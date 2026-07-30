import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/napra/Downloads/8______Bund estimate_1.320TMC.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});
console.log("SHEETS");
console.log(sheets.ndjson);

const matches = await workbook.inspect({
  kind: "match",
  searchTerm: "revetment|reventment|300\\s*mm|30\\s*cm|graded metal",
  options: { useRegex: true, maxResults: 300 },
  maxChars: 30000,
  summary: "revetment and 300 mm references",
});
console.log("MATCHES");
console.log(matches.ndjson);

for (const [sheetId, range] of [
  ["bundqty-1.32TMC", "AN1:BS16"],
  ["Qty. of bund", "A40:O62"],
  ["Qty. of bund", "A128:O141"],
  ["ABSTRACT Earth Bund  (2)", "A16:U22"],
]) {
  const detail = await workbook.inspect({
    kind: "table",
    sheetId,
    range,
    include: "values,formulas",
    tableMaxRows: 30,
    tableMaxCols: 40,
    tableMaxCellChars: 240,
    maxChars: 30000,
  });
  console.log(`DETAIL ${sheetId}!${range}`);
  console.log(detail.ndjson);
}
