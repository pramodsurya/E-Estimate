import type { SignatureFooterSettings } from '../../types/project'
import { printableSignatureRows } from '../../lib/signatureFooter'

export default function SignatureFooterPrint({
  settings,
  repeatEveryPage = false
}: {
  settings: SignatureFooterSettings
  repeatEveryPage?: boolean
}): JSX.Element | null {
  const rows = printableSignatureRows(settings)
  if (!settings.enabled || rows.length === 0) return null
  return (
    <section
      className={`signature-print-footer ${settings.placement}${repeatEveryPage ? ' repeat-every-page' : ''}`}
    >
      {rows.map((row) => (
        <div key={row.id}>
          <span />
          <strong>{row.designation}</strong>
          <small>{row.office}</small>
        </div>
      ))}
    </section>
  )
}
