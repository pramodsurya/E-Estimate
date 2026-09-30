// Generate snapshots through the installed Univer runtime, never by constructing output JSON.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Univer, LocaleType } = require('@univerjs/core');
const { FUniver } = require('@univerjs/core/facade');
const { UniverSheetsPlugin } = require('@univerjs/sheets');
require('@univerjs/sheets/facade');
const { UniverSheetsNumfmtPlugin } = require('@univerjs/sheets-numfmt');
require('@univerjs/sheets-numfmt/facade');

const sheetsLocale = require('@univerjs/sheets/locale/en-US');
const univer = new Univer({ locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: sheetsLocale.default || sheetsLocale } });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverSheetsNumfmtPlugin);
const api = FUniver.newAPI(univer);
const book = api.createWorkbook({ id: 'univer-fidelity-real', name: 'Univer fidelity laboratory' });
const cases = [];
function sheet(name) {
  const sh = book.insertSheet(name, { rows: 60, columns: 12 });
  sh.setColumnWidths(0, 8, 140);
  sh.setRowHeightsForced(0, 50, 32);
  sh.getRange('A1:H1').merge().setValue(name).setFontSize(18).setFontWeight('bold');
  return sh;
}
function sample(sh, row, label, value, configure) {
  sh.getRange(`A${row}`).setValue(label);
  const r = sh.getRange(`C${row}`);
  r.setValue(value);
  if (configure) configure(r);
  cases.push({ sheet: sh.getSheetName(), cell: `C${row}`, label });
}

const fonts = sheet('Fonts and decoration');
for (const [i, font] of ['Arial', 'Calibri', 'Times New Roman', 'Courier New'].entries())
  sample(fonts, i + 3, font, 'Aa 0123', r => r.setFontFamily(font));
for (const [i, size] of [8, 11, 14, 20].entries())
  sample(fonts, i + 8, `Size ${size}`, 'Aa 0123', r => r.setFontSize(size));
sample(fonts, 13, 'Bold', 'Bold', r => r.setFontWeight('bold'));
sample(fonts, 14, 'Italic', 'Italic', r => r.setFontStyle('italic'));
sample(fonts, 15, 'Underline', 'Underline', r => r.setFontLine('underline'));
sample(fonts, 16, 'Strike', 'Strike', r => r.setFontLine('line-through'));
sample(fonts, 17, 'Color and fill', 'Colored', r => r.setFontColor('#D02030').setBackgroundColor('#FFF0A0'));

const alignment = sheet('Alignment wrap rotation');
for (const [i, a] of ['left', 'center', 'right'].entries())
  sample(alignment, i + 3, `Numeric ${a}`, 123.45, r => r.setHorizontalAlignment(a === 'right' ? 'normal' : a));
sample(alignment, 6, 'General number', 123.45);
sample(alignment, 7, 'General text', '123.45');
sample(alignment, 8, 'General boolean', true);
for (const [i, a] of ['top', 'middle', 'bottom'].entries()) {
  alignment.setRowHeightsForced(i + 9, 1, 70);
  sample(alignment, i + 10, `Vertical ${a}`, 'Position', r => r.setVerticalAlignment(a));
}
for (const [i, mode] of ['WRAP', 'CLIP', 'OVERFLOW'].entries()) {
  alignment.setRowHeightsForced(i + 13, 1, 80);
  sample(alignment, i + 14, mode, 'Long text with spaces and abcdefghijklmnopqrstuvwxyz', r => r.setWrapStrategy(api.Enum.WrapStrategy[mode]));
}
for (const [i, angle] of [-90, -45, 0, 45, 90].entries()) {
  alignment.setRowHeightsForced(i + 18, 1, 100);
  sample(alignment, i + 19, `Angle ${angle}`, 'Rotate 123', r => r.setTextRotation(angle));
}
// Public setValue accepts ICellData: enum-backed style inputs are serialized by Univer.
alignment.setRowHeightsForced(25, 1, 100);
sample(alignment, 26, 'Vertical mode + wrap', { v: 'fgfgfgfgffgfg', s: { tb: api.Enum.WrapStrategy.WRAP, tr: { a: 0, v: 1 } } });
alignment.setColumnWidth(2, 88);
alignment.getRange('D26').setValue('zdvfdssv');

