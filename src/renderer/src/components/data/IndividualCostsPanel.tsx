import MiscellaneousCostsPanel from "./MiscellaneousCostsPanel";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, Pencil, Search, X } from "lucide-react";
import {
  costChoices,
  individualCostAdoption,
  resolveIndividualCostPreview,
} from "../../lib/individualCosts";
import {
  loadProjectIndividualCosts,
  type ProjectIndividualCostRow,
  type ProjectCostRecipe,
} from "../../lib/projectIndividualCosts";
import {
  dashboardContextMatches,
  syncDataDashboardSnapshot,
  syncProjectDashboardSnapshot,
  collectDashboardItems,
  dashboardComponentCompileSignature,
} from "../../lib/dashboardSync";
import { useStore } from "../../store/useStore";
import SorPicker from "../sor/SorPicker";
import type {
  CostOwner,
  IndividualCostAdoption,
  IndividualCostChoice,
} from "../../types/individualCosts";
import type { RateAnalysisSectionKey } from "../../types/rateAnalysis";
import "../morth/morth.css";

const EMPTY_COSTS: Record<string, IndividualCostAdoption> = {};
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const sourceName = (owner: CostOwner): string =>
  owner === "MORTH" ? "MoRTH" : "SSR";
type RatePreview = { rate: number | null; max?: number; label: string };
export default function IndividualCostsPanel(): JSX.Element | null {
  const project = useStore((s) => s.project);
  return project ? <IndividualCostsEditor key={project.id} /> : null;
}
function IndividualCostsEditor(): JSX.Element {
  const project = useStore((s) => s.project)!,
    updateMeta = useStore((s) => s.updateMeta);
  const [owner, setOwner] = useState<CostOwner>("MORTH"),
    [kind, setKind] = useState<RateAnalysisSectionKey | "miscellaneous">(
      "materials",
    );
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(60);
  const [inventory, setInventory] = useState<{
    project: typeof project;
    rows: ProjectIndividualCostRow[];
    errors: string[];
    entries: ProjectCostRecipe[];
  }>();
  const [staged, setStaged] = useState<
    Record<string, IndividualCostAdoption | null>
  >({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, RatePreview>>({});
  const [choices, setChoices] = useState<
    Record<string, IndividualCostChoice[]>
  >({});
  const [expanded, setExpanded] = useState<{
    id: string;
    view: "edit" | "usage";
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [picker, setPicker] = useState<ProjectIndividualCostRow | null>(null);
  const saved = project.meta.individualCosts ?? EMPTY_COSTS,
    year = project.meta.sorYear,
    zone = project.meta.sorZone ?? "zone_3";
  const loading = inventory?.project !== project;
  // Hide stale resources immediately when project DATA changes.
  const allRows = useMemo(
    () => (inventory?.project === project ? inventory.rows : []),
    [inventory, project],
  );
  const groupRows = useMemo(
    () => allRows.filter((r) => r.owner === owner && r.kind === kind),
    [allRows, owner, kind],
  );
  const matching = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return groupRows.filter((r) =>
      terms.every((t) =>
        r.aliases.some((a) => a.toLocaleLowerCase().includes(t)),
      ),
    );
  }, [groupRows, query]);
  const visible = useMemo(() => matching.slice(0, limit), [matching, limit]);
  const pendingRows = allRows.filter((r) => r.id in staged || r.id in drafts);
  const current = (
    row: ProjectIndividualCostRow,
  ): IndividualCostAdoption | undefined =>
    row.id in staged
      ? (staged[row.id] ?? undefined)
      : [...row.adoptionKeys, ...row.memberKeys]
          .map((k) => saved[k])
          .find(Boolean);

  useEffect(() => {
    if (kind === "miscellaneous" || !allRows.length || groupRows.length) return;
    const first = allRows.find((r) => r.owner === owner);
    if (!first) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setKind(first.kind);
    });
    return () => {
      active = false;
    };
  }, [allRows, groupRows, owner, kind]);

  useEffect(() => {
    let active = true;
    void loadProjectIndividualCosts(project, () => !active)
      .then((result) => {
        if (!active) return;
        setInventory({ project, ...result });
        setOwner((previous) =>
          result.rows.some((r) => r.owner === previous)
            ? previous
            : (result.rows[0]?.owner ?? previous),
        );
      })
      .catch((e) => {
        if (active)
          setInventory({ project, rows: [], entries: [], errors: [String(e)] });
      });
    return () => {
      active = false;
    };
  }, [project]);

  useEffect(() => {
    let active = true,
      index = 0;
    const result: Record<string, RatePreview> = {};
    void Promise.resolve().then(() => {
      if (active) setRates({});
    });
    const worker = async (): Promise<void> => {
      while (active && index < visible.length) {
        const row = visible[index++];
        try {
          const results = await Promise.all(
            row.inputs.map((input) =>
              resolveIndividualCostPreview(
                { ...row, sample: input.raw },
                row.owner,
                row.kind,
                row.id in staged
                  ? (staged[row.id] ?? undefined)
                  : individualCostAdoption(input, saved),
                year,
                zone,
                project.meta.materialRateOverrides,
              ),
            ),
          );
          const values = results.flatMap((r) =>
            r.rate === null ? [] : [r.rate],
          );
          result[row.id] = {
            rate: values.length === results.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : undefined,
            label:
              new Set(results.map((r) => r.label)).size > 1
                ? "Different existing rate sources"
                : (results[0]?.label ?? "Rate pending"),
          };
        } catch {
          result[row.id] = {
            rate: null,
            label: "Rate unavailable for this year / zone",
          };
        }
        if (active)
          setRates((previous) => ({ ...previous, [row.id]: result[row.id] }));
      }
    };
    void Promise.all(Array.from({ length: 4 }, worker)).then(() => {
      if (active) setRates(result);
    });
    return () => {
      active = false;
    };
  }, [visible, staged, saved, year, zone, project.meta.materialRateOverrides]);

  useEffect(() => {
    const row = allRows.find((r) => r.id === expanded?.id);
    if (!row || expanded?.view !== "edit") return;
    let active = true;
    void costChoices(row.sample)
      .then((result) => {
        if (active)
          setChoices((previous) => ({ ...previous, [row.id]: result }));
      })
      .catch(() => {
        if (active)
          setMessage(
            "Linked choices could not be loaded. Browse SOR or enter a manual rate.",
          );
      });
    return () => {
      active = false;
    };
  }, [expanded, allRows]);

  const stage = (
    row: ProjectIndividualCostRow,
    value: IndividualCostAdoption | null,
  ): void => {
    setStaged((s) => ({ ...s, [row.id]: value }));
    if (value?.mode !== "manual")
      setDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
    setMessage("");
  };
  const apply = async (): Promise<void> => {
    if (
      pendingRows.some(
        (r) =>
          r.id in drafts &&
          (drafts[r.id].trim() === "" ||
            !Number.isFinite(Number(drafts[r.id])) ||
            Number(drafts[r.id]) < 0),
      )
    ) {
      setMessage("Enter a valid non-negative manual rate before applying.");
      return;
    }
    const next = { ...saved };
    for (const row of pendingRows) {
      if (!(row.id in staged)) continue;
      // Store one group adoption; newly added matching resources join that group.
      for (const key of [...row.memberKeys, ...row.adoptionKeys]) {
        if (staged[row.id]) next[key] = staged[row.id]!;
        else delete next[key];
      }
    }
    setBusy(true);
    setMessage("Applying rates and recalculating DATA…");
    updateMeta({ individualCosts: next });
    setStaged({});
    setDrafts({});
    const snapshotProject = useStore.getState().project!;
    try {
      const items = collectDashboardItems(snapshotProject.root);
      const snapshot = items.length
        ? await syncProjectDashboardSnapshot(snapshotProject, items)
        : await syncDataDashboardSnapshot(snapshotProject);
      const latest = useStore.getState().project;
      if (
        latest?.id === snapshotProject.id &&
        dashboardContextMatches(snapshot, latest) &&
        dashboardComponentCompileSignature(snapshotProject, items) ===
          dashboardComponentCompileSignature(
            latest,
            collectDashboardItems(latest.root),
          )
      ) {
        useStore.getState().setDashboardSnapshot(snapshot);
        setMessage("Applied. DATA and estimate rates updated.");
      } else
        setMessage(
          "Rates saved. Project changed during calculation; its latest settings will be used.",
        );
    } catch (e) {
      setMessage(
        `Rates saved. Some DATA remains pending: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string, view: "edit" | "usage"): void =>
    setExpanded((previous) =>
      previous?.id === id && previous.view === view ? null : { id, view },
    );
  const changeFilter = (): void => {
    setLimit(60);
    setExpanded(null);
  };

  return (
    <section className="individual-costs">
      <header className="cost-heading">
        <div>
          <h2>Individual Costs</h2>
          <p>
            Resources used by DATA in this project. Edit a resource once to
            update its usages.
          </p>
        </div>
        <span className="cost-context">
          {year} · {zone.replace("_", " ")}
        </span>
      </header>
      <div
        className="cost-source-tabs"
        role="group"
        aria-label="Resource source"
      >
        {(["MORTH", "SSR"] as const).map((s) => (
          <button
            key={s}
            aria-pressed={owner === s}
            onClick={() => {
              setOwner(s);
              changeFilter();
            }}
          >
            {sourceName(s)}
            <span>{allRows.filter((r) => r.owner === s).length}</span>
          </button>
        ))}
      </div>
      <div
        role="tablist"
        aria-label="Resource kind"
        className="backend-data-source-tabs cost-kind-tabs"
      >
        {(["materials", "machinery", "labour"] as const).map((k) => (
          <button
            role="tab"
            aria-selected={kind === k}
            disabled={
              !loading &&
              !allRows.some((r) => r.owner === owner && r.kind === k)
            }
            key={k}
            onClick={() => {
              setKind(k);
              changeFilter();
            }}
          >
            {k === "materials"
              ? "Materials"
              : k === "machinery"
                ? "Machinery"
                : "Labour"}{" "}
            <span>
              {allRows.filter((r) => r.owner === owner && r.kind === k).length}
            </span>
          </button>
        ))}
        <button
          role="tab"
          aria-selected={kind === "miscellaneous"}
          onClick={() => {
            setKind("miscellaneous");
            changeFilter();
          }}
        >
          Miscellaneous
        </button>
      </div>
      {kind === "miscellaneous" && (
        <MiscellaneousCostsPanel
          owner={owner}
          entries={inventory?.project === project ? inventory.entries : []}
          loading={loading}
        />
      )}
      <div hidden={kind === "miscellaneous"}>
        <div className="cost-controls">
          <label className="cost-search">
            <Search size={16} />
            <input
              aria-label="Search individual costs"
              placeholder="Search project resources…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(60);
              }}
            />
            {query && (
              <button
                className="icon-btn"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <span>
            {matching.length} unique resource{matching.length === 1 ? "" : "s"}
          </span>
        </div>
        {inventory?.project === project && inventory.errors.length > 0 && (
          <details className="cost-load-errors">
            <summary>
              Some project DATA could not be loaded ({inventory.errors.length})
            </summary>
            {inventory.errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
          </details>
        )}
        {loading ? (
          <div className="cost-empty" role="status">
            Loading resources used by project DATA…
          </div>
        ) : !visible.length ? (
          <div className="cost-empty">
            <strong>
              {!allRows.length
                ? "No project resources yet"
                : query
                  ? "No matching resources"
                  : `No ${kind} used in ${sourceName(owner)} DATA`}
            </strong>
            <p>
              {!allRows.length
                ? "Add SSR or MoRTH DATA to the project. Its individual materials, machinery and labour will appear here."
                : query
                  ? "Try another resource name or clear the search."
                  : "Only resources in DATA added to this project are listed."}
            </p>
          </div>
        ) : (
          <div className="cost-table-wrap">
            <table className="cost-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Rate / unit</th>
                  <th>Project usage</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const adoption = current(row),
                    resolved = rates[row.id],
                    open = expanded?.id === row.id;
                  const pending = row.id in staged || row.id in drafts,
                    selectedChoices = choices[row.id] ?? [];
                  const locked = new Set(
                    row.locations.filter((u) => u.locked).map((u) => u.nodeId),
                  ).size;
                  return (
                    <Fragment key={row.id}>
                      <tr className={open ? "cost-row-open" : undefined}>
                        <td>
                          <strong>{row.description}</strong>
                          <div className="cost-resource-meta">
                            <span>{row.unit || "unit"}</span>
                            {row.owner === "MORTH" && (
                              <span
                                className={`cost-status ${row.confidence.toLowerCase().replace(" ", "-")}`}
                              >
                                {row.confidence}
                              </span>
                            )}
                            {pending && (
                              <span className="cost-pending">Unsaved</span>
                            )}
                          </div>
                        </td>
                        <td className="cost-rate">
                          <strong>
                            {resolved?.rate === null
                              ? "Rate pending"
                              : resolved
                                ? `₹ ${money.format(resolved.rate)}${resolved.max !== undefined && resolved.max !== resolved.rate ? ` – ${money.format(resolved.max)}` : ""}`
                                : "Loading…"}
                          </strong>
                          <small>{resolved?.label}</small>
                        </td>
                        <td>
                          <button
                            className="cost-usage-button"
                            aria-expanded={open && expanded.view === "usage"}
                            onClick={() => toggle(row.id, "usage")}
                          >
                            {row.analyses} DATA usage
                            {row.analyses === 1 ? "" : "s"}
                            <ChevronDown size={14} />
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn-mini cost-edit-button"
                            disabled={busy}
                            aria-expanded={open && expanded.view === "edit"}
                            aria-label={`Edit rate for ${row.description}`}
                            onClick={() => toggle(row.id, "edit")}
                          >
                            <Pencil size={14} /> Edit rate
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="cost-detail-row">
                          <td colSpan={4}>
                            <div className="cost-detail">
                              <header>
                                <strong>
                                  {expanded.view === "usage"
                                    ? "Used in this project"
                                    : `Edit ${row.description}`}
                                </strong>
                                <button
                                  className="icon-btn"
                                  aria-label="Close resource details"
                                  onClick={() => setExpanded(null)}
                                >
                                  <X size={16} />
                                </button>
                              </header>
                              {expanded.view === "usage" ? (
                                <ul className="cost-locations">
                                  {row.locations.map((u, i) => (
                                    <li key={`${u.nodeId}:${i}`}>
                                      <strong>{u.description}</strong>
                                      <small>
                                        {u.path}
                                        {u.via ? ` · via ${u.via}` : ""}
                                        {u.locked
                                          ? " · Local DATA rate retained"
                                          : ""}
                                      </small>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <>
                                  <div className="cost-editor-controls">
                                    <label>
                                      Rate source
                                      <select
                                        aria-label={`Rate source for ${row.description}`}
                                        disabled={busy}
                                        value={adoption?.mode ?? "default"}
                                        onChange={(e) => {
                                          if (e.target.value === "default")
                                            stage(row, null);
                                          else if (
                                            e.target.value === "manual"
                                          ) {
                                            const rate = resolved?.rate ?? 0;
                                            setDrafts((d) => ({
                                              ...d,
                                              [row.id]: String(rate),
                                            }));
                                            stage(row, {
                                              mode: "manual",
                                              rate,
                                              updatedAt:
                                                new Date().toISOString(),
                                            });
                                          } else setPicker(row);
                                        }}
                                      >
                                        <option value="default">
                                          {owner === "SSR"
                                            ? "SSR_Year / project default"
                                            : "Default starting rate"}
                                        </option>
                                        <option value="manual">
                                          Manual rate
                                        </option>
                                        <option value="sor">
                                          Choose SOR rate
                                        </option>
                                      </select>
                                    </label>
                                    {adoption?.mode === "manual" && (
                                      <label>
                                        Rate per {row.unit}
                                        <input
                                          autoFocus
                                          type="number"
                                          min="0"
                                          step="any"
                                          disabled={busy}
                                          aria-label={`Manual rate for ${row.description}`}
                                          value={
                                            drafts[row.id] ??
                                            String(adoption.rate ?? "")
                                          }
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setDrafts((d) => ({
                                              ...d,
                                              [row.id]: value,
                                            }));
                                            if (
                                              value.trim() &&
                                              Number.isFinite(Number(value)) &&
                                              Number(value) >= 0
                                            )
                                              stage(row, {
                                                mode: "manual",
                                                rate: Number(value),
                                                updatedAt:
                                                  new Date().toISOString(),
                                              });
                                          }}
                                        />
                                      </label>
                                    )}
                                    {adoption?.mode !== "manual" && (
                                      <div className="cost-sor-controls">
                                        {selectedChoices.length > 0 && (
                                          <label>
                                            Linked SOR choices
                                            <select
                                              aria-label={`SOR rate for ${row.description}`}
                                              disabled={busy}
                                              value={
                                                adoption?.code
                                                  ? `${adoption.code}|${adoption.component ?? "rate"}`
                                                  : ""
                                              }
                                              onChange={(e) => {
                                                const selected =
                                                  selectedChoices.find(
                                                    (c) =>
                                                      `${c.code}|${c.component}` ===
                                                      e.target.value,
                                                  );
                                                if (selected)
                                                  stage(row, {
                                                    mode: "sor",
                                                    code: selected.code,
                                                    component:
                                                      selected.component,
                                                    label: selected.description,
                                                    updatedAt:
                                                      new Date().toISOString(),
                                                  });
                                                else stage(row, null);
                                              }}
                                            >
                                              <option value="">
                                                {owner === "SSR"
                                                  ? "Keep SSR_Year / project default"
                                                  : "Use default starting rate"}
                                              </option>
                                              {adoption?.mode === "sor" &&
                                                !selectedChoices.some(
                                                  (c) =>
                                                    c.code === adoption.code &&
                                                    c.component ===
                                                      (adoption.component ??
                                                        "rate"),
                                                ) && (
                                                  <option
                                                    value={`${adoption.code}|${adoption.component ?? "rate"}`}
                                                  >
                                                    {adoption.label ??
                                                      "Selected SOR rate"}
                                                  </option>
                                                )}
                                              {selectedChoices.map((c) => (
                                                <option
                                                  key={`${c.code}|${c.component}`}
                                                  value={`${c.code}|${c.component}`}
                                                >
                                                  {c.description}
                                                  {c.medium ? " · Medium" : ""}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        )}
                                        <button
                                          className="btn-mini"
                                          disabled={busy}
                                          onClick={() => setPicker(row)}
                                        >
                                          Browse SOR
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <p className="cost-edit-hint">
                                    Applies to matching {sourceName(owner)}{" "}
                                    resources across this project.
                                    {locked > 0
                                      ? ` ${locked} DATA usage${locked === 1 ? " has a" : "s have"} local rate edit that will be retained.`
                                      : ""}{" "}
                                    Use Apply changes below to recalculate.
                                  </p>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visible.length < matching.length && (
          <button
            className="btn-mini cost-load-more"
            onClick={() => setLimit((n) => n + 60)}
          >
            Show more ({matching.length - visible.length} remaining)
          </button>
        )}
        <footer className="cost-actions">
          <div>
            <strong>
              {pendingRows.length
                ? `${pendingRows.length} resource${pendingRows.length === 1 ? "" : "s"} changed`
                : "All changes saved"}
            </strong>
            <span role="status">
              {message || "SSR and MoRTH rates are managed separately."}
            </span>
          </div>
          <button
            className="btn"
            disabled={busy || !pendingRows.length}
            onClick={() => {
              setStaged({});
              setDrafts({});
              setMessage("Changes discarded.");
            }}
          >
            Discard
          </button>
          <button
            className="btn primary"
            disabled={busy || loading || !pendingRows.length}
            onClick={() => void apply()}
          >
            {busy ? "Applying…" : "Apply changes"}
          </button>
        </footer>
      </div>
      {picker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose resource SOR rate"
          className="cost-picker-overlay"
          onKeyDown={(e) => {
            if (e.key === "Escape") setPicker(null);
          }}
        >
          <header>
            <strong>
              {picker.description} · rate per {picker.unit}
            </strong>
            <button
              autoFocus
              className="icon-btn"
              onClick={() => setPicker(null)}
              aria-label="Close SOR picker"
            >
              <X />
            </button>
          </header>
          <div>
            <SorPicker
              year={year}
              zone={zone}
              mode="single"
              onPick={(item) => {
                stage(picker, {
                  mode: "sor",
                  code: item.sorCatalogue?.resolvedRecipeCode ?? item.code,
                  component: choices[picker.id]?.[0]?.component ?? "rate",
                  label: item.description,
                  updatedAt: new Date().toISOString(),
                });
                setPicker(null);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
