import MorthPicker from '../morth/MorthPicker'
import { useState } from "react";
import { X } from "lucide-react";
import type { MasterItem } from "../../lib/masterData";
import type {
  DataVariantSelection,
  ItemSource,
  SorCatalogueItemSelection,
} from "../../types/project";
import { useStore } from "../../store/useStore";
import SorPicker from "../sor/SorPicker";
import MaterialPicker from "./MaterialPicker";
interface TemplateChoice {
  code: string;
  description?: string;
  unit?: string | null;
  side?: ItemSource;
  categoryKey?: string;
  dataVariant?: DataVariantSelection;
  morth?: MasterItem['morth'];
  sorCatalogue?: SorCatalogueItemSelection;
}
export default function UnifiedCodePicker({
  title = "Change item",
  hint,
  currentItem,
  onPick,
  onClose,
}: {
  title?: string;
  hint?: string;
  currentItem?: TemplateChoice;
  onPick: (item: MasterItem) => void;
  onClose: () => void;
}): JSX.Element {
  const year = useStore((state) => state.project?.meta.sorYear ?? "2026-27");
  const zone = useStore((state) => state.project?.meta.sorZone ?? "zone_3");
  const current: MasterItem | undefined = currentItem
    ? {
        side: currentItem.side==="MORTH"?"MORTH":
          currentItem.side === "SOR" || currentItem.code.startsWith("SOR-")
            ? "SOR"
            : "SSR",
        category:
          currentItem.categoryKey ??
          (currentItem.code.startsWith("SOR-") ? "SOR_Recipie" : "ssr_item"),
        code: currentItem.code,
        description: currentItem.description ?? currentItem.code,
        unit: currentItem.unit ?? null,
        morth: currentItem.morth,
        dataVariant: currentItem.dataVariant,
        sorCatalogue: currentItem.sorCatalogue,
      }
    : undefined;
  const [source, setSource] = useState<"SSR" | "SOR" | "MORTH">(current?.side ?? "SSR");
  const apply = (item: MasterItem): void => {
    onPick(item);
    onClose();
  };
  return (
    <div className="gw-picker canal-unified-code-picker">
      <div className="gw-picker-head">
        <div>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close item selector"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div
        className="backend-data-source-tabs"
        role="tablist"
        aria-label="Template item source"
      >
        <button
          role="tab"
          aria-selected={source === "SSR"}
          onClick={() => setSource("SSR")}
        >
          SSR DATA
        </button>
        <button role="tab" aria-selected={source==="MORTH"} onClick={()=>setSource("MORTH")}>MoRTH</button>
        <button
          role="tab"
          aria-selected={source === "SOR"}
          onClick={() => setSource("SOR")}
        >
          SOR items
        </button>
      </div>
      {source === "MORTH" ? <MorthPicker initial={current?.side==="MORTH"?current:undefined} onPick={apply}/> : source === "SOR" ? (
        <SorPicker
          year={year}
          zone={zone}
          mode="lite"
          initial={current?.side === "SOR" ? current.sorCatalogue : undefined}
          initialCode={current?.side === "SOR" ? current.code : undefined}
          onPick={apply}
        />
      ) : (
        <MaterialPicker
          key={`${year}:${current?.code ?? ""}`}
          initialItem={current?.side === "SSR" ? current : undefined}
          initialCategory={
            current?.code.startsWith("IRR-")
              ? current.code.split("-").slice(0, 2).join("-")
              : undefined
          }
          onPick={apply}
          onClose={onClose}
        />
      )}
    </div>
  );
}
