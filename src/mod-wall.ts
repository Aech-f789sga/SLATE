/**
 * The mod's wallpaper, alive, in both rooms of the app.
 *
 * The shelf already painted the mod's still behind the cards. What it never
 * did was keep it running once you opened a notebook — the engine hid the
 * layer the moment the shelf went away, because the wallpaper is a fixed
 * layer and the editor would have been painted underneath it. This module
 * takes the layer over instead: it owns a `<video>` and a canvas inside
 * `#gx-wall`, and the editor's desk is left translucent so the mod keeps
 * playing behind the page you are writing on.
 *
 * Two kinds of "live", because that is what the mods ship:
 *
 *   a video      seventeen of them animate the wallpaper outright, from a
 *                six-second webm of the Cyberdeck skyline to a 17-minute
 *                fireplace. Nothing is added; the loop is the point.
 *   a shader     LoFi Chill is a photograph with a bokeh shader, Cyberdeck
 *                keeps its binary matrix on top of the video, and the mods
 *                with a still wallpaper get a weather chosen to suit the
 *                picture. All of those are redrawn here on a canvas.
 *
 * A video wins outright: drifting dust over real animation reads as a filter
 * on the artwork rather than as weather in it.
 *
 * A "Still" switch is kept for the same reason the mod's own wallpaper
 * settings have one: a moving picture behind a page of handwriting is not
 * always what you want, and a laptop on battery should be able to stop.
 */

import { currentMod, type ModMedia, type Fx } from './mod-media';

/**
 * A live layer is not only for the three mods that ship a video. Every theme
 * has artwork, and artwork that sits perfectly still behind a notebook reads
 * as a screenshot. So each theme gets an effect chosen to suit its picture:
 * sakura for the anime mods, embers for the fantasy ones, snow for the
 * traveller, rain for the horror and terminal ones, and so on.
 */
const THEME_FX: Record<string, Fx> = {
  anime: 'petals',
  'naruto-itachi-uchiha': 'petals',
  'capybara-party': 'petals',
  'japanese-lofi-mix': 'dust',
  cozy: 'dust',
  'hollow-knight': 'dust',
  'the-traveller': 'snow',
  'elden-ring': 'embers',
  medieval: 'embers',
  'legendary-rift': 'embers',
  'monkey-rizz': 'embers',
  blockified: 'embers',
  horror: 'rain',
  msi: 'rain',
  'black-hole': 'stars',
  'violet-nebula': 'stars',
  'spaced-out': 'stars',
  'creamy-keyboard': 'stars',
  'josh-hutcherson': 'stars',
  'day-one': 'dust',
  'grand-theft-auto-san-andreas': 'dust',
};

const KEY = 'inkpad_mod_wall_live';

