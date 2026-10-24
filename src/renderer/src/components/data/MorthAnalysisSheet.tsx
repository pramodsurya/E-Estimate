import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { useStore } from "../../store/useStore";
import {
  syncDataDashboardSnapshot,
  syncProjectDashboardSnapshot,
  collectDashboardItems,
  dashboardContextMatches,
} from "../../lib/dashboardSync";
import { fetchMorthRecipe } from "../../lib/morthEstimate";
import { morthLeadIssues, morthTransportBinding, morthFinalRate } from "../../lib/morthMaterialLead";
import type { LeadApplication, LeadVariant } from "../../types/project";
import {
  record,
  rows,
  individualCostGroupKey,
} from "../../lib/individualCosts";
import {
  appendixForRecipe,
  collectMorthAppendices,
  calculationBasisLabel,
  morthAbstract,
} from "../../lib/morthAppendices";
import type {
  RateAnalysisRecipe,
  RateAnalysisLine,
} from "../../types/rateAnalysis";
import type { IndividualCostAdoption } from "../../types/individualCosts";
import SorPicker from "../sor/SorPicker";
import "../morth/morth.css";
import "./morthSheet.css";
const money = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
type Parameters = Record<string, string | number | boolean>;
export default function MorthAnalysisSheet({
  recipe: original,
  onRefresh,
  leadApplications = [],
  leadVariants = [],
}: {
  recipe: RateAnalysisRecipe;
  onRefresh?: () => void;
  leadApplications?: LeadApplication[];
  leadVariants?: LeadVariant[];
}): JSX.Element {
  const [local, setLocal] = useState<{
    base: RateAnalysisRecipe;
    recipe: RateAnalysisRecipe;
  }>();
  const root = local?.base === original ? local.recipe : original;
  const appendices = useMemo(() => collectMorthAppendices([root]), [root]);
  const [selected, setSelected] = useState("main");
  const active = appendices.find((a) => a.key === selected),
    recipe = active?.recipe ?? root;
  const [calculated, setCalculated] = useState<{
    recipe: RateAnalysisRecipe;
    summary: import("../../types/rateAnalysis").RateAnalysisSummary;
  }>();
  const summary =
    calculated?.recipe === recipe
      ? calculated.summary
      : recipe.morth?.startingSummary;
  const [editing, setEditing] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (recipe.morth?.startingSummary?.morthAbstract) return;
    let live = true;
    void window.api.rateAnalysis.calculateBase(recipe).then(
      (summary) => {
        if (live) setCalculated({ recipe, summary });
      },
      (e) => {
        if (live) setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [recipe]);
  const navigate = (key: string): void => {
    setSelected(key);
    setEditing(undefined);
  };
  const save = async (
    parameters: Parameters,
    costs: Record<string, IndividualCostAdoption>,
  ): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const current = useStore.getState().project!;
      useStore.getState().updateMeta({
        morthParameters: { ...current.meta.morthParameters, ...parameters },
        individualCosts: { ...current.meta.individualCosts, ...costs },
      });
      const updated = useStore.getState().project!,
        items = collectDashboardItems(updated.root);
      const snapshot = items.length
        ? await syncProjectDashboardSnapshot(updated, items)
        : await syncDataDashboardSnapshot(updated);
      const latest = useStore.getState().project;
      if (
        latest?.id === updated.id &&
        dashboardContextMatches(snapshot, latest)
      )
        useStore.getState().setDashboardSnapshot(snapshot);
      const refreshed = await fetchMorthRecipe(
        {
          id: root.itemKey,
          kind: "item",
          children: [],
          name: root.description,
          itemSource: "MORTH",
          categoryKey: "morth",
          itemCode: root.itemCode,
          morth: {
            category: String(root.morth?.source._project_category ?? "medium"),
            printedItem: root.morth?.printedItem ?? "",
            parameters: {},
          },
        },
        updated.meta.sorYear,
        updated.meta.sorZone ?? "zone_3",
        updated.meta.individualCosts,
        updated.meta.morthParameters,
        [],
        updated.meta.miscellaneousCosts,
      );
      setLocal({ base: original, recipe: refreshed });
      setEditing(undefined);
      onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const openCosts = (): void => {
    useStore.getState().setActivity("data");
    useStore.getState().setDataDashboardSection("individual-costs");
  };
  const abstract = morthAbstract(recipe, summary),
    missing = summary?.missing ?? recipe.morth?.pending ?? [];
  const leadIssues = active ? [] : morthLeadIssues(root, leadApplications, leadVariants);
  const leadAmount = leadApplications.reduce((sum, application) => sum + application.grossAmount, 0);
  return (
    <article className="rate-sheet morth-sheet">
      {appendices.length > 0 && (
        <nav className="morth-sheet-nav" aria-label="MoRTH DATA sheets">
          <button
            aria-current={!active ? "page" : undefined}
            onClick={() => navigate("main")}
          >
            MoRTH DATA
          </button>
          <label>
            Appendices{" "}
            <select
              aria-label="Open MoRTH appendix"
              value={active?.key ?? ""}
              onChange={(e) => navigate(e.target.value || "main")}
            >
              <option value="">Select appendix ({appendices.length})</option>
              {appendices.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {a.recipe.description}
                </option>
              ))}
            </select>
          </label>
        </nav>
      )}
      {active && (
        <div className="morth-appendix-context">
          <button onClick={() => navigate("main")}>
            <ArrowLeft size={15} /> Back to MoRTH DATA
          </button>
          <span>
            Shared appendix · used in {active.usages.length} analysis
            {active.usages.length === 1 ? "" : "es"}
          </span>
        </div>
      )}
      <header className="rate-document-header">
        <strong className="rate-sheet-code">
          {active ? "Appendix" : "MoRTH"} {recipe.morth?.printedItem}
        </strong>
        <div className="rate-document-meta">
          <span>{recipe.documentTitle}</span>
          <small>
            {recipe.zone?.replace("_", " ")} · project rate analysis
          </small>
        </div>
      </header>
      <div className="rate-description">{recipe.description}</div>
      {!active && leadIssues.length > 0 && (
        <details className="morth-sheet-warning" open>
          <summary>Material Lead pending · final rate incomplete</summary>
          <ul>{leadIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          <p>Apply the material Lead in the Lead workspace. An explicit zero-distance or included-delivery application can resolve a zero additional cost.</p>
        </details>
      )}
      <div className="rate-sheet-heading">
        <span>{active ? "APPENDIX:" : "DATA:"}</span>
        <strong>RATE ANALYSIS</strong>
        <span className="rate-basis">
          UNIT: <b>{money.format(recipe.outputQuantity)}</b>{" "}
          <span>{recipe.unit}</span>
        </span>
      </div>
      {error && (
        <p className="morth-sheet-warning" role="alert">
          {error}
        </p>
      )}
      {missing.length > 0 && (
        <details className="morth-sheet-warning">
          <summary>
            Rate incomplete · {missing.length} input
            {missing.length === 1 ? "" : "s"} needed
          </summary>
          <ul>
            {missing.map((m, i) => (
              <li key={i}>{m.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </details>
      )}
      {recipe.sections
        .filter((s) => s.lines.length)
        .map((section) => (
          <section
            key={section.key}
            className={`morth-sheet-section morth-section-${section.key}`}
          >
            <h4>
              {section.key === "materials"
                ? "A"
                : section.key === "machinery"
                  ? "B"
                  : "C"}
              . {section.label}
            </h4>
            <div className="morth-sheet-scroll">
              <table className="morth-resource-table">
                <colgroup>
                  <col className="morth-col-sl" />
                  <col className="morth-col-description" />
                  <col className="morth-col-unit" />
                  <col className="morth-col-number" />
                  <col className="morth-col-number" />
                  <col className="morth-col-amount" />
                  <col className="morth-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} scope="col">
                      Sl No
                    </th>
                    <th rowSpan={2} scope="col">
                      {section.key === "materials"
                        ? "Particulars"
                        : "Description"}
                    </th>
                    <th rowSpan={2} scope="col">
                      Unit
                    </th>
                    <th rowSpan={2} scope="col">
                      Quantity
                    </th>
                    <th scope="col">Rate</th>
                    <th scope="col">Amount</th>
                    <th rowSpan={2} scope="col" className="morth-sheet-action">
                      <span className="morth-sr-only">Actions</span>
                    </th>
                  </tr>
                  <tr>
                    <th scope="col">in Rs.</th>
                    <th scope="col">in Rs.</th>
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line, lineIndex) => {
                    const input = recipe.morth?.inputs[line.id],
                      dependency = input?.dependency,
                      appendix = dependency
                        ? appendixForRecipe(appendices, dependency)
                        : undefined;
                    const expression = record(input?.raw.quantity_expression),
                      parameter = morthTransportBinding(input?.raw ?? {})?.mode === 'fixed' ? '' : String(expression.parameter ?? "");
                    const noQuantity = Boolean(
                      parameter &&
                        (recipe.morth?.parameters[parameter] === undefined ||
                          recipe.morth.parameters[parameter] === ""),
                    );
                    const noRate = input?.rate === null && !dependency;
                    return (
                      <Fragment key={line.id}>
                        <tr
                          className={
                            lineIndex % 2 ? "morth-alt-row" : undefined
                          }
                        >
                          <td className="morth-serial">{lineIndex + 1}</td>
                          <td className="morth-particular">
                            <span>{line.description}</span>
                            {appendix ? (
                              <button
                                className="morth-sheet-reference"
                                onClick={() => navigate(appendix.key)}
                              >
                                {appendix.name} →
                                {record(input?.raw.price_lookup)
                                  .require_direct_cost_only === true
                                  ? " · direct rate"
                                  : ""}
                              </button>
                            ) : (
                              <small>
                                {line.rateSource ?? line.individualCost?.label}
                              </small>
                            )}
                          </td>
                          <td className="morth-unit">{line.unit}</td>
                          <td>
                            {noQuantity
                              ? "Input needed"
                              : qty.format(line.quantity)}
                          </td>
                          <td>
                            {noRate
                              ? line.quantity === 0 && !noQuantity
                                ? "—"
                                : "Rate pending"
                              : money.format(line.rate)}
                          </td>
                          <td>
                            {noQuantity || (noRate && line.quantity !== 0)
                              ? "—"
                              : money.format(line.amount)}
                          </td>
                          <td>
                            <button
                              className="morth-row-edit"
                              aria-label={`Edit ${line.description}`}
                              aria-expanded={editing === line.id}
                              disabled={busy}
                              onClick={() =>
                                setEditing(
                                  editing === line.id ? undefined : line.id,
                                )
                              }
                            >
                              <Pencil size={13} /> Edit
                            </button>
                          </td>
                        </tr>
                        {editing === line.id && (
                          <tr className="morth-row-editor">
                            <td colSpan={7}>
                              <MorthRowEditor
                                key={selected + line.id}
                                recipe={recipe}
                                line={line}
                                busy={busy}
                                onSave={save}
                                onClose={() => setEditing(undefined)}
                                onCosts={openCosts}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="morth-section-total">
                    <td />
                    <th colSpan={4}>
                      {section.key === "machinery"
                        ? "Total hire charges of Machinery"
                        : `Total cost of ${section.label}`}
                    </th>
                    <td>
                      {summary
                        ? money.format(summary.sectionTotals[section.key])
                        : "…"}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ))}
      <section className="morth-sheet-section morth-section-abstract">
        <h4>Abstract</h4>
        <div className="morth-sheet-scroll">
          <table className="morth-sheet-abstract">
            <thead>
              <tr>
                <th>Description</th>
                <th>Calculation basis</th>
                <th>Percentage</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {abstract.map((row) => (
                <tr
                  key={row.id}
                  className={
                    ["direct", "total", "rate"].includes(row.formulaKind)
                      ? "morth-abstract-total"
                      : ""
                  }
                >
                  <td>{row.label}</td>
                  <td>
                    {row.percent !== undefined ? (
                      <>
                        <span>{calculationBasisLabel(row.base)}</span>
                        <small>₹ {money.format(row.basisAmount ?? 0)}</small>
                      </>
                    ) : row.formulaKind === "rate" ? (
                      `Total ÷ ${qty.format(recipe.outputQuantity)} ${recipe.unit}`
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{row.percent !== undefined ? `${row.percent}%` : "—"}</td>
                  <td>{money.format(row.amount)}</td>
                </tr>
              ))}
              {!abstract.length && summary && (
                <>
                  <tr>
                    <th colSpan={3}>Direct cost</th>
                    <td>{money.format(summary.baseCost)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>Overheads</th>
                    <td>{money.format(summary.overheadAmount)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>Contractor profit</th>
                    <td>{money.format(summary.profitAmount ?? 0)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>Total cost</th>
                    <td>{money.format(summary.totalCost)}</td>
                  </tr>
                  <tr>
                    <th colSpan={3}>Rate per {recipe.unit}</th>
                    <td>{money.format(summary.ratePerUnit)}</td>
                  </tr>
                </>
              )}
              {!active && summary && (
                <>
                  <tr><th colSpan={3}>Applied material Lead</th><td>{money.format(leadAmount)}</td></tr>
                  <tr className="morth-abstract-total">
                    <th colSpan={3}>Final rate per {recipe.unit} including Lead</th>
                    <td>{leadIssues.length || missing.length ? 'Pending' : money.format(morthFinalRate(recipe, summary.totalCost, leadApplications))}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="morth-sheet-footnote">
          <span>
            {summary?.costReady === false
              ? "Known costs shown; complete missing inputs before use."
              : "Starting analysis · review adopted rates for this project."}
          </span>
          <button onClick={openCosts}>Individual Costs & percentages</button>
        </div>
      </section>
      {active && (
        <details className="morth-used-by">
          <summary>Used by</summary>
          {active.usages.map((u) => (
            <p key={u}>{u}</p>
          ))}
        </details>
      )}
    </article>
  );
}
function MorthRowEditor({
  recipe,
  line,
  busy,
  onSave,
  onClose,
  onCosts,
}: {
  recipe: RateAnalysisRecipe;
  line: RateAnalysisLine;
  busy: boolean;
  onSave: (
    parameters: Parameters,
    costs: Record<string, IndividualCostAdoption>,
  ) => Promise<void>;
  onClose: () => void;
  onCosts: () => void;
}): JSX.Element {
  const project = useStore((s) => s.project)!,
    input = recipe.morth?.inputs[line.id],
    expression = record(input?.raw.quantity_expression);
  const parameter = morthTransportBinding(input?.raw ?? {})?.mode === 'fixed' ? '' : String(expression.parameter ?? "");
  const groups = line.id.startsWith("machinery")
    ? rows(recipe.morth?.source._options)
    : [];
  const [parameters, setParameters] = useState<Parameters>({}),
    [rate, setRate] = useState(String(line.rate)),
    [manual, setManual] = useState(false),
    [sor, setSor] = useState<IndividualCostAdoption>(),
    [picker, setPicker] = useState(false);
  const key = line.individualCostInput
    ? individualCostGroupKey(line.individualCostInput)
    : line.individualCost?.key;
  const apply = (): void => {
    const value = Number(rate);
    if (manual && (!rate.trim() || !Number.isFinite(value) || value < 0))
      return;
    void onSave(
      parameters,
      key && (sor || manual)
        ? {
            [key]: sor ?? {
              mode: "manual",
              rate: value,
              updatedAt: new Date().toISOString(),
            },
          }
        : {},
    );
  };
  return (
    <div className="morth-row-editor-body">
      <header>
        <strong>Edit resource</strong>
        <button aria-label="Close row editor" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="morth-row-editor-fields">
        {parameter && (
          <label>
            {parameter.replace(/_/g, " ")}
            <input
              type="number"
              step="any"
              aria-label={parameter.replace(/_/g, " ")}
              value={String(
                parameters[parameter] ??
                  recipe.morth?.parameters[parameter] ??
                  "",
              )}
              onChange={(e) =>
                setParameters((p) => ({
                  ...p,
                  [parameter]: e.target.value.trim()
                    ? Number(e.target.value)
                    : "",
                }))
              }
            />
          </label>
        )}
        {groups.map((group) => {
          const name = String(group.selection_parameter ?? "");
          return (
            <label key={name}>
              {name.replace(/_/g, " ")}
              <select
                value={String(
                  parameters[name] ??
                    recipe.morth?.parameters[name] ??
                    "source",
                )}
                onChange={(e) =>
                  setParameters((p) => ({ ...p, [name]: e.target.value }))
                }
              >
                {Object.entries(record(group.options)).map(([k, v]) => (
                  <option key={k} value={k}>
                    {k === "source"
                      ? "Source equipment"
                      : String(record(v).label ?? k.replace(/_/g, " "))}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {key && (
          <label>
            Rate source
            <select
              aria-label="Resource rate source"
              value={manual ? "manual" : sor ? "sor" : "current"}
              onChange={(e) => {
                setManual(e.target.value === "manual");
                if (e.target.value === "sor") setPicker(true);
                else setSor(undefined);
              }}
            >
              <option value="current">Keep current rate</option>
              <option value="manual">Manual rate</option>
              <option value="sor">Choose SOR rate</option>
            </select>
          </label>
        )}
        {manual && (
          <label>
            Rate per {line.unit}
            <input
              aria-label="Manual resource rate"
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        )}
        {sor && <span>{sor.label}</span>}
      </div>
      <footer>
        <small>
          Rate changes apply to matching MoRTH resources in this project.
        </small>
        <button onClick={onCosts}>Manage Individual Costs</button>
        <button className="btn-mini" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn-mini"
          onClick={apply}
          disabled={
            busy ||
            (!Object.keys(parameters).length && !manual && !sor) ||
            (manual &&
              (!rate.trim() ||
                !Number.isFinite(Number(rate)) ||
                Number(rate) < 0))
          }
        >
          {busy ? "Calculating…" : "Apply"}
        </button>
      </footer>
      {picker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose resource SOR rate"
          className="cost-picker-overlay"
        >
          <header>
            <strong>Choose rate · {line.unit}</strong>
            <button
              onClick={() => setPicker(false)}
              aria-label="Close SOR picker"
            >
              <X />
            </button>
          </header>
          <SorPicker
            mode="single"
            year={project.meta.sorYear}
            zone={project.meta.sorZone ?? "zone_3"}
            onPick={(item) => {
              setSor({
                mode: "sor",
                code: item.sorCatalogue?.resolvedRecipeCode ?? item.code,
                label: item.description,
                updatedAt: new Date().toISOString(),
              });
              setManual(false);
              setPicker(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
