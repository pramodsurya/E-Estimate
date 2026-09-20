const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'src/renderer/src/lib/cluster.ts');

function loadTsModule() {
  const source = fs.readFileSync(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  });
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(outputText, filePath);
  return loaded.exports;
}

const cluster = loadTsModule();

// Same-folder rule: members must live beside the cluster file.
assert.equal(
  cluster.isInSameFolder('C:/estimates/cluster.eestimate-cluster', 'C:/estimates/road.eestimate'),
  true,
  'member in the same folder must be accepted'
);
assert.equal(
  cluster.isInSameFolder('C:/estimates/cluster.eestimate-cluster', 'C:/estimates/sub/road.eestimate'),
  false,
  'member in a subfolder must be rejected'
);
assert.equal(
  cluster.isInSameFolder('/estimates/a.eestimate-cluster', '/estimates/nested.eestimate-cluster'),
  true,
  'nested clusters obey the same same-folder rule'
);
assert.equal(cluster.isClusterPath('site.eestimate-cluster'), true, 'cluster extension detected');
assert.equal(cluster.isClusterPath('site.eestimate'), false, 'plain project is not a cluster');

// Hard gate: every member must have all its own Leads applied first.
const ready = {
  id: 'p1',
  name: 'Road',
  leadApplicability: { itemA: {}, itemB: {} },
  leadApplications: [{ itemKey: 'itemA' }, { itemKey: 'itemB' }],
};
const blocked = {
  id: 'p2',
  name: 'Drain',
  leadApplicability: { itemA: {}, itemC: {} },
  leadApplications: [{ itemKey: 'itemA' }],
};
const gateBlocked = cluster.canCreateClusterWeightedLead([ready, blocked]);
assert.equal(gateBlocked.ok, false, 'weighted-avg must be blocked while any member has unapplied leads');
assert.deepEqual(
  gateBlocked.blocked.map((entry) => entry.memberId),
  ['p2'],
  'only the member with missing applications is reported'
);
assert.deepEqual(gateBlocked.blocked[0].missingItemKeys, ['itemC'], 'missing item key is reported');

const gateReady = cluster.canCreateClusterWeightedLead([ready]);
assert.equal(gateReady.ok, true, 'weighted-avg allowed when all member leads are applied');
assert.deepEqual(gateReady.blocked, [], 'no blocks when ready');

// Members with no lead-applicable DATA are vacuously ready.
assert.equal(
  cluster.canCreateClusterWeightedLead([{ id: 'p3', name: 'Compound' }]).ok,
  true,
  'member with nothing needing lead must not block the cluster'
);

// Quantity-weighted average math: (10*100 + 20*300) / 400 = 17.5.
assert.equal(cluster.clusterWeightedAvgKm([]), 0, 'empty entries average to zero');
assert.equal(
  cluster.clusterWeightedAvgKm([
    { leadKm: 10, quantity: 100 },
    { leadKm: 20, quantity: 300 },
  ]),
  17.5,
  'cluster average must be quantity-weighted'
);

// Cluster file format: wrapper with members, never a merged copy.
const created = cluster.createCluster('  Godavari Works  ');
assert.equal(created.meta.name, 'Godavari Works', 'cluster name is trimmed');
assert.equal(created.formatVersion, 1, 'cluster format version is 1');
assert.deepEqual(created.members, [], 'new cluster has no members');
assert.equal(cluster.isClusterFile(created), true, 'created cluster matches the file shape');
assert.equal(cluster.isClusterFile({ root: {}, meta: {} }), false, 'plain project is not a cluster file');
const normalized = cluster.normalizeCluster({ ...created, members: [{ relativePath: 'C:/estimates/road.eestimate', kind: 'project' }] });
assert.equal(normalized.members[0].relativePath, 'road.eestimate', 'member paths collapse to same-folder file names');
assert.equal(cluster.suggestedClusterFileName({ meta: { name: 'Godavari' } }), 'Godavari.eestimate-cluster', 'save dialog suggests the cluster extension');
assert.equal(cluster.resolveMemberPath('/estimates/a.eestimate-cluster', { relativePath: 'road.eestimate' }), '/estimates/road.eestimate', 'members resolve beside the cluster file');

