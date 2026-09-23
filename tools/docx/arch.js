/**
 * Assembles the technical architecture document.
 *
 * <p>The chapters live in `arch/`, one file per group, because this was a
 * single 631-line array — past the §3.3 limit, and past the point where
 * editing one chapter meant scrolling through the rest. What stays here is
 * the order of the document, which is the one thing that belongs in a single
 * place, and the writing of the file.
 */
const { makeDoc, section, Packer, fs } = require('./build.js');

const children = [
  ...require('./arch/front-matter.js'),
  ...require('./arch/viewer-core.js'),
  ...require('./arch/pipelines.js'),
  ...require('./arch/accessibility.js'),
  ...require('./arch/security.js'),
  ...require('./arch/verification.js'),
];

const doc = makeDoc([section(children, 'Viewer product — Technical Architecture   ·   page ')]);
Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('Viewer-Product-Technical-Architecture.docx', b);
  console.log('architecture written:', b.length, 'bytes');
});
