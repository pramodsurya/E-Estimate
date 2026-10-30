import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { MasterItem } from "../../lib/masterData";
import {
  browseSor,
  getSorTree,
  getSorDetail,
  humanize,
  leafMasterItem,
  readySorDetail,
  SOR_LEVELS,
  SOR_PARTS,
  sorFamily,
  sorMasterItem,
  sorNeedsConfiguration,
  sorMoney,
  sorPath,
  sorPublishedCode,
  sorSelectionKey,
  sorStatus,
} from "../../lib/sorSource";
import {
  createSorSelection,
  EMPTY_SOR_CONFIGURATION,
  sorAddons,
} from "../../lib/sorRules";
import {
  applySemanticScores,
  parseMasterSearch,
  rankMasterItems,
} from "../../lib/masterSearch";
import { rerankMasterSearch } from "../../lib/semanticMasterSearch";
import type {
  SorConfiguration,
  SorDetail,
  SorItemSelection,
  SorLeaf,
  SorLevel,
  SorNode,
  SorPath,
  SorZone,
} from "../../types/sor";
import "./sorPicker.css";
import type { SorTreeIndex } from "../../lib/sorTree";
import { sorItemDescription } from "../../lib/sorPresentation";
interface Props {
  year: string;
  zone: SorZone;
  onPick: (item: MasterItem) => void;
  initial?: SorItemSelection;
  initialCode?: string;
  mode?: "full" | "lite" | "single" | "inspect";
  selected?: Map<string, MasterItem>;
  onRemove?: (key: string) => void;
}
interface Crumb {
  level: Exclude<SorLevel, "item">;
  key: string;
  label: string;
}
const problem = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const unavailable = (row: SorLeaf): boolean =>
  row.cost_ready === "false" ||
  /not_published|deleted|blank|reference_only|analysis_required|source_clarification/i.test(
    row.rate_status ?? "",
  );
