/**
 * How the wallpaper sits behind the app: sharp or soft, and how loud.
 *
 * Two complaints drove this module. Light themes looked *blurry*, because the
 * frosted panels over the wallpaper (`#libm`, `#nav`) carry a backdrop blur,
 * and a 7 px blur over a pale photograph reads as a smudge rather than a
 * picture. And there was no way to say "I want to see the wallpaper" — the
 * scrim was tuned once, by the theme, and that was that.
 *
 * So the look is a pair of user settings, applied to the document root so the
 * CSS in `themes.ts` and `themes-skin.ts` can react to them:
 *
 *   data-gx-wallfx="hd"    drop the frost; the wallpaper is shown as shot
 *   --gx-wall-a            0.1 - 1, the layer's own opacity
 *
 * They are global rather than per-theme on purpose: this is a preference about
 * your eyes, not about the mod you happen to be wearing.
 */

const KEY = 'inkpad_wall_look';

export interface WallLook {
  hd: boolean;
  alpha: number;
}

/**
 * HD by default. The frosted look is the nicer default in theory — it keeps a
 * busy photograph from fighting the shelf — but the complaint that started
 * this was that the wallpaper looked blurry, so the out-of-the-box answer is
 * the picture as shot. Blur is one click away for anyone who wants calm.
 */
const DEFAULTS: WallLook = { hd: true, alpha: 1 };
const MIN_ALPHA = 0.1;

type Listener = () => void;

class WallLookStore {
  readonly look: WallLook = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private booted = false;

  boot() {
    if (this.booted) return;
    this.booted = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.hd === 'boolean') this.look.hd = p.hd;
        if (Number(p?.alpha) >= MIN_ALPHA && Number(p?.alpha) <= 1) {
          this.look.alpha = Number(p.alpha);
        }
      }
    } catch {
      /* defaults */
    }
    this.apply();
  }

  get hd() {
    return this.look.hd;
  }

  get alpha() {
    return this.look.alpha;
  }

  setHd(on: boolean) {
    if (this.look.hd === on) return;
    this.look.hd = on;
    this.save();
  }

  setAlpha(v: number) {
    const a = Math.max(MIN_ALPHA, Math.min(1, v));
    if (Math.abs(this.look.alpha - a) < 0.001) return;
    this.look.alpha = a;
    this.save();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.look));
    } catch {
      /* ignore */
    }
    this.apply();
    this.listeners.forEach((fn) => fn());
  }

  private apply() {
    const root = document.documentElement;
    root.dataset.gxWallfx = this.look.hd ? 'hd' : 'blur';
    root.style.setProperty('--gx-wall-a', String(this.look.alpha));
  }
}

export const wallLook = new WallLookStore();

wallLook.boot();
