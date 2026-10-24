import { supabase } from "./supabase";
import { SorRequestCache } from "./sorCache";
import { SorTreeIndex, type SorNavigationPath } from "./sorTree";
import type { MasterItem } from "./masterData";
import type { ConveyanceClass } from "../types/project";
import type {
  SorAnnual,
  SorConfiguration,
  SorDetail,
  SorItemSelection,
  SorLeaf,
  SorLevel,
  SorNode,
  SorPath,
  SorRecipe,
  SorZone,
} from "../types/sor";
export const SOR_CATEGORY = "SOR_Recipie";
const browserCache = new SorRequestCache(80);
const detailCache = new SorRequestCache(128);
const treeCache = new SorRequestCache(4);
export function clearSorPickerCache(): void {
  browserCache.clear();
  detailCache.clear();
  treeCache.clear();
}
export function getSorTree(
  year: string,
  signal?: AbortSignal,
): Promise<SorTreeIndex> {
  return treeCache.get(
    `tree:${year}`,
    300_000,
    async () => {
      const { data, error } = await supabase.rpc("sor_picker_navigation", {
        p_year: year,
      });
      if (error) throw new Error(error.message);
      const value = record(data);
      if (value.year !== year || !Array.isArray(value.paths))
        throw new Error("SOR navigation does not match the active edition.");
      return new SorTreeIndex(value.paths as SorNavigationPath[]);
    },
    signal,
  );
}
export const SOR_PARTS: Record<string, string> = {
  "1": "Part 1 · Irrigation & CAD",
  "2": "Part 2 · Roads & Bridges",
  "3": "Part 3 · Buildings",
  "4": "Part 4 · Public Health",
};
export const SOR_LEVELS: SorLevel[] = [
  "part",
  "heading",
  "section",
  "subsection",
  "family",
  "item",
];
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const sorMoney = (value: number): string =>
  `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const humanize = (value: string): string =>
  value.replaceAll("_", " ").replace(/^./, (x) => x.toUpperCase());
/** Conservative: new source rules also require review before a direct add. */
export function sorNeedsConfiguration(
  recipe: Pick<SorRecipe, "variants" | "addons">,
): boolean {
  return [recipe.variants, recipe.addons].some((value) =>
    Object.keys(record(value)).some((key) => key !== "schema_version"),
  );
}
export function isSorTariff(recipe: Pick<SorRecipe, "metadata">): boolean {
  return ["conveyance_matrix", "conveyance_matrix_cell"].includes(
    String(recipe.metadata.item_type),
  );
}
export async function browseSor<T extends SorNode | SorLeaf>(
  year: string,
  level: SorLevel,
  path: SorPath = {},
  query = "",
  offset = 0,
  signal?: AbortSignal,
): Promise<{ rows: T[]; total: number }> {
  const identity = JSON.stringify([
    year,
    level,
    SOR_LEVELS.map((key) => (key === "item" ? null : path[key])),
    query,
    offset,
  ]);
  return browserCache.get(
    identity,
    300_000,
    async () => {
      const request = supabase.rpc("sor_picker_browse", {
        p_year: year,
        p_level: level,
        p_path: path,
        p_query: query,
        p_offset: offset,
        p_limit:
          (level === "item" && path.family) || level === "family" ? 500 : 100,
      });
      const response = await request;
      if (response.error) throw new Error(response.error.message);
      const data = record(response.data);
      if (
        data.year !== year ||
        data.level !== level ||
        !Array.isArray(data.rows)
      )
        throw new Error(
          "SOR browser response does not match the active edition.",
        );
      return { rows: data.rows as T[], total: Number(data.total) };
    },
    signal,
  );
}
export async function getSorDetail(
  code: string,
  year: string,
  zone: SorZone,
  signal?: AbortSignal,
  fresh = false,
): Promise<SorDetail> {
  return detailCache.get(
    JSON.stringify([code, year, zone]),
    60_000,
    async () => {
      const request = supabase.rpc("sor_picker_detail", {
        p_code: code,
        p_year: year,
        p_zone: zone,
      });
      const response = await request;
      if (response.error) throw new Error(response.error.message);
      const detail = response.data as unknown as SorDetail;
      if (!detail?.quote || !detail.resolution)
        throw new Error("Incomplete SOR resolution response.");
      if (detail.recipe && isSorTariff(detail.recipe))
        throw new Error("Conveyance tariffs are managed in Lead.");
      return detail;
    },
    signal,
    fresh,
  );
}
export function sorPath(recipe: SorRecipe, annual: SorAnnual): SorPath {
  return {
    part: String(recipe.part_no),
    heading: annual.heading ?? recipe.heading,
    section: annual.section ?? recipe.section,
    subsection: annual.sub_section ?? recipe.sub_section ?? "",
  };
}
export function sorFamily(recipe: SorRecipe): string {
  if (recipe.variants?.main_recipe_code)
    return `variant:${recipe.variants.main_recipe_code}`;
  if (recipe.metadata.centering_cell)
    return `centering:${recipe.table_code}:${recipe.metadata.system_id}`;
  if (recipe.metadata.public_health_cell)
    return `matrix:${recipe.table_code}:${record(recipe.metadata.public_health_cell).group ?? ""}`;
  return `item:${recipe.recipe_code}`;
}
/** Only references actually printed in the book belong in customer-facing labels. */
export function sorPublishedCode(
  code: string | null | undefined,
): string | undefined {
  const value = code?.trim();
  return value && !/^(?:SOR-|P\d+-T\d+(?:$|-))/i.test(value)
    ? value
    : undefined;
}
export function sorReference(selection: SorItemSelection): string {
  return [
    sorPublishedCode(selection.annual.item_code) ??
      `SOR · Part ${selection.recipe.part_no}`,
    selection.year,
  ].join(" · ");
}

export function sorStatus(detail: SorDetail): string {
  if (detail.resolution.requires_review)
    return "Review the published replacement before choosing this item.";
  if (detail.quote.status === "priced" && typeof detail.quote.rate === "number")
    return "Published rate available";
  return humanize(String(detail.quote.status ?? "Selected year rate missing"));
}
export function readySorDetail(detail: SorDetail): boolean {
  return Boolean(
    detail.recipe &&
    detail.annual?.year_row_code &&
    !isSorTariff(detail.recipe) &&
    !detail.resolution.requires_review &&
    detail.quote.status === "priced" &&
    typeof detail.quote.rate === "number" &&
    Number.isFinite(detail.quote.rate) &&
    detail.quote.rate >= 0 &&
    detail.quote.unit,
  );
}
export function sorSelectionKey(
  code: string,
  configuration: SorConfiguration,
): string {
  return `${code}:${JSON.stringify({ inputs: Object.entries(configuration.inputs).sort(([a], [b]) => a.localeCompare(b)), enabled: [...configuration.enabled].sort(), confirmed: [...configuration.confirmed].sort() })}`;
}
export function sorMasterItem(selection: SorItemSelection): MasterItem {
  const profile = selection.recipe.lead_applicability;
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
  return {
    side: "SOR",
    category: SOR_CATEGORY,
    code: selection.recipeCode,
    description:
      selection.annual.to_be_printed?.description ??
      selection.recipe.description,
    unit: selection.quote.unit,
    sorCatalogue: selection,
    lead: {
      applicable: Boolean(profile && classes[profile]),
      conveyanceClass: profile ? classes[profile] : undefined,
      materialName: profile ? humanize(profile.toLowerCase()) : undefined,
    },
  };
}
export function validateSorInsertion(
  items: MasterItem[],
  year: string,
  zone: SorZone,
): void {
  for (const item of items) {
    if (item.side !== "SOR") continue;
    const saved = item.sorCatalogue;
    if (
      !saved ||
      isSorTariff(saved.recipe) ||
      saved.quote.status !== "priced" ||
      !Number.isFinite(saved.rate)
    )
      throw new Error(
        "Choose a costable material or work item from the current SOR selector.",
      );
    if (saved.year !== year || saved.zone !== zone)
      throw new Error(
        "Refresh the SOR selection for the current project year and zone.",
      );
  }
}
export function leafMasterItem(row: SorLeaf): MasterItem {
  return {
    side: "SOR",
    category: SOR_CATEGORY,
    code: row.recipe_code,
    description: row.description,
    unit: row.unit,
  };
}
export async function refreshSorSelection(
  saved: SorItemSelection,
  year: string,
  zone: SorZone,
  refresh = false,
): Promise<SorItemSelection> {
  if (!refresh && saved.year === year && saved.zone === zone) return saved;
  const detail = await getSorDetail(
    saved.recipeCode,
    year,
    zone,
    undefined,
    refresh,
  );
  if (!readySorDetail(detail)) throw new Error(sorStatus(detail));
  if (detail.quote.unit !== saved.quote.unit)
    throw new Error(
      "The published quantity basis changed. Choose the compatible SOR variant again.",
    );
  const { createSorSelection } = await import("./sorRules");
  return createSorSelection(
    detail,
    saved.recipeCode,
    year,
    zone,
    saved.quantity,
    saved.configuration,
  );
}
