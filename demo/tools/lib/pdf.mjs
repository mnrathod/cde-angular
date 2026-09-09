/**
 * A very small PDF writer, enough for a synthetic drawing sheet.
 *
 * Written rather than taken from a library because the sample files have to
 * be provably ours (CLAUDE.md §17.1): a drawing pulled off the internet
 * carries a licence we would have to trace, and a generated one carries none.
 * The output uses only the base-14 fonts, so no font file is embedded and no
 * font licence attaches either.
 *
 * This is deliberately not a general-purpose PDF library. It writes the
 * handful of operators a drawing sheet needs and nothing else; anything more
 * belongs in a dependency, and a dependency here would need approval (§0.3).
 */

/**
 * The non-ASCII characters worth having, mapped to their WinAnsiEncoding byte.
 *
 * The file is written as latin1, so a character outside this map would be
 * silently truncated to its low byte and simply not draw. That happened: an
 * en dash in a sheet title vanished, the PDF opened cleanly, and the only
 * evidence was a missing glyph nobody was looking at. Unmappable characters
 * now throw instead.
 */
const WIN_ANSI = new Map([
  ['–', 0x96], ['—', 0x97],   // en dash, em dash
  ['‘', 0x91], ['’', 0x92],   // single quotes
  ['“', 0x93], ['”', 0x94],   // double quotes
  ['•', 0x95], ['°', 0xB0],   // bullet, degree
]);

/** Escape a string for a PDF literal — only `\`, `(` and `)` are special. */
function pdfString(text) {
  let encoded = '';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code < 0x80) {
      encoded += '\\()'.includes(character) ? `\\${character}` : character;
      continue;
    }
    const winAnsi = WIN_ANSI.get(character);
    if (winAnsi === undefined) {
      throw new Error(
        `Character ${JSON.stringify(character)} (U+${code.toString(16).toUpperCase()}) ` +
        'has no WinAnsiEncoding mapping here. Use ASCII, or add it to WIN_ANSI.',
      );
    }
    encoded += String.fromCharCode(winAnsi);
  }
  return `(${encoded})`;
}

/**
 * Assemble numbered objects into a PDF file with a correct cross-reference
 * table. Object N is `objects[N - 1]`; the table needs each one's byte offset,
 * so the body is built first and measured as it goes.
 */
function assemble(objects, { catalogRef, infoRef }) {
  const header = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  let body = '';
  const offsets = [];

  objects.forEach((content, index) => {
    // Offsets are byte counts, and the body is latin1 throughout, so string
    // length and byte length agree. Using `.length` on a UTF-8 string here
    // would put every offset after the first non-ASCII character wrong, and
    // the file would still open in forgiving readers — the worst kind of bug.
    offsets.push(Buffer.byteLength(header, 'latin1') + Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(header, 'latin1') + Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R ` +
    `/Info ${infoRef} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'latin1');
}

/** Content-stream operators, named so the drawing code reads as drawing. */
export const draw = {
  strokeColour: (r, g, b) => `${r} ${g} ${b} RG`,
  fillColour:   (r, g, b) => `${r} ${g} ${b} rg`,
  lineWidth:    (w) => `${w} w`,
  rectangle:    (x, y, w, h) => `${x} ${y} ${w} ${h} re`,
  stroke:       () => 'S',
  fill:         () => 'f',
  moveTo:       (x, y) => `${x} ${y} m`,
  lineTo:       (x, y) => `${x} ${y} l`,
  closeAndStroke: () => 'h S',
  text: (x, y, sizePt, content, font = 'F1') =>
    `BT /${font} ${sizePt} Tf ${x} ${y} Td ${pdfString(content)} Tj ET`,
};

/**
 * Build a PDF from pages, each of which is an array of content-stream lines.
 *
 * `title` and `language` are set because they cost nothing and a document
 * without them announces itself to a screen reader as "untitled" in whatever
 * language the reader assumes (§1A.4). This does not make the file PDF/UA —
 * there is no structure tree, and a sample drawing is content we are handed
 * rather than an export we produce, so it is honest for it to be untagged.
 */
export function buildPdf({ pages, title, language = 'en-AU', widthPt, heightPt }) {
  const catalogRef = 1;
  const pagesRef = 2;
  const fontRegularRef = 3;
  const fontBoldRef = 4;
  const infoRef = 5;
  const firstPageRef = 6;

  const pageRefs = pages.map((_, index) => firstPageRef + index * 2);
  const objects = [];

  objects[catalogRef - 1] =
    `<< /Type /Catalog /Pages ${pagesRef} 0 R /Lang ${pdfString(language)} >>`;
  objects[pagesRef - 1] =
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] ` +
    `/Count ${pages.length} >>`;
  objects[fontRegularRef - 1] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[fontBoldRef - 1] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  // A fixed creation date, because these files are committed and a generator
  // that produced different bytes every run would make "regenerate and diff"
  // impossible to use as a check.
  objects[infoRef - 1] =
    `<< /Title ${pdfString(title)} /Producer ${pdfString('cde-angular demo sample generator')} ` +
    `/CreationDate ${pdfString('D:20260101000000Z')} >>`;

  pages.forEach((lines, index) => {
    const pageRef = pageRefs[index];
    const contentRef = pageRef + 1;
    const stream = lines.join('\n');

    objects[pageRef - 1] =
      `<< /Type /Page /Parent ${pagesRef} 0 R ` +
      `/MediaBox [0 0 ${widthPt} ${heightPt}] ` +
      `/Resources << /Font << /F1 ${fontRegularRef} 0 R /F2 ${fontBoldRef} 0 R >> >> ` +
      `/Contents ${contentRef} 0 R >>`;
    objects[contentRef - 1] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  return assemble(objects, { catalogRef, infoRef });
}
