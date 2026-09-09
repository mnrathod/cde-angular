/**
 * The three sample documents, as content rather than as files.
 *
 * Everything here is invented. There is no real project, no real person, no
 * real address and no real asset — §14 requires synthetic test data, and §17.1
 * requires that any content asset we ship has a provenance we can state. Both
 * are satisfied the same way: by generating the files instead of finding them.
 *
 * The names are deliberately obvious placeholders. A sample called
 * "Level 02 GA" beside a plausible-looking practice name gets mistaken for a
 * real deliverable the first time someone opens the demo in front of a
 * customer.
 */
import { buildPdf, draw } from './pdf.mjs';
import { buildZip } from './zip.mjs';

const A3_LANDSCAPE = { widthPt: 1191, heightPt: 842 };

const INK = { line: draw.strokeColour(0.1, 0.12, 0.16) };

/** The sheet border and title block that every page of the drawing carries. */
function titleBlock(sheetName, sheetNumber, totalSheets) {
  const { widthPt, heightPt } = A3_LANDSCAPE;
  const margin = 24;
  const blockWidth = 300;
  const blockHeight = 118;
  const blockX = widthPt - margin - blockWidth;

  return [
    INK.line,
    draw.lineWidth(2),
    draw.rectangle(margin, margin, widthPt - margin * 2, heightPt - margin * 2),
    draw.stroke(),

    draw.lineWidth(1),
    draw.rectangle(blockX, margin, blockWidth, blockHeight),
    draw.stroke(),

    draw.text(blockX + 12, margin + blockHeight - 26, 13, 'SAMPLE PROJECT', 'F2'),
    draw.text(blockX + 12, margin + blockHeight - 44, 9, 'Synthetic content for demonstration'),
    draw.text(blockX + 12, margin + blockHeight - 62, 9, 'No real asset, party or location'),
    draw.text(blockX + 12, margin + 34, 10, sheetName, 'F2'),
    draw.text(blockX + 12, margin + 16, 9, `${sheetNumber} of ${totalSheets}   Rev P01   Not for construction`),
  ];
}

/** A scale bar, so the measurement tool has something to be calibrated against. */
function scaleBar(x, y) {
  const segmentPt = 60;   // one segment is 60pt, labelled as 5 m
  const lines = [INK.line, draw.lineWidth(1)];
  for (let index = 0; index < 4; index += 1) {
    lines.push(draw.rectangle(x + index * segmentPt, y, segmentPt, 8));
    lines.push(index % 2 === 0 ? draw.fill() : draw.stroke());
    lines.push(draw.fillColour(0.1, 0.12, 0.16));
  }
  lines.push(draw.text(x, y - 14, 8, '0'));
  lines.push(draw.text(x + segmentPt * 4 - 12, y - 14, 8, '20 m'));
  lines.push(draw.text(x + segmentPt * 4 + 20, y - 14, 8, 'Scale bar: one segment = 5 m'));
  return lines;
}

/** A rectangular plan with internal partitions, drawn as plain vectors. */
function planPage() {
  const originX = 90;
  const originY = 220;
  const width = 620;
  const height = 420;

  const lines = [
    ...titleBlock('GENERAL ARRANGEMENT — LEVEL 02', 'Sheet 1', 3),
    draw.text(90, 780, 18, 'General arrangement', 'F2'),
    draw.text(90, 758, 10, 'Every dimension on this sheet is invented.'),

    INK.line,
    draw.lineWidth(3),
    draw.rectangle(originX, originY, width, height),
    draw.stroke(),

    draw.lineWidth(1.5),
    // Two internal partitions and a core.
    draw.moveTo(originX + 240, originY),
    draw.lineTo(originX + 240, originY + height),
    draw.moveTo(originX + 240, originY + 250),
    draw.lineTo(originX + width, originY + 250),
    draw.stroke(),
    draw.rectangle(originX + 400, originY + 60, 120, 130),
    draw.stroke(),
  ];

  // A column grid, labelled, so there is repeating detail to zoom into.
  for (let column = 0; column < 5; column += 1) {
    const x = originX + 60 + column * 120;
    lines.push(draw.lineWidth(0.5), draw.strokeColour(0.55, 0.58, 0.62));
    lines.push(draw.moveTo(x, originY - 30), draw.lineTo(x, originY + height + 30), draw.stroke());
    lines.push(draw.fillColour(0.25, 0.28, 0.32));
    lines.push(draw.text(x - 4, originY + height + 38, 9, String.fromCharCode(65 + column), 'F2'));
    lines.push(draw.fillColour(0.1, 0.12, 0.16));
  }

  lines.push(
    INK.line,
    draw.text(originX + 60, originY + 340, 10, 'OPEN OFFICE'),
    draw.text(originX + 290, originY + 340, 10, 'PLANT'),
    draw.text(originX + 415, originY + 120, 10, 'CORE'),
    ...scaleBar(originX, 150),
  );
  return lines;
}

