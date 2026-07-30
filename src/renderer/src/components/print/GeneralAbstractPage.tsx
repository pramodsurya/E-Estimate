import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { EestimateProject } from '../../types/project'
import type { AbstractLine, ProjectAbstract } from '../../lib/projectAbstract'
import {
  chooseSmartAbstractPlan,
  type AbstractDensity,
  type SmartAbstractCapacities,
  type SmartAbstractPlan,
  type SmartAbstractProfile,
  type SmartAbstractRow
} from '../../lib/smartAbstractPagination'
import SignatureFooterPrint from '../signature/SignatureFooterPrint'
import {
  PROJECT_SIGNATURE_SCOPE,
  resolveSignatureFooter
} from '../../lib/signatureFooter'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
const estimateMoney = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const DENSITIES: AbstractDensity[] = ['normal', 'compact', 'tight']

function estimatedRowHeight(line: AbstractLine, density: AbstractDensity): number {
  const densityFactor = density === 'normal' ? 1 : density === 'compact' ? 0.9 : 0.82
  const textLines = 1 + (line.basisNote ? 1 : 0) + Math.max(0, Math.ceil(line.label.length / 56) - 1)
  const summaryHeight = line.kind === 'grand' || line.kind === 'total' ? 34 : 0
  return Math.max(summaryHeight, (textLines * 19 + 11) * densityFactor)
}

function initialPlan(lines: AbstractLine[]): SmartAbstractPlan<AbstractLine> {
  const profiles: SmartAbstractProfile<AbstractLine>[] = DENSITIES.map((density) => ({
    density,
    rows: lines.map((line) => ({
      value: line,
      height: estimatedRowHeight(line, density),
      detail: line.kind !== 'total' && line.kind !== 'grand',
      keepWithPrevious: line.kind === 'total' || line.kind === 'grand'
    })),
    // Conservative first render. The hidden probes replace these values in a
    // layout effect before the preview is painted or serialised for PDF.
    capacities: {
      first: 690,
      continuation: 790,
      finalFirst: 560,
      finalContinuation: 660
    }
  }))
  return chooseSmartAbstractPlan(profiles)
}

function planSignature(plan: SmartAbstractPlan<AbstractLine>): string {
  return `${plan.density}:${plan.pages
    .map((page) => page.rows.map((row) => row.value.key).join(','))
    .join('|')}`
}

function AbstractTitle({ continuation }: { continuation: boolean }): JSX.Element {
  return (
    <div className="ga-sheet-title">
      <span>General Abstract{continuation ? ' — Continued' : ''}</span>
    </div>
  )
}

function WorkHeading({
  project,
  locationLine,
  continuation
}: {
  project: EestimateProject
  locationLine: string
  continuation: boolean
}): JSX.Element {
  return (
    <section className={`ga-sheet-work${continuation ? ' ga-sheet-work--continued' : ''}`}>
      <small>Name of Work</small>
      <h1>{project.meta.name || project.root.name}</h1>
      {!continuation && (
        <p>{locationLine || project.meta.location?.label || 'Project location'}</p>
      )}
    </section>
  )
}

function TableHead(): JSX.Element {
  return (
    <thead>
      <tr>
        <th>Sl. No.</th>
        <th>Description of Work / Provision</th>
        <th>Amount (Rs.)</th>
      </tr>
    </thead>
  )
}

function AbstractRow({
  line,
  measure
}: {
  line: AbstractLine
  measure?: boolean
}): JSX.Element {
  const isSummary = line.kind === 'total' || line.kind === 'grand'
  return (
    <tr
      className={`ga-row-${line.kind}`}
      data-ga-row-key={measure ? line.key : undefined}
    >
      {isSummary ? (
        <td colSpan={2} className="ga-summary-label">{line.label}</td>
      ) : (
        <>
          <td className="ga-sl">{line.slNo ?? ''}</td>
          <td className="ga-description">
            <span>{line.label}</span>
            {line.basisNote && <small>{line.basisNote}</small>}
          </td>
        </>
      )}
      <td className="ga-amount">
        {line.kind === 'grand'
          ? estimateMoney.format(line.amount)
          : money.format(line.amount)}
      </td>
    </tr>
  )
}

