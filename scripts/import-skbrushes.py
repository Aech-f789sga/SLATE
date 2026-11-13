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
import plistlib
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


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def parse_set(xml_text):
    """Return [{name, params, tip, paper}] for one .skbrushes XML."""
    out = []
    for block in re.findall(r'<brush\s+name="([^"]*)"[^>]*>(.*?)</brush>', xml_text, re.S):
        name, body = block
        stroke = re.search(r'<strokeParameters[^>]*>', body)
        bpar = re.search(r'<brushParameters[^>]*>', body)
        custom = re.search(r'<customBrush[^>]*>', body)
        paper = re.search(r'<paperTexture[^>]*>', body)
        pers = re.search(r'<personalized[^>]*>', body)
        st = stroke.group(0) if stroke else ''
        bp = bpar.group(0) if bpar else ''
        cb = custom.group(0) if custom else ''
        pt = paper.group(0) if paper else ''
        pe = pers.group(0) if pers else ''

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
            'icon': s(pe, 'icon', ''),
            'texIcon': s(pe, 'useTextureIcon', 'false') == 'true',
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


def is_degenerate(mask):
    """True when a mask cannot work as a stamp.

    A handful of the `.tif` files are paper grains rather than tips: uniformly
    light with a little noise, which as an opacity mask paints a solid block.
    Such brushes are skipped — nothing is substituted for them, so every mask
    that ships is the set's own artwork.
    """
    lo, hi = mask.getextrema()
    if lo > 200:          # essentially opaque everywhere
        return True
    if hi < 24:           # essentially empty
        return True
    return False


def scale_radius(r, median=46.0):
    """Map a source brush radius onto Slate's `a1` band.

    This is the single most important calibration in the import. Slate's own
    textured presets run `a1` from about 4 to 46 (median ~14) — a cloud brush is
    `a1=45`, a quill `a1=7` — and the stamp radius is `a1 * size/3`. An earlier
    version squeezed everything into 1.2..10.5, which made every imported brush
    paint a thin line: the dab was so small that a textured mask collapsed to a
    hairline and its edges read as regular ticks, which is exactly the "row of
    dots" complaint.

    So the mapping is anchored on the source's median value, which lands at 14 —
    the middle of Slate's own band — and a 0.6 power spreads the rest while
    keeping the ordering. Relative size between brushes survives; absolute size
    stays in the range the engine and its other presets already use.
    """
    return clamp(14.0 * (max(r, 0.05) / median) ** 0.6, 1.5, 46.0)


def procreate_params(raw):
    """Read a Procreate `Brush.archive` into Slate brush fields.

    The archive is a binary NSKeyedArchiver plist whose root object carries
    **named** settings — `plotSpacing`, `plotJitter`, `dynamicsJitterSize`,
    `minSize`/`maxSize`, `shapeRoundness`, `shapeRotation`, `shapeAzimuth` and
    the brush's own `name`. (An earlier pass assumed the keys were positional;
    they are not, so these are the brush's real settings, not defaults.)

    The numbers still need calibrating, because the two engines measure
    different things:
      * Procreate's `plotSpacing` is a fraction of the dab diameter. Slate
        spaces stamps by `sp * 0.274 * a1 * size/3` against a radius of
        `a1 * size/3`, i.e. a fraction of `sp * 0.137`, so `sp = frac / 0.137`.
      * Procreate's `maxSize` is the brush's default diameter (measured range
        1.1..16.0, median 13.1), while Slate's `a1` is a scale on `size/3`.
        Feeding it through the same curve used for Sketchbook radii keeps the
        ordering between brushes and lands them in Slate's band.
      * `shapeRotation` is a turn fraction and is commonly exactly 1.0, which
        means "no rotation" — it is normalised to 0 rather than 360.
    """
    out = {}
    try:
        d = plistlib.load(io.BytesIO(raw))
        objs = d.get('$objects', [])
        root = objs[1] if len(objs) > 1 else None
        if not isinstance(root, dict):
            return out

        def g(key, default=0.0):
            v = root.get(key, default)
            if isinstance(v, plistlib.UID):
                v = objs[v.data] if v.data < len(objs) else default
            return v

        name = g('name', '')
        if isinstance(name, str) and name.strip():
            out['name'] = name.strip()

        sp = float(g('plotSpacing', 0.0)) / 0.137
        out['sp'] = round(clamp(sp, MIN_SP, MAX_SP), 3)
        out['sn'] = round(clamp(float(g('plotJitter', 0.0)) * 3.0, 0.0, MAX_SN), 3)
        out['rj'] = round(clamp(float(g('dynamicsJitterSize', 0.0)) * 2.0, 0.0, 20.0), 2)
        out['oj'] = round(clamp(float(g('dynamicsJitterOpacity', 0.0)) * 33.0, 0.0, 20.0), 2)
        out['rt'] = 0.0
        out['f'] = 1 if g('shapeAzimuth', False) else 0

        max_size = float(g('maxSize', 1.0)) or 1.0
        min_size = float(g('minSize', 0.0))
        a1 = scale_radius(max_size, median=13.1)
        a0 = clamp(a1 * clamp(min_size / max_size, 0.05, 1.0), 0.4, a1)
        out['a0'] = round(a0, 2)
        out['a1'] = round(a1, 2)

        # minOpacity/maxOpacity are the opacity *slider's* range, not a per-dab
        # random range; the brush's actual opacity is paintOpacity. Using the
        # slider range here scattered dabs between 0% and 100%, which speckles
        # the stroke — the "dots" look.
        paint = clamp(float(g('paintOpacity', 1.0)), 0.2, 1.0)
        paint = density_opacity(out.get('sp', 1.0), paint)
        out['o0'] = round(clamp(paint * 0.7, 0.2, paint), 3)
        out['o1'] = round(paint, 3)

        out['q'] = round(clamp(float(g('shapeRoundness', 1.0)), 0.2, 1.0), 3)
        # a turn fraction of 1.0 means "no rotation", not a full spin
        out['g'] = round((float(g('shapeRotation', 0.0)) * 360.0) % 360.0, 2)
        out['vt'] = 0
        out['sz'] = 4
    except Exception:
        return {}
    return out


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


