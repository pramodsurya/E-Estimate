import type {
  ConveyanceClass,
  PipeLeadSource,
  ProjectNode,
} from "../types/project";
import type { SorItemSelection } from "../types/sor";
import type { RateAnalysisRecipe } from "../types/rateAnalysis";
import { projectItemKey } from "./projectItems";
import { parseRateAnalysisVisibility } from "./rateAnalysisVisibility";
import { sorReference, record } from "./sorSource";
import {
  createUniverWorkbookData,
  usedCellRange,
  workbookFromRows,
} from "./univerSpreadsheet";
import type { IWorkbookData } from "@univerjs/core";
export function sorPipeSource(
  saved: SorItemSelection,
): PipeLeadSource | undefined {
  const cell = record(saved.recipe.metadata.public_health_cell),
    row = record(cell.row),
    column = record(cell.column);
  const group = String(cell.group ?? "");
  const end =
    group === "Plain ended pipe supply"
      ? "PLAIN_ENDED"
      : group === "Socket/spigot pipe supply" ||
          group === "Socket/spigot pressure pipe supply"
        ? "SOCKET_SPIGOT"
        : undefined;
  const diameter = /^([0-9]+(?:\.[0-9]+)?)\s*mm\b/i.exec(
    String(row.label ?? ""),
  );
  if (
    saved.recipe.lead_applicability !== "PIPE" ||
    saved.quote.unit !== "m" ||
    !end ||
    !diameter ||
    !saved.leadRule
  )
    return undefined;
  return {
    materialItemCode: saved.recipeCode,
    pipeLeadItemCode: saved.recipeCode,
    leadRuleCode: saved.leadRule.rule_code,
    pipeLeadCatalogueCode: saved.recipe.table_code,
    catalogueName: saved.recipe.section,
    pipeEndType: end,
    pipeClassGroup: String(column.label ?? ""),
    diameterMm: Number(diameter[1]),
    unit: "m",
    autoApply: true,
    distanceInputRequired: true,
    handlingIncluded: [],
  };
}
export function sorLeadApplicability(saved: SorItemSelection): unknown {
  const profile = saved.recipe.lead_applicability;
  if (!profile || profile === "PIPE") return { classes: [], materials: {} };
  const classes: Record<string, ConveyanceClass> = {
    EARTH: "EARTH",
    SAND: "EARTH",
    STONE: "STONE",
    CEMENT: "CEMENT",
    STEEL: "STEEL",
    LIME: "EARTH",
    WOOD: "SLAB_WOOD",
    WATER: "WATER",
    BRICKS: "BRICKS",
  };
  const key = classes[profile];
  if (!key) return { classes: [], materials: {} };
  const name = profile.charAt(0) + profile.slice(1).toLowerCase();
  return {
    classes: [key],
    materials: { [name]: key },
    sor_profile: profile,
    sor_rule_code: saved.leadRule?.rule_code,
  };
}
export function sorRecipe(
  node: ProjectNode,
  saved: SorItemSelection,
): RateAnalysisRecipe {
  if (!Number.isFinite(saved.rate) || saved.quote.status !== "priced")
    throw new Error("This SOR selection has no usable selected-year rate.");
  const description =
    saved.annual.to_be_printed?.description ?? saved.recipe.description;
  const section = /labour/i.test(saved.recipe.heading)
    ? "labour"
    : /machinery/i.test(saved.recipe.heading)
      ? "machinery"
      : "materials";
  const pipeLead = sorPipeSource(saved);
  const dimensions = record(
    saved.recipe.metadata.public_health_cell ??
      saved.recipe.metadata.centering_cell,
  );
  return {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: "SOR",
    categoryKey: "SOR_Recipie",
    itemCode: saved.recipeCode,
    documentTitle: sorReference(saved),
    description,
    unit: saved.quote.unit,
    outputQuantity: 1,
    year: saved.year,
    overheadPercent: 0,
    publishedRate: saved.rate,
    unresolvedLines: 0,
    sor: saved,
    sections: (["materials", "machinery", "labour"] as const).map((key) => ({
      key,
      label: {
        materials: "A. Materials",
        machinery: "B. Machinery",
        labour: "C. Labour",
      }[key],
      lines:
        key === section
          ? [
              {
                id: "sor-published-rate",
                slNo: "1",
                description,
                unit: saved.quote.unit,
                quantity: 1,
                rate: saved.rate,
                amount: saved.rate,
                resourceCode: saved.resolvedRecipeCode,
                rateSource: "SOR_Year",
                resourceIdentity: {
                  sourceTable: "SOR_Year",
                  masterCode: saved.resolvedRecipeCode,
                  rateComponent: "rate",
                },
              },
            ]
          : [],
    })),
    layout: parseRateAnalysisVisibility(undefined, description),
    leadApplicability: sorLeadApplicability(saved),
    sorCatalogueSource: {
      catalogueCode: saved.recipe.table_code,
      catalogueName: saved.recipe.section,
      dimensions: Object.fromEntries(
        Object.entries(dimensions)
          .filter(([key]) => ["row", "column", "floor", "member"].includes(key))
          .map(([key, value]) => [key, String(record(value).label ?? "")]),
      ),
      sourcePage:
        typeof saved.annual.metadata.pdf_page === "number"
          ? saved.annual.metadata.pdf_page
          : null,
      sourceTitle: sorReference(saved),
      ...(pipeLead ? { pipeLead } : {}),
    },
  };
}
export function seedSorMeasurement(node: ProjectNode): ProjectNode {
  const saved = node.sorCatalogue;
  if (!saved) return node;
  return {
    ...node,
    finalCell: { row: 1, column: 1 },
    spreadsheet: workbookFromRows(node, [
      ["SOR reference", "Quantity", "Unit"],
      [sorReference(saved), saved.quantity, saved.quote.unit],
      ["Specification", node.itemDescription ?? node.name],
    ]),
  };
}
export function seedSharedSorMeasurements(nodes: ProjectNode[]): ProjectNode[] {
  const selected = nodes.filter((node) => node.sorCatalogue);
  if (!selected.length) return nodes;
  const owner = nodes[0],
    snapshot = structuredClone(
      createUniverWorkbookData(owner),
    ) as IWorkbookData;
  const sheet = snapshot.sheets[snapshot.sheetOrder[0]],
    start = (usedCellRange(snapshot)?.endRow ?? -2) + 2;
  const cells = sheet.cellData ?? {};
  cells[start] = {
    0: { v: "SOR reference" },
    1: { v: "Quantity" },
    2: { v: "Unit" },
  };
  const rows = new Map<string, number>();
  selected.forEach((node, index) => {
    const saved = node.sorCatalogue!,
      row = start + index + 1;
    rows.set(node.id, row);
    cells[row] = {
      0: { v: sorReference(saved) },
      1: { v: saved.quantity },
      2: { v: saved.quote.unit },
    };
  });
  sheet.cellData = cells;
  sheet.rowCount = Math.max(sheet.rowCount ?? 0, start + selected.length + 20);
  return nodes.map((node) => ({
    ...node,
    spreadsheet: snapshot,
    ...(rows.has(node.id)
      ? { finalCell: { row: rows.get(node.id)!, column: 1 } }
      : {}),
  }));
}
export function sorRecipeSnapshots(
  nodes: ProjectNode[],
  existing: Record<string, RateAnalysisRecipe> = {},
): Record<string, RateAnalysisRecipe> {
  return {
    ...Object.fromEntries(
      nodes.flatMap((node) =>
        node.sorCatalogue
          ? [[projectItemKey(node), sorRecipe(node, node.sorCatalogue)]]
          : [],
      ),
    ),
    ...existing,
  };
}
