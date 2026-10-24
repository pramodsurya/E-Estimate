import type { SorCatalogueItemSelection } from "../../types/project";
import { sorReference } from "../../lib/sorSource";
import SsrCode from "./SsrCode";
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
  if (/^MORTH-/i.test(code)) return <b title={description}>{description || "MoRTH item"}</b>;
  if (!catalogue) {
    if (/^SOR-/i.test(code))
      return <b title={description}>{description || "SOR item"}</b>;
    return <SsrCode code={code} description={description} />;
  }
  const label = sorReference(catalogue);
  return (
    <b
      className="ssr-code-hover"
      title={[
        label,
        description,
        catalogue.year !== sorYear
          ? "Refresh for the project edition"
          : undefined,
      ]
        .filter(Boolean)
        .join("\n")}
    >
      {label}
    </b>
  );
}
