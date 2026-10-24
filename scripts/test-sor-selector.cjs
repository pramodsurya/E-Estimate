const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const fixture = require("./fixtures/sor-selector.json");
const root = path.resolve(__dirname, "..");
function modules(supabase) {
  const cache = new Map();
  function load(name) {
    const file = path.resolve(root, "src/renderer/src/lib", name + ".ts");
    if (cache.has(file)) return cache.get(file).exports;
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, mod);
    mod.require = (request) => {
      if (request === "./supabase") return { supabase };
      if (request === "./projectItems")
        return {
          projectItemKey: (node) =>
            `SOR:SOR_Recipie:${node.itemCode}:${node.sorCatalogue.selectionKey}`,
        };
      if (request === "./univerSpreadsheet")
        return {
          workbookFromRows: (_node, rows) => ({ rows }),
          createUniverWorkbookData: () => ({
            sheetOrder: ["main"],
            sheets: { main: { cellData: {} } },
          }),
          usedCellRange: () => null,
        };
      if (request.startsWith("./")) return load(request.slice(2));
      return require(request);
    };
    mod._compile(compiled.outputText, file);
    return mod.exports;
  }
  return load;
}
const calls = [];
const client = {
  from(name) {
    throw new Error(`Unexpected direct table query ${name}`);
  },
  rpc(name, args) {
    calls.push({ name, args });
    let data;
    if (name === "sor_picker_browse")
      data = { ...fixture.root, year: args.p_year, level: args.p_level };
    else if (name === "sor_picker_detail") {
      const found = Object.values(fixture.details).find(
        (detail) => detail.recipe?.recipe_code === args.p_code,
      );
      if (found) {
        data = structuredClone(found);
        data.quote.zone = args.p_zone;
      } else
        data = {
          resolution: {
            requires_review: true,
            status: "revision_review_required",
          },
          quote: { status: "revision_review_required", rate: null },
        };
    } else throw new Error(`Retired or unexpected RPC ${name}`);
    const response = Promise.resolve({ data, error: null });
    response.abortSignal = () => response;
    return response;
  },
};
async function main() {
  const load = modules(client),
    source = load("sorSource"),
    rules = load("sorRules"),
    estimate = load("sorEstimate");
  assert.equal(source.sorNeedsConfiguration({ variants: null, addons: null }), false);
  assert.equal(source.sorNeedsConfiguration({ variants: {}, addons: { schema_version: 1 } }), false);
  assert.equal(source.sorNeedsConfiguration(fixture.details.sand.recipe), false);
  assert.equal(source.sorNeedsConfiguration(fixture.details.hdpe.recipe), true);
  assert.equal(source.sorNeedsConfiguration(fixture.details.plumbing.recipe), true);
  assert.equal(source.sorNeedsConfiguration({ variants: null, addons: { future_rule: {} } }), true);
  const empty = { inputs: {}, enabled: [], confirmed: [] };
  assert.deepEqual(
    (await source.browseSor("2026-27", "part")).rows.map((row) => row.count),
    [454, 369, 6125, 3733],
  );
  const sand = await rules.createSorSelection(
    fixture.details.sand,
    "SOR-P01-T01-G0002-V002",
    "2026-27",
    "zone_3",
    10,
    empty,
  );
  assert.equal(sand.rate, 777);
  assert.equal(sand.quantity, 10);
  assert.equal(sand.recipe.lead_applicability, "SAND");
  source.validateSorInsertion(
    [source.sorMasterItem(sand)],
    "2026-27",
    "zone_3",
  );
  assert.throws(
    () =>
      source.validateSorInsertion(
        [source.sorMasterItem(sand)],
        "2025-26",
        "zone_3",
      ),
    /Refresh/,
  );
  assert.throws(
    () =>
      source.validateSorInsertion(
        [{ side: "SOR", code: "missing" }],
        "2026-27",
        "zone_3",
      ),
    /current SOR/,
  );
  const fakeTariff = {
    ...sand,
    recipe: {
      ...sand.recipe,
      metadata: { item_type: "conveyance_matrix_cell" },
    },
  };
  assert.throws(
    () =>
      source.validateSorInsertion(
        [source.sorMasterItem(fakeTariff)],
        "2026-27",
        "zone_3",
      ),
    /material or work item/,
  );
  const node = {
    id: "sand",
    itemCode: sand.recipeCode,
    sorCatalogue: sand,
    categoryKey: "SOR_Recipie",
    itemSource: "SOR",
    name: "Sand",
    kind: "item",
    children: [],
  };
  const recipe = estimate.sorRecipe(node, sand);
  assert.equal(recipe.publishedRate, 777);
  assert.equal(recipe.overheadPercent, 0);
  assert.equal(recipe.leadApplicability.materials.Sand, "EARTH");
  assert.equal(recipe.leadApplicability.sor_rule_code, "SOR-LEAD-2026-27-SAND");
  assert.equal(estimate.seedSorMeasurement(node).spreadsheet.rows[1][1], 10);
  assert.equal(
    estimate.seedSharedSorMeasurements([node, { ...node, id: "second" }])[1]
      .finalCell.row,
    2,
  );
  const height = rules
    .sorAddons(fixture.details.centering)
    .find((row) => row.kind === "height");
  const raised = await rules.createSorSelection(
    fixture.details.centering,
    fixture.details.centering.recipe.recipe_code,
    "2026-27",
    "zone_3",
    2,
    { ...empty, enabled: [height.id], inputs: { unsupported_height_m: 4 } },
  );
  assert.equal(
    raised.rate,
    3519.82,
    "Exact H and L components, rounded separately, one extra increment",
  );
  const atBoundary = await rules.createSorSelection(
    fixture.details.centering,
    fixture.details.centering.recipe.recipe_code,
    "2026-27",
    "zone_3",
    2,
    { ...empty, enabled: [height.id], inputs: { unsupported_height_m: 4.27 } },
  );
  assert.equal(atBoundary.rate, raised.rate);
  await assert.rejects(
    rules.createSorSelection(
      fixture.details.unpublished,
      "SOR-P04-T15-M0001",
      "2026-27",
      "zone_3",
      1,
      empty,
    ),
    /review|clarification|unpublished|source|published/i,
  );
  const outdoor = rules.sorAddons(fixture.details.electrical)[0];
  const bus = await rules.createSorSelection(
    fixture.details.electrical,
    fixture.details.electrical.recipe.recipe_code,
    "2026-27",
    "zone_3",
    1,
    { ...empty, enabled: [outdoor.id], inputs: { outdoor_ip65: true } },
  );
  assert.equal(bus.rate, 20790);
  const hdpeChoice = rules
    .sorAddons(fixture.details.hdpe)
    .find((row) => row.id === "resin_variation");
  const hdpe = await rules.createSorSelection(
    fixture.details.hdpe,
    fixture.details.hdpe.recipe.recipe_code,
    "2026-27",
    "zone_3",
    1,
    {
      ...empty,
      enabled: [hdpeChoice.id],
      inputs: { item_weight_kg: 1, resin_per_tonne: 152490 },
    },
  );
  assert.equal(hdpe.rate, 41.95);
  await assert.rejects(
    rules.createSorSelection(
      fixture.details.hdpe,
      fixture.details.hdpe.recipe.recipe_code,
      "2026-27",
      "zone_3",
      1,
      { ...empty, enabled: [hdpeChoice.id], inputs: {} },
    ),
    /Enter/,
  );
  assert.notEqual(hdpe.selectionKey, sand.selectionKey);
  assert.equal(
    (await source.refreshSorSelection(sand, "2026-27", "zone_1")).zone,
    "zone_1",
  );
  const stone = await rules.createSorSelection(
    fixture.details.stone,
    fixture.details.stone.recipe.recipe_code,
    "2026-27",
    "zone_3",
    1,
    empty,
  );
  assert.equal(
    estimate.sorLeadApplicability(stone).sor_rule_code,
    "SOR-LEAD-2026-27-STONE_INCLUDED_LOADING",
  );
  const pipe = await rules.createSorSelection(
    fixture.details.pipe,
    fixture.details.pipe.recipe.recipe_code,
    "2026-27",
    "zone_3",
    1,
    empty,
  );
  const pipeSource = estimate.sorPipeSource(pipe);
  assert.equal(pipeSource.diameterMm, 1800);
  assert.equal(pipeSource.pipeClassGroup, "NP2");
  assert.equal(pipeSource.leadRuleCode, pipe.leadRule.rule_code);
  const matrix = fixture.leaves.filter((row) => row.matrix);
  const rowFirst = matrix
    .filter((row) => row.matrix.row.id === "OD 32 mm")
    .filter((row) => row.matrix.column.id === "PN16 / SDR9");
  const columnFirst = matrix
    .filter((row) => row.matrix.column.id === "PN16 / SDR9")
    .filter((row) => row.matrix.row.id === "OD 32 mm");
  assert.equal(rowFirst[0].recipe_code, columnFirst[0].recipe_code);
  assert.equal(
    fixture.leaves.filter(
      (row) => row.variants?.main_recipe_code === "SOR-P03-T03-R0001",
    ).length,
    2,
  );
  assert.ok(
    calls.every((call) =>
      ["sor_picker_browse", "sor_picker_detail"].includes(call.name),
    ),
  );
  if (process.argv.includes("--live")) {
    const { createClient } = require("@supabase/supabase-js"),
      config = fs.readFileSync(
        path.join(root, "src/renderer/src/lib/supabase.ts"),
        "utf8",
      );
    const url = /https:\/\/[a-z]+\.supabase\.co/.exec(config)[0],
      key = /sb_publishable_[A-Za-z0-9_-]+/.exec(config)[0];
    const publicClient = createClient(url, key, {
        auth: { persistSession: false },
      }),
      liveLoad = modules(publicClient),
      live = liveLoad("sorSource");
    const navigation=await live.getSorTree('2026-27');
    assert.deepEqual(navigation.nodes({},'part').map(node=>node.count),[454,369,6125,3733]);
    assert.deepEqual(
      (await live.browseSor("2026-27", "part")).rows.map((row) => row.count),
      [454, 369, 6125, 3733],
    );
    const results = await live.browseSor("2026-27", "item", {}, "sand filling");
    assert.ok(results.rows.some((row) => row.recipe_code === sand.recipeCode));
    for (let attempt=0;attempt<3;attempt++) {
      const exact=await live.browseSor("2026-27","item",{},"SOR-P03-T03-R0001");
      assert.ok(exact.rows.some(row=>row.recipe_code==='SOR-P03-T03-R0001'),'exact-code search stays within the public API budget');
    }
    // Public browse summaries distinguish terminal actions without detail N+1 requests.
    for (const [code, configurable] of [
      ["SOR-P01-T03-R0067", false],
      ["SOR-P03-T03-R0001", true],
      ["SOR-P04-T15-M0005", true],
    ]) {
      const search = await live.browseSor("2026-27", "item", {}, code);
      const leaf = search.rows.find(row => row.recipe_code === code);
      assert.equal(leaf.requires_configuration, configurable, code);
      assert.ok(!("search_vector" in leaf));
      const group = await live.browseSor("2026-27", "family", { family: leaf.family_key });
      if (group.rows[0].count === 1) {
        assert.equal(group.rows[0].item.recipe_code, code);
        assert.equal(group.rows[0].item.requires_configuration, configurable);
        assert.ok(!("search_vector" in group.rows[0].item));
      } else assert.equal(group.rows[0].item, null);
    }
    const liveDetail = await live.getSorDetail(
      sand.recipeCode,
      "2026-27",
      "zone_1",
    );
    assert.equal(liveDetail.quote.rate, 777);
    const family = await live.browseSor("2026-27", "item", {
      family: "matrix:P04-T15:HDPE PE100 pipe supply",
    });
    assert.equal(family.total, 140);
    assert.equal(family.rows.length, 140);
    const forward = await live.getSorDetail(
      "SOR-P01-T07-R0111",
      "2026-27",
      "zone_3",
    );
    assert.equal(forward.recipe.recipe_code, "SOR-P01-T07-R0001");
    assert.equal(forward.quote.rate, 845);
    const backward = await live.getSorDetail(
      "SOR-P01-T07-R0001",
      "2025-26",
      "zone_3",
    );
    assert.equal(backward.recipe.recipe_code, "SOR-P01-T07-R0111");
    assert.equal(backward.quote.rate, 805);
    const review = await live.getSorDetail(
      "SOR-P03-T03-R0960",
      "2026-27",
      "zone_3",
    );
    assert.equal(live.readySorDetail(review), false);
    await assert.rejects(
      live.getSorDetail("SOR-P01-T09-M0002-R0001-C0001", "2026-27", "zone_3"),
      /managed in Lead/,
    );
    const search = await live.browseSor("2026-27", "item", {}, "conveyance");
    assert.ok(
      search.rows.every(
        (row) =>
          ![
            "P01-T09",
            "P04-T06",
            "P04-T07",
            "P04-T11",
            "P04-T12",
            "P04-T13",
            "P04-T20",
          ].includes(row.table_code) ||
          !row.description.startsWith("Conveyance of"),
      ),
    );
    console.log(
      "Current SOR public API: tree, full matrix, search, forward/backward/review resolution and tariff exclusion passed",
    );
  }
  console.log(
    "Current SOR: exact identity, variants/matrix, configuration rates, source units, insertion guards, snapshots and Lead context passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
