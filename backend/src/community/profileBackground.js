import { crc32, inflateSync } from 'node:zlib';

// Accept only the bounded, non-interlaced RGB/RGBA PNG produced by the editor.
export function validateBackground(photo) {
  if (typeof photo !== 'string' || photo.length > 1600000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) return null;
  const png = Buffer.from(photo, 'base64');
  if (png.length < 57 || png.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452'
    || png.readUInt32BE(16) !== 900 || png.readUInt32BE(20) !== 300
    || png[24] !== 8 || ![2, 6].includes(png[25]) || png[26] || png[27] || png[28]) return null;
  const data = [];
  let ended = false;
  for (let offset = 8; offset < png.length;) {
    if (offset + 12 > png.length) return null;
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length || crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) return null;
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') data.push(png.subarray(offset + 8, end - 4));
    else if (type === 'IEND') { if (length || end !== png.length) return null; ended = true; }
    else if (type === 'IHDR' ? offset !== 8 : (png[offset + 4] & 32) === 0) return null;
    offset = end;
  }
  if (!ended || !data.length) return null;
  const stride = 900 * (png[25] === 6 ? 4 : 3) + 1;
  try {
    const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: stride * 300 });
    if (pixels.length !== stride * 300) return null;
    for (let row = 0; row < 300; row++) if (pixels[row * stride] > 4) return null;
  } catch { return null; }
  return png;
}
