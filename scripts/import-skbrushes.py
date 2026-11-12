#!/usr/bin/env python3
"""Import Autodesk Sketchbook brush sets (.skbrushes) into Slate.

Sketchbook's `.skbrushes` is a ZIP holding:

  * `<Set name>.xml`  — brush presets (stroke/brush parameters + texture refs)
  * `<hash>.tif`      — brush tip stamps and paper grains
  * `*-icon.png`      — toolbar icons (unused here)

Slate's stamp engine (see `stampStroke` in index.html) draws a brush as a
series of tip images, so a Sketchbook set is almost entirely transferable: the
tip becomes a mask in `TIPD`, and the numeric parameters map onto the fields of
`BrushDefinition`.

Run from the repo root:

    python scripts/import-skbrushes.py <folder-with-skbrushes> [--size 96]

Outputs:
    public/brushes/<hash>.png        one alpha mask per unique tip
    public/sketchbook-packs.js       window.SKB = { packs, tips }

The masks are 8-bit greyscale written into RGB with a fully opaque alpha,
because the engine reads the RED channel and rewrites alpha from it:

    for (j…) { dd[j+3] = dd[j]; dd[j] = dd[j+1] = dd[j+2] = 0 }

Sketchbook stamps are black-background/white-shape, so luminance *is* the mask.
A handful carry a real alpha channel instead; that is preferred when present.
"""

import argparse
import hashlib
import io
import json
import math
import os
import re
import sys
import zipfile

from PIL import Image

# --------------------------------------------------------------------------
# Parameter mapping: Sketchbook XML -> Slate BrushDefinition
# --------------------------------------------------------------------------
#
# Slate's stamp loop (index.html, stampStroke) does, per stamp:
#
#   R     = (a0 + (a1-a0)*pressure) * size/3        stamp radius
#   sp0   = sp * 0.274 * a1 * size/3                spacing in px
#   rot   = (f ? strokeAngle : 0) + g° + rand*rt°
#   alpha = o0 + (o1-o0)*rand, reduced by oj
#   scale(1, q)                                     vertical squish
#
# so the fields below are chosen to reproduce Sketchbook's spacing/rotation/
# opacity behaviour rather than to copy its numbers verbatim.

SPACING_K = 2.0   # spacingBias -> sp; 0.7 gives a dense, overlapping tip run
MIN_SP, MAX_SP = 0.12, 12.0
MAX_SN = 3.0      # guard: sn > 4 can drive the spacing step negative
MAX_RADIUS = 46.0 # Slate's own a1 tops out at 45.99

NUM = r'="([-\d.]+)"'


def f(attrs, key, default=0.0):
    m = re.search(re.escape(key) + NUM, attrs)
    return float(m.group(1)) if m else default


def s(attrs, key, default=''):
    m = re.search(re.escape(key) + r'="([^"]*)"', attrs)
    return m.group(1) if m else default


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def parse_set(xml_text):
    """Return [{name, params, tip, paper}] for one .skbrushes XML."""
    out = []
    for block in re.findall(r'<brush\s+name="([^"]*)"[^>]*>(.*?)</brush>', xml_text, re.S):
        name, body = block
        stroke = re.search(r'<strokeParameters[^>]*>', body)
        bpar = re.search(r'<brushParameters[^>]*>', body)
        custom = re.search(r'<customBrush[^>]*>', body)
        paper = re.search(r'<paperTexture[^>]*>', body)
        st = stroke.group(0) if stroke else ''
        bp = bpar.group(0) if bpar else ''
        cb = custom.group(0) if custom else ''
        pt = paper.group(0) if paper else ''

        out.append({
            'name': name.strip(),
            'spacingBias': f(st, 'spacingBias', 0.5),
            'spacingNoise': f(st, 'spacingNoise', 0.0),
            'opacityJitter': f(st, 'opacityJitter', 0.0),
            'radiusJitter': f(st, 'radiusJitter', 0.0),
            'rotationJitter': f(st, 'rotationJitter', 0.0),
            'rotateToStroke': s(st, 'rotateToStroke', 'false') == 'true',
            'minRadius': f(bp, 'minRadius', 1.0),
            'maxRadius': f(bp, 'maxRadius', 3.0),
            'minOpacity': f(bp, 'minOpacity', 0.01),
            'maxOpacity': f(bp, 'maxOpacity', 1.0),
            'squish': f(bp, 'squish', 1.0),
            'angle': f(bp, 'angle', 0.0),
            'tip': s(cb, 'name', '') if re.search(r'\.tiff?$', s(cb, 'name', ''), re.I) else '',
            'paper': s(pt, 'name', '') if 'paperTextureEnabled="true"' in pt else '',
        })
    return out


