import { useMemo, useState } from "react";
import "./morthSheet.css";
import { useStore } from "../../store/useStore";
import {
  miscellaneousDefinitions,
  miscellaneousBasisLabel,
  type MiscellaneousCost,
} from "../../lib/miscellaneousCosts";
import { collectMorthAppendices } from "../../lib/morthAppendices";
import {
  collectDashboardItems,
  dashboardContextMatches,
  syncDataDashboardSnapshot,
  syncProjectDashboardSnapshot,
} from "../../lib/dashboardSync";
import type { ProjectCostRecipe } from "../../lib/projectIndividualCosts";

export default function MiscellaneousCostsPanel({
  owner,
  entries,
  loading,
}: {
  owner: "SSR" | "MORTH";
  entries: ProjectCostRecipe[];
  loading: boolean;
}): JSX.Element {
  const project = useStore((s) => s.project)!;
  const [draft, setDraft] = useState<Record<string, string>>({}),
    [conditions, setConditions] = useState<Record<string, boolean>>({}),
    [editing, setEditing] = useState<string>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const allRules = useMemo(() => {
    const groups = new Map<
      string,
      MiscellaneousCost & { usages: Set<string> }
    >();
    for (const entry of entries)
      for (const recipe of [
        entry.recipe,
        ...collectMorthAppendices([entry.recipe]).map((a) => a.recipe),
      ])
        for (const definition of miscellaneousDefinitions(recipe)) {
          const group = groups.get(definition.key) ?? {
            ...definition,
            usages: new Set<string>(),
          };
          group.usages.add(
            `${entry.path} · ${recipe.morth?.printedItem || recipe.itemCode} · ${recipe.description}`,
          );
          groups.set(definition.key, group);
        }
    return [...groups.values()];
  }, [entries]);
  const rows = allRules.filter((row) => row.owner === owner);
  const apply = async (): Promise<void> => {
    const next = { ...project.meta.miscellaneousCosts };
    for (const row of allRules) {
      if (!(row.key in draft)) continue;
      const raw = draft[row.key];
      if (!raw.trim()) {
        delete next[row.key];
        continue;
      }
      const percent = Number(raw);
      if (
        !Number.isFinite(percent) ||
        percent < 0 ||
        (row.maximum !== undefined && percent > row.maximum)
      ) {
        setMessage(
          `Enter a valid percentage for ${row.label}${row.maximum !== undefined ? ` (0–${row.maximum}%)` : ""}.`,
        );
        return;
      }
      next[row.key] = { percent, updatedAt: new Date().toISOString() };
    }
    setBusy(true);
    setMessage("");
    try {
      useStore.getState().updateMeta({
        miscellaneousCosts: next,
        morthParameters: { ...project.meta.morthParameters, ...conditions },
      });
      const current = useStore.getState().project!,
        items = collectDashboardItems(current.root);
      const snapshot = items.length
        ? await syncProjectDashboardSnapshot(current, items)
        : await syncDataDashboardSnapshot(current);
      const latest = useStore.getState().project;
      if (
        latest?.id === current.id &&
        dashboardContextMatches(snapshot, latest)
      )
        useStore.getState().setDashboardSnapshot(snapshot);
      setDraft({});
      setConditions({});
      setEditing(undefined);
      setMessage("Percentages applied to project DATA.");
    } catch (e) {
      setMessage(
        `Settings saved; recalculation needs attention: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="misc-costs">
      <p>
        Percentages used by {owner === "MORTH" ? "MoRTH" : "SSR"} DATA in this
        project. Matching rules share one setting; appendix production costs
        retain their own rules.
      </p>
      {loading ? (
        <p role="status">Loading project percentages…</p>
      ) : !rows.length ? (
        <p>No percentage rules in this source’s project DATA.</p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>Miscellaneous cost</th>
                <th>Calculation basis</th>
                <th>Percentage</th>
                <th>Project usage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const saved = project.meta.miscellaneousCosts?.[row.key],
                  value =
                    draft[row.key] ??
                    (row.unresolved && !saved
                      ? ""
                      : String(saved?.percent ?? row.percent));
                const conditionValue = row.condition
                  ? (conditions[row.condition] ?? row.conditionValue)
                  : true;
                return (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.label}</strong>
                      <small>
                        Source{" "}
                        {row.maximum !== undefined ? "maximum" : "default"}:{" "}
                        {row.defaultPercent}%
                        {row.condition ? " · conditional" : ""}
                      </small>
                    </td>
                    <td>{miscellaneousBasisLabel(row.base)}</td>
                    <td>
                      {editing === row.key ? (
                        <label>
                          <span className="sr-only">
                            Percentage for {row.label}
                          </span>
                          <input
                            aria-label={`Percentage for ${row.label}`}
                            type="number"
                            min="0"
                            max={row.maximum}
                            step="any"
                            disabled={busy}
                            value={value}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [row.key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <strong>
                          {row.condition && conditionValue === undefined
                            ? "Choose applicability"
                            : conditionValue === false
                              ? "Not applied"
                              : value
                                ? value + "%"
                                : "Set percentage"}
                        </strong>
                      )}
                    </td>
                    <td>
                      <details>
                        <summary>
                          {row.usages.size} DATA usage
                          {row.usages.size === 1 ? "" : "s"}
                        </summary>
                        {[...row.usages].map((u) => (
                          <p key={u}>{u}</p>
                        ))}
                      </details>
                    </td>
                    <td>
                      {editing === row.key && row.condition && (
                        <label>
                          Apply this allowance
                          <select
                            disabled={busy}
                            aria-label={"Apply " + row.label}
                            value={String(conditionValue ?? "")}
                            onChange={(e) =>
                              setConditions((c) => ({
                                ...c,
                                [row.condition!]: e.target.value === "true",
                              }))
                            }
                          >
                            <option value="" disabled>
                              Select…
                            </option>
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </label>
                      )}
                      <button
                        className="btn-mini"
                        disabled={busy}
                        onClick={() =>
                          setEditing(editing === row.key ? undefined : row.key)
                        }
                      >
                        {editing === row.key ? "Done" : "Edit"}
                      </button>
                      {(saved || row.key in draft) && (
                        <button
                          className="btn-mini"
                          disabled={busy}
                          onClick={() =>
                            setDraft((d) => ({ ...d, [row.key]: "" }))
                          }
                        >
                          Use source default
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <footer className="cost-actions">
        <span role="status">
          {message || "SSR and MoRTH percentages are managed separately."}
        </span>
        <button
          className="btn"
          disabled={
            busy ||
            (!Object.keys(draft).length && !Object.keys(conditions).length)
          }
          onClick={() => {
            setDraft({});
            setConditions({});
          }}
        >
          Discard
        </button>
        <button
          className="btn primary"
          disabled={
            busy ||
            (!Object.keys(draft).length && !Object.keys(conditions).length)
          }
          onClick={() => void apply()}
        >
          {busy ? "Applying…" : "Apply percentages"}
        </button>
      </footer>
    </div>
  );
}
