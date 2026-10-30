import MorthPicker from '../morth/MorthPicker'
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { sorTemplateCode, SOR_CATEGORY } from "../../lib/sorSource";
import { sorItemDescription } from "../../lib/sorPresentation";
import "./unifiedCodePicker.css";
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
  defaultSource = "SSR",
  anchorElement,
  onPick,
  onClose,
}: {
  title?: string;
  hint?: string;
  currentItem?: TemplateChoice;
  defaultSource?: "SSR" | "SOR" | "MORTH";
  anchorElement?: HTMLElement;
  onPick: (item: MasterItem) => void;
  onClose: () => void;
}): JSX.Element {
  const year = useStore((state) => state.project?.meta.sorYear ?? "2026-27");
  const zone = useStore((state) => state.project?.meta.sorZone ?? "zone_3");
  const sorCode = currentItem && sorTemplateCode(currentItem.code);
  const current: MasterItem | undefined = currentItem
    ? {
        side: currentItem.side==="MORTH"?"MORTH":
          currentItem.side === "SOR" || currentItem.sorCatalogue || sorCode
            ? "SOR"
            : "SSR",
        category: sorCode ? SOR_CATEGORY : (currentItem.categoryKey ?? "ssr_item"),
        code: sorCode ?? currentItem.code,
        description: currentItem.sorCatalogue
          ? sorItemDescription(currentItem.sorCatalogue.annual, currentItem.sorCatalogue.recipe)
          : (currentItem.description ?? currentItem.code),
        unit: currentItem.unit ?? null,
        morth: currentItem.morth,
        dataVariant: currentItem.dataVariant,
        sorCatalogue: currentItem.sorCatalogue,
      }
    : undefined;
  const [source, setSource] = useState<"SSR" | "SOR" | "MORTH">(current?.side ?? defaultSource);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [position, setPosition] = useState({ top: 12, left: 12, maxHeight: 650 });
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const place = (): void => {
      const gap = 12;
      const height = Math.min(650, window.innerHeight - gap * 2);
      const rect = anchorElement?.getBoundingClientRect();
      const width = element.offsetWidth;
      let top = gap;
      let left = Math.max(gap, (window.innerWidth - width) / 2);
      let maxHeight = height;
      if (rect) {
        const below = Math.max(0, window.innerHeight - rect.bottom - gap - 8);
        const above = Math.max(0, rect.top - gap - 8);
        const useBelow = below >= Math.min(height, 320) || below >= above;
        maxHeight = Math.min(height, useBelow ? below : above);
        top = useBelow ? rect.bottom + 8 : rect.top - 8 - Math.min(element.offsetHeight, maxHeight);
        left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
      }
      top = Math.max(gap, Math.min(top, window.innerHeight - maxHeight - gap));
      setPosition((previous) => previous.top === top && previous.left === left && previous.maxHeight === maxHeight
        ? previous : { top, left, maxHeight });
    };
    const scroll = (event: Event): void => {
      if (!(event.target instanceof Node) || !element.contains(event.target)) place();
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    if (anchorElement) observer.observe(anchorElement);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    element.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      if (anchorElement?.isConnected) anchorElement.focus({ preventScroll: true });
    };
  }, [anchorElement]);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Element && event.target.closest(".catalogue-hover-card")) return;
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchorElement?.contains(event.target)) onClose();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("pointerdown", outside);
    };
  }, [anchorElement, onClose]);
  const apply = (item: MasterItem): void => {
    onPick(item);
    onClose();
  };
  return createPortal(
    <div ref={panel} className="gw-picker canal-unified-code-picker" role="dialog" aria-labelledby={titleId} style={position}>
      <div className="gw-picker-head">
        <div>
          <strong id={titleId}>{title}</strong>
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
      <div className="unified-code-picker-content">
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
    </div>,
    document.body,
  );
}
