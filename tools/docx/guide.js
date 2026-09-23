/**
 * Assembles the integration guide.
 *
 * <p>The chapters live in `guide/`, one file per group, for the reason given
 * in `arch.js`: this was a single 504-line array, past the §3.3 limit and
 * past the point where editing one chapter meant scrolling through the rest.
 * What stays here is the order of the document and the writing of the file.
 */
const { makeDoc, section, Packer, fs } = require('./build.js');

const children = [
  ...require('./guide/front-matter.js'),
  ...require('./guide/converting.js'),
  ...require('./guide/embedding.js'),
  ...require('./guide/obligations.js'),
];

const doc = makeDoc([section(children, 'Viewer product — Integration Guide   ·   page ')]);
Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('Viewer-Product-Integration-Guide.docx', b);
  console.log('guide written:', b.length, 'bytes');
});
