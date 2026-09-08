const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  TableOfContents, PageBreak, Header, Footer, PageNumber, LevelFormat,
  convertInchesToTwip
} = require('docx');

// ── palette ────────────────────────────────────────────────────────────
const INK      = '1B2027';
const GRAPHITE = '5F6875';
const TEAL     = '0F7A83';
const TEAL_BG  = 'E9F3F3';
const RED      = 'C4342A';
const RED_BG   = 'FBEDEC';
const RULE     = 'D9D7D1';
const HEAD_BG  = 'F2F1EE';

const BODY = 'Calibri';
const MONO = 'Consolas';

const USABLE = 9746;           // A4 minus 0.75in margins, in DXA

// ── inline markup: **bold** and `code` ─────────────────────────────────
// Split a string on `code` spans. Used on its own for plain text and again
// INSIDE a bold token — a code span nested in bold is common ("**`x` is the
// product.**") and matching only the outer token emitted its backticks
// verbatim.
function splitCode(s) {
  const parts = [];
  const re = /`[^`]+`/g;
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index), code: false });
    parts.push({ text: m[0].slice(1, -1), code: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last), code: false });
  return parts;
}

function runs(text, opts = {}) {
  const size = opts.size || 21;
  const color = opts.color || INK;
  const emit = (out, piece, bold) => out.push(new TextRun({
    text: piece.text, bold, color,
    font: piece.code ? MONO : BODY,
    size: piece.code ? size - 2 : size
  }));

  const out = [];
  const re = /\*\*[^*]+\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) splitCode(text.slice(last, m.index)).forEach(pc => emit(out, pc, false));
    splitCode(m[0].slice(2, -2)).forEach(pc => emit(out, pc, true));
    last = m.index + m[0].length;
  }
  if (last < text.length) splitCode(text.slice(last)).forEach(pc => emit(out, pc, false));
  return out.length ? out : [new TextRun({ text: '', font: BODY, size, color })];
}

const p    = (t, o = {}) => new Paragraph({ children: runs(t, o), spacing: { after: 140, line: 276 }, ...o.para });
const lead = (t)         => new Paragraph({ children: runs(t, { color: GRAPHITE }), spacing: { after: 200, line: 276 } });

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
  children: [new TextRun({ text: t, font: BODY, size: 30, bold: true, color: INK })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 140 },
  children: [new TextRun({ text: t, font: BODY, size: 25, bold: true, color: TEAL })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 120 },
  children: [new TextRun({ text: t, font: BODY, size: 22, bold: true, color: GRAPHITE })] });

const bullet = (t) => new Paragraph({ children: runs(t), numbering: { reference: 'dot', level: 0 },
                                      spacing: { after: 90, line: 276 } });

function code(lines) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: HEAD_BG, color: 'auto' },
    spacing: { before: 100, after: 160 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 6 } },
    children: lines.flatMap((l, i) => {
      const r = [new TextRun({ text: l, font: MONO, size: 17, color: INK })];
      return i < lines.length - 1 ? r.concat(new TextRun({ break: 1 })) : r;
    })
  });
}

function note(t) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: RED_BG, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 8 } },
    spacing: { before: 140, after: 180 }, indent: { left: 120, right: 120 },
    children: runs(t)
  });
}

// ── tables ─────────────────────────────────────────────────────────────
const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };

function cell(text, w, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: cellBorders,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    verticalAlign: o.valign,
    children: (Array.isArray(text) ? text : [text]).map(t =>
      new Paragraph({
        alignment: o.align,
        spacing: { after: 40, line: 240 },
        children: runs(t, { size: o.size || 19, color: o.color })
          .map(r => o.bold ? new TextRun({ ...r, bold: true }) : r)
      }))
  });
}

function table(widths, rows) {
  return new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: rows.map(r => new TableRow({
      tableHeader: r.header,
      children: r.cells.map((c, i) =>
        cell(c.t, widths[i], { ...c, fill: c.fill || (r.header ? HEAD_BG : undefined),
                               bold: c.bold || r.header }))
    }))
  });
}

const caption = (t) => new Paragraph({
  spacing: { before: 80, after: 240 },
  children: runs(t, { size: 17, color: GRAPHITE })
});

// ── DIAGRAM 1 — the integration boundary ───────────────────────────────
function diagramBoundary() {
  const w = [3100, 3546, 3100];
  return [
    table(w, [
      { header: true, cells: [
        { t: 'HOST CDE', align: AlignmentType.CENTER, color: TEAL },
        { t: 'EXCHANGE', align: AlignmentType.CENTER, color: GRAPHITE },
        { t: 'VIEWER PRODUCT', align: AlignmentType.CENTER, color: GRAPHITE } ] },

      { cells: [
        { t: ['Their document store', 'SharePoint / S3 / Blob'], fill: TEAL_BG },
        { t: ['1.  mount the viewer', '✗  NOT BUILT — no embed surface'],
          fill: RED_BG, color: RED, align: AlignmentType.CENTER },
        { t: ['viewer-core', '6 components · 6 services'] } ] },

      { cells: [
        { t: ['Their identity provider', 'Entra / Okta / own'], fill: TEAL_BG },
        { t: ['2.  identify the user', '✗  NOT BUILT — no token exchange'],
          fill: RED_BG, color: RED, align: AlignmentType.CENTER },
        { t: ['Conversion pipeline', 'fetch → scan → render'] } ] },

      { cells: [
        { t: ['Their web interface', 'where the viewer appears'], fill: TEAL_BG },
        { t: ['3.  hand over the document  →', '✓  BUILT', 'POST /api/conversions'],
          fill: TEAL_BG, color: TEAL, align: AlignmentType.CENTER, bold: true },
        { t: ['Markup store', 'tied to our user table'] } ] },

      { cells: [
        { t: '', fill: TEAL_BG },
        { t: ['←  4.  return the markups', '✗  NOT BUILT — 17 operations undecided'],
          fill: RED_BG, color: RED, align: AlignmentType.CENTER },
        { t: '' } ] }
    ]),
    caption('Figure 1 — Three of the four exchanges do not exist. The viewer can already take a '
          + 'document from anyone’s storage; it cannot yet be mounted, be told who is looking, '
          + 'or give anything back.')
  ];
}

// ── DIAGRAM 2 — the conversion ingress ─────────────────────────────────
function diagramIngress() {
  const w = [700, 3200, 5846];
  const step = (n, stage, detail, fill) => ({ cells: [
    { t: n, align: AlignmentType.CENTER, bold: true, color: TEAL, fill },
    { t: stage, bold: true, fill },
    { t: detail, fill } ] });
  return [
    table(w, [
      { header: true, cells: [
        { t: '#', align: AlignmentType.CENTER }, { t: 'STAGE' }, { t: 'WHAT HAPPENS' } ] },
      step('1', 'Host mints a link', 'Short-lived, single-object, your credentials. We never hold them.', TEAL_BG),
      step('2', 'Submit', 'POST /api/conversions { sourceUrl, targetFormat } — 202 + Location header, under one second'),
      step('3', 'Destination policy', 'Resolves the hostname and validates the ADDRESS, not the string. Refuses loopback, link-local, 169.254.169.254, RFC 1918, .internal. Redirects are NOT followed.'),
      step('4', 'Bounded fetch', 'Size cap enforced during the stream, not after. Connect and read timeouts.'),
      step('5', 'Quarantine + scan', 'Magic-byte type check, then ClamAV. Not referenced by the application until clean.'),
      step('6', 'Convert', 'Sandboxed, resource-limited, network-isolated worker, out of process.'),
      step('7', 'Poll', 'GET /api/conversions/{jobId} — PENDING, RUNNING, then SUCCEEDED / FAILED / CANCELLED (terminal)', TEAL_BG),
      step('8', 'Collect', 'GET /api/conversions/{jobId}/content — streamed', TEAL_BG)
    ]),
    caption('Figure 2 — The one exchange that is built, end to end. Stages 1, 7 and 8 are yours; '
          + '2 to 6 are ours. Always send an Idempotency-Key so a timed-out retry returns the same '
          + 'job rather than converting twice.')
  ];
}

// ── DIAGRAM 3 — the identity coupling ──────────────────────────────────
function diagramIdentity() {
  const w = [4873, 4873];
  return [
    table(w, [
      { header: true, cells: [
        { t: 'TODAY', align: AlignmentType.CENTER, color: RED },
        { t: 'NEEDED', align: AlignmentType.CENTER, color: TEAL } ] },
      { cells: [
        { t: ['Priya, at Asite', 'host identity'], fill: RED_BG, align: AlignmentType.CENTER },
        { t: ['Priya, at Asite', 'signed assertion'], fill: TEAL_BG, align: AlignmentType.CENTER } ] },
      { cells: [
        { t: '↓   blocked', align: AlignmentType.CENTER, color: RED, bold: true },
        { t: '↓', align: AlignmentType.CENTER, color: TEAL, bold: true } ] },
      { cells: [
        { t: ['Annotation.author', '@ManyToOne User'], align: AlignmentType.CENTER },
        { t: ['Annotation.authorRef', 'opaque value'], align: AlignmentType.CENTER } ] },
      { cells: [
        { t: '↓', align: AlignmentType.CENTER, color: RED, bold: true },
        { t: '↓', align: AlignmentType.CENTER, color: TEAL, bold: true } ] },
      { cells: [
        { t: ['OUR users table', 'she must exist as a row'], fill: RED_BG,
          align: AlignmentType.CENTER, color: RED },
        { t: ['Issuer + subject', 'no row required'], fill: TEAL_BG,
          align: AlignmentType.CENTER, color: TEAL } ] },
      { cells: [
        { t: 'Integration means shadow-provisioning every host user into our database.',
          align: AlignmentType.CENTER, color: GRAPHITE },
        { t: 'The host stays the system of record for who its people are.',
          align: AlignmentType.CENTER, color: GRAPHITE } ] }
    ]),
    caption('Figure 3 — The difference is one field. Annotation.author is a foreign key into our own '
          + 'user table, so a markup cannot exist without a local user row.')
  ];
}

// ── document scaffolding ───────────────────────────────────────────────
function titleBlock(title, subtitle, statusLines) {
  return [
    new Paragraph({ spacing: { after: 60 },
      children: [new TextRun({ text: 'VIEWER PRODUCT', font: BODY, size: 17, bold: true,
                               color: TEAL, characterSpacing: 60 })] }),
    new Paragraph({ spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 10 } },
      children: [new TextRun({ text: title, font: BODY, size: 52, bold: true, color: INK })] }),
    new Paragraph({ spacing: { before: 140, after: 200 },
      children: [new TextRun({ text: subtitle, font: BODY, size: 23, color: GRAPHITE })] }),
    ...statusLines.map(s => note(s))
  ];
}

function makeDoc(sections) {
  return new Document({
    creator: 'CDE Platform engineering',
    description: 'Viewer product documentation',
    numbering: { config: [{ reference: 'dot', levels: [{
      level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] }] },
    styles: { default: { document: { run: { font: BODY, size: 21, color: INK } } } },
    sections
  });
}

function section(children, footerText) {
  return {
    properties: { page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
      children: [
        new TextRun({ text: footerText + '   ', font: BODY, size: 16, color: GRAPHITE }),
        new TextRun({ children: [PageNumber.CURRENT], font: BODY, size: 16, color: GRAPHITE })
      ] })] }) },
    children
  };
}

module.exports = { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  TableOfContents, PageBreak, runs, p, lead, h1, h2, h3, bullet, code, note, table, cell,
  caption, diagramBoundary, diagramIngress, diagramIdentity, titleBlock, makeDoc, section,
  INK, GRAPHITE, TEAL, TEAL_BG, RED, RED_BG, HEAD_BG, RULE, BODY, MONO, USABLE, fs };