const borders = sheet('Border enum matrix');
const borderEntries = Object.entries(api.Enum.BorderStyleTypes).filter(([k,v]) => typeof v === 'number');
for (const [i, [name, value]] of borderEntries.entries())
  sample(borders, i + 3, name, name, r => r.setBorder(api.Enum.BorderType.ALL, value, '#204080'));

const formats = sheet('Number formats');
const formatCases = [
  ['General', 1234.567, 'General'], ['Decimal', 1234.567, '0.00'],
  ['Grouping', 1234.567, '#,##0.00'], ['Percent', 0.125, '0.0%'],
  ['Currency', 1234.5, '"₹"#,##0.00'], ['Negative', -1234.5, '#,##0.00;[Red](#,##0.00)'],
  ['Date', 45000, 'yyyy-mm-dd'], ['Time', 0.5, 'hh:mm:ss'],
  ['Scientific', 1234567, '0.00E+00'], ['Fraction', 1.25, '# ?/?'],
  ['Conditional', -2, '[Red][<0]0;[Blue]0'], ['Leading zeros', 42, '00000'],
];
formatCases.forEach(([label,value,pattern],i) => sample(formats,i+3,label,value,r=>r.setNumberFormat(pattern)));

const geometry = sheet('Geometry merges unicode');
geometry.setColumnWidth(2, 50); geometry.setColumnWidth(3, 240);
geometry.getRange('C3:E4').merge().setValue('Merged block').setWrap(true).setBackground('#E0F0FF');
geometry.hideRows(6); geometry.hideColumns(5);
sample(geometry, 9, 'Unicode', 'A😀e\u0301 العربية 中文');
const rich = api.newRichText().insertText('Bold 😀 plain e\u0301').setStyle(0, 4, { bl: 1, cl: { rgb: '#D02030' } });
geometry.getRange('C11').setRichTextValueForCell(rich);
geometry.getRange('A11').setValue('Rich text UTF-16 offsets');
cases.push({ sheet: geometry.getSheetName(), cell: 'C11', label: 'Rich text Unicode offsets' });
geometry.getRange('C13').setValue({ v: 123, t: 4 });
geometry.getRange('A13').setValue('Forced numeric text');

const advanced = sheet('Advanced cell styles');
const advancedCases = [
  ['Superscript', 'x2', { va: 3 }], ['Subscript', 'H2O', { va: 2 }],
  ['Overline', 'Overline', { ol: { s: 1 } }],
  ['Double underline', 'Double underline', { ul: { s: 1, t: 2 } }],
  ['Padding', 'Padded', { pd: { t: 10, b: 6, l: 16, r: 12 } }],
  ['RTL', 'العربية 123', { td: 2 }], ['LTR', 'English 123', { td: 1 }],
  ['Justified', 'One two three four', { ht: 4, tb: api.Enum.WrapStrategy.WRAP }],
  ['Both', 'One two three four', { ht: 5, tb: api.Enum.WrapStrategy.WRAP }],
  ['Distributed', 'One two three four', { ht: 6, tb: api.Enum.WrapStrategy.WRAP }],
  ['Diagonal down', 'Diagonal', { bd: { tl_br: { s: api.Enum.BorderStyleTypes.THIN, cl: { rgb: '#D02030' } } } }],
  ['Diagonal up', 'Diagonal', { bd: { bl_tr: { s: api.Enum.BorderStyleTypes.THIN, cl: { rgb: '#204080' } } } }],
];
advancedCases.forEach(([label, value, style], i) => sample(advanced, i + 3, label, { v: value, s: style }));

const saved = book.save();
assert.ok(saved.sheetOrder.length >= 5);
const out = path.resolve(__dirname, 'fixtures/univer-fidelity');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'real-univer-workbook.json'), JSON.stringify(saved, null, 2));
const version = JSON.parse(fs.readFileSync(path.resolve(path.dirname(require.resolve('@univerjs/core')), '../../package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generator: 'scripts/create-univer-fidelity.cjs', version, method: 'Univer facade mutations followed by FWorkbook.save()', cases, limitations: ['Headless generation: no canvas-measured auto heights or source screenshots.', 'No chart/image render, conditional-format rule, theme-color or paragraph-list fixtures yet.', 'setValue ICellData used for vertical-mode and forced-text cases; all saved style IDs are assigned by Univer.'] }, null, 2));
console.log(`Saved ${saved.sheetOrder.length} sheets and ${cases.length} labeled cases to ${out}`);
univer.dispose();
