/**
 * PNG and ICO writers.
 *
 * Node has DEFLATE and CRC-32 in `node:zlib`, which is most of PNG; the rest
 * is four chunk headers. ICO is a directory of embedded PNGs. Both are small
 * enough to write here and avoid a dependency (§0.3) for a build-time script.
 *
 * Nothing here records a timestamp — no `tIME` chunk, no ICO date field — so
 * regenerating produces byte-identical output and `generate → git diff` works
 * as a staleness check.
 */
import { deflateSync, crc32 } from 'node:zlib';

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

/**
 * Encode RGBA pixels as a PNG.
 *
 * Filter type 0 (None) on every row. A smarter filter would compress better,
 * but these are flat-colour icons a few kilobytes each, and a filter bug
 * produces a corrupt image rather than a large one.
 *
 * @param {Uint8ClampedArray} pixels RGBA, row major
 */
export function encodePng(pixels, size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + row * stride, stride)
      .copy(raw, row * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;      // bit depth
  header[9] = 6;      // colour type: truecolour with alpha
  header[10] = 0;     // deflate
  header[11] = 0;     // adaptive filtering
  header[12] = 0;     // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Pack PNGs into an ICO.
 *
 * PNG-encoded entries rather than the older BMP form: every browser in the
 * support matrix reads them, and the BMP form carries an inverted mask plane
 * that is easy to get subtly wrong.
 *
 * @param {Array<{size: number, png: Buffer}>} images
 */
export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);               // reserved
  header.writeUInt16LE(1, 2);               // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, png }, index) => {
    const at = index * 16;
    // 0 means 256 in this field; every size we emit is smaller than that.
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory[at + 2] = 0;                  // palette entries
    directory[at + 3] = 0;                  // reserved
    directory.writeUInt16LE(1, at + 4);     // colour planes
    directory.writeUInt16LE(32, at + 6);    // bits per pixel
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}