def to_mask(tif_bytes):
    """TIFF -> 8-bit mask (PIL 'L'). Prefers a real alpha channel when it varies."""
    im = Image.open(io.BytesIO(tif_bytes))
    im.load()
    if im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info:
        rgba = im.convert('RGBA')
        alpha = rgba.getchannel('A')
        lo, hi = alpha.getextrema()
        if hi > lo:                     # a genuine alpha mask
            mask = alpha
        else:
            mask = rgba.convert('L')    # flat alpha: shape lives in luminance
    else:
        mask = im.convert('L')

    # Faint stamps (many Sketchbook tips peak well below 255) read as washed out
    # once used as an opacity mask, so stretch the top of the range. Only the
    # ceiling is moved: scaling the floor too would turn grain into flat blobs.
    hi = mask.getextrema()[1]
    if 0 < hi < 250:
        mask = mask.point(lambda v: min(255, round(v * 255.0 / hi)))
    return mask


def fallback_tip(name, size=96):
    """Synthesise a tip for brushes that use a Sketchbook *internal* shape.

    A fair number of presets (most of the marker and pen sets) carry a
    `<customBrush>` with no `name`, meaning the tip lives inside Sketchbook
    itself and was never shipped in the ZIP. Those tips are all simple solids,
    so drawing an approximation keeps the preset usable instead of dropping it.
    """
    n = name.lower()
    if 'square' in n or 'chisel' in n or 'flat' in n:
        shape, hardness, squash = 'square', 0.95, 0.55
    elif 'bristle' in n or 'brush tip' in n:
        shape, hardness, squash = 'bristle', 0.55, 1.0
    elif 'firm' in n or 'bullet' in n or 'hard' in n:
        shape, hardness, squash = 'round', 0.9, 1.0
    elif 'soft' in n or 'air' in n:
        shape, hardness, squash = 'round', 0.15, 1.0
    else:
        shape, hardness, squash = 'round', 0.6, 1.0

    img = Image.new('L', (size, size), 0)
    px = img.load()
    c = (size - 1) / 2.0
    rmax = size / 2.0
    for y in range(size):
        for x in range(size):
            dx = (x - c) / rmax
            dy = (y - c) / (rmax * squash)
            if shape == 'square':
                d = max(abs(dx), abs(dy))
                v = 255 if d <= 0.78 else 0
            else:
                d = (dx * dx + dy * dy) ** 0.5
                if d > 1.0:
                    v = 0
                elif shape == 'bristle':
                    # a few soft streaks across the tip
                    import math
                    streak = 0.75 + 0.25 * abs(math.sin(dx * 9.0))
                    v = int(255 * streak * max(0.0, 1.0 - d) ** 0.35)
                else:
                    # hardness controls where the falloff starts
                    v = int(255 * max(0.0, min(1.0, (1.0 - d) / max(1e-3, 1.0 - hardness))) ** 0.7)
            px[x, y] = max(0, min(255, v))
    return img


def read_palettes(folder):
    """Parse .skcolors files into [{name, colors:[#rrggbb]}].

    A Sketchbook palette file is plain JSON holding 12 `colorsets` (the 12
    swatch slots of the app). Empty slots are skipped; the rest are flattened
    into one palette per file, in the order the artist arranged them.
    """
    out = []
    for fname in sorted(os.listdir(folder)):
        if not fname.lower().endswith('.skcolors'):
            continue
        name = re.sub(r'\s*\(\d+\)$', '', os.path.splitext(fname)[0]).strip()
        if any(p['name'] == name for p in out):      # "(1)" duplicate
            continue
        try:
            with open(os.path.join(folder, fname), encoding='utf-8') as fh:
                data = json.load(fh)
        except (ValueError, OSError):
            print(f'  ! {fname}: unreadable, skipped')
            continue

        colors, seen = [], set()
        for cs in data.get('colorsets', []):
            for c in cs.get('colors', []) or []:
                c = str(c).strip().lstrip('#')
                if re.fullmatch(r'[0-9a-fA-F]{6}', c) and c.lower() not in seen:
                    seen.add(c.lower())
                    colors.append('#' + c.lower())
        if colors:
            out.append({'name': name, 'colors': colors})
            print(f'  palette {name:24} {len(colors)} colours')
    return out


