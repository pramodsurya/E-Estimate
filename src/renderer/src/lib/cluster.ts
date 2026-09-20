/**
 * Cluster Project foundation.
 *
 * A Cluster is a wrapper file (`.eestimate-cluster`) that links member
 * `.eestimate` projects (or nested `.eestimate-cluster` files) living in the
 * SAME folder. In the Cluster tree each member Project behaves like one
 * Component node. Cluster rates are derived cluster-wise only; member files
 * keep their own rates unchanged.
 *
 * Hard rule enforced here: a cluster Weighted-Average Lead may only be
 * created once every member already has all of its own Leads applied.
 * Cluster weighted math reuses the project-wide formula
 * (w1*l1 + w2*l2 + ...) / W over applied leads (see `WeightedLeadDetail`).
 */

export const CLUSTER_FILE_EXTENSION = '.eestimate-cluster';
export const PROJECT_FILE_EXTENSION = '.eestimate';

export type ClusterMemberKind = 'project' | 'cluster';

export interface ClusterMemberRef {
  id: string;
  name: string;
  /** File name (or relative path) of the member, resolved against the cluster folder. */
  relativePath: string;
  kind: ClusterMemberKind;
  projectId?: string;
}

/** Minimal cluster wrapper persisted to disk. */
export interface ClusterProject {
  formatVersion: 1;
  id: string;
  meta: { name: string };
  members: ClusterMemberRef[];
  /** Cluster-only weighted-average leads. Member files are never modified. */
  weightedLeads?: ClusterWeightedLead[];
  /** Ids of weighted leads applied to all DATA items (cluster-wise rates). */
  appliedWeightedLeadIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimal shape of a member project needed for the lead-readiness gate.
 * `leadApplicability` keys are DATA item keys that need a Lead; every key
 * must have at least one entry in `leadChart.applications`.
 */
export interface LeadReadinessMember {
  id: string;
  name: string;
  leadApplicability?: Record<string, unknown>;
  leadApplications?: Array<{ itemKey: string }>;
}

export interface ClusterLeadBlock {
  memberId: string;
  memberName: string;
  missingItemKeys: string[];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function dirnameOf(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? '' : normalized.slice(0, index);
}

function basenameOf(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

/** Cluster files are recognised by extension only. */
export function isClusterPath(path: string): boolean {
  return normalizePath(path).toLowerCase().endsWith(CLUSTER_FILE_EXTENSION);
}

/**
 * Same-folder rule: a member may only be imported when it lives in the same
 * folder as the cluster file. Both nested clusters and plain projects obey it.
 */
export function isInSameFolder(clusterPath: string, memberPath: string): boolean {
  return dirnameOf(clusterPath) === dirnameOf(memberPath);
}

/** Item keys that still need a Lead application in this member. */
export function missingLeadApplications(member: LeadReadinessMember): string[] {
  const needed = Object.keys(member.leadApplicability ?? {});
  if (needed.length === 0) return [];
  const applied = new Set((member.leadApplications ?? []).map((entry) => entry.itemKey));
  return needed.filter((key) => !applied.has(key));
}

/**
 * Gate for creating a cluster Weighted-Average Lead.
 * `ok` is true only when EVERY member has zero missing Lead applications.
 */
export function canCreateClusterWeightedLead(
  members: LeadReadinessMember[]
): { ok: boolean; blocked: ClusterLeadBlock[] } {
  const blocked: ClusterLeadBlock[] = [];
  for (const member of members) {
    const missingItemKeys = missingLeadApplications(member);
    if (missingItemKeys.length > 0) {
      blocked.push({ memberId: member.id, memberName: member.name, missingItemKeys });
    }
  }
  return { ok: blocked.length === 0, blocked };
}

export interface ClusterWeightedEntry {
  leadKm: number;
  quantity: number;
}

/** Quantity-weighted average over applied member leads. Returns 0 when empty. */
export function clusterWeightedAvgKm(entries: ClusterWeightedEntry[]): number {
  let weightedSum = 0;
  let totalQuantity = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry.leadKm) || !Number.isFinite(entry.quantity) || entry.quantity <= 0) continue;
    weightedSum += entry.leadKm * entry.quantity;
    totalQuantity += entry.quantity;
  }
  if (totalQuantity <= 0) return 0;
  return weightedSum / totalQuantity;
}

