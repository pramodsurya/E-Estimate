import { Check, Gauge, Tags } from 'lucide-react'
import type { DataVariantSelection } from '../../types/project'
import type { DataVariantOption, DataVariantSpec } from '../../lib/dataVariants'

export function selectionForVariantOption(
  spec: DataVariantSpec,
  option: DataVariantOption
): DataVariantSelection {
  return {
    kind: spec.kind as DataVariantSelection['kind'],
    key: option.key,
    label: option.label,
    sourceYear: spec.year,
    unit: option.basisUnit,
    addonId: option.addonId
  }
}

export function defaultSelectionForVariantSpec(
  spec: DataVariantSpec
): DataVariantSelection | undefined {
  const option = spec.options.find((candidate) => candidate.key === spec.defaultOptionKey)
  return option ? selectionForVariantOption(spec, option) : undefined
}

export default function DataVariantReview({
  specs,
  selections,
  onSelect,
  heading = 'Prepare multi-rate DATA'
}: {
  specs: Record<string, DataVariantSpec>
  selections: Record<string, DataVariantSelection>
  onSelect: (code: string, spec: DataVariantSpec, option: DataVariantOption) => void
  heading?: string
}): JSX.Element {
  const money = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

  return (
    <div className="data-variant-review">
      <div className="data-variant-review-heading">
        <span className="data-variant-heading-icon">
          <Tags size={20} />
        </span>
        <div>
          <h3>{heading}</h3>
          <p>
            Published rates are classified by purpose. Choose the applicable class, depth band,
            or optional addition.
          </p>
        </div>
      </div>
      <div className="data-variant-cards">
        {Object.values(specs).map((spec) => (
          <section className="data-variant-card" key={spec.code}>
            <div className="data-variant-card-title">
              <span>
                {spec.kind === 'quantity_band' || spec.kind === 'upto' ? (
                  <Gauge size={17} />
                ) : (
                  <Tags size={17} />
                )}
              </span>
              <div>
                <strong>{spec.code}</strong>
                <small>
                  {spec.kind === 'optional_addition'
                    ? 'Optional addition · base DATA remains valid without it'
                    : spec.kind === 'quantity_band' || spec.kind === 'upto'
                      ? 'Quantity / depth band · split quantity by interval'
                      : 'Published type choice · one applicable basis'}
                </small>
              </div>
            </div>
            {spec.description ? (
              <p className="data-variant-description" title={spec.description}>
                {spec.description}
              </p>
            ) : null}
            <p>{spec.prompt}</p>
            <div className="data-variant-options">
              {spec.options.map((option) => {
                const checked = selections[spec.code]?.key === option.key
                return (
                  <button
                    type="button"
                    key={option.key}
                    className={checked ? 'selected' : ''}
                    onClick={() => onSelect(spec.code, spec, option)}
                  >
                    <span className="data-variant-radio">
                      {checked ? <Check size={13} /> : null}
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      {option.basisQuantity ? (
                        <small>
                          Basis: {option.basisQuantity} {option.basisUnit ?? ''}
                        </small>
                      ) : null}
                    </span>
                    <b>₹ {money.format(option.rate)}</b>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
