import { supabase } from "./supabase";
import { SorRequestCache } from "./sorCache";
import type {
  CostOwner,
  IndividualCostAdoption,
  IndividualCostInput,
  IndividualCostPage,
  IndividualCostChoice,
  IndividualCosts,
} from "../types/individualCosts";
import type {
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
} from "../types/rateAnalysis";
import type { MaterialRateOverride } from "../types/project";
import type { IndividualCostRow } from "../types/individualCosts";
const cache = new SorRequestCache(256);
const resourceDefaults = new Map<string, RecordValue>();
export type RecordValue = Record<string, unknown>;
export const record = (v: unknown): RecordValue =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as RecordValue) : {};
export const rows = (v: unknown): RecordValue[] =>
  Array.isArray(v) ? v.map(record) : [];
export function numeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/,/g, "") : v);
  return Number.isFinite(n) ? n : null;
}
export async function costRpc<T>(name: string, args: RecordValue): Promise<T> {
  return cache.get(JSON.stringify([name, args]), 120_000, async () => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  });
}
export function individualCostKey({
  owner,
  kind,
  raw,
  context,
}: IndividualCostInput): string {
  const unit = String(raw.unit ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const identity = record(raw.resource_identity),
    lookup = record(raw.price_lookup);
  if (owner === "SSR")
    return JSON.stringify([
      owner,
      kind,
      unit,
      identity.master_code ??
        identity.recipe_code ??
        identity.resource_key ??
        context,
      identity.rate_component ?? "rate",
      String(record(identity.link_review).rate_basis_multiplier ?? "1"),
    ]);
  const targets = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [k, val] of Object.entries(record(v))) {
      if ((k === "recipe_code" || k === "resource_code") && val !== null)
        targets.add(String(val));
      walk(val);
    }
  };
  walk(lookup);
  const named =
    identity.recipe_code ?? identity.master_code ?? identity.resource_code;
  if (named !== undefined && named !== null) targets.add(String(named));
  return JSON.stringify([
    owner,
    kind,
    unit,
    raw.resource_key ?? context,
    [...targets].sort(),
    lookup.rate_component ??
      identity.rate_component ??
      record(raw.sor_ref).component ??
      "rate",
  ]);
}
export function costConfidence(
  raw: RecordValue,
): "Correct" | "Maybe" | "Review Required" {
  const identity = record(raw.resource_identity),
    evidence = record(raw._evidence);
  const review = record(
    identity.link_review ?? record(raw.price_lookup).link_review,
  );
  const text = JSON.stringify([review, evidence]).toLowerCase();
  if (
    identity.unresolved === true ||
    identity.pricing_review_required === true ||
    /mock|unresolved|review_required|candidate_only/.test(text)
  )
    return "Review Required";
  if (/role_equivalence|generic|empirical|assum|merged|equivalent/.test(text))
    return "Maybe";
  if (/approved|exact|direct/.test(text) || identity.resolution === "linked")
    return "Correct";
  return "Review Required";
}
/** Merge equivalent MoRTH resources without conflating different grades or rate bases. */
export function individualCostGroupKey(input: IndividualCostInput): string {
  const key = JSON.parse(individualCostKey(input)) as unknown[];
  if (input.owner === "SSR") return JSON.stringify(key);
  const targets = key[4] as string[];
  const description = String(input.raw.desc ?? input.raw.description ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!targets.length || !description) return JSON.stringify(key);
  return JSON.stringify([
    input.owner,
    input.kind,
    key[2],
    "resource-group",
    description,
    targets,
    key[5],
    String(
      record(record(input.raw.resource_identity).link_review)
        .rate_basis_multiplier ?? "1",
    ),
  ]);
}
export function individualCostAdoption(
  input: IndividualCostInput,
  costs?: IndividualCosts,
): IndividualCostAdoption | undefined {
  return (
    costs?.[individualCostGroupKey(input)] ?? costs?.[individualCostKey(input)]
  );
}
export async function costChoices(
  raw: RecordValue,
): Promise<IndividualCostChoice[]> {
  const defaults = await morthResourceDefaults(raw);
  return costRpc("individual_cost_choices", {
    p_row: {
      ...raw,
      _candidates: [...rows(raw._candidates), ...rows(defaults.candidates)],
    },
  });
}
export function morthResourceCode(raw: RecordValue): string | undefined {
  const lookup = record(raw.price_lookup),
    identity = record(raw.resource_identity);
  if (
    lookup.table !== "analysis_resource" &&
    identity.source_table !== "analysis_resource"
  )
    return undefined;
  const code = lookup.resource_code ?? identity.resource_code ?? lookup.code;
  return typeof code === "string" ? code : undefined;
}
export async function preloadMorthResourceDefaults(
  codes: string[],
): Promise<void> {
  const missing = [...new Set(codes)].filter(
    (code) => !resourceDefaults.has(code),
  );
  if (!missing.length) return;
  const result = await costRpc<RecordValue[]>("morth_resource_defaults", {
    p_resource_codes: missing.sort(),
  });
  for (const code of missing)
    resourceDefaults.set(
      code,
      result.find((r) => r.resource_code === code) ?? {},
    );
}
async function morthResourceDefaults(raw: RecordValue): Promise<RecordValue> {
  const code = morthResourceCode(raw);
  if (!code) return {};
  await preloadMorthResourceDefaults([code]);
  return resourceDefaults.get(code) ?? {};
}
export interface ResolvedIndividualCost {
  rate: number | null;
  label: string;
  source?: "manual" | "sor" | "starting-sor" | "stored" | "benchmark";
  reviewRequired?: boolean;
}
async function storedStartingRate(
  raw: RecordValue,
  unit: string,
  year: string,
  zone: string,
): Promise<ResolvedIndividualCost | undefined> {
  const defaults = await morthResourceDefaults(raw);
  const records = rows(defaults.pricing_records)
    .filter(
      (r) =>
        (!r.zone || r.zone === zone) &&
        (!r.project_zone || r.project_zone === zone),
    )
    .sort((a, b) => {
      const annual = (r: RecordValue): number => (r.year === year ? 1 : 0);
      return (
        annual(b) - annual(a) ||
        String(b.year ?? b.source_edition_year ?? "").localeCompare(
          String(a.year ?? a.source_edition_year ?? ""),
        )
      );
    });
  for (const entry of records) {
    const rate = numeric(record(entry.rate)[zone] ?? entry.rate);
    if (rate === null || rate < 0) continue;
    const sourceUnit = String(entry.unit ?? defaults.unit ?? unit);
    const factor =
      sourceUnit.trim().toLowerCase() === unit.trim().toLowerCase()
        ? 1
        : numeric(
            await costRpc("sor_unit_rate_factor", {
              p_source_unit: sourceUnit,
              p_requested_unit: unit,
            }),
          );
    if (factor === null) continue;
    const edition = entry.year ?? entry.source_edition_year;
    const benchmark =
      entry.year !== year ||
      /benchmark|mock|proxy/.test(String(entry.rate_role));
    return {
      rate: rate * factor,
      source: benchmark ? "benchmark" : "stored",
      reviewRequired: benchmark,
      label: `${benchmark ? "Stored starting benchmark" : "Stored resource rate"}${edition ? ` · ${edition}` : ""}${benchmark ? " · review required" : ""}`,
    };
  }
  for (const field of ["starting_rate", "mock_rate", "rate"]) {
    const rate = numeric(raw[field]);
    if (rate !== null && rate >= 0)
      return {
        rate,
        label: "Stored starting rate · review required",
        source: "stored",
        reviewRequired: true,
      };
  }
  return undefined;
}
export function defaultCostChoice(
  choices: IndividualCostChoice[],
): IndividualCostChoice | undefined {
  return choices.find((x) => x.medium) ?? choices[0];
}
export async function resolveIndividualCost(
  raw: RecordValue,
  unit: string,
  owner: CostOwner,
  adoption: IndividualCostAdoption | undefined,
  year: string,
  zone: string,
  supplied?: IndividualCostChoice[],
): Promise<ResolvedIndividualCost> {
  if (adoption?.mode === "manual")
    return {
      rate:
        typeof adoption.rate === "number" &&
        Number.isFinite(adoption.rate) &&
        adoption.rate >= 0
          ? adoption.rate
          : null,
      label: "Manual rate",
      source: "manual",
    };
  if (owner === "SSR" && !adoption)
    return { rate: numeric(raw.rate), label: "SSR_Year" };
  if (owner === "MORTH" && !adoption && morthResourceCode(raw)) {
    const stored = await storedStartingRate(raw, unit, year, zone);
    if (stored) return stored;
  }
  const selected = adoption?.code
    ? {
        code: adoption.code,
        component: adoption.component ?? "rate",
        description: adoption.label,
      }
    : defaultCostChoice(supplied ?? (await costChoices(raw)));
  if (!selected) {
    const stored =
      owner === "MORTH" && !adoption
        ? await storedStartingRate(raw, unit, year, zone)
        : undefined;
    return (
      stored ?? {
        rate: null,
        label: "No stored rate · choose SOR or enter a rate",
      }
    );
  }
  const identity = record(raw.resource_identity),
    review = record(identity.link_review);
  const originalCode = identity.master_code ?? identity.recipe_code;
  const multiplier =
    selected.code === originalCode
      ? numeric(review.rate_basis_multiplier)
      : null;
  const quotedUnit =
    multiplier !== null ? String(review.reference_sor_unit ?? unit) : unit;
  const quote = await costRpc<RecordValue>("sor_resource_quote", {
    p_recipe_code: selected.code,
    p_year: year,
    p_zone: zone,
    p_component: selected.component,
    p_unit: quotedUnit,
  });
  const quoted = numeric(quote.rate ?? quote.unit_rate);
  const rate =
    quote.status === "priced" &&
    quote.year === year &&
    quote.zone === zone &&
    quoted !== null
      ? quoted * (multiplier ?? 1)
      : null;
  if (rate === null && owner === "MORTH" && !adoption) {
    const stored = await storedStartingRate(raw, unit, year, zone);
    if (stored) return stored;
  }
  const starting = !adoption && Boolean(morthResourceCode(raw));
  return {
    rate,
    label: `${selected.description ?? "Selected SOR rate"}${rate === null ? ` · no compatible ${year} rate per ${unit}` : starting ? " · starting SOR choice · review required" : ""}`,
    source: starting ? "starting-sor" : "sor",
    reviewRequired: starting,
  };
}
/** Mirror existing project Cement/Steel defaults before a resource-specific adoption. */
export async function resolveIndividualCostPreview(
  row: IndividualCostRow,
  owner: CostOwner,
  kind: RateAnalysisSectionKey,
  adoption: IndividualCostAdoption | undefined,
  year: string,
  zone: string,
  overrides?: Record<string, MaterialRateOverride>,
): Promise<{ rate: number | null; label: string }> {
  const resolved = await resolveIndividualCost(
    row.sample,
    row.unit,
    owner,
    adoption,
    year,
    zone,
    row.choices.length ? row.choices : undefined,
  );
  if (
    owner !== "SSR" ||
    kind !== "materials" ||
    adoption ||
    !overrides ||
    !Object.keys(overrides).length
  )
    return resolved;
  const {
    applyMaterialRateOverrides,
    fetchMaterialAliases,
    fetchMonthlyMaterials,
  } = await import("./materialRates");
  const [aliases, materials] = await Promise.all([
    fetchMaterialAliases(),
    fetchMonthlyMaterials(),
  ]);
  const identity = record(row.sample.resource_identity);
  const recipe: RateAnalysisRecipe = {
    schemaVersion: 1,
    itemSource: "SSR",
    itemKey: "preview",
    categoryKey: "ssr_item",
    itemCode: "",
    description: row.description,
    unit: row.unit,
    year,
    outputQuantity: 1,
    overheadPercent: 0,
    sections: [
      {
        key: kind,
        label: kind,
        lines: [
          {
            id: "preview",
            slNo: "1",
            description: row.description,
            unit: row.unit,
            quantity: 1,
            rate: resolved.rate ?? 0,
            amount: resolved.rate ?? 0,
            resourceIdentity: {
              sourceTable: String(identity.source_table ?? ""),
              masterCode: String(identity.master_code ?? ""),
            },
          },
        ],
      },
    ],
  };
  const applied = applyMaterialRateOverrides(
    recipe,
    overrides,
    aliases,
    new Map(materials.map((m) => [m.materialCode, m])),
  );
  const line = applied.recipe.sections[0].lines[0];
  return line.rateOverride
    ? { rate: line.rate, label: `Cement / Steel · ${line.rateOverride.label}` }
    : resolved;
}

