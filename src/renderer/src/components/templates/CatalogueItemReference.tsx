import { useEffect, useState } from "react";
import type { SorCatalogueItemSelection } from "../../types/project";
import type { SorDetail, SorZone } from "../../types/sor";
import { getSorDetail, sorReference, sorTemplateCode } from "../../lib/sorSource";
import { sorItemDescription } from "../../lib/sorPresentation";
import { useStore } from "../../store/useStore";
import SsrCode from "./SsrCode";
import "./catalogueItemReference.css";

function SorItemReference({ code, description, catalogue, year, zone }: {
  code: string;
  description?: string;
  catalogue?: SorCatalogueItemSelection;
  year: string;
  zone: SorZone;
}): JSX.Element {
  const [detail, setDetail] = useState<SorDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getSorDetail(code, year, zone, controller.signal).then((value) => {
      if (!controller.signal.aborted) setDetail(value);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [code, year, zone]);
  const saved = catalogue?.year === year ? catalogue : undefined;
  const annual = detail?.annual ?? saved?.annual;
  const recipe = detail?.recipe ?? saved?.recipe;
  const text = sorItemDescription(annual, recipe,
    !catalogue ? description : undefined) ||
    (failed ? "Choose an item from the current SOR." : "Loading published SOR description…");
  const reference = annual && recipe ? sorReference({ annual, recipe, year }) : `SOR · ${year}`;
  return <span className="catalogue-item-reference" title={`${text}\n${reference}`}>
    <b>{text}</b>
    <small>{reference}</small>
  </span>;
}
export default function CatalogueItemReference({
  code,
  description,
  catalogue,
  sorYear,
}: {
  code: string;
  description?: string;
  catalogue?: SorCatalogueItemSelection;
  sorYear: string;
}): JSX.Element {
  const zone = useStore((state) => state.project?.meta.sorZone ?? "zone_3");
  if (/^MORTH-/i.test(code)) return <b title={description}>{description || "MoRTH item"}</b>;
  const sorCode = sorTemplateCode(code) ?? catalogue?.recipeCode;
  if (sorCode) return <SorItemReference
    key={`${sorCode}:${sorYear}:${zone}`}
    code={sorCode}
    description={description}
    catalogue={catalogue}
    year={sorYear}
    zone={zone}
  />;
  return <SsrCode code={code} description={description} />;
}
