import type { EestimateProject, ProjectNode } from "../types/project";
import type {
  RateAnalysisRecipe,
  RateAnalysisSectionKey,
} from "../types/rateAnalysis";
import type {
  CostOwner,
  IndividualCostInput,
  IndividualCostRow,
} from "../types/individualCosts";
import {
  costConfidence,
  individualCostGroupKey,
  individualCostKey,
  numeric,
} from "./individualCosts";
import {
  collectDashboardItems,
  dashboardContextMatches,
  dashboardItemIsSynced,
  dashboardItemSignature,
  dashboardDataCompileSignature,
} from "./dashboardSync";
import { projectNodePath, rateAnalysisOverrideForNode } from "./projectItems";
import { effectiveAllowanceForNode } from "./componentAllowance";
import { fetchRateAnalysis } from "./rateAnalysis";
import { mergeSavedRecipe } from "./recipeMerge";
import { projectDataForNode, projectDataRecipe } from "./projectData";
import { SorRequestCache } from "./sorCache";
import { morthRowIsExcluded } from "./morthMaterialLead";

export interface ProjectCostUsage {
  nodeId: string;
  description: string;
  path: string;
  via?: string;
  locked: boolean;
}
export interface ProjectIndividualCostRow extends IndividualCostRow {
  id: string;
  owner: CostOwner;
  kind: RateAnalysisSectionKey;
  memberKeys: string[];
  adoptionKeys: string[];
  inputs: IndividualCostInput[];
  locations: ProjectCostUsage[];
  aliases: string[];
  confidence: ReturnType<typeof costConfidence>;
}
export interface ProjectCostRecipe {
  node: ProjectNode;
  recipe: RateAnalysisRecipe;
  path: string;
}
const sourceCache = new SorRequestCache(128);

