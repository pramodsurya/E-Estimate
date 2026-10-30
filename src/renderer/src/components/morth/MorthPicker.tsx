import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Plus, Search } from "lucide-react";
import { costRpc } from "../../lib/individualCosts";
import type { MasterItem } from "../../lib/masterData";
import { readCatalogueGuidance, type CatalogueGuidance } from "../../lib/catalogueGuidance";
import SsrCode from "../templates/SsrCode";
import CatalogueItemDetails from "../templates/CatalogueItemDetails";
import CatalogueChoiceText from "../templates/CatalogueChoiceText";
import CatalogueComparison, { CatalogueCompareToggle, useCatalogueComparison } from "../templates/CatalogueComparison";
import "./morth.css";
interface Entry {
  key?: string;
  label?: string;
  count?: number;
  code?: string;
  description?: string;
  guidance?: CatalogueGuidance;
  unit?: string;
  printedItem?: string;
  heading?: string;
  category?: string;
  sourceCodes?: Record<string, string>;
  variant?: string;
}
interface Page {
  level: string;
  total: number;
  rows: Entry[];
}
export default function MorthPicker({
  onPick,
  selected,
  initial,
}: {
  onPick: (item: MasterItem) => void;
  selected?: Map<string, MasterItem>;
  initial?: MasterItem;
}): JSX.Element {
  const comparison = useCatalogueComparison();
  const [path, setPath] = useState<Record<string, string>>({}),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [category, setCategory] = useState(initial?.morth?.category ?? "medium");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setOffset(0);
    }, 220);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void Promise.resolve().then(() => {
      if (active) setError("");
    });
    void costRpc<Page>("morth_picker_browse", {
      p_path: { ...path, category },
      p_query: search,
      p_offset: offset,
      p_limit: 100,
    })
      .then(
        (result) => {
          if (active)
            setPage((prev) =>
              offset
                ? { ...result, rows: [...(prev?.rows ?? []), ...result.rows] }
                : result,
            );
        },
        (e) => {
          if (active) setError(String(e.message ?? e));
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, search, offset, category]);
  const go = (next: Record<string, string>): void => {
    setPage(null);
    setOffset(0);
    setPath(next);
  };
  const pick = (entry: Entry): void => {
    const codes = entry.sourceCodes ?? {},
      chosen = codes[category]
        ? category
        : (Object.keys(codes)[0] ?? entry.category ?? category);
    onPick({
      side: "MORTH",
      category: "morth",
      code: codes[chosen] ?? entry.code!,
      description: entry.description ?? "",
      guidance: readCatalogueGuidance(entry.guidance),
      unit: entry.unit ?? null,
      morth: {
        category,
        printedItem: entry.printedItem ?? "",
        parameters: {},
      },
    });
  };
  return (
    <section className="morth-picker">
      <header>
        <strong>MoRTH catalogue</strong>
        <small>Standard Data Book 2019 · rates from SOR</small>
      </header>
      <nav aria-label="MoRTH location">
        <button onClick={() => go({})}>Parts</button>
        {path.part && (
          <>
            <ChevronRight size={14} />
            <button onClick={() => go({ part: path.part })}>{path.part}</button>
          </>
        )}
        {path.heading && (
          <>
            <ChevronRight size={14} />
            <span>{path.heading}</span>
          </>
        )}
      </nav>
      {initial && (
        <p className="morth-current">
          Current: {initial.description}. Browse to choose another item.
        </p>
      )}
      <div className="morth-tools">
        <label>
          <Search size={16} />
          <input
            aria-label="Search MoRTH"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items or printed reference…"
          />
        </label>
        <select
          aria-label="Project size"
          value={category}
          onChange={(e) => {
            setOffset(0);
            setPage(null);
            setCategory(e.target.value);
          }}
        >
          <option value="medium">Medium project</option>
          <option value="large">Large project</option>
          <option value="small">Small project</option>
        </select>
      </div>
      {path.part && (
        <button
          className="btn-mini"
          onClick={() => go(path.heading ? { part: path.part } : {})}
        >
          <ArrowLeft size={14} /> Back
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <CatalogueComparison comparison={comparison} />
      <div aria-busy={loading} className="morth-rows">
        {page?.rows.map((entry) => {
          if (page.level !== "item")
            return (
              <button
                className="morth-node"
                key={entry.key}
                onClick={() => go({ ...path, [page.level]: entry.key! })}
              >
                <span>{entry.label}</span>
                <small>{entry.count}</small>
                <ChevronRight size={16} />
              </button>
            );
          const codes = entry.sourceCodes ?? {},
            code = codes[category] ?? Object.values(codes)[0] ?? entry.code!;
          const added = Array.from(selected?.values() ?? []).some(
            (x) => x.side === "MORTH" && x.code === code,
          );
          const item = { code, description: entry.description ?? "", unit: entry.unit, guidance: readCatalogueGuidance(entry.guidance) };
          return (
            <div className="morth-item catalogue-choice-row" key={code}>
              <div>
                <SsrCode code={code} description={item.description} guidance={item.guidance} className="catalogue-choice-code" strong={false} />
                <CatalogueChoiceText item={item} />
                {search && entry.heading && <small className="catalogue-choice-context">{entry.heading}</small>}
                <div className="catalogue-choice-tools">
                <small>
                  {entry.unit}
                  {entry.category &&
                  entry.category !== "shared" &&
                  entry.category !== "not_applicable"
                    ? ` · ${entry.category}`
                    : ""}
                </small>
                <CatalogueCompareToggle item={item} comparison={comparison} />
                <CatalogueItemDetails item={item} />
                </div>
              </div>
              <button
                className="item-add-btn"
                aria-label={`${added ? "Add another" : "Add"} ${entry.description}`}
                onClick={() => pick(entry)}
              >
                {added ? <Check size={16} /> : <Plus size={16} />}
              </button>
            </div>
          );
        })}
        {loading && <p role="status">Loading MoRTH…</p>}
        {!loading && page?.rows.length === 0 && <p>No matching items.</p>}
      </div>
      {page?.level === "item" && page.rows.length < page.total && (
        <button
          className="btn-mini"
          disabled={loading}
          onClick={() => setOffset(page.rows.length)}
        >
          Load more
        </button>
      )}
    </section>
  );
}
