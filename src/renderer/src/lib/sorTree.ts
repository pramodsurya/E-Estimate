import type { SorLevel, SorNode, SorPath } from "../types/sor";

export interface SorNavigationPath {
  part: string;
  heading: string;
  section: string;
  subsection: string;
  count: number;
  page: number | null;
  first_code: string;
}
export interface SorCrumb {
  level: Exclude<SorLevel, "item">;
  key: string;
  label: string;
}
const levels = ["part", "heading", "section", "subsection"] as const;
const keyFor = (path: SorPath, level: string): string =>
  JSON.stringify([level, ...levels.map((key) => path[key] ?? null)]);

/** One O(paths × 4) build; every subsequent navigation lookup is a Map lookup. */
export class SorTreeIndex {
  private children = new Map<string, SorNode[]>();
  constructor(paths: SorNavigationPath[]) {
    const groups = new Map<
      string,
      Map<string, SorNode & { first_code: string }>
    >();
    for (const path of paths) {
      const parent: SorPath = {};
      for (const level of levels) {
        const key = keyFor(parent, level),
          value = path[level];
        const siblings = groups.get(key) ?? new Map();
        const node = siblings.get(value);
        if (node) {
          node.count += path.count;
          if (
            path.page !== null &&
            (node.page === null || path.page < node.page)
          )
            node.page = path.page;
          if (path.first_code < node.first_code)
            node.first_code = path.first_code;
        } else
          siblings.set(value, {
            key: value,
            label: value,
            count: path.count,
            page: path.page,
            first_code: path.first_code,
          });
        groups.set(key, siblings);
        parent[level] = value;
      }
    }
    for (const [key, nodes] of groups)
      this.children.set(
        key,
        [...nodes.values()].sort(
          (a, b) =>
            (a.page ?? Infinity) - (b.page ?? Infinity) ||
            a.first_code.localeCompare(b.first_code) ||
            a.key.localeCompare(b.key),
        ),
      );
  }
  nodes(path: SorPath, level: SorLevel): SorNode[] {
    return this.children.get(keyFor(path, level)) ?? [];
  }

  advance(
    crumbs: SorCrumb[],
    level: SorLevel,
  ): { crumbs: SorCrumb[]; level: SorLevel } {
    const next = [...crumbs];
    while (
      level === "heading" ||
      level === "section" ||
      level === "subsection"
    ) {
      const path = Object.fromEntries(
        next.map((crumb) => [crumb.level, crumb.key]),
      ) as SorPath;
      const nodes = this.nodes(path, level);
      if (nodes.length !== 1) break;
      next.push({
        level,
        key: nodes[0].key,
        label: nodes[0].label || "General",
      });
      level =
        level === "heading"
          ? "section"
          : level === "section"
            ? "subsection"
            : "family";
    }
    return { crumbs: next, level };
  }
}