def scale_radius(r):
    """Map a Sketchbook radius onto Slate's stamp-radius band.

    Sketchbook's min/maxRadius run 0.1..511 and are not comparable between
    brushes, so using them verbatim makes a bristle brush paint a 140 px blob
    while a pencil stays hairline. A square-root curve keeps the ordering and
    the relative feel while landing every brush in a usable range.
    """
    return clamp(1.2 + 8.8 * math.sqrt(max(0.0, r) / 60.0), 1.2, 10.5)


def is_degenerate(mask):
    """True when a mask cannot work as a stamp.

    A handful of the `.tif` files are paper grains rather than tips: uniformly
    light with a little noise, which as an opacity mask paints a solid block.
    """
    lo, hi = mask.getextrema()
    if lo > 200:          # essentially opaque everywhere
        return True
    if hi < 24:           # essentially empty
        return True
    return False


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('--size', type=int, default=96, help='mask edge in px (Slate ships 96)')
    ap.add_argument('--out', default='public')
    ap.add_argument('--stamp-zip', action='append', default=[],
                    help='zip of loose PNG stamps to import as one set (repeatable)')
    args = ap.parse_args()

    src = args.source
    files = sorted(n for n in os.listdir(src) if n.lower().endswith('.skbrushes'))
    others = [n for n in os.listdir(src)
              if n.lower().endswith(('.brushset', '.zip', '.abr', '.sut'))]
    if not files and not others:
        sys.exit(f'no brush sources in {src}')

    brush_dir = os.path.join(args.out, 'brushes')
    os.makedirs(brush_dir, exist_ok=True)

    tips = {}          # hash -> web path
    seen = {}          # hash -> mask (dedupe)
    packs = []
    seen_packs = set()
    skipped_missing_tip = 0
    total = 0

    for idx, fname in enumerate(files):
        pack_name = os.path.splitext(fname)[0]
        pack_name = re.sub(r'\s*\(\d+\)$', '', pack_name).strip()   # drop "(1)" dupes
        pack_id = re.sub(r'[^a-z0-9]+', '-', pack_name.lower()).strip('-')
        if pack_id in seen_packs:                        # the "(1)" copies of a set
            continue
        seen_packs.add(pack_id)

        with zipfile.ZipFile(os.path.join(src, fname)) as z:
            names = [n for n in z.namelist() if '__MACOSX' not in n]
            xmls = [n for n in names if n.lower().endswith('.xml')]
            if not xmls:
                print(f'  ! {fname}: no XML, skipped')
                continue
            parsed = parse_set(z.read(xmls[0]).decode('utf-8', 'ignore'))

            # Prefer a real filename stem when it is already a 32-hex hash, so
            # tips shared with Slate's built-in set reuse the same key.
            by_basename = {os.path.basename(n): n for n in names if n.lower().endswith('.tif')}

            brushes = []
            seen_brushes = set()
            for bi, b in enumerate(parsed):
                total += 1
                tip_file = b['tip']
                entry = None
                if tip_file:
                    entry = by_basename.get(tip_file) or by_basename.get(os.path.basename(tip_file))
                # A <brush> block repeats its parameters under <default>, so the
                # same preset can be parsed twice; keep the first occurrence.
                sig = (b['name'], tip_file or '<internal>')
                if sig in seen_brushes:
                    continue
                seen_brushes.add(sig)

                if entry:
                    stem = os.path.splitext(os.path.basename(entry))[0]
                    key = stem.lower() if re.fullmatch(r'[0-9a-fA-F]{32}', stem) else None
                    mask = to_mask(z.read(entry))
                    if is_degenerate(mask):
                        mask = fallback_tip(b['name'])
                        key = None
                        skipped_missing_tip += 1
                    if key is None:
                        key = hashlib.md5(mask.tobytes()).hexdigest()
                else:
                    # internal Sketchbook tip: approximate it
                    mask = fallback_tip(b['name'])
                    key = hashlib.md5(mask.tobytes()).hexdigest()
                    skipped_missing_tip += 1

                key = key.lower()

                if key not in seen:
                    seen[key] = mask
                    m = mask.resize((args.size, args.size), Image.LANCZOS)
                    # Saved as an 8-bit greyscale PNG. A browser decodes it to
                    # R=G=B=level, which is exactly what the engine's red-channel
                    # read wants, at a third of the bytes of an RGB PNG.
                    m.save(os.path.join(brush_dir, key + '.png'), optimize=True)
                tips[key] = f'/brushes/{key}.png'

                a1 = scale_radius(b['maxRadius'])
                ratio = (b['minRadius'] / b['maxRadius']) if b['maxRadius'] > 0 else 1.0
                a0 = clamp(a1 * clamp(ratio, 0.05, 1.0), 0.4, a1)
                sp = clamp(b['spacingBias'] * SPACING_K, MIN_SP, MAX_SP)

                brushes.append({
                    'id': f'{pack_id}-{bi}',
                    'n': b['name'],
                    't': key,
                    'sp': round(sp, 3),
                    'sn': round(clamp(b['spacingNoise'], 0.0, MAX_SN), 3),
                    'rj': round(clamp(b['radiusJitter'], 0.0, 20.0), 2),
                    'rt': round(clamp(b['rotationJitter'], 0.0, 180.0), 2),
                    'f': 1 if b['rotateToStroke'] else 0,
                    'oj': round(clamp(b['opacityJitter'], 0.0, 20.0), 2),
                    'a0': round(a0, 2),
                    'a1': round(a1, 2),
                    'o0': round(clamp(b['minOpacity'], 0.02, 1.0), 3),
                    'o1': round(clamp(b['maxOpacity'], 0.02, 1.0), 3),
                    'q': round(clamp(b['squish'], 0.2, 1.0), 3),
                    'g': round(b['angle'], 2),
                    'vt': 0,
                    'sz': 4,
                })

        if brushes:
            packs.append({'id': pack_id, 'name': pack_name, 'brushes': brushes})
            print(f'  {pack_name:34} {len(brushes):3} brushes')

    # ----------------------------------------------------------------------
    # Procreate `.brushset` and plain PNG stamp packs
    #
    # A Procreate brushset is a ZIP of one folder per brush, each holding a
    # `Shape.png` — the stamp — plus a binary `Brush.archive` with the settings.
    # The archive is an NSKeyedArchiver blob whose parameters are indexed rather
    # than named, so the settings are not recoverable without reverse-engineering
    # Procreate's own keys. The shape is the brush's visual identity, so it is
    # used with tuned defaults instead: Procreate brushes then behave like
    # stamps, which is what most of these sets are.
    #
    # `.abr` (Photoshop) and `.sut` (Clip Studio) are skipped: the ABR here uses
    # the CS-era UUID-sampled layout rather than the classic `samp` table, and
    # Clip Studio's .sut is a SQLite file whose texture column is empty — the
    # images live in the app's material catalog, not in the file.
    # ----------------------------------------------------------------------

    # These sets are clump stamps: the artwork occupies a thin silhouette inside
    # the mask, so the stamp has to be drawn large enough for the blades to read.
    # At a1=4 a grass tuft collapsed into a dot.
    STAMP_DEFAULTS = {
        'sp': 5.0, 'sn': 0.0, 'rj': 0.0, 'rt': 0.0, 'f': 0, 'oj': 0.0,
        'a0': 4.0, 'a1': 9.0, 'o0': 1.0, 'o1': 1.0, 'q': 1.0, 'g': 0.0,
        'vt': 0, 'sz': 4,
    }

    def write_mask(mask):
        key = hashlib.md5(mask.tobytes()).hexdigest()
        if key not in seen:
            seen[key] = mask
            m = mask.resize((args.size, args.size), Image.LANCZOS)
            m.save(os.path.join(brush_dir, key + '.png'), optimize=True)
        tips[key] = f'/brushes/{key}.png'
        return key

    def emit_mask_pack(pack_name, items, defaults=STAMP_DEFAULTS):
        """items: [(brush name, PIL mask)] -> one pack of stamp brushes."""
        nonlocal skipped_missing_tip
        pack_id = slug(pack_name)
        if pack_id in seen_packs or not items:
            return
        seen_packs.add(pack_id)
        brushes = []
        for i, (nm, mask) in enumerate(items):
            if is_degenerate(mask):
                mask = fallback_tip(nm)
                skipped_missing_tip += 1
            brushes.append({
                'id': f'{pack_id}-{i}', 'n': nm, 't': write_mask(mask),
                **defaults,
            })
        packs.append({'id': pack_id, 'name': pack_name, 'brushes': brushes})
        print(f'  {pack_name:34} {len(brushes):3} brushes')

    def procreate_items(zf):
        """Every <uuid>/Shape.png in a .brushset becomes one brush."""
        out = []
        for n in sorted(zf.namelist()):
            if not n.endswith('/Shape.png') or '__MACOSX' in n:
                continue
            # the top-level folder is the brush; `Reset/` is Procreate's default
            if n.count('/') != 1:
                continue
            try:
                out.append((f'Brush {len(out) + 1}', to_mask(zf.read(n))))
            except Exception:
                continue
        return out

    def read_brushset_bytes(data, name):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                emit_mask_pack(name, procreate_items(z))
        except zipfile.BadZipFile:
            print(f'  ! {name}: not a zip, skipped')

    # standalone .brushset files
    for fname in sorted(n for n in os.listdir(src) if n.lower().endswith('.brushset')):
        with open(os.path.join(src, fname), 'rb') as fh:
            read_brushset_bytes(fh.read(), os.path.splitext(fname)[0])

    # zips that carry brushesets, or loose PNG stamps
    for fname in sorted(n for n in os.listdir(src) if n.lower().endswith('.zip')):
        try:
            with zipfile.ZipFile(os.path.join(src, fname)) as z:
                inner = [n for n in z.namelist()
                         if n.lower().endswith('.brushset') and '__MACOSX' not in n]
                if inner:
                    for n in inner:
                        read_brushset_bytes(z.read(n), os.path.splitext(os.path.basename(n))[0])
                    continue
                # A zip of loose PNGs is only a brush pack if it was named
                # explicitly: a downloads folder is full of archives that happen
                # to contain PNGs (repo snapshots, exam figures) and importing
                # those as brushes would be wrong.
                if fname not in args.stamp_zip:
                    continue
                pngs = [n for n in z.namelist()
                        if n.lower().endswith('.png') and '__MACOSX' not in n]
                items = []
                for n in sorted(pngs):
                    try:
                        items.append((os.path.splitext(os.path.basename(n))[0],
                                      to_mask(z.read(n))))
                    except Exception:
                        continue
                emit_mask_pack(os.path.splitext(fname)[0], items,
                               {**STAMP_DEFAULTS, 'sp': 6.0})
        except zipfile.BadZipFile:
            print(f'  ! {fname}: not a zip, skipped')

    for fname in sorted(n for n in os.listdir(src) if n.lower().endswith(('.abr', '.sut'))):
        print(f'  - {fname}: format not supported, skipped')

    payload = {'packs': packs, 'tips': tips, 'palettes': read_palettes(src)}
    js_path = os.path.join(args.out, 'sketchbook-packs.js')
    with open(js_path, 'w', encoding='utf-8') as fh:
        fh.write('/* Generated by scripts/import-skbrushes.py — do not edit by hand. */\n')
        fh.write('window.SKB=')
        json.dump(payload, fh, separators=(',', ':'))
        fh.write(';\n')

    n_brushes = sum(len(p['brushes']) for p in packs)
    png_bytes = sum(os.path.getsize(os.path.join(brush_dir, n)) for n in os.listdir(brush_dir))
    print(f'\n{len(packs)} packs, {n_brushes} brushes, {len(tips)} unique tips')
    print(f'skipped {skipped_missing_tip}/{total} brushes with no usable tip image')
    print(f'masks: {png_bytes/1024:.0f} KiB   packs.js: {os.path.getsize(js_path)/1024:.0f} KiB')


if __name__ == '__main__':
    main()
