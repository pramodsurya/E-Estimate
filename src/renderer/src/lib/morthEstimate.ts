import {
  applyMiscellaneousCosts,
  type MiscellaneousCosts,
} from "./miscellaneousCosts";
import {
  costRpc,
  record,
  rows,
  numeric,
  individualCostKey,
  individualCostAdoption,
  resolveIndividualCost,
  morthResourceCode,
  preloadMorthResourceDefaults,
} from "./individualCosts";
import { projectItemKey } from "./projectItems";
import type { IndividualCosts } from "../types/individualCosts";
import type { ProjectNode } from "../types/project";
import type {
  RateAnalysisRecipe,
  RateAnalysisLine,
  RateAnalysisSectionKey,
} from "../types/rateAnalysis";
export interface MorthDetail {
  code: string;
  recipe: Record<string, unknown>;
  context: Record<string, unknown>;
  candidates: Record<string, unknown>;
}
export async function fetchMorthRecipe(
  node: ProjectNode,
  year: string,
  zone: string,
  costs?: IndividualCosts,
  parameters: Record<string, string | number | boolean> = {},
  ancestors: string[] = [],
  miscellaneousCosts?: MiscellaneousCosts,
): Promise<RateAnalysisRecipe> {
  const code = node.itemCode!,
    category = node.morth?.category ?? "medium";
  if (ancestors.includes(code) || ancestors.length > 12)
    throw new Error(
      "Circular or excessively deep MoRTH dependency; choose a manual rate for the affected input.",
    );
  const detail = await costRpc<MorthDetail | null>("morth_picker_detail", {
    p_code: code,
    p_category: category,
  });
  if (!detail) throw new Error("MoRTH source DATA is unavailable.");
  const source: Record<string, unknown> = {
    ...detail.recipe,
    _project_category: category,
    _policies: record(detail.context.book_calculation_policies),
  };
  const selectedParameters: Record<string, string | number | boolean> = {
    ...parameters,
    ...node.morth?.parameters,
    selected_project_zone: zone,
  };
  const calculation = record(source.calculation);
  const overheadSelector = String(
    calculation.overhead_selection_parameter ?? "",
  );
  if (overheadSelector && selectedParameters[overheadSelector] === undefined) {
    const choices = Object.keys(
      record(calculation.overhead_percent_by_project_type),
    );
    const choice = choices.includes("new_or_widening")
      ? "new_or_widening"
      : choices[0];
    if (choice) selectedParameters[overheadSelector] = choice;
  }
  // Expand only the selected equipment method; alternate rows remain in the cost registry.
  for (const kind of ["materials", "machinery", "labour"])
    source[kind] = rows(source[kind]).map((r) => ({ ...r }));
  source._options = ["materials", "machinery", "labour"].flatMap((kind) =>
    rows(source[kind])
      .map((r) => record(r.costing_options))
      .filter((g) => Object.keys(g).length),
  );
  const expanded: Record<string, Record<string, unknown>[]> = {
    materials: [],
    machinery: [],
    labour: [],
  };
  for (const kind of ["materials", "machinery", "labour"])
    for (const raw of rows(source[kind])) {
      const group = record(raw.costing_options),
        options = record(group.options);
      if (!Object.keys(options).length) {
        expanded[kind].push(raw);
        continue;
      }
      const selected = String(
        selectedParameters[String(group.selection_parameter)] ??
          group.default_option ??
          "source",
      );
      if (
        group.selection_parameter &&
        selectedParameters[String(group.selection_parameter)] === undefined
      )
        selectedParameters[String(group.selection_parameter)] = selected;
      const option = record(options[selected]);
      if (selected === "source") {
        expanded[kind].push(raw);
        continue;
      }
      for (const component of rows(option.components)) {
        const destination = String(component.section ?? kind);
        expanded[destination]?.push({
          ...raw,
          ...component,
          costing_options: undefined,
          resource_key:
            component.resource_key ?? `morth:option:${component.desc}`,
          unit: component.unit ?? raw.unit,
          quantity_expression:
            option.quantity_expression ?? raw.quantity_expression,
        });
      }
    }
  for (const kind of ["materials", "machinery", "labour"])
    source[kind] = [
      ...expanded[kind],
      ...rows(record(source.pricing_additions)[kind]),
    ];
  const inputs: NonNullable<RateAnalysisRecipe["morth"]>["inputs"] = {};
  const pending: string[] = [];
  const resourceCodes = ["materials", "machinery", "labour"].flatMap((kind) =>
    rows(source[kind]).flatMap((raw) => {
      const resourceCode = morthResourceCode(raw);
      return resourceCode ? [resourceCode] : [];
    }),
  );
  try {
    await preloadMorthResourceDefaults(resourceCodes);
  } catch (e) {
    pending.push(
      `Stored resource rates: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const sections = await Promise.all(
    (["materials", "machinery", "labour"] as RateAnalysisSectionKey[]).map(
      async (kind) => ({
        key: kind,
        label: kind[0].toUpperCase() + kind.slice(1),
        lines: await Promise.all(
          rows(source[kind]).map(
            async (raw, index): Promise<RateAnalysisLine> => {
              const id = `${kind}-${index}`,
                unit = String(raw.unit ?? ""),
                description = String(raw.desc ?? raw.description ?? "");
              const enriched = {
                ...raw,
                _evidence: detail.candidates[String(raw.resource_key)],
                _candidates:
                  record(detail.candidates[String(raw.resource_key)])
                    .candidates ?? [],
              };
              const input = {
                owner: "MORTH" as const,
                kind,
                raw: enriched,
                context: `${detail.code}:base:${index}`,
              };
              const key = individualCostKey(input),
                adoption = individualCostAdoption(input, costs),
                lookup = record(raw.price_lookup);
              let resolved: { rate: number | null; label: string } = {
                  rate: null,
                  label: "Rate pending",
                },
                dependency: RateAnalysisRecipe | undefined;
              if (!adoption && lookup.table === "morth") {
                const dependencyCode = morthDependencyCode(lookup, category);
                if (dependencyCode) {
                  try {
                    dependency = await fetchMorthRecipe(
                      {
                        ...node,
                        itemCode: dependencyCode,
                        morth: { category, printedItem: "", parameters: {} },
                      },
                      year,
                      zone,
                      costs,
                      selectedParameters,
                      [...ancestors, code],
                      miscellaneousCosts,
                    );
                  } catch (e) {
                    pending.push(
                      `${description}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                  }
                }
              } else {
                try {
                  resolved = await resolveIndividualCost(
                    enriched,
                    unit,
                    "MORTH",
                    adoption,
                    year,
                    zone,
                  );
                } catch (e) {
                  pending.push(
                    `${description}: ${e instanceof Error ? e.message : String(e)}`,
                  );
                }
              }
              inputs[id] = {
                raw,
                rate: resolved.rate,
                ...(dependency ? { dependency } : {}),
              };
              return {
                id,
                slNo: String(index + 1),
                description,
                unit,
                quantity: numeric(raw.quantity) ?? 0,
                rate: resolved.rate ?? 0,
                amount: 0,
                individualCostInput: input,
                individualCost: {
                  key,
                  mode: adoption?.mode ?? "sor",
                  label: dependency ? "MoRTH dependency" : resolved.label,
                  publishedRate: null,
                },
                rateSource: dependency
                  ? `Appendix ${dependency.morth?.printedItem ?? ""} · calculated`
                  : resolved.label,
                sourceValues: {
                  quantity: String(raw.quantity_raw ?? raw.quantity ?? ""),
                },
                resourceIdentity: { sourceTable: "MORTH", resourceKey: key },
              };
            },
          ),
        ),
      }),
    ),
  );
  const recipe: RateAnalysisRecipe = {
    schemaVersion: 1,
    itemKey: projectItemKey(node),
    itemSource: "MORTH",
    categoryKey: "morth",
    itemCode: detail.code,
    description: String(source.description ?? node.itemDescription),
    unit: String(source.unit ?? node.unit ?? ""),
    year,
    zone: zone as RateAnalysisRecipe["zone"],
    documentTitle: `${source.source_edition ?? "MoRTH 2019"} · SOR ${year}`,
    sectionHeading: String(source.section_heading ?? ""),
    outputQuantity: numeric(source.rate_divisor) ?? 0,
    overheadPercent: 0,
    sections,
    morth: {
      source,
      parameters: selectedParameters,
      inputs,
      printedItem: String(source.printed_item ?? ""),
      pending,
      sourceErrors: pending,
    },
  };
  return prepareMorthRecipe(
    applyMiscellaneousCosts(recipe, miscellaneousCosts),
  );
}
export function morthDependencyCode(
  lookup: Record<string, unknown>,
  category: string,
): string {
  if (typeof lookup.resolved_code === "string" && lookup.resolved_code)
    return lookup.resolved_code;
  const available = Array.isArray(lookup.available_dependency_codes)
    ? lookup.available_dependency_codes.map(String)
    : [];
  const template = String(lookup.code_template ?? "").replace(
    "{project_category}",
    category,
  );
  return available.includes(template) || !available.length
    ? template
    : available.length === 1
      ? available[0]
      : "";
}
export async function prepareMorthRecipe(
  recipe: RateAnalysisRecipe,
): Promise<RateAnalysisRecipe> {
  if (!recipe.morth) return recipe;
  const inputs = { ...recipe.morth.inputs };
  for (const section of recipe.sections)
    for (const line of section.lines) {
      if (
        inputs[line.id] &&
        (line.editedFields?.includes("rate") ||
          line.editedFields?.includes("amount"))
      ) {
        inputs[line.id] = {
          ...inputs[line.id],
          rate: line.rate,
          dependency: undefined,
        };
      }
    }
  const next = {
    ...recipe,
    morth: {
      ...recipe.morth,
      inputs,
      pending: recipe.morth.sourceErrors ?? [],
    },
  };
  const summary = await window.api.rateAnalysis.calculateBase(next);
  if (typeof summary.costReady !== "boolean") {
    throw new Error(
      "Restart the desktop app after its native build completes to enable the MoRTH calculator.",
    );
  }
  const results =
    (
      summary as typeof summary & {
        computedLines?: Record<
          string,
          { quantity: number; rate: number; amount: number }
        >;
      }
    ).computedLines ?? {};
  const sections = next.sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({ ...l, ...results[l.id] })),
  }));
  const abstract =
    summary.morthAbstract?.map((r) => ({
      label: r.label,
      amount: String(r.amount),
      value: "",
      unit: "",
      basis: r.basisAmount === undefined ? "" : String(r.basisAmount),
      percent: r.percent === undefined ? "" : String(r.percent) + "%",
    })) ??
    [
      { label: "Direct cost", amount: String(summary.baseCost) },
      {
        label: "Percentage allowances",
        amount: String(summary.allowanceAmount ?? 0),
      },
      { label: "Overheads", amount: String(summary.overheadAmount) },
      { label: "Contractor profit", amount: String(summary.profitAmount ?? 0) },
      { label: "Total cost", amount: String(summary.totalCost) },
      { label: `Rate per ${recipe.unit}`, amount: String(summary.ratePerUnit) },
    ].map((r) => ({ ...r, value: "", unit: "", basis: "", percent: "" }));
  return {
    ...next,
    sections,
    overheadPercent:
      summary.morthAbstract?.find((r) => r.id === "overhead")?.percent ?? 0,
    morth: {
      ...next.morth,
      pending: [
        ...new Set([
          ...(next.morth.sourceErrors ?? []),
          ...(summary.missing ?? []),
        ]),
      ],
      startingSummary: summary,
    },
    storedValues:
      summary.costReady === false
        ? undefined
        : {
            labourExtract: [],
            sectionTotals: {
              materials: String(summary.sectionTotals.materials),
              machinery: String(summary.sectionTotals.machinery),
              labour: String(summary.sectionTotals.labour),
            },
            abstract,
          },
    recalculation: undefined,
  };
}