export function fetchIndividualCosts(
  owner: CostOwner,
  kind: string,
  year: string,
  query: string,
  offset = 0,
): Promise<IndividualCostPage> {
  return costRpc("individual_cost_catalogue", {
    p_owner: owner,
    p_kind: kind,
    p_year: year,
    p_query: query,
    p_offset: offset,
    p_limit: 100,
  });
}
export async function applyIndividualCosts(
  recipe: RateAnalysisRecipe,
  costs: IndividualCosts | undefined,
  zone: string,
): Promise<RateAnalysisRecipe> {
  if (!costs || recipe.itemSource !== "SSR") return recipe;
  let changed = false;
  const sections = await Promise.all(
    recipe.sections.map(async (section) => ({
      ...section,
      lines: await Promise.all(
        section.lines.map(async (line) => {
          const input = line.individualCostInput;
          if (!input) return line;
          const key = individualCostKey(input),
            adoption = individualCostAdoption(input, costs);
          if (
            !adoption ||
            (line.editedFields?.includes("rate") &&
              !line.individualCost &&
              !line.rateOverride)
          )
            return line;
          const resolved = await resolveIndividualCost(
            input.raw,
            line.unit,
            "SSR",
            adoption,
            recipe.year,
            zone,
          );
          if (resolved.rate === null)
            throw new Error(
              `Rate unavailable for ${line.description}. Choose another SOR rate or enter a manual rate in Individual Costs.`,
            );
          changed = true;
          return {
            ...line,
            rate: resolved.rate,
            amount: resolved.rate * line.quantity,
            rateOverride: undefined,
            rateSource: `Individual Costs · ${resolved.label} · ${recipe.year} · ${zone}`,
            individualCost: {
              key,
              mode: adoption.mode,
              label: resolved.label,
              publishedRate: numeric(input.raw.rate),
            },
            editedFields: [
              ...new Set([...(line.editedFields ?? []), "rate" as const]),
            ],
          };
        }),
      ),
    })),
  );
  let dataVariant = recipe.dataVariant;
  const addition = dataVariant?.additionAnalysis;
  if (addition) {
    const nested = await applyIndividualCosts(
      { ...recipe, dataVariant: undefined, sections: addition.sections },
      costs,
      zone,
    );
    if (nested.calculationStale) {
      changed = true;
      dataVariant = {
        ...dataVariant!,
        additionAnalysis: { ...addition, sections: nested.sections },
      };
    }
  }
  return changed
    ? {
        ...recipe,
        sections,
        dataVariant,
        publishedRate: undefined,
        calculationStale: true,
        recalculation: undefined,
      }
    : recipe;
}
