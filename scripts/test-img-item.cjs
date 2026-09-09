const fs = require('fs');
const path = require('path');
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');

// Let's test compiling a document with #image("images/sheet_drawing_1.png")
const root = path.resolve(__dirname, '..');
const compiler = NodeCompiler.create({ workspace: root });

const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const absPath = path.resolve(root, 'images/sheet_drawing_1.png');

compiler.mapShadow(absPath, Buffer.from(b64, 'base64'));

try {
  const pdf = compiler.pdf({
    mainFileContent: `
    #set page(paper: "a4")
    #place(top + left, dx: 10pt, dy: 10pt, image("images/sheet_drawing_1.png", width: 50pt, height: 50pt))
    Hello image test!
    `
  });
  console.log('PDF compiled successfully! Length:', pdf.length);
} catch (e) {
  console.log('Error:', e.code || e.message);
}