def density_opacity(sp, o1):
    """Hold back per-dab opacity when a brush stamps very densely.

    Sketchbook and Procreate both layer a separate paper grain over the stroke,
    so a densely-stamped brush still shows texture. Slate has no grain layer: at
    full opacity, hundreds of overlapping tips average into a flat slab — which
    is what made the acrylic set look like a solid black bar. Letting the dabs be
    translucent instead lets the tip's own texture survive the overlap, which is
    also how the source brushes read.
    """
    if sp < 0.35:
        o1 = min(o1, 0.55)
    elif sp < 0.8:
        o1 = min(o1, 0.78)
    return o1


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
    icon_dir = os.path.join(args.out, 'brush-icons')
    os.makedirs(icon_dir, exist_ok=True)

    icons = {}         # hash -> web path

    def write_icon(raw, bg=None):
        """Store a brush icon (Sketchbook glyph or Procreate thumbnail).

        Procreate's QuickLook thumbnails are 1060x324 renders of a *white*
        stroke on transparency — they are drawn against Procreate's dark UI, so
        on a light panel they are invisible. `bg` composites them onto that dark
        plate so the artwork reads as it does in its own app. Icons are only
        ever shown by the picker's <img>, never read back as pixels, so WebP is
        safe here and roughly a quarter the size of PNG.
        """
        im = Image.open(io.BytesIO(raw))
        im.load()
        if im.mode != 'RGBA':
            im = im.convert('RGBA')
        if bg is not None:
            plate = Image.new('RGBA', im.size, bg)
            plate.alpha_composite(im)
            im = plate
        w, h = im.size
        if max(w, h) > 256:
            k = 256.0 / max(w, h)
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format='WEBP', quality=82, method=4)
        data = buf.getvalue()
        key = hashlib.md5(data).hexdigest()
        if key not in icons:
            with open(os.path.join(icon_dir, key + '.webp'), 'wb') as fh:
                fh.write(data)
            icons[key] = f'/brush-icons/{key}.webp'
        return key

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
            # brush glyphs: `<personalized icon="fine-art-4h-icon">` names a
            # `fine-art-4h-icon.png` (or @2x) shipped alongside the set
            icons_by_name = {os.path.basename(n): n for n in names if n.lower().endswith('.png')}

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
                    # A paper grain is not a stamp. Skip rather than substitute
                    # a generated tip: every mask shipped must be the set's own.
                    if is_degenerate(mask):
                        skipped_missing_tip += 1
                        continue
                    if key is None:
                        key = hashlib.md5(mask.tobytes()).hexdigest()
                else:
                    # the tip lives inside Sketchbook itself and is not in the
                    # ZIP — nothing authentic to use, so the preset is dropped
                    skipped_missing_tip += 1
                    continue

                key = key.lower()

                if key not in seen:
                    seen[key] = mask
                    m = mask.resize((args.size, args.size), Image.LANCZOS)
                    # Saved as an 8-bit greyscale PNG. A browser decodes it to
                    # R=G=B=level, which is exactly what the engine's red-channel
                    # read wants, at a third of the bytes of an RGB PNG.
                    m.save(os.path.join(brush_dir, key + '.png'), optimize=True)
                tips[key] = f'/brushes/{key}.png'

                a1 = scale_radius(b['maxRadius'], median=46.0)
                ratio = (b['minRadius'] / b['maxRadius']) if b['maxRadius'] > 0 else 1.0
                a0 = clamp(a1 * clamp(ratio, 0.05, 1.0), 0.4, a1)
                sp = clamp(b['spacingBias'] * SPACING_K, MIN_SP, MAX_SP)

                # minOpacity/maxOpacity are the pressure range of the opacity
                # slider. Mapping that straight onto Slate's per-dab random
                # range lets dabs land at 1-2% opacity, which punches holes in
                # the stroke and reads as speckle. Keep the top of the range and
                # hold the floor up so consecutive dabs stay connected.
                o1 = clamp(b['maxOpacity'], 0.2, 1.0)
                o1 = density_opacity(sp, o1)
                o0 = clamp(o1 * 0.7, 0.2, o1)

                ic = None
                if b['icon']:
                    for cand in (b['icon'] + '@2x.png', b['icon'] + '.png'):
                        if cand in icons_by_name:
                            try:
                                ic = write_icon(z.read(icons_by_name[cand]))
                            except Exception:
                                ic = None
                            break

                brushes.append({
                    'id': f'{pack_id}-{bi}',
                    'n': b['name'],
                    't': key,
                    **({'ic': ic} if ic else {}),
                    'sp': round(sp, 3),
                    'sn': round(clamp(b['spacingNoise'], 0.0, MAX_SN), 3),
                    'rj': round(clamp(b['radiusJitter'], 0.0, 20.0), 2),
                    'rt': round(clamp(b['rotationJitter'], 0.0, 180.0), 2),
                    'f': 1 if b['rotateToStroke'] else 0,
                    'oj': round(clamp(b['opacityJitter'], 0.0, 20.0), 2),
                    'a0': round(a0, 2),
                    'a1': round(a1, 2),
                    'o0': round(o0, 3),
                    'o1': round(o1, 3),
                    'q': round(clamp(b['squish'], 0.2, 1.0), 3),
                    'g': round(b['angle'], 2),
                    'vt': 0,
                    'sz': 4,
                })

        if brushes:
            packs.append({'id': pack_id, 'name': pack_name, 'source': 'sketchbook',
                          'brushes': brushes})
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

    def emit_mask_pack(pack_name, items, defaults=STAMP_DEFAULTS, source='stamps'):
        """items: [(brush name, PIL mask, icon bytes or None)] -> one pack."""
        nonlocal skipped_missing_tip
        pack_id = slug(pack_name)
        if pack_id in seen_packs or not items:
            return
        seen_packs.add(pack_id)
        brushes = []
        for i, (nm, mask, icon_raw) in enumerate(items):
            if is_degenerate(mask):
                skipped_missing_tip += 1
                continue
            ic = None
            if icon_raw:
                try:
                    ic = write_icon(icon_raw)
                except Exception:
                    ic = None
            brushes.append({
                'id': f'{pack_id}-{i}', 'n': nm, 't': write_mask(mask),
                **({'ic': ic} if ic else {}),
                **defaults,
            })
        if not brushes:
            return
        packs.append({'id': pack_id, 'name': pack_name, 'source': source,
                      'brushes': brushes})
        print(f'  {pack_name:34} {len(brushes):3} brushes')

    def emit_procreate(pack_name, zf):
        """One brush per `<uuid>/`, using Procreate's own shape and settings."""
        nonlocal skipped_missing_tip
        pack_id = slug(pack_name)
        if pack_id in seen_packs:
            return
        seen_packs.add(pack_id)
        brushes = []
        for n in sorted(zf.namelist()):
            if not n.endswith('/Shape.png') or '__MACOSX' in n:
                continue
            # the top-level folder is the brush; `Reset/` is Procreate's default
            if n.count('/') != 1:
                continue
            uid = n.split('/')[0]
            try:
                mask = to_mask(zf.read(n))
            except Exception:
                continue
            if is_degenerate(mask):
                skipped_missing_tip += 1
                continue
            params = {}
            arch = f'{uid}/Brush.archive'
            if arch in zf.namelist():
                try:
                    params = procreate_params(zf.read(arch))
                except Exception:
                    params = {}
            nm = params.pop('name', '') or f'Brush {len(brushes) + 1}'
            icon = None
            thumb = f'{uid}/QuickLook/Thumbnail.png'
            if thumb in zf.namelist():
                try:
                    # Procreate renders these white-on-clear for its dark UI
                    icon = write_icon(zf.read(thumb), bg=(28, 28, 30, 255))
                except Exception:
                    icon = None
            brushes.append({
                'id': f'{pack_id}-{len(brushes)}',
                'n': nm,
                't': write_mask(mask),
                **({'ic': icon} if icon else {}),
                **{**STAMP_DEFAULTS, **params},
            })
        if not brushes:
            return
        packs.append({'id': pack_id, 'name': pack_name, 'source': 'procreate',
                      'brushes': brushes})
        print(f'  {pack_name:34} {len(brushes):3} brushes')

    def read_brushset_bytes(data, name):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                emit_procreate(name, z)
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
                                      to_mask(z.read(n)), None))
                    except Exception:
                        continue
                emit_mask_pack(os.path.splitext(fname)[0], items,
                               {**STAMP_DEFAULTS, 'sp': 6.0}, source='stamps')
        except zipfile.BadZipFile:
            print(f'  ! {fname}: not a zip, skipped')

    for fname in sorted(n for n in os.listdir(src) if n.lower().endswith(('.abr', '.sut'))):
        print(f'  - {fname}: format not supported, skipped')

    payload = {'packs': packs, 'tips': tips, 'icons': icons,
               'palettes': read_palettes(src)}
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
