/**
 * Paste a picture or a clip straight onto the page.
 *
 * Ctrl+V is the shortest path from "this is on my clipboard" to "this is on the
 * page", and on a desktop it is the path people reach for without being told.
 * The app already had an image button and a video button, but both of them open
 * a file dialog — which means saving the picture to disk first. That is a
 * detour for a screenshot, and no detour at all for one that was just taken.
 *
 * What arrives in a paste is not one thing, and the difference matters:
 *
 *   • A screenshot, as `image/png`, with no file name at all.
 *   • A file copied in Explorer, which arrives in `clipboardData.files`.
 *   • A copied image *address*, which is only text — no bytes anywhere.
 *   • Something that is not media: a paragraph, a spreadsheet cell, a folder.
 *
 * The first two are read as blobs. The third is worth a fetch, because "nothing
 * happened" is a poor answer to a deliberate paste. The fourth must be left
 * completely alone — a paste handler that swallows everything would break
 * pasting text into the text tool, which is the one place in this app where
 * pasting text is the whole point.
 *
 * The insertion itself lives in the engine (`window.SLATE_MEDIA`), because it
 * needs the current page, the undo stack and the stroke list. This module only
 * decides what was pasted.
 */

/* ------------------------------------------------------------------ */
/* The engine's side of the deal                                      */
/* ------------------------------------------------------------------ */

interface MediaBridge {
  /** Place an image blob on the page. Resolves with the stroke, or null. */
  img(f: Blob): Promise<unknown>;
  /** Place a video blob on the page. Resolves with the stroke, or null. */
  vid(f: Blob): Promise<unknown>;
  toast(message: string): void;
}

function bridge(): MediaBridge | null {
  const b = (window as any).SLATE_MEDIA;
  return b && typeof b.img === 'function' && typeof b.vid === 'function' ? (b as MediaBridge) : null;
}

/**
 * Is there a page to paste onto?
 *
 * The app opens on a library and only then shows a canvas. Pasting while the
 * library is up has nowhere to go, and silently creating a stroke on a hidden
 * notebook would be worse than doing nothing.
 */
function editorVisible(): boolean {
  const cv = document.getElementById('cv');
  return !!cv && cv.offsetParent !== null;
}

/**
 * Is the keystroke headed for a text field?
 *
 * If it is, the paste is not ours: the text tool's textarea, a rename box and a
 * search field all expect the browser's own behaviour, and stealing it to look
 * for an image would break the thing the user was actually doing.
 */
function inTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/* ------------------------------------------------------------------ */
/* Reading the clipboard                                              */
/* ------------------------------------------------------------------ */

/** Direct links to media, which is all a "copy image address" gives us. */
const IMAGE_URL = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?(?:#\S*)?$/i;
const VIDEO_URL = /^https?:\/\/\S+\.(?:mp4|webm|ogv|mov|m4v)(?:\?\S*)?(?:#\S*)?$/i;

/**
 * Every image or video in a transfer, once each.
 *
 * `files` covers a file copied in Explorer; `items` covers a screenshot copied
 * out of a viewer, which has no name and often appears in both lists. The
 * de-duplication key is type + size + name, which is enough to collapse the
 * same blob seen twice without merging two genuinely different images of equal
 * size — they would have to share a name as well, and a nameless screenshot
 * that matches another nameless screenshot in type and size is the same
 * screenshot.
 */
function mediaIn(dt: DataTransfer): File[] {
  const out: File[] = [];
  const seen = new Set<string>();
  const add = (f: File | null) => {
    if (!f || !f.size) return;
    if (!/^(?:image|video)\//.test(f.type)) return;
    const key = `${f.type}:${f.size}:${f.name || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  for (const f of Array.from(dt.files || [])) add(f);
  for (const it of Array.from(dt.items || [])) {
    if (it.kind === 'file') add(it.getAsFile());
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Placing it                                                         */
/* ------------------------------------------------------------------ */

async function insertAll(files: File[], b: MediaBridge): Promise<void> {
  let placed = 0;
  let videos = 0;
  for (const f of files) {
    const isVideo = /^video\//.test(f.type);
    const made = isVideo ? await b.vid(f) : await b.img(f);
    if (made) {
      placed++;
      if (isVideo) videos++;
    }
  }
  if (!placed) {
    b.toast("That file couldn't be read as an image or a video.");
    return;
  }
  b.toast(placed > 1 ? `Pasted ${placed} items` : videos ? 'Pasted video' : 'Pasted image');
}

/**
 * Try to pull a copied *link* down as a file.
 *
 * Only works when the other server allows it, which many image hosts do and
 * some do not. A failure here is not a bug to hide: the message says what to do
 * instead, because "nothing happened" after a deliberate paste reads as broken.
 */
async function fromUrl(url: string, b: MediaBridge): Promise<boolean> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (/^image\//.test(blob.type)) return !!(await b.img(blob));
    if (/^video\//.test(blob.type)) return !!(await b.vid(blob));
    return false;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

function onPaste(e: ClipboardEvent): void {
  const b = bridge();
  if (!b || !editorVisible()) return;
  if (inTextField(document.activeElement)) return;

  const dt = e.clipboardData;
  if (!dt) return;

  const files = mediaIn(dt);
  if (files.length) {
    e.preventDefault();
    void insertAll(files, b);
    return;
  }

  // No bytes, but possibly an address. A single token only: a paragraph of text
  // that happens to contain a URL is text, and belongs in the text tool.
  const text = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
  if (!text || /\s/.test(text)) return;
  if (!IMAGE_URL.test(text) && !VIDEO_URL.test(text)) return;

  e.preventDefault();
  void (async () => {
    const ok = await fromUrl(text, b);
    if (!ok) b.toast("That link can't be read from this page — save the file and paste it instead.");
  })();
}

/**
 * Claim a drag only while files are in flight.
 *
 * Preventing `dragover` unconditionally would also cancel dragging selected
 * text around the page, which is a thing people do inside a text box.
 */
function onDragOver(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (!dt) return;
  if (!Array.from(dt.types || []).includes('Files')) return;
  e.preventDefault();
  dt.dropEffect = 'copy';
}

function onDrop(e: DragEvent): void {
  const b = bridge();
  if (!b || !editorVisible() || !e.dataTransfer) return;
  const files = mediaIn(e.dataTransfer);
  if (!files.length) return;
  e.preventDefault();
  void insertAll(files, b);
}

function install(): void {
  // A module can be evaluated twice in a hot-reload; two listeners would place
  // the same screenshot twice.
  if ((window as any).__slatePaste) return;
  (window as any).__slatePaste = { onPaste, onDrop, mediaIn, fromUrl };
  // Capture, so a handler on a focused element cannot consume the paste first.
  document.addEventListener('paste', onPaste, true);
  document.addEventListener('dragover', onDragOver, true);
  document.addEventListener('drop', onDrop, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
else install();
