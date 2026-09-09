const fs = require('fs');
const path = require('path');
const { NodeCompiler } = require('@myriaddreamin/typst-ts-node-compiler');

const root = path.resolve(__dirname, '..');
const p = 'C:\\\\Users\\\\napra\\\\Downloads\\\\Bund.eestimate';
const project = JSON.parse(fs.readFileSync(p, 'utf-8'));

function findNode(node, name) {
  if (node.name === name) return node;
  for (const c of node.children || []) {
    const f = findNode(c, name);
    if (f) return f;
  }
  return null;
}

const componentNode = findNode(project.root, 'New Component');
console.log('Component found:', componentNode.name, 'items:', componentNode.children.map(c => c.name));

// Let's import componentTypst
// We can transpile componentTypst.ts or use require
const Module = require('module');
const ts = require('typescript');

function loadTs(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(content, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m._compile(transpiled, filename);
  return m.exports;
}

// Intercept .typ?raw and assets
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith('.typ?raw')) {
    return fs.readFileSync(path.resolve(path.dirname(parent.filename), request.slice(0, -4)), 'utf8');
  }
  if (request.includes('emblem-telangana.png') || request.includes('.png')) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }
  if (request.includes('nodeVisual')) {
    return { nodeDisplayName: (n) => n?.name || n?.itemCode || 'Node' };
  }
  if (request.includes('supabase')) {
    return { supabase: {} };
  }
  return origLoad.call(this, request, parent, isMain);
};

require.extensions['.ts'] = function(m, f) {
  const c = fs.readFileSync(f, 'utf8');
  const t = ts.transpileModule(c, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  m._compile(t, f);
};

const compApi = require('../src/renderer/src/lib/typist-output/componentTypst.ts');

const renderData = compApi.buildComponentRenderData(project, componentNode);
const shadowFiles = compApi.componentShadowFiles(project, componentNode);
const prelude = compApi.componentCompilePrelude();
const template = compApi.defaultComponentTypstSource();

console.log('renderData abstract count:', renderData.abstract.length);
console.log('renderData items count:', renderData.items.length);
for (const it of renderData.items) {
  console.log('  item:', it.name, 'images:', it.images?.length, 'printConfig range:', it.printConfig?.range);
}
console.log('shadowFiles keys:', Object.keys(shadowFiles));

const fullSource = `${prelude}\n${template}`;
const compiler = NodeCompiler.create({ workspace: root });

// Map shadow files
for (const [vpath, b64] of Object.entries(shadowFiles)) {
  const cleanB64 = b64.replace(/^data:[^;]+;base64,/, '');
  const absPath = path.resolve(root, vpath);
  console.log('Mapping shadow file:', absPath, 'bytes:', cleanB64.length);
  compiler.mapShadow(absPath, Buffer.from(cleanB64, 'base64'));
}

try {
  const pdf = compiler.pdf({
    mainFileContent: fullSource,
    inputs: { 'ee-data': JSON.stringify(renderData) }
  });
  console.log('SUCCESS! PDF compiled, bytes:', pdf.length);
  fs.writeFileSync('tmp/bund-component.pdf', pdf);

  // Check SVG for page 2
  const svg = compiler.svg({
    mainFileContent: fullSource,
    inputs: { 'ee-data': JSON.stringify(renderData) }
  });
  fs.writeFileSync('tmp/bund-component.svg', svg);
  console.log('SVG written to tmp/bund-component.svg');
} catch (e) {
  console.log('FAILED! Error:', e.code || e.message);
}
