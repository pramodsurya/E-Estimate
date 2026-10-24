import type {
  EestimateProject,
  ProjectDataDefinition,
  SorZone,
} from "../types/project";
import { projectDataUsesTimelyRates } from "./projectDataRateLinks";

export function nextProjectDataCode(
  definitions: ProjectDataDefinition[],
): string {
  const highest = definitions.reduce((max, definition) => {
    const match = /^DATA-SOR-(\d+)$/i.exec(definition.code.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `DATA-SOR-${String(highest + 1).padStart(3, "0")}`;
}

/** Retire only the previously injected default, including its placed usages. */
export function retireDefaultCreatedData(
  project: EestimateProject,
): EestimateProject {
  const removed = new Set(
    (project.projectData ?? [])
      .filter(
        (definition) =>
          (definition as unknown as { builtIn?: { key?: string } }).builtIn
            ?.key === "m25-wearing-coat" ||
          definition.id === `${project.id}:builtin:m25-wearing-coat`,
      )
      .map((definition) => definition.id),
  );
  if (!removed.size) return project;
  const removedNodes = new Set<string>();
  const clean = (node: EestimateProject["root"]): EestimateProject["root"] => ({
    ...node,
    children: node.children
      .filter((child) => {
        if (child.projectDataId && removed.has(child.projectDataId)) {
          removedNodes.add(child.id);
          return false;
        }
        return true;
      })
      .map(clean),
  });
  const keep = (key: string) =>
    ![...removed].some((id) => key === `PROJECT_DATA:${id}`);
  const root = clean(project.root);
  return {
    ...project,
    leadChart: project.leadChart
      ? {
          ...project.leadChart,
          applications: project.leadChart.applications?.filter(
            (a) => !removedNodes.has(a.itemNodeId ?? "") && keep(a.itemKey),
          ),
        }
      : undefined,
    projectData: project.projectData?.filter(
      (definition) => !removed.has(definition.id),
    ),
    root,
    dashboardSnapshot: undefined,
    rateAnalysisOverrides: Object.fromEntries(
      Object.entries(project.rateAnalysisOverrides ?? {}).filter(([key]) =>
        keep(key),
      ),
    ),
    rateAnalysisScopedOverrides: Object.fromEntries(
      Object.entries(project.rateAnalysisScopedOverrides ?? {}).map(
        ([scope, rows]) => [
          scope,
          Object.fromEntries(Object.entries(rows).filter(([key]) => keep(key))),
        ],
      ),
    ),
  };
}

export function projectDataRatesReady(
  definition: ProjectDataDefinition,
  year: string,
  zone: SorZone,
): boolean {
  if (!projectDataUsesTimelyRates(definition)) return true;
  if (definition.rateRefresh)
    return (
      definition.rateRefresh.status === "ready" &&
      definition.rateRefresh.year === year &&
      definition.rateRefresh.zone === zone
    );
  return false;
}