function AbstractTable({
  lines,
  measure = false
}: {
  lines: AbstractLine[]
  measure?: boolean
}): JSX.Element {
  return (
    <table className="ga-sheet-table">
      <colgroup>
        <col style={{ width: '11%' }} />
        <col style={{ width: '61%' }} />
        <col style={{ width: '28%' }} />
      </colgroup>
      <TableHead />
      <tbody>
        {lines.map((line) => <AbstractRow key={line.key} line={line} measure={measure} />)}
      </tbody>
    </table>
  )
}

function FinalBlock({
  project,
  abstract
}: {
  project: EestimateProject
  abstract: ProjectAbstract
}): JSX.Element {
  return (
    <div className="ga-sheet-final-block">
      <div className="ga-sheet-total">
        <span>Total Estimated Cost</span>
        <strong>₹ {estimateMoney.format(abstract.grandTotal)}</strong>
      </div>
      <SignatureFooterPrint
        settings={resolveSignatureFooter(project, PROJECT_SIGNATURE_SCOPE)}
      />
    </div>
  )
}

function ProbePage({
  project,
  abstract,
  locationLine,
  pageStyle,
  density,
  continuation,
  final
}: {
  project: EestimateProject
  abstract: ProjectAbstract
  locationLine: string
  pageStyle: CSSProperties
  density: AbstractDensity
  continuation: boolean
  final: boolean
}): JSX.Element {
  const capacity = final
    ? continuation ? 'final-continuation' : 'final-first'
    : continuation ? 'continuation' : 'first'
  return (
    <article
      className={`ga-sheet ga-sheet-probe ga-density-${density}`}
      style={pageStyle}
      data-ga-density={density}
      data-ga-capacity={capacity}
    >
      <div className="ga-sheet-frame">
        <AbstractTitle continuation={continuation} />
        <WorkHeading
          project={project}
          locationLine={locationLine}
          continuation={continuation}
        />
        <div className="ga-sheet-schedule">
          <AbstractTable lines={[]} />
        </div>
        {final && <FinalBlock project={project} abstract={abstract} />}
      </div>
    </article>
  )
}

/**
 * The General Abstract owns its page breaks. Hidden probes measure the actual
 * rows and the exact space left by each page's heading/final signature block.
 * Both View Print View and PDF export therefore receive the same settled,
 * already-paginated page DOM.
 */