/** Build the inventory from actual project rows; unused definitions never enter it. */
export function collectProjectIndividualCosts(
  entries: ProjectCostRecipe[],
): ProjectIndividualCostRow[] {
  const groups = new Map<string, ProjectIndividualCostRow>();
  const severity = { Correct: 0, Maybe: 1, "Review Required": 2 };
  for (const { node, recipe, path } of entries) {
    const walk = (
      current: RateAnalysisRecipe,
      via?: string,
      ancestors = new Set<RateAnalysisRecipe>(),
    ): void => {
      if (ancestors.has(current)) return;
      const visited = new Set(ancestors).add(current);
      for (const section of current.sections)
        for (const line of section.lines) {
          if (current.morth && morthRowIsExcluded(current.morth.inputs[line.id]?.raw ?? {})) continue;
          const dependency = current.morth?.inputs[line.id]?.dependency;
          const locked = Boolean(
            line.editedFields?.some((f) => f === "rate" || f === "amount") &&
              !line.individualCost &&
              !line.rateOverride,
          );
          if (dependency && !locked) {
            walk(
              dependency,
              [via, line.description].filter(Boolean).join(" → "),
              visited,
            );
            continue;
          }
          const input = line.individualCostInput;
          if (!input || (input.owner !== "SSR" && input.owner !== "MORTH"))
            continue;
          const id = individualCostGroupKey(input),
            memberKey = individualCostKey(input);
          let row = groups.get(id);
          const confidence = costConfidence(input.raw);
          if (!row) {
            row = {
              id,
              key: JSON.parse(id),
              owner: input.owner,
              kind: input.kind,
              description: line.description,
              unit: line.unit,
              sample: input.raw,
              usages: 0,
              analyses: 0,
              minRate: null,
              maxRate: null,
              choices: [],
              memberKeys: [],
              adoptionKeys: [id],
              inputs: [],
              locations: [],
              aliases: [],
              confidence,
            };
            groups.set(id, row);
          }
          if (!row.memberKeys.includes(memberKey)) {
            row.memberKeys.push(memberKey);
          }
          if (
            !row.inputs.some(
              (i) =>
                individualCostKey(i) === memberKey &&
                numeric(i.raw.rate) === numeric(input.raw.rate),
            )
          )
            row.inputs.push(input);
          if (!row.aliases.includes(line.description))
            row.aliases.push(line.description);
          if (severity[confidence] > severity[row.confidence])
            row.confidence = confidence;
          row.usages++;
          if (
            !row.locations.some(
              (u) =>
                u.nodeId === node.id && u.via === via && u.locked === locked,
            )
          )
            row.locations.push({
              nodeId: node.id,
              description: node.itemDescription ?? node.name,
              path,
              via,
              locked,
            });
          row.analyses = new Set(row.locations.map((u) => u.nodeId)).size;
          const rate =
            input.owner === "SSR"
              ? numeric(input.raw.rate)
              : numeric(current.morth?.inputs[line.id]?.rate);
          if (rate !== null) {
            row.minRate =
              row.minRate === null ? rate : Math.min(row.minRate, rate);
            row.maxRate =
              row.maxRate === null ? rate : Math.max(row.maxRate, rate);
          }
        }
      const addition = current.dataVariant?.additionAnalysis;
      if (addition)
        walk(
          {
            ...current,
            morth: undefined,
            dataVariant: undefined,
            sections: addition.sections,
          },
          [via, "Selected addition"].filter(Boolean).join(" → "),
          visited,
        );
    };
    walk(recipe);
  }
  // Published resource identities also merge aliases whose descriptions differ.
  // A second pass handles transitive matches (same identity OR same binding/name).
  const parents = new Map<string, string>();
  const find = (id: string): string => {
    const parent = parents.get(id);
    if (!parent || parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  const byMember = new Map<string, string>();
  for (const row of groups.values()) {
    for (const input of row.inputs) {
      const basis = String(
        (
          input.raw.resource_identity as
            | { link_review?: { rate_basis_multiplier?: unknown } }
            | undefined
        )?.link_review?.rate_basis_multiplier ?? "1",
      );
      const member = JSON.stringify([individualCostKey(input), basis]);
      const other = byMember.get(member);
      if (other) {
        const a = find(row.id),
          b = find(other);
        if (a !== b) parents.set(a > b ? a : b, a > b ? b : a);
      } else byMember.set(member, row.id);
    }
  }
  const merged = new Map<string, ProjectIndividualCostRow>();
  for (const row of groups.values()) {
    const root = find(row.id),
      existing = merged.get(root);
    if (!existing) {
      merged.set(root, {
        ...row,
        id: root,
        key: JSON.parse(root),
        adoptionKeys: [...row.adoptionKeys],
      });
      continue;
    }
    existing.adoptionKeys.push(...row.adoptionKeys);
    existing.memberKeys = [
      ...new Set([...existing.memberKeys, ...row.memberKeys]),
    ];
    existing.inputs.push(...row.inputs);
    existing.aliases = [...new Set([...existing.aliases, ...row.aliases])];
    existing.usages += row.usages;
    for (const location of row.locations)
      if (
        !existing.locations.some(
          (u) =>
            u.nodeId === location.nodeId &&
            u.via === location.via &&
            u.locked === location.locked,
        )
      )
        existing.locations.push(location);
    existing.analyses = new Set(existing.locations.map((u) => u.nodeId)).size;
    if (severity[row.confidence] > severity[existing.confidence])
      existing.confidence = row.confidence;
    if (row.minRate !== null)
      existing.minRate =
        existing.minRate === null
          ? row.minRate
          : Math.min(existing.minRate, row.minRate);
    if (row.maxRate !== null)
      existing.maxRate =
        existing.maxRate === null
          ? row.maxRate
          : Math.max(existing.maxRate, row.maxRate);
  }
  return [...merged.values()].sort(
    (a, b) =>
      a.description.localeCompare(b.description, undefined, {
        numeric: true,
      }) || a.id.localeCompare(b.id),
  );
}

/** Reuse current compiled DATA; fetch only missing project sources, once per identity. */
export async function loadProjectIndividualCosts(
  project: EestimateProject,
  cancelled = (): boolean => false,
): Promise<{ rows: ProjectIndividualCostRow[]; errors: string[]; entries: ProjectCostRecipe[] }> {
  const items = collectDashboardItems(project.root).filter(
    (n) =>
      n.itemSource === "SSR" ||
      n.itemSource === "MORTH" ||
      projectDataForNode(project.projectData, n)?.kind === "ssr",
  );
  const entries: ProjectCostRecipe[] = [],
    errors: string[] = [];
  let index = 0;
  const snapshot = dashboardContextMatches(project.dashboardSnapshot, project)
    ? project.dashboardSnapshot
    : undefined;
  const dataSignature = items.some(n => n.projectDataId) ? dashboardDataCompileSignature(project) : undefined;
  const worker = async (): Promise<void> => {
    while (!cancelled() && index < items.length) {
      const node = items[index++];
      try {
        const allowance = effectiveAllowanceForNode(project, node.id);
        const definition = projectDataForNode(project.projectData, node);
        let recipe =
          snapshot &&
          dashboardItemIsSynced(snapshot, node) &&
          (!definition ||
            snapshot.dataCompileSignature === dataSignature)
            ? snapshot.recipes[node.id]
            : undefined;
        // Old snapshots may predate resource identities; rebuild those once.
        if (
          !recipe ||
          (!definition &&
            recipe.sections.some((s) =>
              s.lines.some((l) => !l.userAdded && !l.individualCostInput),
            ))
        ) {
          const options = {
            zone: project.meta.sorZone ?? "zone_3",
            materialRateOverrides: project.meta.materialRateOverrides,
            morthParameters: project.meta.morthParameters,
            miscellaneousCosts: project.meta.miscellaneousCosts,
            individualCosts: project.meta.individualCosts,
            areaAllowancePercent: allowance.percent,
            areaAllowanceLabel: allowance.label,
          };
          const key = JSON.stringify([
            dashboardItemSignature(node),
            project.meta.sorYear,
            options,
            definition,
          ]);
          recipe = await sourceCache.get(key, 120_000, () =>
            definition
              ? projectDataRecipe(
                  definition,
                  node,
                  project.meta.sorYear,
                  project.meta.sorZone ?? "zone_3",
                  project.meta.materialRateOverrides,
                  allowance,
                  project.meta.individualCosts,
                  project.meta.miscellaneousCosts,
                )
              : fetchRateAnalysis(node, project.meta.sorYear, options),
          );
        }
        const saved = rateAnalysisOverrideForNode(project, node);
        if (saved) recipe = mergeSavedRecipe(recipe, saved);
        const path = projectNodePath(project.root, node.id)
          .map((n) => n.name)
          .join(" / ");
        entries.push({ node, recipe, path });
      } catch (e) {
        errors.push(
          `${node.itemDescription ?? node.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return { rows: collectProjectIndividualCosts(entries), errors, entries };
}
