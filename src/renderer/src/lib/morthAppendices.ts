import type {
  RateAnalysisRecipe,
  RateAnalysisSummary,
} from "../types/rateAnalysis";

export interface MorthAbstractRow {
  id: string;
  label: string;
  amount: number;
  percent?: number;
  basisAmount?: number;
  base?: string;
  formulaKind: string;
}
export interface MorthAppendix {
  key: string;
  name: string;
  recipe: RateAnalysisRecipe;
  usages: string[];
}
const registryIndexes = new WeakMap<
  MorthAppendix[],
  Map<string, MorthAppendix>
>();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Share a calculated appendix by code and adopted rates, independently of its route or usage. */
export function morthAnalysisIdentity(recipe: RateAnalysisRecipe): string {
  const summary = recipe.morth?.startingSummary;
  if (summary && summary.costReady !== false &&
      Number.isFinite(summary.ratePerUnit) && Number.isFinite(summary.baseCost) &&
      Number.isFinite(recipe.outputQuantity) && recipe.outputQuantity > 0) {
    return JSON.stringify({
      code: recipe.itemCode,
      unit: recipe.unit,
      rate: summary.ratePerUnit,
      // Parents can adopt either the final rate or the direct rate. Both must
      // agree so sharing a live Excel reference cannot change a parent's cost.
      directRate: (summary.baseCost + (summary.morthLeadAmount ?? 0)) / recipe.outputQuantity,
    });
  }
  // Uncalculated/incomplete analyses have no reliable adopted rate to share.
  return JSON.stringify(
    canonical({
      code: recipe.itemCode,
      year: recipe.year,
      zone: recipe.zone,
      output: recipe.outputQuantity,
      abstract:
        recipe.morth?.startingSummary?.morthAbstract ??
        recipe.morth?.startingSummary,
      // Unused parent settings must not duplicate an otherwise identical appendix.
      fallbackParameters: recipe.morth?.startingSummary?.morthAbstract
        ? undefined
        : recipe.morth?.parameters,
      calculation: recipe.morth?.source.calculation,
      leadScopes: Object.values(recipe.morth?.inputs ?? {}).filter(input => input.raw.material_lead_charge === true).map(input => [input.raw.desc, input.raw.material_lead_route_signature]),
      sections: recipe.sections.map((s) => ({
        key: s.key,
        lines: s.lines.map((l) => ({
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.amount,
        })),
      })),
      dependencies: Object.entries(recipe.morth?.inputs ?? {})
        .filter(([, i]) => i.dependency)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, i]) => [id, morthAnalysisIdentity(i.dependency!)]),
    }),
  );
}
export function collectMorthAppendices(
  recipes: RateAnalysisRecipe[],
): MorthAppendix[] {
  const found = new Map<string, MorthAppendix>(),
    expanded = new Set<RateAnalysisRecipe>();
  const visit = (
    parent: RateAnalysisRecipe,
    trail: Set<RateAnalysisRecipe>,
  ): void => {
    if (trail.has(parent)) return;
    const next = new Set(trail).add(parent);
    const inputs = parent.sections.flatMap((s) =>
      s.lines.flatMap((l) =>
        parent.morth?.inputs[l.id] ? [parent.morth.inputs[l.id]] : [],
      ),
    );
    for (const input of inputs) {
      const child = input.dependency;
      if (!child || next.has(child)) continue;
      const identity = morthAnalysisIdentity(child);
      let entry = found.get(identity);
      if (!entry) {
        const key = `MA${String(found.size + 1).padStart(3, "0")}`;
        const baseName = `Appendix ${child.morth?.printedItem || child.description}`,
          same = [...found.values()].filter(
            (e) => e.recipe.itemCode === child.itemCode,
          );
        if (same.length === 1) same[0].name = `${baseName} (configuration 1)`;
        entry = {
          key,
          name: same.length
            ? `${baseName} (configuration ${same.length + 1})`
            : baseName,
          recipe: child,
          usages: [],
        };
        found.set(identity, entry);
      }
      const label = `${parent.morth?.printedItem || parent.itemCode} · ${parent.description}`;
      if (!entry.usages.includes(label)) entry.usages.push(label);
      // Equal outer rates can still contain different nested appendix rates.
      // Inspect each usage tree even when its outer definition is shared.
      if (!expanded.has(child)) {
        expanded.add(child);
        visit(child, next);
      }
    }
  };
  recipes.forEach((r) => visit(r, new Set()));
  const result = [...found.values()];
  registryIndexes.set(result, found);
  return result;
}
export function appendixForRecipe(
  entries: MorthAppendix[],
  recipe: RateAnalysisRecipe,
): MorthAppendix | undefined {
  const identity = morthAnalysisIdentity(recipe);
  let index = registryIndexes.get(entries);
  if (!index) {
    index = new Map(entries.map((e) => [morthAnalysisIdentity(e.recipe), e]));
    registryIndexes.set(entries, index);
  }
  return index.get(identity);
}
export function morthAbstract(
  recipe: RateAnalysisRecipe,
  summary?: RateAnalysisSummary,
): MorthAbstractRow[] {
  return (summary ?? recipe.morth?.startingSummary)?.morthAbstract ?? [];
}
export function calculationBasisLabel(base?: string): string {
  const labels: Record<string, string> = {
    direct_cost: "Direct cost",
    labour_plus_machinery_plus_material_cost: "Direct cost",
    direct_cost_including_allowances: "Direct cost + allowances",
    labour_plus_machinery_plus_materials_plus_percentage_allowances:
      "Direct cost + allowances",
    labour_plus_machinery_cost: "Machinery + labour",
    labour_cost: "Labour",
    machinery_cost: "Machinery",
    materials_cost: "Materials",
    material_cost: "Materials",
    direct_cost_plus_overheads: "Direct cost + overheads",
    direct_cost_including_allowances_plus_overheads:
      "Direct cost + allowances + overheads",
    eligible_direct_cost_plus_overheads:
      "Eligible direct cost + allowances + overheads",
    labour_plus_machinery_plus_materials_plus_percentage_allowances_excluding_marked_dependencies:
      "Eligible direct cost + allowances",
    labour_plus_machinery_plus_overheads: "Machinery + labour + overheads",
    filter_material_cost_only: "Eligible filter materials",
    adopted_concrete_cost: "Adopted concrete",
    foundation_excavation_cost: "Foundation excavation",
    pile_shoes_plus_machinery_plus_labour_cost:
      "Pile shoes + machinery + labour",
    pile_shoes_plus_machinery_plus_labour_plus_overhead_cost:
      "Pile shoes + machinery + labour + overheads",
  };
  return base ? (labels[base] ?? base.replace(/_/g, " ")) : "Direct cost";
}
