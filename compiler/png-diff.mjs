import fs from 'node:fs';
import zlib from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(file) {
  const buffer = fs.readFileSync(file);
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) throw new Error(`expected PNG: ${file}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG encoding in ${file}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType} in ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const source = raw[sourceOffset++];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const up = y > 0 ? pixels[rowOffset - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowOffset - rowBytes + x - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : (() => { throw new Error(`unsupported PNG filter ${filter}`); })();
      pixels[rowOffset + x] = (source + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const source = index * channels;
    const target = index * 4;
    if (colorType === 0) {
      rgba[target] = pixels[source]; rgba[target + 1] = pixels[source]; rgba[target + 2] = pixels[source]; rgba[target + 3] = 255;
    } else if (colorType === 2) {
      rgba[target] = pixels[source]; rgba[target + 1] = pixels[source + 1]; rgba[target + 2] = pixels[source + 2]; rgba[target + 3] = 255;
    } else if (colorType === 4) {
      rgba[target] = pixels[source]; rgba[target + 1] = pixels[source]; rgba[target + 2] = pixels[source]; rgba[target + 3] = pixels[source + 1];
    } else {
      rgba[target] = pixels[source]; rgba[target + 1] = pixels[source + 1]; rgba[target + 2] = pixels[source + 2]; rgba[target + 3] = pixels[source + 3];
    }
  }
  return { width, height, rgba };
}

export function comparePngFiles(expectedFile, actualFile, channelTolerance = 8) {
  const expected = decodePng(expectedFile);
  const actual = decodePng(actualFile);
  const sameCanvas = expected.width === actual.width && expected.height === actual.height;
  if (!sameCanvas) return { sameCanvas: false, pixelDiffRatio: 1, meanChannelDelta: 255 };
  let changedPixels = 0;
  let totalDelta = 0;
  const pixelCount = expected.width * expected.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(expected.rgba[pixel * 4 + channel] - actual.rgba[pixel * 4 + channel]);
      totalDelta += delta;
      if (delta > channelTolerance) changed = true;
    }
    if (changed) changedPixels += 1;
  }
  return {
    sameCanvas: true,
    pixelDiffRatio: changedPixels / pixelCount,
    meanChannelDelta: totalDelta / (pixelCount * 4),
  };
}