// Weighted-lead builder: one lead per material, cluster-owned.
const built = cluster.buildClusterWeightedLeads([{ materialName: 'Earth', conveyanceClass: 'EARTH', entries: [{ memberId: 'm1', memberName: 'Road', leadKm: 10, quantity: 100 }, { memberId: 'm2', memberName: 'Drain', leadKm: 20, quantity: 300 }] }]);
assert.equal(built.length, 1, 'one lead per material group');
assert.equal(built[0].avgKm, 17.5, 'lead average is quantity-weighted');
assert.equal(built[0].totalQuantity, 400, 'lead totals member quantities');
assert.equal(built[0].entries.length, 2, 'lead keeps its audit entries');

// Explorer rows: projects render as component-like rows, nested clusters expand inline.
const rows = cluster.buildClusterTreeRows([{ id: 'm1', name: 'Road', relativePath: 'road.eestimate', kind: 'project' }, { id: 'm2', name: 'Sub', relativePath: 'sub.eestimate-cluster', kind: 'cluster' }], new Map([['m1', { leadReady: true, missingItemKeys: [] }], ['m2', { leadReady: false, missingItemKeys: ['Drain (2 items)'] }]]), new Map([['m2', [{ id: 'm3', name: 'Canal', relativePath: 'canal.eestimate', kind: 'project' }]]]));
assert.deepEqual(rows.map((row) => [row.ref.name, row.depth]), [['Road', 0], ['Sub', 0], ['Canal', 1]], 'nested members render one level deeper');

// Seigniorage roll-up: members add together by mineral, nulls never poison totals.
const seig = cluster.aggregateClusterSeigniorage([{ memberId: 'm1', memberName: 'Road', mineralKey: 'seig_earth', mineralLabel: 'Earth', quantity: 100, quantityUnit: 'cum', seigRate: 10, seigniorage: 1000, dmft: 300, smft: 20, permit: 800 }, { memberId: 'm2', memberName: 'Drain', mineralKey: 'SEIG_EARTH', mineralLabel: 'Earth', quantity: 50, quantityUnit: 'cum', seigRate: 10, seigniorage: 500, dmft: 150, smft: 10, permit: 400 }, { memberId: 'm2', memberName: 'Drain', mineralKey: 'seig_sand', mineralLabel: 'Sand', quantity: null, quantityUnit: 'cum', seigRate: null, seigniorage: null, dmft: null, smft: null, permit: null }]);
assert.equal(seig.groups.length, 2, 'two minerals group separately');
assert.equal(seig.groups[0].mineralLabel, 'Earth', 'richest mineral sorts first');
assert.equal(seig.groups[0].totalSeigniorage, 1500, 'same mineral adds across members');
assert.equal(seig.groups[0].totalQuantity, 150, 'quantities add across members');
assert.equal(seig.groups[0].totalPermit, 1200, 'permit fees add across members');
assert.equal(seig.groups[0].members.length, 2, 'group keeps the per-member audit lines');
assert.equal(seig.groups[1].totalSeigniorage, 0, 'unmatched rows contribute zero, not NaN');
assert.equal(seig.totals.grandTotal, 1500 + 450 + 30 + 1200, 'grand total covers seigniorage + DMFT + SMFT + permit');
assert.deepEqual(cluster.aggregateClusterSeigniorage([]).groups, [], 'empty roll-up has no groups');
assert.equal(rows[1].leadReady, false, 'unready nested cluster is flagged');
assert.deepEqual(rows[1].missingItemKeys, ['Drain (2 items)'], 'nested blockers name the inner project');

console.log('test:cluster ok');
