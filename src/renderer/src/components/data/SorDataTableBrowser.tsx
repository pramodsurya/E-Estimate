import SorPicker from "../sor/SorPicker";
import type { MasterItem } from "../../lib/masterData";
import type { SorZone } from "../../types/project";
export default function SorDataTableBrowser({
  sorYear,
  zone,
  onInspect,
}: {
  sorYear: string;
  zone: SorZone;
  onInspect: (item: MasterItem) => void;
}): JSX.Element {
  return (
    <section className="sor-data-table-browser" data-tour="sor-catalogue">
      <SorPicker year={sorYear} zone={zone} mode="inspect" onPick={onInspect} />
    </section>
  );
}
