import fs from 'node:fs';
import zlib from 'node:zlib';

function createPNG(width, height, drawFn) {
  // width and height as 32-bit big endian
  // IHDR: width(4), height(4), bitDepth(1)=8, colorType(1)=6 (RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(width, 0);
  IHDR.writeUInt32BE(height, 4);
  IHDR[8] = 8;
  IHDR[9] = 6;
  IHDR[10] = 0;
  IHDR[11] = 0;
  IHDR[12] = 0;

  // Raw image data with filter byte (0) before each scanline
  const scanlineLength = width * 4;
  const rawData = Buffer.alloc(height * (1 + scanlineLength));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + scanlineLength);
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const IDAT = zlib.deflateSync(rawData);

  // Helper to make PNG chunk: length (4) + type (4) + data + crc (4)
  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([typeBuf, data]);
    const crc = crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([lenBuf, body, crcBuf]);
  }

  // Precomputed CRC table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', IHDR);
  const idatChunk = makeChunk('IDAT', IDAT);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon drawing function with slate styling
function drawSlateIcon(x, y, w, h, isMaskable = false) {
  const nx = x / w;
  const ny = y / h;

  // Dark slate background
  let r = 30;
  let g = 34;
  let b = 43;
  let a = 255;

  // Corner rounding check if not maskable
  if (!isMaskable) {
    const cx = Math.abs(nx - 0.5) * 2;
    const cy = Math.abs(ny - 0.5) * 2;
    const rad = 0.85;
    if (cx > rad && cy > rad) {
      const dist = Math.hypot(cx - rad, cy - rad);
      if (dist > (1 - rad)) {
        return [0, 0, 0, 0];
      }
    }
  }

  // Notebook cover rect: nx 0.22 to 0.78, ny 0.18 to 0.82
  if (nx >= 0.22 && nx <= 0.78 && ny >= 0.18 && ny <= 0.82) {
    // Notebook blue cover
    r = 47;
    g = 109;
    b = 246;

    // White page inside: nx 0.30 to 0.72, ny 0.24 to 0.76
    if (nx >= 0.30 && nx <= 0.72 && ny >= 0.24 && ny <= 0.76) {
      r = 255;
      g = 255;
      b = 255;

      // Ruled line stripes
      const lineStep = 0.08;
      const modY = (ny - 0.24) % lineStep;
      if (modY < 0.007 && ny >= 0.32 && ny <= 0.68) {
        r = 190;
        g = 205;
        b = 225;
      }

      // Red margin line
      if (Math.abs(nx - 0.40) < 0.006) {
        r = 240;
        g = 120;
        b = 120;
      }
    }

    // Stylus diagonal line
    // line from (0.50, 0.35) to (0.75, 0.75)
    const distToLine = Math.abs((0.75 - 0.50) * (0.35 - ny) - (0.50 - nx) * (0.75 - 0.35)) / Math.hypot(0.25, 0.40);
    if (distToLine < 0.025 && nx >= 0.48 && nx <= 0.80 && ny >= 0.32 && ny <= 0.80) {
      r = 230;
      g = 235;
      b = 245;
      // Stylus blue tip
      if (nx > 0.72 && ny > 0.72) {
        r = 59;
        g = 130;
        b = 246;
      }
    }
  }

  return [r, g, b, a];
}

fs.writeFileSync('public/pwa-192x192.png', createPNG(192, 192, (x, y, w, h) => drawSlateIcon(x, y, w, h, false)));
fs.writeFileSync('public/pwa-512x512.png', createPNG(512, 512, (x, y, w, h) => drawSlateIcon(x, y, w, h, false)));
fs.writeFileSync('public/pwa-maskable-512x512.png', createPNG(512, 512, (x, y, w, h) => drawSlateIcon(x, y, w, h, true)));
fs.writeFileSync('public/apple-touch-icon.png', createPNG(180, 180, (x, y, w, h) => drawSlateIcon(x, y, w, h, false)));

console.log('Generated PNG icons successfully.');