/** A section, drawn so the sheets differ visibly when paging through. */
function sectionPage() {
  const originX = 110;
  const originY = 240;
  const width = 700;
  const storeyHeight = 110;

  const lines = [
    ...titleBlock('SECTION A–A', 'Sheet 2', 3),
    draw.text(90, 780, 18, 'Section A–A', 'F2'),
    draw.text(90, 758, 10, 'Storey heights are illustrative only.'),
    INK.line,
  ];

  for (let storey = 0; storey < 4; storey += 1) {
    const y = originY + storey * storeyHeight;
    lines.push(draw.lineWidth(storey === 0 ? 3 : 1.5));
    lines.push(draw.moveTo(originX, y), draw.lineTo(originX + width, y), draw.stroke());
    lines.push(draw.text(originX - 68, y + 6, 9, `LEVEL 0${storey}`, 'F2'));
    lines.push(draw.text(originX + width + 12, y + 6, 9, `+${(storey * 3.6).toFixed(2)} m`));
  }

  lines.push(
    draw.lineWidth(3),
    draw.moveTo(originX, originY),
    draw.lineTo(originX, originY + storeyHeight * 3),
    draw.moveTo(originX + width, originY),
    draw.lineTo(originX + width, originY + storeyHeight * 3),
    draw.stroke(),
    ...scaleBar(originX, 170),
  );
  return lines;
}

/** A notes sheet — flowing text, so the search and text-layer paths have work. */
function notesPage() {
  const notes = [
    'This document is synthetic sample content generated for the embed demo.',
    'It describes no real building, no real party, and no real location.',
    '',
    'The viewer is given this file by URL. It fetches it once, renders it, and',
    'holds any markup you draw until the host takes it. Nothing is stored here.',
    '',
    'Search for the word FERROUS to see the text layer and the search index at',
    'work: it appears twice, both times on this sheet and nowhere else in the',
    'document, so a search should take you here and report two hits.',
    '',
    'FERROUS fixings are indicated on the general arrangement as filled squares.',
    '',
    'Markup you draw is emitted to the host as viewer.markupCreated. The demo',
    'host stores it against this document and hands it back on reload, which is',
    'the whole persistence story: the viewer forgets, the host remembers.',
  ];

  const lines = [
    ...titleBlock('GENERAL NOTES', 'Sheet 3', 3),
    draw.text(90, 780, 18, 'General notes', 'F2'),
    INK.line,
  ];
  notes.forEach((note, index) => {
    if (note) lines.push(draw.text(90, 720 - index * 22, 11, note));
  });
  return lines;
}

export function drawingPdf() {
  return buildPdf({
    ...A3_LANDSCAPE,
    title: 'Sample drawing set (synthetic)',
    pages: [planPage(), sectionPage(), notesPage()],
  });
}

// ── The Office sample ───────────────────────────────────────────────────────