export default function SorPicker(props: Props): JSX.Element {
  return (
    <SorPickerSession
      key={`${props.year}:${props.zone}:${props.initialCode ?? props.initial?.recipeCode ?? ""}`}
      {...props}
    />
  );
}
function SorPickerSession({
  year,
  zone,
  onPick,
  initial,
  initialCode,
  mode = "full",
  selected,
  onRemove,
}: Props): JSX.Element {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [level, setLevel] = useState<SorLevel>("part");
  const [stage, setStage] = useState<"browse" | "variants">(
    initial || initialCode ? "variants" : "browse",
  );
  const [nodes, setNodes] = useState<SorNode[]>([]);
  const [leaves, setLeaves] = useState<SorLeaf[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<SorDetail | null>(null);
  const [code, setCode] = useState(initialCode ?? initial?.recipeCode ?? "");
  const [config, setConfig] = useState<SorConfiguration>(
    initial?.configuration ?? EMPTY_SOR_CONFIGURATION,
  );
  const [selection, setSelection] = useState<SorItemSelection | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [row, setRow] = useState("");
  const [column, setColumn] = useState("");
  const [tree, setTree] = useState<SorTreeIndex | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const pendingAdds = useRef(new Set<string>());
  const alive = useRef(true);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browseReturn = useRef<{
    crumbs: Crumb[];
    level: SorLevel;
    search: string;
    query: string;
    offset: number;
    row: string;
    column: string;
    leaves: SorLeaf[];
  } | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [ranked, setRanked] = useState<string[] | null>(null);
  const request = useRef(0);
  const rankingRequest = useRef(0);
  const path = Object.fromEntries(
    crumbs.map((crumb) => [crumb.level, crumb.key]),
  ) as SorPath;
  const pathKey = JSON.stringify(path);
  const browsingQuery = stage === "browse" ? query : "";
  const itemLevel = level === "item" || Boolean(browsingQuery);
  const loadKey = JSON.stringify(
    stage === "variants"
      ? [stage, code, year, zone, retry]
      : [year, zone, level, pathKey, browsingQuery, offset, retry, stage, code],
  );
  const [previousLoad, setPreviousLoad] = useState(loadKey);
  if (previousLoad !== loadKey) {
    setPreviousLoad(loadKey);
    setLoading(true);
    setError("");
    setRanked(null);
    setAiStatus("");
    if (stage === "browse" && !offset) {
      setLeaves([]);
      setNodes([]);
    }
  }
  const [previousCalculation, setPreviousCalculation] = useState({
    detail,
    config,
  });
  if (
    previousCalculation.detail !== detail ||
    previousCalculation.config !== config
  ) {
    setPreviousCalculation({ detail, config });
    setSelection(null);
    setCalculating(Boolean(detail && readySorDetail(detail)));
    setError("");
  }
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    };
  }, []);
  useEffect(() => {
    if (stage !== "browse") return;
    const controller = new AbortController();
    const token = ++request.current;
    ++rankingRequest.current;
    const load = async (): Promise<void> => {
      const currentPath = JSON.parse(pathKey) as SorPath;
      const pageRequest = itemLevel
        ? browseSor<SorLeaf>(
            year,
            "item",
            browsingQuery ? {} : currentPath,
            browsingQuery,
            offset,
            controller.signal,
          )
        : null;
      const groupOffset = itemLevel ? 0 : offset;
      const groupRequest =
        !browsingQuery && level === "family"
          ? browseSor<SorNode>(
              year,
              "family",
              currentPath,
              "",
              groupOffset,
              controller.signal,
            )
          : Promise.resolve(null);
      const [index, page, groupPage] = await Promise.all([
        getSorTree(year, controller.signal),
        pageRequest,
        groupRequest,
      ]);
      if (controller.signal.aborted || token !== request.current) return;
      setTree(index);
      const localNodes = !browsingQuery ? index.nodes(currentPath, level) : [];
      const groups = groupPage ?? {
        rows: localNodes,
        total: localNodes.length,
      };
      setTotal(page?.total ?? groups.total);
      const nextNodes = groups.rows;
      setNodes((previous) =>
        groupOffset
          ? [
              ...new Map(
                [...previous, ...nextNodes].map((node) => [node.key, node]),
              ).values(),
            ]
          : nextNodes,
      );
      if (page) {
        setLeaves((previous) =>
          offset
            ? [
                ...new Map(
                  [...previous, ...page.rows].map((leaf) => [
                    leaf.recipe_code,
                    leaf,
                  ]),
                ).values(),
              ]
            : page.rows,
        );
      } else {
        setLeaves([]);
      }
    };
    void load()
      .catch((reason) => {
        if (!controller.signal.aborted) setError(problem(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted && token === request.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [
    year,
    level,
    pathKey,
    browsingQuery,
    offset,
    retry,
    stage,
    itemLevel,
    mode,
  ]);
  useEffect(() => {
    if (stage !== "variants" || !code) return;
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      const current = await getSorDetail(code, year, zone, controller.signal);
      if (controller.signal.aborted) return;
      setDetail(current);
      setLeaves([]);
      if (current.recipe && current.annual) {
        const context = sorPath(current.recipe, current.annual);
        setCrumbs([
          ...Object.entries(context).map(([key, value]) => ({
            level: key as Crumb["level"],
            key: value!,
            label: key === "part" ? SOR_PARTS[value!] : value! || "General",
          })),
          {
            level: "family",
            key: sorFamily(current.recipe),
            label: current.recipe.description,
          },
        ]);
        setLevel("item");
        if (current.recipe.variants?.main_recipe_code) {
          const family = await browseSor<SorLeaf>(
            year,
            "item",
            { ...context, family: sorFamily(current.recipe) },
            "",
            0,
            controller.signal,
          );
          if (!controller.signal.aborted) setLeaves(family.rows);
        }
      }
    };
    void load()
      .catch((reason) => {
        if (!controller.signal.aborted) setError(problem(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stage, code, year, zone, retry]);
  useEffect(() => {
    let active = true;
    if (!detail || !readySorDetail(detail)) return;
    void createSorSelection(detail, code, year, zone, 1, config)
      .then((value) => {
        if (active) setSelection(value);
      })
      .catch((reason) => {
        if (active) setError(problem(reason));
      })
      .finally(() => {
        if (active) setCalculating(false);
      });
    return () => {
      active = false;
    };
  }, [detail, code, year, zone, config]);
  const inspect = async (leaf: SorLeaf): Promise<void> => {
    if (stage === "browse")
      browseReturn.current = {
        crumbs,
        level,
        search,
        query,
        offset,
        row,
        column,
        leaves,
      };
    setStage("variants");
    setDetail(null);
    setCode(leaf.recipe_code);
    setConfig(EMPTY_SOR_CONFIGURATION);
    setSelection(null);
    setError("");
  };
  const back = (count: number): void => {
    const next = crumbs.slice(0, count);
    setCrumbs(next);
    setLevel(SOR_LEVELS[count] ?? "part");
    setStage("browse");
    setDetail(null);
    setSearch("");
    setQuery("");
    setOffset(0);
    setRow("");
    setColumn("");
  };
  const open = (node: SorNode): void => {
    const next = [
      ...crumbs,
      {
        level: level as Crumb["level"],
        key: node.key,
        label: level === "part" ? SOR_PARTS[node.key] : node.label || "General",
      },
    ];
    const targetLevel = SOR_LEVELS[SOR_LEVELS.indexOf(level) + 1];
    const target = tree?.advance(next, targetLevel) ?? {
      crumbs: next,
      level: targetLevel,
    };
    setCrumbs(target.crumbs);
    setLevel(target.level);
    setOffset(0);
    setRow("");
    setColumn("");
  };
  const returnToBrowse = (): void => {
    const previous = browseReturn.current;
    if (!previous) {
      back(crumbs.length);
      return;
    }
    setCrumbs(previous.crumbs);
    setLevel(previous.level);
    setSearch(previous.search);
    setQuery(previous.query);
    setOffset(previous.offset);
    setRow(previous.row);
    setColumn(previous.column);
    setLeaves(previous.leaves);
    setStage("browse");
    setDetail(null);
  };
  const prefetch = (fetcher: () => Promise<unknown>): void => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => {
      void fetcher().catch(() => undefined);
    }, 140);
  };
  const stopPrefetch = (): void => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  };
  const prefetchNode = (node: SorNode): void => {
    if (mode !== "full") return;
    const next = [
      ...crumbs,
      { level: level as Crumb["level"], key: node.key, label: node.label },
    ];
    const target = tree?.advance(
      next,
      SOR_LEVELS[SOR_LEVELS.indexOf(level) + 1],
    );
    const targetPath = Object.fromEntries(
      (target?.crumbs ?? next).map((crumb) => [crumb.level, crumb.key]),
    ) as SorPath;
    // Intermediate levels are already in the local tree. Prefetch only the
    // next family/item page; never load all items below a Part.
    if (target?.level === "family" || target?.level === "item")
      prefetch(() => browseSor(year, target.level, targetPath));
  };
  const quickAdd = async (leaf: SorLeaf): Promise<void> => {
    if (pendingAdds.current.has(leaf.recipe_code)) return;
    pendingAdds.current.add(leaf.recipe_code);
    setAdding(new Set(pendingAdds.current));
    setError("");
    try {
      const current = await getSorDetail(leaf.recipe_code, year, zone);
      if (!alive.current) return;
      // Recheck authoritative details even if the browse summary is stale.
      if (!current.recipe || sorNeedsConfiguration(current.recipe)) {
        inspect(leaf);
        return;
      }
      const picked = await createSorSelection(
        current,
        leaf.recipe_code,
        year,
        zone,
        1,
        EMPTY_SOR_CONFIGURATION,
      );
      if (alive.current) onPick(sorMasterItem(picked));
    } catch (reason) {
      if (alive.current) setError(problem(reason));
    } finally {
      pendingAdds.current.delete(leaf.recipe_code);
      if (alive.current) setAdding(new Set(pendingAdds.current));
    }
  };
  const apply = (): void => {
    if (!selection || selection.year !== year || selection.zone !== zone)
      return;
    onPick(sorMasterItem(selection));
    if (mode === "full") {
      returnToBrowse();
    }
  };
  const aiOrder = async (): Promise<void> => {
    const token = ++rankingRequest.current;
    setAiStatus("Loading local relevance model…");
    try {
      const parsed = parseMasterSearch(query),
        matches = rankMasterItems(leaves.map(leafMasterItem), parsed);
      const scores = await rerankMasterSearch(query, matches, (progress) => {
        if (token === rankingRequest.current) setAiStatus(progress.message);
      });
      if (token === rankingRequest.current) {
        setRanked(
          applySemanticScores(matches, scores).map((match) => match.item.code),
        );
        setAiStatus("AI relevance order");
      }
    } catch {
      if (token === rankingRequest.current)
        setAiStatus("Book order available · local model unavailable");
    }
  };
  const rankIndex = new Map(ranked?.map((code, index) => [code, index]));
  const displayed = ranked
    ? [...leaves].sort(
        (a, b) =>
          (rankIndex.get(a.recipe_code) ?? Number.MAX_SAFE_INTEGER) -
          (rankIndex.get(b.recipe_code) ?? Number.MAX_SAFE_INTEGER),
      )
    : leaves;
  const matrix =
    !browsingQuery &&
    Boolean(path.family) &&
    leaves.some((leaf) => leaf.matrix);
  const rowOptions = [
    ...new Map(
      leaves
        .filter((leaf) => !column || leaf.matrix?.column.id === column)
        .flatMap((leaf) =>
          leaf.matrix
            ? [[leaf.matrix.row.id, leaf.matrix.row.label] as const]
            : [],
        ),
    ).entries(),
  ];
  const columnOptions = [
    ...new Map(
      leaves
        .filter((leaf) => !row || leaf.matrix?.row.id === row)
        .flatMap((leaf) =>
          leaf.matrix
            ? [[leaf.matrix.column.id, leaf.matrix.column.label] as const]
            : [],
        ),
    ).entries(),
  ];
  const filtered = !matrix
    ? displayed
    : displayed.filter(
        (leaf) =>
          (!row || leaf.matrix?.row.id === row) &&
          (!column || leaf.matrix?.column.id === column),
      );
  const addons = detail ? sorAddons(detail) : [];
  const selectedKeys = new Map(
    [...(selected?.entries() ?? [])].flatMap(([key, item]) =>
      item.sorCatalogue ? [[item.sorCatalogue.selectionKey, key] as const] : [],
    ),
  );
  const setInput = (key: string, value: number | string | boolean): void =>
    setConfig((current) => ({
      ...current,
      inputs: { ...current.inputs, [key]: value },
    }));
  const renderLeaf = (leaf: SorLeaf): JSX.Element => {
    const added = selectedKeys.get(
      sorSelectionKey(leaf.recipe_code, EMPTY_SOR_CONFIGURATION),
    );
    const pending = adding.has(leaf.recipe_code);
    return (
      <div
        key={leaf.recipe_code}
        className={`sor-leaf ${unavailable(leaf) ? "unavailable" : ""}`}
      >
        <button
          className="sor-leaf-description"
          title="View variants and details"
          onMouseEnter={() =>
            prefetch(() => getSorDetail(leaf.recipe_code, year, zone))
          }
          onFocus={() =>
            prefetch(() => getSorDetail(leaf.recipe_code, year, zone))
          }
          onMouseLeave={stopPrefetch}
          onBlur={stopPrefetch}
          onClick={() => {
            void inspect(leaf);
          }}
        >
          <strong>
            {matrix
              ? `${leaf.matrix?.row.label} · ${leaf.matrix?.column.label}`
              : leaf.description}
          </strong>
          <small>
            {[
              browsingQuery ? `Part ${leaf.part_no}` : undefined,
              sorPublishedCode(leaf.item_code),
              leaf.unit,
            ]
              .filter(Boolean)
              .join(" · ")}
            {unavailable(leaf)
              ? " · " + humanize(leaf.rate_status ?? "Unavailable")
              : ""}
          </small>
        </button>
        <div className="sor-leaf-actions">
          {mode === "full" && leaf.requires_configuration === false && (
            <button
              className={`sor-quick-add ${added ? "selected" : ""}`}
              aria-label={`${added ? "Remove" : "Add"} ${leaf.description}`}
              title={added ? "Remove item" : "Add item"}
              disabled={
                pending ||
                (!added && unavailable(leaf)) ||
                Boolean(added && !onRemove)
              }
              onMouseEnter={() =>
                prefetch(() => getSorDetail(leaf.recipe_code, year, zone))
              }
              onMouseLeave={stopPrefetch}
              onFocus={() =>
                prefetch(() => getSorDetail(leaf.recipe_code, year, zone))
              }
              onBlur={stopPrefetch}
              onClick={() => (added ? onRemove?.(added) : void quickAdd(leaf))}
            >
              {pending ? (
                <LoaderCircle className="spin" size={15} />
              ) : added ? (
                <Check size={15} />
              ) : (
                <Plus size={15} />
              )}
            </button>
          )}
          {(mode !== "full" || leaf.requires_configuration !== false) && (
            <button
              className="sor-details-button"
              aria-label={`Configure ${leaf.description}`}
              title="Choose variants or add-ons"
              onClick={() => void inspect(leaf)}
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <section className="sor-picker" aria-label="SOR item selector">
      <header className="sor-picker-header">
        <div>
          <strong>
            {stage === "variants" ? "Variants & specification" : "SOR items"}
          </strong>
          <small>
            {year} · {zone.replace("_", " ")}
          </small>
        </div>
        {stage === "variants" ? (
          <button className="btn ghost" onClick={returnToBrowse}>
            <ArrowLeft size={14} />
            Back
          </button>
        ) : null}
      </header>
      <nav className="sor-breadcrumbs" aria-label="SOR hierarchy">
        <button onClick={() => back(0)}>Parts</button>
        {crumbs.map((crumb, index) =>
          crumb.label === "General" ? null : (
            <span key={`${crumb.level}:${crumb.key}`}>
              <ChevronRight size={12} />
              <button title={crumb.label} onClick={() => back(index + 1)}>
                {crumb.label || "General"}
              </button>
            </span>
          ),
        )}
        {stage === "variants" && (
          <span>
            <ChevronRight size={12} />
            Variant
          </span>
        )}
      </nav>
      {stage === "browse" && (
        <div className="sor-search">
          <Search size={15} />
          <input
            aria-label="Search SOR items"
            placeholder="Search all SOR items or printed codes…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
          {query && (
            <button
              className="icon-btn"
              title="AI relevance order"
              onClick={() => void aiOrder()}
            >
              <Sparkles size={15} />
            </button>
          )}
        </div>
      )}
      {aiStatus && stage === "browse" && (
        <small className="sor-notice">
          {aiStatus}
          <button
            onClick={() => {
              setRanked(null);
              setAiStatus("");
            }}
          >
            Book order
          </button>
        </small>
      )}
      {error && (
        <div className="sor-error" role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setRetry((value) => value + 1);
              if (stage === "variants") setDetail(null);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && (
        <p className="sor-notice" role="status">
          <LoaderCircle className="spin" size={15} />
          Loading SOR…
        </p>
      )}
      {stage === "browse" &&
        !browsingQuery &&
        level !== "item" &&
        nodes.length > 0 && (
          <div className="sor-node-list" aria-label="Browse SOR groups">
            {nodes.map((node) =>
              node.item ? (
                renderLeaf(node.item)
              ) : (
                <button
                  key={node.key}
                  className="sor-node"
                  onClick={() => open(node)}
                  onMouseEnter={() => prefetchNode(node)}
                  onFocus={() => prefetchNode(node)}
                  onMouseLeave={stopPrefetch}
                  onBlur={stopPrefetch}
                >
                  <span>
                    {level === "part"
                      ? SOR_PARTS[node.key]
                      : node.label || "General"}
                  </span>
                  <small>{node.count}</small>
                  <ChevronRight size={15} />
                </button>
              ),
            )}
          </div>
        )}
      {stage === "browse" && itemLevel && (
        <>
          {matrix && (
            <div className="sor-matrix-axes">
              <label>
                {humanize(leaves[0]?.matrix?.rowLabel ?? "Row")}
                <select
                  aria-label="Matrix row"
                  value={row}
                  onChange={(event) => setRow(event.target.value)}
                >
                  <option value="">Choose either axis first</option>
                  {rowOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {humanize(leaves[0]?.matrix?.columnLabel ?? "Column")}
                <select
                  aria-label="Matrix column"
                  value={column}
                  onChange={(event) => setColumn(event.target.value)}
                >
                  <option value="">All compatible choices</option>
                  {columnOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn ghost"
                onClick={() => {
                  setRow("");
                  setColumn("");
                }}
              >
                Reset axes
              </button>
            </div>
          )}
          <div className="sor-leaf-list">{filtered.map(renderLeaf)}</div>
          {!loading && !leaves.length && (
            <p className="sor-notice">
              No items in this edition match this selection.
              {/^SOR-/i.test(query) && (
                <button
                  onClick={() => {
                    setCode(query);
                    setDetail(null);
                    setStage("variants");
                  }}
                >
                  Resolve this code
                </button>
              )}
            </p>
          )}
        </>
      )}
      {stage === "browse" &&
        (itemLevel ? leaves.length : nodes.length) < total && (
          <button
            className="btn ghost"
            disabled={loading}
            onClick={() =>
              setOffset(
                itemLevel && path.family
                  ? leaves.length
                  : nodes.length || leaves.length,
              )
            }
          >
            Load more
          </button>
        )}
      {stage === "variants" && detail && (
        <article className="sor-variant-stage">
          {detail.recipe && (
            <>
              <h3>
                {sorItemDescription(detail.annual, detail.recipe)}
              </h3>
              <details className="sor-specification">
                <summary>Complete published specification</summary>
                <p>
                  {sorItemDescription(detail.annual, detail.recipe)}
                </p>
              </details>
              <small>
                {[sorPublishedCode(detail.annual?.item_code), detail.quote.unit]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </>
          )}
          {Boolean(detail.resolution.requires_review) && (
            <div className="sor-error">{sorStatus(detail)}</div>
          )}
          <fieldset className="sor-variant-options">
            <legend>Variant</legend>
            {leaves.length > 1 && detail.recipe?.variants ? (
              leaves.map((leaf) => (
                <label key={leaf.recipe_code}>
                  <input
                    type="radio"
                    name="sor-variant"
                    checked={detail.recipe?.recipe_code === leaf.recipe_code}
                    disabled={unavailable(leaf)}
                    onChange={() => void inspect(leaf)}
                  />
                  <span>
                    {humanize(String(leaf.variants?.axis ?? "Specification"))}:{" "}
                    {String(leaf.variants?.value ?? leaf.description)}
                  </span>
                </label>
              ))
            ) : (
              <p>
                {detail.recipe?.metadata.public_health_cell ||
                detail.recipe?.metadata.centering_cell
                  ? "Selected matrix specification"
                  : "Standard configuration"}{" "}
                · no remaining alternative required
              </p>
            )}
          </fieldset>
          <div className="sor-tariff">
            <span>{sorStatus(detail)}</span>
            <strong>
              {readySorDetail(detail)
                ? `${sorMoney(detail.quote.rate!)} / ${detail.quote.unit}`
                : "Rate unresolved"}
            </strong>
          </div>
          {addons.length > 0 && (
            <fieldset className="sor-addon-options">
              <legend>Applicable extras & conditions</legend>
              {addons.map((choice) => (
                <div key={choice.id} className="sor-addon">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.enabled.includes(choice.id)}
                      disabled={Boolean(choice.blocked)}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          enabled: event.target.checked
                            ? [...current.enabled, choice.id]
                            : current.enabled.filter((id) => id !== choice.id),
                          inputs: {
                            ...current.inputs,
                            ...Object.fromEntries(
                              choice.fields
                                .filter((field) => field.value !== undefined)
                                .map((field) => [
                                  field.key,
                                  current.inputs[field.key] ?? field.value!,
                                ]),
                            ),
                          },
                        }))
                      }
                    />
                    <span>{choice.label}</span>
                  </label>
                  {choice.blocked && <small>{choice.blocked}</small>}
                  {config.enabled.includes(choice.id) && (
                    <>
                      {choice.fields.map((field) => (
                        <label className="sor-input" key={field.key}>
                          {field.label}
                          {field.type === "boolean" ? (
                            <input
                              type="checkbox"
                              checked={config.inputs[field.key] === true}
                              onChange={(event) =>
                                setInput(field.key, event.target.checked)
                              }
                            />
                          ) : (
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              step="any"
                              value={String(config.inputs[field.key] ?? "")}
                              onChange={(event) =>
                                setInput(
                                  field.key,
                                  field.type === "number" &&
                                    event.target.value !== ""
                                    ? Number(event.target.value)
                                    : event.target.value,
                                )
                              }
                            />
                          )}
                        </label>
                      ))}
                      {choice.kind === "porcelain" && (
                        <label>
                          <input
                            type="checkbox"
                            checked={config.confirmed.includes(choice.id)}
                            onChange={(event) =>
                              setConfig((current) => ({
                                ...current,
                                confirmed: event.target.checked
                                  ? [...current.confirmed, choice.id]
                                  : current.confirmed.filter(
                                      (id) => id !== choice.id,
                                    ),
                              }))
                            }
                          />
                          I have verified the porcelain-only component cost,
                          excluding fittings.
                        </label>
                      )}
                    </>
                  )}
                </div>
              ))}
            </fieldset>
          )}
          {selection && (
            <div className="sor-amount">
              {selection.adjustments.map((row) => (
                <small key={row.code}>
                  {row.label}: {sorMoney(row.amount)} / {selection.quote.unit}
                </small>
              ))}
              <span>
                Configured rate{" "}
                <b>
                  {sorMoney(selection.rate)} / {selection.quote.unit}
                </b>
              </span>
            </div>
          )}
          <details>
            <summary>Published source & rate evidence</summary>
            <p>
              {[
                sorPublishedCode(detail.annual?.item_code),
                year,
                zone.replace("_", " "),
              ]
                .filter(Boolean)
                .join(" · ")}
              {detail.annual?.metadata.pdf_page
                ? ` · PDF page ${detail.annual.metadata.pdf_page}`
                : ""}
            </p>
            {detail.recipe?.recipe_code !== code && (
              <p>A reviewed item revision is used for this edition.</p>
            )}
            <p>{detail.recipe?.unit}</p>
          </details>
          <button
            className="btn sor-apply"
            disabled={!selection || calculating || loading}
            onClick={apply}
          >
            {calculating ? <LoaderCircle size={15} /> : <Check size={15} />}{" "}
            {mode === "full"
              ? selected &&
                [...selected.values()].some(
                  (item) =>
                    item.sorCatalogue?.selectionKey === selection?.selectionKey,
                )
                ? "Update selection"
                : "Add to selection"
              : mode === "inspect"
                ? "Inspect DATA"
                : mode === "single"
                  ? "Use resource"
                  : "Apply"}
          </button>
        </article>
      )}
    </section>
  );
}
