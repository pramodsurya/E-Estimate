import { individualCostKey as identityKey, individualCostGroupKey as identityGroupKey } from './individualCostIdentity';
export const individualCostKey = identityKey;
export const individualCostGroupKey = identityGroupKey;
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
  const choices = await costRpc<IndividualCostChoice[]>("individual_cost_choices", {
    p_row: {
      ...raw,
      _candidates: [...rows(raw._candidates), ...rows(defaults.candidates)],
    },
  });
  const component = record(raw.price_lookup).rate_component;
  return typeof component === "string"
    ? choices.map((choice) => ({ ...choice, component }))
    : choices;
}
export function morthResourceCode(raw: RecordValue): string | undefined {
  const lookup = record(raw.price_lookup),
    identity = record(raw.resource_identity);
  // Expanded equipment alternatives retain source evidence, but their current
  // SOR/project-quote binding takes precedence over that inherited identity.
  if (lookup.table && lookup.table !== "analysis_resource") return undefined;
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
  pricing?: {
    recipeCode: string;
    component: string;
    quoteUnit: string;
    status: string;
    conversionFactor: number;
    capacityFactor?: number;
    includesFuel?: boolean;
    includesCrew?: boolean;
    components?: Record<string, number>;
  };
}
async function storedStartingRate(
  raw: RecordValue,
  unit: string,
  year: string,
  zone: string,
): Promise<ResolvedIndividualCost | undefined> {
  const defaults = await morthResourceDefaults(raw);
  const component = String(
    record(raw.price_lookup).rate_component ??
      record(raw.resource_identity).rate_component ?? "rate",
  );
  const startingBasis = record(defaults.starting_rate_basis);
  if (startingBasis.enabled === true) {
    const quote = await costRpc<RecordValue>("morth_resource_starting_quote", {
      p_resource_code: morthResourceCode(raw), p_year: year, p_zone: zone,
      p_component: component, p_unit: unit,
    });
    const value = numeric(quote.rate);
    const rate = quote.status === "priced" && quote.year === year && quote.zone === zone
      && value !== null && value >= 0 ? value : null;
    const capacity = numeric(quote.capacity_factor ?? startingBasis.capacity_factor);
    const factors = record(quote.component_factors ?? startingBasis.component_factors);
    const total = ["rate", "total", "hire_total"].includes(component);
    const factorLabel = total
      ? `hire/fuel ×${capacity}; crew ×${String(factors.crew_charge ?? 1)}`
      : `${component.replace("_charge", "")} ×${String(factors[component] ?? "?")}`;
    return {
      rate, source: "starting-sor", reviewRequired: true,
      label: `${String(quote.description ?? raw.desc ?? "Equipment")} · 8 kL SOR · ${factorLabel} · ${year}${rate === null ? " · estimate unavailable" : " · starting estimate"} · review required`,
      pricing: {
        recipeCode: String(startingBasis.reference_recipe_code), component,
        quoteUnit: unit, status: String(quote.status),
        conversionFactor: numeric(quote.unit_conversion_factor) ?? 1,
        ...(capacity !== null ? { capacityFactor: capacity } : {}),
        includesFuel: quote.includes_fuel === true,
        includesCrew: quote.includes_crew === true,
        components: Object.fromEntries(Object.entries(record(quote.rate_detailed))
          .filter(([, amount]) => numeric(amount) !== null)
          .map(([name, amount]) => [name, numeric(amount)!])),
      },
    };
  }
  const editionOf = (r: RecordValue): unknown =>
    r.year ?? r.sor_year ?? r.source_edition_year;
  const records = rows(defaults.pricing_records)
    .filter(
      (r) =>
        (!r.zone || r.zone === zone) &&
        (!r.project_zone || r.project_zone === zone),
    )
    .sort((a, b) => {
      const annual = (r: RecordValue): number => (editionOf(r) === year ? 1 : 0);
      return (
        annual(b) - annual(a) ||
        String(editionOf(b) ?? "").localeCompare(
          String(editionOf(a) ?? ""),
        )
      );
    });
  for (const entry of records) {
    // Legacy machinery records store their inclusive price as hire_total.
    // A split fuel/hire/crew row must only read that specific component.
    const amount = ["rate", "total", "hire_total"].includes(component)
      ? entry.rate ?? entry.hire_total ?? record(entry.zone_rates)[zone]
      : entry[component];
    const rate = numeric(record(amount)[zone] ?? amount);
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
    const edition = editionOf(entry);
    const benchmark =
      edition !== year ||
      /benchmark|mock|proxy/.test(String(entry.rate_role));
    return {
      rate: rate * factor,
      source: benchmark ? "benchmark" : "stored",
      reviewRequired: benchmark,
      label: `${benchmark ? "Stored starting benchmark" : "Stored resource rate"}${edition ? ` · ${edition}` : ""} · no SOR item adopted${factor !== 1 ? ` · ×${factor} (${sourceUnit} → ${unit})` : ""}${benchmark ? " · review required" : ""}`,
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
function linkedSorLookup(raw: RecordValue, code: string): RecordValue | undefined {
  const lookup = record(raw.price_lookup);
  if (lookup.recipe_code === code) return lookup;
  for (const value of Object.values(record(lookup.cases))) {
    const branch = record(value);
    if (branch.recipe_code === code) return { ...lookup, ...branch };
  }
  return undefined;
}
export async function resolveIndividualCost(
  raw: RecordValue,
  unit: string,
  owner: CostOwner,
  adoption: IndividualCostAdoption | undefined,
  year: string,
  zone: string,
  supplied?: IndividualCostChoice[],
  parameters: RecordValue = record(raw._pricing_parameters),
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
  const lookup = record(raw.price_lookup);
  if (owner === "MORTH" && !adoption && lookup.table === "project_quote")
    return { rate: null, label: "Enter this equipment's quoted component rate in Individual Costs" };
  if (owner === "MORTH" && !adoption && morthResourceCode(raw)) {
    const stored = await storedStartingRate(raw, unit, year, zone);
    if (stored) return stored;
  }
  const choices = adoption?.code ? [] : supplied ?? (await costChoices(raw));
  const branch = record(record(lookup.cases)[String(parameters[String(lookup.selection_parameter)])]);
  const boundCode = branch.recipe_code ?? lookup.recipe_code;
  const boundChoice = typeof boundCode === "string"
    ? { ...choices.find((choice) => choice.code === boundCode),
        code: boundCode,
        component: String(branch.rate_component ?? lookup.rate_component ?? "rate") }
    : undefined;
  const selected = adoption?.code
    ? {
        code: adoption.code,
        component: adoption.component ?? "rate",
        description: adoption.label,
      }
    : boundChoice ?? defaultCostChoice(choices);
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
  let quotedUnit =
    multiplier !== null ? String(review.reference_sor_unit ?? unit) : unit;
  let basisFactor = multiplier ?? 1;
  const conversion = record(linkedSorLookup(raw, selected.code)?.unit_conversion);
  if (multiplier === null && conversion.type === "fixed_supply_length") {
    const length = numeric(conversion.metres_per_supply_item);
    const requestedLength = numeric(await costRpc("sor_unit_rate_factor", {
      p_source_unit: "metre", p_requested_unit: unit,
    }));
    if (length === null || length <= 0 || requestedLength === null)
      return { rate: null, label: "Supply length conversion requires review" };
    quotedUnit = "Each";
    basisFactor = requestedLength / length;
  } else if (multiplier === null && conversion.type === "bulk_density_kg_per_cum") {
    const density = numeric(parameters[String(conversion.parameter)]);
    if (density === null || density <= 0)
      return { rate: null, label: "Enter bulk density (kg/cum) to convert the SOR rate" };
    const requestedMass = numeric(await costRpc("sor_unit_rate_factor", {
      p_source_unit: "kg", p_requested_unit: unit,
    }));
    if (requestedMass === null)
      return { rate: null, label: "Density conversion requires a mass unit" };
    quotedUnit = "cum";
    basisFactor = requestedMass / density;
  }
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
      ? quoted * basisFactor
      : null;
  if (rate === null && owner === "MORTH" && !adoption) {
    const stored = await storedStartingRate(raw, unit, year, zone);
    if (stored) return stored;
  }
  const starting = !adoption && Boolean(morthResourceCode(raw));
  // The quote already includes ordinary unit conversion; never multiply it twice.
  const factor = (numeric(quote.conversion_factor) ?? 1) * basisFactor;
  const basisLabel = rate !== null && factor !== 1
    ? ` · ×${factor} (${String(quote.source_unit ?? quotedUnit)} → ${unit})`
    : "";
  return {
    rate,
    label: `${selected.description ?? "Selected SOR rate"}${basisLabel}${rate === null ? ` · no compatible ${year} rate per ${unit}` : starting ? " · starting SOR choice · review required" : ""}`,
    source: starting ? "starting-sor" : "sor",
    reviewRequired: starting,
    pricing: {
      recipeCode: selected.code,
      component: selected.component,
      quoteUnit: quotedUnit,
      status: String(quote.status ?? "unknown"),
      conversionFactor: factor,
    },
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
