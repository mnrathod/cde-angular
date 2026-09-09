#!/usr/bin/env node
/**
 * Draw the application icons.
 *
 *   node tools/icons/generate-icons.mjs          # write public/
 *   node tools/icons/generate-icons.mjs --check  # fail if they are stale
 *
 * **This is a placeholder mark, and deliberately so.** The icons it replaces
 * were the Angular logo, left in place from `ng generate @angular/pwa` and
 * presented as this product's identity — a third-party trademark used in the
 * one way §17.4 does not permit. The product has no mark of its own yet, and
 * choosing one is a brand and trademark-clearance decision rather than an
 * engineering one (§17.4: cleared and registered before public launch).
 *
 * So this is the narrow correct fix: something neutral that is unambiguously
 * ours, replacing something that is unambiguously not. `docs/licences.md`
 * records it as a placeholder so nobody mistakes it for a decision.
 *
 * The geometry below is the entire provenance. Nothing is traced, copied, or
 * derived from another mark.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, roundedRect } from './lib/raster.mjs';
import { encodePng, encodeIco } from './lib/png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(here, '..', '..', 'public');

/**
 * Colours, taken from the theme already in the repository rather than newly
 * invented, so the installed icon and the application agree.
 */
const GROUND = [0x1e, 0x3a, 0x5f];   // #1e3a5f — the manifest's theme_color
const SHEET = [0xff, 0xff, 0xff];
const FOLD = [0x9d, 0xc2, 0xe0];     // a lighter tint of the ground

/**
 * The mark: a sheet with a folded corner, centred on a filled ground.
 *
 * Two constraints shaped it, and both are checkable rather than matters of
 * taste:
 *
 * 1. **Maskable safe zone.** A `purpose: "maskable"` icon may be cropped by
 *    the platform to any shape inside a circle of 80% diameter, so everything
 *    that carries meaning must sit within 0.4 of the size from the centre.
 *    The sheet's half-diagonal is ~0.32, which `assertWithinSafeZone` checks.
 * 2. **It has to survive 16px.** Anything with interior detail — rules on the
 *    sheet, a wordmark — turns to mush in a browser tab. One silhouette with
 *    one notch still reads.
 */
function drawMark(size) {
  const canvas = new Canvas(size);
  canvas.fill(GROUND);

  const sheet = roundedRect(SHEET_X, SHEET_Y, SHEET_WIDTH, SHEET_HEIGHT, CORNER, {
    corners: { topRight: 0 },   // the folded corner is a cut, not a curve
  });

  // Replace the square top-right corner with the diagonal of the fold.
  const cutStartX = SHEET_X + SHEET_WIDTH - FOLD_SIZE;
  const cutEndY = SHEET_Y + FOLD_SIZE;
  const body = sheet.flatMap((point) => {
    const [x, y] = point;
    const isTopRightCorner =
      Math.abs(x - (SHEET_X + SHEET_WIDTH)) < 1e-9 && Math.abs(y - SHEET_Y) < 1e-9;
    return isTopRightCorner ? [[cutStartX, SHEET_Y], [SHEET_X + SHEET_WIDTH, cutEndY]] : [point];
  });

  canvas.fillPolygon(body, SHEET);
  canvas.fillPolygon([
    [cutStartX, SHEET_Y],
    [SHEET_X + SHEET_WIDTH, cutEndY],
    [cutStartX, cutEndY],
  ], FOLD);

  return canvas;
}

// Normalised to the canvas, so one definition serves every size.
const SHEET_WIDTH = 0.40;
const SHEET_HEIGHT = 0.50;
const SHEET_X = (1 - SHEET_WIDTH) / 2;
const SHEET_Y = (1 - SHEET_HEIGHT) / 2;
const CORNER = 0.035;
const FOLD_SIZE = 0.14;

/**
 * The safe-zone check, as an assertion rather than a comment.
 *
 * A maskable icon whose content strays outside the circle looks correct in a
 * file browser and gets its corner sliced off on an Android home screen —
 * a place nobody in this repository is going to look.
 */
function assertWithinSafeZone() {
  const halfDiagonal = Math.hypot(SHEET_WIDTH / 2, SHEET_HEIGHT / 2);
  if (halfDiagonal > 0.4) {
    throw new Error(
      `The mark reaches ${halfDiagonal.toFixed(3)} from the centre, outside the ` +
      '0.4 maskable safe zone. Shrink the sheet or drop "maskable" from the manifest.',
    );
  }
  return halfDiagonal;
}

const PNG_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ICO_SIZES = [16, 32, 48];

const checkOnly = process.argv.includes('--check');
const halfDiagonal = assertWithinSafeZone();

const outputs = new Map();
for (const size of PNG_SIZES) {
  outputs.set(join(publicDirectory, 'icons', `icon-${size}x${size}.png`),
    encodePng(drawMark(size).pixels, size));
}
outputs.set(join(publicDirectory, 'favicon.ico'), encodeIco(
  ICO_SIZES.map((size) => ({ size, png: encodePng(drawMark(size).pixels, size) })),
));

let stale = 0;
for (const [path, content] of outputs) {
  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    if (!current.equals(content)) {
      console.error(`stale: ${path.replace(`${publicDirectory}/`, '')}`);
      stale += 1;
    }
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`${path.replace(`${publicDirectory}/`, '')}  ${content.length.toLocaleString()} bytes`);
}

if (checkOnly) {
  if (stale) {
    console.error(`\n${stale} icon(s) differ. Run: node tools/icons/generate-icons.mjs`);
    process.exit(1);
  }
  console.log('icons match their generator');
} else {
  console.log(`\nmaskable safe zone: content reaches ${halfDiagonal.toFixed(3)} of 0.400`);
}