export default function GeneralAbstractPage({
  project,
  abstract,
  pageStyle
}: {
  project: EestimateProject
  abstract: ProjectAbstract
  pageStyle: CSSProperties
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [plan, setPlan] = useState(() => initialPlan(abstract.lines))
  const signatureSettings = resolveSignatureFooter(project, PROJECT_SIGNATURE_SCOPE)
  const location = project.meta.areaAllowance
  const locationLine = [
    location?.village ? `${location.village} (V)` : null,
    location?.mandal ? `${location.mandal} (M)` : null,
    location?.district ? `${location.district} (D)` : null
  ]
    .filter(Boolean)
    .join(' · ')

  const measurementKey = useMemo(
    () => JSON.stringify({
      lines: abstract.lines.map((line) => [line.key, line.label, line.basisNote]),
      pageStyle,
      work: project.meta.name || project.root.name,
      locationLine,
      signatures: signatureSettings
    }),
    [abstract.lines, locationLine, pageStyle, project.meta.name, project.root.name, signatureSettings]
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const profiles: SmartAbstractProfile<AbstractLine>[] = []

    for (const density of DENSITIES) {
      const rowProbe = root.querySelector(
        `[data-ga-row-probe="${density}"]`
      )
      const rowHeights = new Map<string, number>()
      rowProbe?.querySelectorAll<HTMLElement>('tr[data-ga-row-key]').forEach((row) => {
        rowHeights.set(row.dataset.gaRowKey ?? '', row.getBoundingClientRect().height)
      })

      const capacityOf = (name: string): number => {
        const probe = root.querySelector(
          `[data-ga-density="${density}"][data-ga-capacity="${name}"]`
        )
        const schedule = probe?.querySelector('.ga-sheet-schedule')
        const heading = probe?.querySelector('.ga-sheet-table thead')
        if (!(schedule instanceof HTMLElement) || !(heading instanceof HTMLElement)) return 0
        // Two pixels absorb fractional mm/border rounding in Chromium.
        return Math.max(1, schedule.getBoundingClientRect().height - heading.getBoundingClientRect().height - 2)
      }

      const capacities: SmartAbstractCapacities = {
        first: capacityOf('first'),
        continuation: capacityOf('continuation'),
        finalFirst: capacityOf('final-first'),
        finalContinuation: capacityOf('final-continuation')
      }
      if (Object.values(capacities).some((value) => value <= 1)) continue
      profiles.push({
        density,
        rows: abstract.lines.map((line) => ({
          value: line,
          height: rowHeights.get(line.key) ?? estimatedRowHeight(line, density),
          detail: line.kind !== 'total' && line.kind !== 'grand',
          keepWithPrevious: line.kind === 'total' || line.kind === 'grand'
        })),
        capacities
      })
    }

    if (profiles.length === 0) return
    const next = chooseSmartAbstractPlan(profiles)
    setPlan((current) => planSignature(current) === planSignature(next) ? current : next)
  }, [abstract.lines, measurementKey])

  return (
    <div className="ga-sheet-pages" ref={rootRef}>
      {plan.pages.map((page, pageIndex) => (
        <article
          className={[
            'pp-page',
            'ga-sheet',
            `ga-density-${plan.density}`,
            page.isContinuation ? 'ga-sheet-page--continued' : 'ga-sheet-page--first',
            page.isFinal ? 'ga-sheet-page--final' : 'ga-sheet-page--flow'
          ].join(' ')}
          style={pageStyle}
          key={`${pageIndex}:${page.rows.map((row) => row.value.key).join(':')}`}
          data-ga-page={pageIndex + 1}
          data-ga-final={page.isFinal ? 'true' : 'false'}
        >
          <div className="ga-sheet-frame">
            <AbstractTitle continuation={page.isContinuation} />
            <WorkHeading
              project={project}
              locationLine={locationLine}
              continuation={page.isContinuation}
            />
            <div className="ga-sheet-schedule">
              <AbstractTable lines={page.rows.map((row) => row.value)} />
            </div>
            {page.isFinal && <FinalBlock project={project} abstract={abstract} />}
          </div>
        </article>
      ))}

      <div className="ga-sheet-probes" aria-hidden="true">
        {DENSITIES.flatMap((density) => [
          <ProbePage
            key={`${density}:first`}
            project={project}
            abstract={abstract}
            locationLine={locationLine}
            pageStyle={pageStyle}
            density={density}
            continuation={false}
            final={false}
          />,
          <ProbePage
            key={`${density}:continuation`}
            project={project}
            abstract={abstract}
            locationLine={locationLine}
            pageStyle={pageStyle}
            density={density}
            continuation
            final={false}
          />,
          <ProbePage
            key={`${density}:final-first`}
            project={project}
            abstract={abstract}
            locationLine={locationLine}
            pageStyle={pageStyle}
            density={density}
            continuation={false}
            final
          />,
          <ProbePage
            key={`${density}:final-continuation`}
            project={project}
            abstract={abstract}
            locationLine={locationLine}
            pageStyle={pageStyle}
            density={density}
            continuation
            final
          />,
          <article
            className={`ga-sheet ga-sheet-probe ga-sheet-row-probe ga-density-${density}`}
            style={pageStyle}
            data-ga-row-probe={density}
            key={`${density}:rows`}
          >
            <div className="ga-sheet-frame">
              <div className="ga-sheet-schedule">
                <AbstractTable lines={abstract.lines} measure />
              </div>
            </div>
          </article>
        ])}
      </div>
    </div>
  )
}
