const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');
const compiler = NodeCompiler.create({ workspace: process.cwd() });
const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const tests = [
  '#image.decode(base64.decode("' + b64 + '"), format: "png")',
  '#image.decode(bytes.from-base64("' + b64 + '"), format: "png")',
  '#image.decode(base64("' + b64 + '"), format: "png")'
];

for (const t of tests) {
  try {
    const pdf = compiler.pdf({ mainFileContent: t });
    console.log('SUCCESS with:', t.slice(0, 30), 'length:', pdf.length);
  } catch (e) {
    console.log('FAILED:', t.slice(0, 30), '-->', e.code || e.message);
  }
}