/** Resolve a member file name against its cluster file for display/errors. */
export function describeMemberPath(clusterPath: string, memberFileName: string): string {
  const dir = dirnameOf(clusterPath);
  const base = basenameOf(memberFileName);
  return dir ? `${dir}/${base}` : base;
}

/** True for a parsed cluster file shape (as opposed to a plain project). */
export function isClusterFile(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.formatVersion === 1 &&
    Array.isArray(record.members) &&
    typeof (record.meta as { name?: unknown } | undefined)?.name === 'string' &&
    typeof record.id === 'string'
  );
}

/** Normalize a parsed cluster file so older saves still open. */
export function normalizeCluster(raw: ClusterProject): ClusterProject {
  return {
    formatVersion: 1,
    id: typeof raw.id === 'string' && raw.id ? raw.id : newClusterId(),
    meta: { name: raw.meta?.name ?? 'Untitled Cluster' },
    members: Array.isArray(raw.members)
      ? raw.members
          .filter((member) => member && typeof member.relativePath === 'string')
          .map((member) => ({
            id: member.id || newClusterId(),
            name: member.name || basenameOf(member.relativePath),
            relativePath: basenameOf(member.relativePath),
            kind: member.kind === 'cluster' ? 'cluster' : 'project',
            projectId: member.projectId
          }))
      : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

export function newClusterId(): string {
  return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** A new in-memory cluster; the file is written on first Save. */
export function createCluster(name: string): ClusterProject {
  const now = new Date().toISOString();
  return {
    formatVersion: 1,
    id: newClusterId(),
    meta: { name: name.trim() || 'Untitled Cluster' },
    members: [],
    createdAt: now,
    updatedAt: now
  };
}

/** Resolve a member ref to an absolute (or browser:) path beside the cluster file. */
export function resolveMemberPath(clusterPath: string, member: Pick<ClusterMemberRef, 'relativePath'>): string {
  const dir = dirnameOf(clusterPath);
  const base = basenameOf(member.relativePath);
  return dir ? `${dir}/${base}` : base;
}

/** File name suggested by a Save dialog for a cluster. */
export function suggestedClusterFileName(cluster: Pick<ClusterProject, 'meta'>): string {
  const base = (cluster.meta.name || 'Cluster').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Cluster';
  return base.endsWith(CLUSTER_FILE_EXTENSION) ? base : `${base}${CLUSTER_FILE_EXTENSION}`;
}

/** One material group feeding a cluster weighted-average lead. */
export interface ClusterWeightedLeadInput {
  materialName: string;
  conveyanceClass: string;
  entries: Array<{ memberId: string; memberName: string; leadKm: number; quantity: number }>;
}

/** A cluster weighted-average lead, stored on the cluster — never on members. */
export interface ClusterWeightedLead {
  id: string;
  materialName: string;
  conveyanceClass: string;
  avgKm: number;
  totalQuantity: number;
  entries: ClusterWeightedLeadInput['entries'];
  createdAt: string;
}

/**
 * Build one cluster weighted-average lead per material group.
 * Callers must run `canCreateClusterWeightedLead` first: every entry here is
 * expected to come from an already-applied member lead.
 */
export function buildClusterWeightedLeads(groups: ClusterWeightedLeadInput[]): ClusterWeightedLead[] {
  const now = new Date().toISOString();
  return groups.map((group) => {
    const entries = group.entries.filter(
      (entry) => Number.isFinite(entry.leadKm) && Number.isFinite(entry.quantity) && entry.quantity > 0
    );
    const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    return {
      id: newClusterId(),
      materialName: group.materialName,
      conveyanceClass: group.conveyanceClass,
      avgKm: clusterWeightedAvgKm(entries),
      totalQuantity,
      entries,
      createdAt: now
    };
  });
}

/**
 * Cluster explorer row: each member project renders as one component-like
 * node; a nested cluster renders as one expandable cluster node. Pure —
 * the UI expands nested rows from already-loaded member data.
 */
export interface ClusterTreeRow {
  ref: ClusterMemberRef;
  depth: number;
  leadReady: boolean;
  missingItemKeys: string[];
  /** Resolved only for nested clusters already loaded in this session. */
  nestedMembers?: ClusterMemberRef[];
}

export function buildClusterTreeRows(
  members: ClusterMemberRef[],
  readiness: Map<string, { leadReady: boolean; missingItemKeys: string[] }>,
  nested: Map<string, ClusterMemberRef[]>,
  depth = 0
): ClusterTreeRow[] {
  const rows: ClusterTreeRow[] = [];
  for (const ref of members) {
    const status = readiness.get(ref.id) ?? { leadReady: true, missingItemKeys: [] };
    const nestedMembers = ref.kind === 'cluster' ? nested.get(ref.id) : undefined;
    rows.push({ ref, depth, leadReady: status.leadReady, missingItemKeys: status.missingItemKeys, nestedMembers });
    if (nestedMembers) {
      rows.push(...buildClusterTreeRows(nestedMembers, readiness, nested, depth + 1));
    }
  }
  return rows;
}

/**
 * Cluster-wise seigniorage roll-up.
 *
 * Each member's seigniorage is computed from its OWN synced snapshot (same
 * inputs as its Seigniorage dashboard); the cluster only adds the members
 * together, grouped by mineral. Member files are never modified.
 */
export interface ClusterSeigniorageInputRow {
  memberId: string;
  memberName: string;
  /** Mineral identity: seig_code when matched, else the material key/label. */
  mineralKey: string;
  mineralLabel: string;
  quantity: number | null;
  quantityUnit: string | null;
  seigRate: number | null;
  seigniorage: number | null;
  dmft: number | null;
  smft: number | null;
  permit: number | null;
}

export interface ClusterSeigniorageMemberLine {
  memberId: string;
  memberName: string;
  quantity: number | null;
  seigniorage: number | null;
}

export interface ClusterSeigniorageGroup {
  mineralKey: string;
  mineralLabel: string;
  quantityUnit: string | null;
  totalQuantity: number | null;
  totalSeigniorage: number;
  totalDmft: number;
  totalSmft: number;
  totalPermit: number;
  members: ClusterSeigniorageMemberLine[];
}

export interface ClusterSeigniorageTotals {
  totalSeigniorage: number;
  totalDmft: number;
  totalSmft: number;
  totalPermit: number;
  grandTotal: number;
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function aggregateClusterSeigniorage(
  rows: ClusterSeigniorageInputRow[]
): { groups: ClusterSeigniorageGroup[]; totals: ClusterSeigniorageTotals } {
  const groups = new Map<string, ClusterSeigniorageGroup>();
  for (const row of rows) {
    const key = row.mineralKey.trim().toUpperCase() || 'UNASSIGNED';
    const group = groups.get(key) ?? {
      mineralKey: key,
      mineralLabel: row.mineralLabel,
      quantityUnit: row.quantityUnit,
      totalQuantity: null as number | null,
      totalSeigniorage: 0,
      totalDmft: 0,
      totalSmft: 0,
      totalPermit: 0,
      members: []
    };
    if (!group.mineralLabel && row.mineralLabel) group.mineralLabel = row.mineralLabel;
    if (row.quantity != null && Number.isFinite(row.quantity)) {
      group.totalQuantity = (group.totalQuantity ?? 0) + row.quantity;
    }
    group.totalSeigniorage += finiteOrZero(row.seigniorage);
    group.totalDmft += finiteOrZero(row.dmft);
    group.totalSmft += finiteOrZero(row.smft);
    group.totalPermit += finiteOrZero(row.permit);
    group.members.push({
      memberId: row.memberId,
      memberName: row.memberName,
      quantity: row.quantity,
      seigniorage: row.seigniorage
    });
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => b.totalSeigniorage - a.totalSeigniorage);
  const totals: ClusterSeigniorageTotals = {
    totalSeigniorage: 0,
    totalDmft: 0,
    totalSmft: 0,
    totalPermit: 0,
    grandTotal: 0
  };
  for (const group of ordered) {
    totals.totalSeigniorage += group.totalSeigniorage;
    totals.totalDmft += group.totalDmft;
    totals.totalSmft += group.totalSmft;
    totals.totalPermit += group.totalPermit;
  }
  totals.grandTotal =
    totals.totalSeigniorage + totals.totalDmft + totals.totalSmft + totals.totalPermit;
  return { groups: ordered, totals };
}