const OOXML_MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function paragraph(text, { heading = false } = {}) {
  const style = heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : '';
  const runProperties = heading ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<w:p>${style}<w:r>${runProperties}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

export function specificationDocx() {
  const body = [
    paragraph('Sample specification', { heading: true }),
    paragraph('Synthetic content. This describes no real works.'),
    paragraph(''),
    paragraph('1. Scope'),
    paragraph(
      'This document exists so the demo has an Office file to open. Office ' +
      'formats are converted to PDF before they reach the viewer, so opening ' +
      'this one exercises a path the PDF sample does not.',
    ),
    paragraph(''),
    paragraph('2. Conversion'),
    paragraph(
      'The viewer does not read this format in the browser. The conversion ' +
      'service renders it, and the demo says so plainly when that service is ' +
      'not running rather than showing an empty frame.',
    ),
    paragraph(''),
    paragraph('3. Language'),
    paragraph(
      'The document language is set to en-AU so an assistive technology reads ' +
      'it in the language it is written in.',
    ),
  ].join('');

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="${OOXML_MAIN}"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>` +
    `</w:sectPr></w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;

  const packageRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  // The language is set on the document defaults so the whole file declares it,
  // which is what a screen reader and a conversion to tagged PDF both read.
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:styles xmlns:w="${OOXML_MAIN}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Liberation Sans" w:hAnsi="Liberation Sans"/>` +
    `<w:sz w:val="22"/><w:lang w:val="en-AU"/>` +
    `</w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>` +
    `<w:pPr><w:outlineLvl w:val="0"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>` +
    `</w:styles>`;

  // `[Content_Types].xml` must be the first entry in an OOXML package.
  return buildZip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: packageRels },
    { name: 'word/document.xml', content: document },
    { name: 'word/_rels/document.xml.rels', content: documentRels },
    { name: 'word/styles.xml', content: styles },
  ]);
}

// ── The IFC sample ──────────────────────────────────────────────────────────

/**
 * A small IFC4 model, written as ISO 10303-21 text.
 *
 * Writing a file in a published exchange format is implementing the format,
 * not reproducing the specification — §17.5 forbids reproducing a standard's
 * text, tables or code lists, and none of that is here. The entity names are
 * the format's vocabulary, in the same way element names are an XML schema's.
 */
export function modelIfc() {
  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('sample-model.ifc','2026-01-01T00:00:00'," +
      "('Synthetic sample'),('No real party'),'cde-angular demo sample generator','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    "#1= IFCPERSON($,'Sample','Author',$,$,$,$,$);",
    "#2= IFCORGANIZATION($,'Synthetic Organisation',$,$,$);",
    '#3= IFCPERSONANDORGANIZATION(#1,#2,$);',
    "#4= IFCAPPLICATION(#2,'1.0','Demo sample generator','demo-samples');",
    '#5= IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,0);',
    "#6= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);",
    "#7= IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);",
    "#8= IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);",
    '#9= IFCUNITASSIGNMENT((#6,#7,#8));',
    '#10= IFCCARTESIANPOINT((0.,0.,0.));',
    '#11= IFCAXIS2PLACEMENT3D(#10,$,$);',
    "#12= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#11,$);",
    "#13= IFCPROJECT('0SampleProject00000001',#5,'Sample Project'," +
      "'Synthetic model for the embed demo',$,$,$,(#12),#9);",
    '#14= IFCLOCALPLACEMENT($,#11);',
    "#15= IFCSITE('0SampleSite000000001',#5,'Sample Site',$,$,#14,$,$,.ELEMENT.,$,$,$,$,$);",
    "#16= IFCBUILDING('0SampleBuilding00001',#5,'Sample Building',$,$,#14,$,$,.ELEMENT.,$,$,$);",
    "#17= IFCBUILDINGSTOREY('0SampleStorey0000001',#5,'Level 00',$,$,#14,$,$,.ELEMENT.,0.);",
    "#18= IFCBUILDINGSTOREY('0SampleStorey0000002',#5,'Level 01',$,$,#14,$,$,.ELEMENT.,3600.);",
    "#19= IFCBUILDINGSTOREY('0SampleStorey0000003',#5,'Level 02',$,$,#14,$,$,.ELEMENT.,7200.);",
    "#20= IFCRELAGGREGATES('0SampleAggregate0001',#5,$,$,#13,(#15));",
    "#21= IFCRELAGGREGATES('0SampleAggregate0002',#5,$,$,#15,(#16));",
    "#22= IFCRELAGGREGATES('0SampleAggregate0003',#5,$,$,#16,(#17,#18,#19));",
  ];

  // A few elements per storey, so a hierarchy tree has something to expand.
  let nextId = 23;
  const storeys = [
    { ref: 17, label: 'Level 00' },
    { ref: 18, label: 'Level 01' },
    { ref: 19, label: 'Level 02' },
  ];
  for (const storey of storeys) {
    const elementRefs = [];
    for (const kind of ['IFCWALL', 'IFCSLAB', 'IFCCOLUMN']) {
      const guid = `0SampleElement${String(nextId).padStart(6, '0')}`;
      const name = `${kind.replace('IFC', '')} ${storey.label}`;
      lines.push(`#${nextId}= ${kind}('${guid}',#5,'${name}',$,$,#14,$,$,$);`);
      elementRefs.push(`#${nextId}`);
      nextId += 1;
    }
    const relationGuid = `0SampleContains${String(nextId).padStart(5, '0')}`;
    lines.push(
      `#${nextId}= IFCRELCONTAINEDINSPATIALSTRUCTURE('${relationGuid}',#5,$,$,` +
      `(${elementRefs.join(',')}),#${storey.ref});`,
    );
    nextId += 1;
  }

  lines.push('ENDSEC;', 'END-ISO-10303-21;', '');
  return Buffer.from(lines.join('\n'), 'utf8');
}