type Listener = () => void;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class ModWall {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private mod: ModMedia | null = null;
  private fx: Fx | null = null;
  private applied = '';
  private listeners = new Set<Listener>();
  private booted = false;
  private live = true;

  boot() {
    if (this.booted) return;
    this.booted = true;

    // the layer itself belongs to themes.ts; this only says what a video and a
    // canvas inside it are supposed to be
    const style = document.createElement('style');
    style.id = 'gx-wall-media-style';
    style.textContent = `
#gx-wall .gx-wall-video,#gx-wall .gx-wall-fx{
  position:absolute;inset:0;width:100%;height:100%;
  pointer-events:none;border:0;
}
#gx-wall .gx-wall-video{object-fit:cover;background:transparent}
#gx-wall .gx-wall-fx{mix-blend-mode:screen}
#gx-wall[data-live="0"] .gx-wall-fx{display:none}
@media (prefers-reduced-motion:reduce){#gx-wall .gx-wall-fx{display:none}}
`;
    document.head.append(style);
    try {
      this.live = localStorage.getItem(KEY) !== 'still';
    } catch {
      this.live = true;
    }
    if (reducedMotion()) this.live = false;

    window.setInterval(() => this.tick(), 350);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.tick();
  }

  // ---------------------------------------------------------------- state

  get isLive() {
    return this.live;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  setLive(on: boolean) {
    if (this.live === on) return;
    this.live = on;
    try {
      localStorage.setItem(KEY, on ? 'live' : 'still');
    } catch {
      /* ignore */
    }
    // force a rebuild so the video element is created or dropped at once
    this.applied = '';
    this.tick();
    this.emit();
  }

  // ---------------------------------------------------------------- layer

  private layer(): HTMLElement | null {
    return document.getElementById('gx-wall');
  }

  private ensureNodes(layer: HTMLElement) {
    if (!this.video) {
      const v = document.createElement('video');
      v.className = 'gx-wall-video';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.preload = 'metadata';
      v.setAttribute('aria-hidden', 'true');
      v.disablePictureInPicture = true;
      layer.append(v);
      this.video = v;
    }
    if (!this.canvas) {
      const c = document.createElement('canvas');
      c.className = 'gx-wall-fx';
      c.setAttribute('aria-hidden', 'true');
      layer.append(c);
      this.canvas = c;
      this.ctx = c.getContext('2d');
    }
  }

  /** Cheap poll: the theme, the wallpaper switch and the mod's own `data-on`
   *  are all owned by other modules, so we read them rather than duplicating
   *  the state machine. */
  private tick() {
    const layer = this.layer();
    if (!layer) return;
    const mod = currentMod();
    const themeId = document.documentElement.dataset.gxTheme || '';
    // Every theme gets a live layer now. Mods that ship their own animated
    // wallpaper use that video; the rest fall back to a procedural effect
    // chosen to suit the artwork. `data-on` is already the wallpaper switch, so
    // a theme with no wallpaper still gets nothing.
    const videoSrc = mod?.wall.video ?? null;
    // A video wins outright. Painting drifting dust over real animation reads
    // as a filter on top of the artwork rather than as weather in it, and now
    // that the mods' own loops are ported there is nothing left for the
    // procedural layer to stand in for.
    const fx: Fx | null = videoSrc
      ? null
      : (mod?.wall.fx ?? THEME_FX[themeId] ?? null);
    const on = layer.dataset.on === '1';
    const want = `${mod?.id ?? themeId}|${on ? 1 : 0}|${this.live ? 1 : 0}|${fx ?? ''}`;
    if (want === this.applied) {
      this.syncPlayback();
      return;
    }
    this.applied = want;
    this.mod = mod;
    this.fx = fx;

    if (!on) {
      this.stopFx();
      this.video?.pause();
      if (this.video) this.video.style.display = 'none';
      if (this.canvas) this.canvas.style.display = 'none';
      layer.dataset.live = '0';
      return;
    }

    this.ensureNodes(layer);
    const video = this.video!;
    const canvas = this.canvas!;
    const hasVideo = !!videoSrc && this.live;

    if (hasVideo) {
      if (video.getAttribute('src') !== videoSrc) {
        video.setAttribute('src', videoSrc!);
        video.load();
      }
      video.style.display = '';
      this.playVideo();
    } else {
      video.pause();
      video.style.display = 'none';
      if (video.getAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    }

    layer.dataset.live = hasVideo || (this.live && fx) ? '1' : '0';

    const wantFx = this.live && !!fx && !document.hidden;
    if (wantFx) {
      this.startFx(fx!);
    } else {
      this.stopFx();
      canvas.style.display = 'none';
    }
  }

  private syncPlayback() {
    const layer = this.layer();
    if (!layer) return;
    if (layer.dataset.on !== '1' || document.hidden) {
      this.video?.pause();
      if (this.mod?.wall.fx && this.raf) this.stopFx();
      return;
    }
    if (this.video && this.video.style.display !== 'none' && this.video.paused) this.playVideo();
    if (this.fx && this.live && !this.raf) this.startFx(this.fx);
  }

  private playVideo() {
    const v = this.video;
    if (!v || document.hidden || reducedMotion()) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  private onVisibility() {
    if (document.hidden) {
      this.video?.pause();
      this.stopFx();
    } else {
      this.syncPlayback();
    }
  }

  // ---------------------------------------------------------------- effects

  private sizeCanvas() {
    const c = this.canvas;
    const ctx = this.ctx;
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width === Math.floor(w * dpr) && c.height === Math.floor(h * dpr)) return;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = '100%';
    c.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private stopFx() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
    const ctx = this.ctx;
    if (ctx && this.canvas) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private startFx(kind: Fx) {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.style.display = '';
    this.sizeCanvas();
    if (this.raf) return;
    if (kind === 'bokeh') this.runBokeh();
    else if (kind === 'matrix') this.runMatrix();
    else this.runParticles(kind);
  }

  /**
   * One runner for the six weathers. They differ only in what a particle is
   * and which way it goes, so they share a loop: fall, rise, or hang still and
   * twinkle. Drawing is a circle, an ellipse (petals), or a streak (rain).
   */
  private runParticles(kind: Exclude<Fx, 'bokeh' | 'matrix'>) {
    const canvas = this.canvas!;
    const ctx = this.ctx!;
    const cfg = {
      petals: { n: 26, s: 5, v: 0.34, sway: 0.9, a: 0.5, c: '255,186,205', shape: 'petal' },
      snow: { n: 64, s: 1.6, v: 0.16, sway: 0.35, a: 0.75, c: '255,255,255', shape: 'dot' },
      stars: { n: 90, s: 1.1, v: 0, sway: 0, a: 0.8, c: '255,255,255', shape: 'twinkle' },
      embers: { n: 34, s: 1.5, v: -0.3, sway: 0.5, a: 0.6, c: '255,168,74', shape: 'dot' },
      rain: { n: 70, s: 1, v: 1.7, sway: 0.05, a: 0.32, c: '190,214,235', shape: 'streak' },
      dust: { n: 36, s: 1.4, v: -0.05, sway: 0.28, a: 0.4, c: '255,238,214', shape: 'dot' },
    }[kind];

    const parts = Array.from({ length: cfg.n }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.3 + Math.random() * 0.7,
      r: cfg.s * (0.5 + Math.random()),
      ph: Math.random() * Math.PI * 2,
      sp: 0.6 + Math.random() * 0.8,
    }));
    let t = 0;

    const step = (now: number) => {
      this.raf = requestAnimationFrame(step);
      if (now - this.last < 40) return;
      const dt = this.last ? Math.min(80, now - this.last) : 16;
      this.last = now;
      t += dt;

      const w = window.innerWidth;
      const h = window.innerHeight;
      this.sizeCanvas();
      ctx.clearRect(0, 0, w, h);

      for (const p of parts) {
        const speed = (cfg.v * dt) / 1000;
        if (cfg.v !== 0) {
          p.y += speed * p.sp;
          if (p.y > 1.08) p.y = -0.08;
          if (p.y < -0.08) p.y = 1.08;
        }
        const sway = Math.sin(t / 2600 + p.ph) * cfg.sway * 0.02 * p.z;
        const x = (p.x + sway) * w;
        const y = p.y * h;
        const alpha =
          cfg.shape === 'twinkle'
            ? cfg.a * (0.35 + 0.65 * Math.abs(Math.sin(t / 1400 + p.ph)))
            : cfg.a * p.z;
        const r = cfg.shape === 'streak' ? cfg.s : p.r * p.z;

        if (cfg.shape === 'streak') {
          ctx.strokeStyle = `rgba(${cfg.c},${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 1.5, y + 14 * p.z);
          ctx.stroke();
        } else if (cfg.shape === 'petal') {
          ctx.fillStyle = `rgba(${cfg.c},${alpha})`;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.55, p.ph + t / 900, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${cfg.c},${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /**
   * The lofi shader draws five layers of soft circles drifting up through the
   * frame at different depths. That is the whole effect, and it is cheap to
   * redraw honestly: one pass of radial gradients, back to front.
   */
  private runBokeh() {
    const canvas = this.canvas!;
    const ctx = this.ctx!;
    const parts = Array.from({ length: 30 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.25 + Math.random() * 0.75,
      r: 0.6 + Math.random() * 1.6,
      v: 0.004 + Math.random() * 0.012,
      drift: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.62,
    }));
    let t = 0;

    const step = (now: number) => {
      this.raf = requestAnimationFrame(step);
      if (now - this.last < 40) return;
      const dt = this.last ? Math.min(80, now - this.last) : 16;
      this.last = now;
      t += dt;

      const w = window.innerWidth;
      const h = window.innerHeight;
      this.sizeCanvas();
      ctx.clearRect(0, 0, w, h);

      for (const p of parts) {
        p.y -= (p.v * dt) / h * 60;
        if (p.y < -0.1) {
          p.y = 1.1;
          p.x = Math.random();
        }
        const x = (p.x + Math.sin(t / 5200 + p.drift) * 0.02 * p.z) * w;
        const y = p.y * h;
        const rad = p.r * 26 * p.z;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const a = 0.05 + p.z * 0.10;
        const tint = p.warm ? '255,190,150' : '255,246,232';
        g.addColorStop(0, `rgba(${tint},${a})`);
        g.addColorStop(0.55, `rgba(${tint},${a * 0.45})`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /**
   * The cyberdeck shader lays binary digits over the skyline. A canvas cannot
   * fade itself with a translucent fill without also hiding the video behind
   * it, so the trail is faded with `destination-out`, which only erases the
   * pixels this canvas drew.
   */
  private runMatrix() {
    const canvas = this.canvas!;
    const ctx = this.ctx!;
    const size = 14;
    let cols = 0;
    let drops: number[] = [];

    const reset = () => {
      cols = Math.ceil(window.innerWidth / size);
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };
    reset();

    const step = (now: number) => {
      this.raf = requestAnimationFrame(step);
      if (now - this.last < 70) return; // ~14 fps is plenty
      this.last = now;

      this.sizeCanvas();
      if (Math.ceil(window.innerWidth / size) !== cols) reset();

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'source-over';

      ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const h = window.innerHeight;
      for (let i = 0; i < cols; i++) {
        const ch = Math.random() > 0.5 ? '1' : '0';
        const y = drops[i] * size;
        // a few cyan "data" columns among the amber ones, like the shader
        ctx.fillStyle = i % 9 === 0 ? 'rgba(0,196,255,0.55)' : 'rgba(255,214,90,0.34)';
        ctx.fillText(ch, i * size, y);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      }
    };
    this.raf = requestAnimationFrame(step);
  }
}

export const modWall = new ModWall();
