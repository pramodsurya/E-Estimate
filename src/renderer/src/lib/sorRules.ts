import {
  getSorDetail,
  humanize,
  readySorDetail,
  record,
  sorSelectionKey,
  sorStatus,
} from "./sorSource";
import type {
  SorAdjustment,
  SorConfiguration,
  SorDetail,
  SorItemSelection,
  SorZone,
} from "../types/sor";
export interface SorInputField {
  key: string;
  label: string;
  type: "number" | "text" | "boolean";
  value?: number | string | boolean;
}
export interface SorAddon {
  id: string;
  label: string;
  kind: string;
  rule: Record<string, unknown>;
  fields: SorInputField[];
  blocked?: string;
  exclusive?: string;
}
export const EMPTY_SOR_CONFIGURATION: SorConfiguration = {
  inputs: {},
  enabled: [],
  confirmed: [],
};
const finite = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Enter a finite ${label}.`);
  return value;
};
const money = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;
function fieldsIn(
  value: unknown,
  out = new Map<string, SorInputField>(),
): Map<string, SorInputField> {
  if (!value || typeof value !== "object") return out;
  const item = record(value);
  if (typeof item.input === "string") {
    const type =
      typeof item.value === "boolean"
        ? "boolean"
        : typeof item.value === "string"
          ? "text"
          : "number";
    out.set(item.input, {
      key: item.input,
      label: humanize(item.input),
      type,
      value: item.value as number | string | boolean | undefined,
    });
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((v) => fieldsIn(v, out));
    else if (typeof child === "object") fieldsIn(child, out);
  }
  return out;
}
export function sorAddons(detail: SorDetail): SorAddon[] {
  const source = detail.recipe?.addons ?? {};
  const result: SorAddon[] = [];
  const height = record(source.height_rule);
  if (Object.keys(height).length)
    result.push({
      id: String(height.rule_code),
      label: "Extra unsupported height",
      kind: "height",
      rule: height,
      fields: [
        {
          key: "unsupported_height_m",
          label: "Unsupported height (m)",
          type: "number",
          value: Number(height.threshold_m),
        },
      ],
    });
  const porcelain = record(source.porcelain_colour_rule);
  if (Object.keys(porcelain).length)
    result.push({
      id: String(porcelain.rule_code),
      label: "Coloured porcelain",
      kind: "porcelain",
      rule: porcelain,
      fields: [
        {
          key: "white_porcelain_component",
          label: "Verified white porcelain component cost, excluding fittings",
          type: "number",
        },
      ],
    });
  const electrical = record(source.electrical_rules);
  for (const value of Array.isArray(electrical.rules) ? electrical.rules : []) {
    const rule = record(value),
      condition = record(rule.condition);
    const type =
      typeof condition.equals === "boolean"
        ? "boolean"
        : typeof condition.equals === "string"
          ? "text"
          : "number";
    const supported =
      ["percentage", "percentage_each", "fixed_each"].includes(
        String(rule.operation),
      ) &&
      rule.basis === "scheduled_rate" &&
      !rule.review_only;
    result.push({
      id: String(rule.rule_code),
      label: String(rule.label),
      kind: "electrical",
      rule,
      exclusive: String(rule.exclusive_group || ""),
      blocked: supported
        ? undefined
        : "Requires reviewed project-specific cost data; this adjustment cannot be applied here.",
      fields: [
        {
          key: String(rule.parameter),
          label: humanize(String(rule.parameter)),
          type,
          value: condition.equals as number | string | boolean | undefined,
        },
      ],
    });
  }
  const ph = record(source.public_health_rules);
  for (const value of Array.isArray(ph.rules) ? ph.rules : []) {
    const rule = record(value);
    result.push({
      id: String(rule.rule_code),
      label: String(rule.label),
      kind: "public_health",
      rule,
      blocked: rule.review_only
        ? "Published clarification or review is required before this adjustment can be costed."
        : undefined,
      fields: [
        ...fieldsIn({
          expression: rule.expression,
          condition: rule.when,
        }).values(),
      ],
    });
  }
  for (const code of Array.isArray(source.recipe_codes)
    ? source.recipe_codes
    : []) {
    const target = detail.related_addons?.find(
      (recipe) => recipe.recipe_code === code,
    );
    const relation = record(target?.addons?.rule);
    result.push({
      id: `linked:${code}`,
      label: target?.description ?? "Published additional item",
      kind: "linked",
      rule: { target_recipe_code: code },
      fields: [...fieldsIn(relation.when).values()],
      blocked: target
        ? undefined
        : "The additional item needs its current reviewed source definition.",
    });
  }
  return result;
}
export function evaluateSorExpression(
  value: unknown,
  inputs: SorConfiguration["inputs"],
  annual: Record<string, unknown>,
  base: number,
  depth = 0,
): number {
  if (depth > 30)
    throw new Error("SOR expression exceeds its supported depth.");
  if (typeof value === "number") return finite(value, "source expression");
  const node = record(value);
  if (typeof node.input === "string")
    return finite(inputs[node.input], humanize(node.input));
  if (typeof node.annual === "string")
    return finite(annual[node.annual], `annual ${node.annual}`);
  if (node.base === "scheduled_rate" || node.rate === "scheduled_rate")
    return base;
  const args = Array.isArray(node.args)
    ? node.args
    : [node.left, node.right].filter((v) => v !== undefined);
  const numbers = args.map((v) =>
    evaluateSorExpression(v, inputs, annual, base, depth + 1),
  );
  let result: number;
  switch (node.op) {
    case "add":
      result = numbers.reduce((a, b) => a + b, 0);
      break;
    case "subtract":
      if (numbers.length !== 2) throw new Error("Invalid subtraction");
      result = numbers[0] - numbers[1];
      break;
    case "multiply":
      result = numbers.reduce((a, b) => a * b, 1);
      break;
    case "divide":
      if (numbers.length !== 2 || numbers[1] === 0)
        throw new Error("Invalid SOR divisor.");
      result = numbers[0] / numbers[1];
      break;
    case "max":
      result = Math.max(...numbers);
      break;
    case "min":
      result = Math.min(...numbers);
      break;
    case "ceil":
      result = Math.ceil(
        evaluateSorExpression(
          node.value ?? args[0],
          inputs,
          annual,
          base,
          depth + 1,
        ),
      );
      break;
    default:
      throw new Error(
        "This published expression needs a supported calculation adapter.",
      );
  }
  return finite(result, "calculated amount");
}
export function sorCondition(
  value: unknown,
  inputs: SorConfiguration["inputs"],
): boolean {
  const node = record(value);
  if (!Object.keys(node).length) return true;
  if (Array.isArray(node.all))
    return node.all.every((v) => sorCondition(v, inputs));
  if (Array.isArray(node.any))
    return node.any.some((v) => sorCondition(v, inputs));
  const actual = inputs[String(node.input)];
  if (actual === undefined)
    throw new Error(`Enter ${humanize(String(node.input))}.`);
  if (node.op === "eq") return actual === node.value;
  if (node.op === "ne") return actual !== node.value;
  const a = finite(actual, String(node.input)),
    b = finite(node.value, "condition limit");
  switch (node.op) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    default:
      throw new Error("Unsupported SOR condition.");
  }
}
export async function createSorSelection(
  detail: SorDetail,
  requestedCode: string,
  year: string,
  zone: SorZone,
  quantity: number,
  configuration: SorConfiguration,
): Promise<SorItemSelection> {
  if (!readySorDetail(detail) || !detail.recipe || !detail.annual)
    throw new Error(sorStatus(detail));
  if (
    detail.quote.year !== year ||
    detail.quote.zone !== zone ||
    detail.annual.year !== year
  )
    throw new Error(
      "SOR selection is stale. Reload for the active year and zone.",
    );
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("Enter a positive quantity.");
  const base = finite(detail.quote.rate, "published rate");
  const adjustments: SorAdjustment[] = [];
  const choices = sorAddons(detail);
  const selected = choices.filter((choice) =>
    configuration.enabled.includes(choice.id),
  );
  if (selected.length !== new Set(configuration.enabled).size)
    throw new Error(
      "An adjustment no longer applies to the resolved item. Choose its configuration again.",
    );
  const exclusivity = new Set<string>();
  for (const choice of selected) {
    if (choice.blocked) throw new Error(choice.blocked);
    if (choice.exclusive) {
      if (exclusivity.has(choice.exclusive))
        throw new Error(
          "Choose only one adjustment from each exclusive group.",
        );
      exclusivity.add(choice.exclusive);
    }
    const rule = choice.rule;
    let amount: number;
    if (choice.kind === "height") {
      if (
        rule.kind !== "centering_extra_height" ||
        record(rule.review).status !== "approved" ||
        rule.applies_to_recipe_code !== detail.recipe.recipe_code
      )
        throw new Error("This height rule needs review.");
      const height = finite(
        configuration.inputs.unsupported_height_m,
        "unsupported height",
      );
      if (height < 0) throw new Error("Height cannot be negative.");
      const increments = Math.max(
        0,
        Math.ceil(
          (height - Number(rule.threshold_m)) / Number(rule.increment_m) -
            1e-10,
        ),
      );
      const components =
        detail.quote.rate_detailed ?? detail.annual.rate_detailed ?? {};
      const h = finite(components.material_hire_charge, "material hire H"),
        l = finite(components.labour_charge, "labour L");
      if (
        rule.compounding !== false ||
        rule.rounding !== "component_paise_half_up"
      )
        throw new Error("Unsupported height rounding or compounding.");
      amount =
        increments *
        (money((h * Number(rule.percentage)) / 100) +
          money((l * Number(rule.percentage)) / 100));
    } else if (choice.kind === "porcelain") {
      if (!configuration.confirmed.includes(choice.id))
        throw new Error(
          "Confirm the porcelain-only cost basis before applying this extra.",
        );
      const component = finite(
        configuration.inputs.white_porcelain_component,
        "white porcelain component cost",
      );
      if (component < 0 || component > base)
        throw new Error(
          "Porcelain-only component must be between zero and the selected published rate.",
        );
      amount = (component * Number(rule.percentage)) / 100;
    } else if (choice.kind === "electrical") {
      const condition = record(rule.condition),
        actual = configuration.inputs[String(rule.parameter)];
      if ("equals" in condition && actual !== condition.equals)
        throw new Error(`${choice.label}: choose the published condition.`);
      const count =
        typeof actual === "boolean"
          ? actual
            ? 1
            : 0
          : finite(actual, String(rule.parameter));
      if (
        (condition.minimum !== undefined &&
          count < Number(condition.minimum)) ||
        (condition.maximum !== undefined && count > Number(condition.maximum))
      )
        throw new Error("Adjustment input is outside the published range.");
      amount =
        rule.operation === "percentage"
          ? (base * Number(rule.value)) / 100
          : rule.operation === "percentage_each"
            ? ((base * Number(rule.value)) / 100) *
              Math.max(0, count - Number(rule.base_count))
            : Number(rule.value) * Math.max(0, count - Number(rule.base_count));
    } else if (choice.kind === "linked" || rule.operation === "linked_item") {
      if (rule.when && !sorCondition(rule.when, configuration.inputs))
        throw new Error(`${choice.label}: the published condition is not met.`);
      const target = String(rule.target_recipe_code ?? "");
      if (!target || target === detail.recipe.recipe_code)
        throw new Error("The additional item target needs review.");
      const linked = await getSorDetail(target, year, zone);
      if (!readySorDetail(linked) || !linked.recipe)
        throw new Error(`Additional item ${target}: ${sorStatus(linked)}`);
      const relation = record(linked.recipe.addons?.rule);
      if (
        choice.kind === "linked" &&
        (!Array.isArray(relation.applies_to) ||
          !relation.applies_to.includes(detail.recipe.recipe_code))
      )
        throw new Error("The additional item is not bound to this recipe.");
      if (
        choice.kind === "linked" &&
        !sorCondition(relation.when, configuration.inputs)
      )
        throw new Error("The additional item condition is not met.");
      if (
        choice.kind === "linked" &&
        Array.isArray(relation.requires) &&
        relation.requires.length
      )
        throw new Error(
          "This additional item requires another reviewed selection.",
        );
      if (linked.quote.unit !== detail.quote.unit)
        throw new Error("The additional item has a different quantity basis.");
      amount = finite(linked.quote.rate, "additional item rate");
    } else {
      if (
        rule.operation !== "add" ||
        !sorCondition(rule.when, configuration.inputs)
      )
        throw new Error(
          `${choice.label}: the published condition is not met or needs its own adapter.`,
        );
      amount = evaluateSorExpression(
        rule.expression,
        configuration.inputs,
        record(detail.annual.metadata.annual_baselines),
        base,
      );
    }
    adjustments.push({
      code: choice.id,
      label: choice.label,
      amount: money(finite(amount, "adjustment")),
    });
  }
  const rate = money(
    base + adjustments.reduce((sum, row) => sum + row.amount, 0),
  );
  if (rate < 0) throw new Error("The configured rate cannot be negative.");
  return {
    recipeCode: requestedCode,
    resolvedRecipeCode: detail.recipe.recipe_code,
    year,
    zone,
    quantity,
    recipe: detail.recipe,
    annual: detail.annual,
    quote: detail.quote,
    leadRule: detail.lead_rule,
    configuration: structuredClone(configuration),
    adjustments,
    rate,
    selectionKey: sorSelectionKey(requestedCode, configuration),
  };
}
