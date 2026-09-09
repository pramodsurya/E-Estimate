const path = require('path');
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');

const workspaceRoot = path.resolve(__dirname, '..');
console.log('workspaceRoot:', workspaceRoot);

const compiler = NodeCompiler.create({
  workspace: workspaceRoot
});

const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const buf = Buffer.from(b64, 'base64');

// Try testing different paths with mapShadow:
const relPath = 'images/sheet_drawing_1.png';
const absPath = path.resolve(workspaceRoot, relPath);
console.log('absPath:', absPath);

console.log('--- CYCLE 1 ---');
compiler.mapShadow(absPath, buf);
try {
  const res1 = compiler.pdf({ mainFileContent: '#image("images/sheet_drawing_1.png")' });
  console.log('Cycle 1 SUCCESS:', res1.length);
} catch (e) {
  console.log('Cycle 1 FAIL:', e.code || e.message);
}

compiler.resetShadow();

console.log('--- CYCLE 2 ---');
compiler.mapShadow(absPath, buf);
try {
  const res2 = compiler.pdf({ mainFileContent: '#image("images/sheet_drawing_1.png")' });
  console.log('Cycle 2 SUCCESS:', res2.length);
} catch (e) {
  console.log('Cycle 2 FAIL:', e.code || e.message);
}

compiler.resetShadow();

console.log('--- CYCLE 3 (without shadow) ---');
try {
  const res3 = compiler.pdf({ mainFileContent: '#image("images/sheet_drawing_1.png")' });
  console.log('Cycle 3 SUCCESS:', res3.length);
} catch (e) {
  console.log('Cycle 3 FAIL:', e.code || e.message);
}
