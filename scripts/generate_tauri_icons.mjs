#!/usr/bin/env node
/**
 * Generates deterministic valid PNG and Windows ICO files in `src-tauri/icons/`
 * required by `tauri-build` and `tauri build` (MSI / NSIS bundlers on Windows).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.resolve(__dirname, '../src-tauri/icons');

fs.mkdirSync(ICONS_DIR, { recursive: true });

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createSolidPng(width, height, r = 63, g = 81, b = 181, a = 255) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type 6 = RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw scanlines: 1 filter byte (0) + width * 4 RGBA bytes per row
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      // Draw a warm off-white "L" glyph in the center on muted indigo (#3F51B5) background
      const nx = x / width;
      const ny = y / height;
      const isGlyphL =
        (nx >= 0.30 && nx <= 0.44 && ny >= 0.22 && ny <= 0.78) ||
        (nx >= 0.30 && nx <= 0.72 && ny >= 0.64 && ny <= 0.78);
      if (isGlyphL) {
        raw[px] = 250;
        raw[px + 1] = 248;
        raw[px + 2] = 245;
        raw[px + 3] = 255;
      } else {
        raw[px] = r;
        raw[px + 1] = g;
        raw[px + 2] = b;
        raw[px + 3] = a;
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIcoFromPng(pngBuf, width = 32, height = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = width >= 256 ? 0 : width;
  dirEntry[1] = height >= 256 ? 0 : height;
  dirEntry[2] = 0; // palette
  dirEntry[3] = 0; // reserved
  dirEntry.writeUInt16LE(1, 4); // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(pngBuf.length, 8); // size of image data
  dirEntry.writeUInt32LE(6 + 16, 12); // offset of image data

  return Buffer.concat([header, dirEntry, pngBuf]);
}

const png32 = createSolidPng(32, 32);
const png128 = createSolidPng(128, 128);
const png256 = createSolidPng(256, 256);
const ico = createIcoFromPng(png32, 32, 32);

fs.writeFileSync(path.join(ICONS_DIR, '32x32.png'), png32);
fs.writeFileSync(path.join(ICONS_DIR, '128x128.png'), png128);
fs.writeFileSync(path.join(ICONS_DIR, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), png256);
fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), ico);

console.log('Generated valid PNG and ICO icons in src-tauri/icons/');
