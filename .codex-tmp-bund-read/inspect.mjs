import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:\\Users\\napra\\Downloads\\8______Bund estimate_1.320TMC.xlsx";
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});
console.log("SHEETS");
console.log(sheets.ndjson);

for (const term of ["cut of trench", "cutoff trench", "cut off trench", "trench filling", "EWE", "toe"]) {
  const matches = await workbook.inspect({
    kind: "match",
    searchTerm: term,
    options: { useRegex: false, maxResults: 100 },
    summary: `matches for ${term}`,
    maxChars: 12000,
  });
  console.log(`MATCH ${term}`);
  console.log(matches.ndjson);
}
