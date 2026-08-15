/**
 * Carry a project's edits onto a newly published rate analysis.
 *
 * When the SOR year changes, an item that was never opened is simply re-fetched
 * and revalued. An item the estimator edited used to be frozen whole: the saved
 * recipe replaced the published one outright, so every row in it — including
 * rows nobody had touched — kept the old year's rate, while the sheet went on
 * printing the new year in its header.
 *
 * The rule this implements is per row and per field:
 *
 *   - a field the estimator edited keeps the edited value;
 *   - every other field on that row comes from the new year;
 *   - a row edited in both quantity and rate is left entirely alone;
 *   - a row the estimator added is theirs, and is carried across whole.
 *
 * So changing one rate no longer holds back the rest of the item. The rest of
 * the sheet revalues around the edit, and the item rate is recalculated from
 * the merged rows.
 *
 * `editedFields` already records exactly which cells were touched, and is
 * maintained by the DATA editor on every change. Nothing here needs to guess.
 */

import type {
  RateAnalysisLine,
  RateAnalysisRecipe,
  RateAnalysisSection
} from '../types/rateAnalysis'

/**
 * Every way a row can be recognised across two publications of the same item,
 * strongest first.
 *
 * The line `id` is `section-display_order-index`, so it moves the moment a row
 * is inserted, removed or reordered upstream — matching on it would quietly
 * land an edit on the wrong resource in exactly the case that matters most.
 * What a row *is* survives that.
 *
 * It is a list rather than one key because the strongest identity is not always
 * present on both sides. A resource whose rate resolved through the labour
 * table one year and as a literal the next has a code on one side only; with a
 * single key that row silently loses its edit, where a cascade still matches it
 * on description and unit. A bare code is also qualified by the rate table it
 * came from, so a labour "01" cannot be mistaken for a material "01".
 */
export function lineIdentityCandidates(line: RateAnalysisLine): string[] {
  const candidates: string[] = []
  // The extractor's own name for the row, where it has supplied one. This is
  // data rather than inference, so it outranks everything below it.
  const published = line.resourceIdentity
  if (published?.sourceTable && published.masterCode) {
    const master = `${published.sourceTable}:${published.masterCode}`.toLowerCase()
    // One master can serve several lines of an item — a mason at day and at
    // night rates. The component is what separates them, so it is part of the
    // name rather than an extra name: keeping the bare master as a fallback
    // would let the day row answer to the night row's edit, which is the
    // collision the component exists to prevent. Where only one side names a
    // component the two fall through to description and unit instead.
    candidates.push(
      published.rateComponent
        ? `identity:${master}:${published.rateComponent.toLowerCase()}`
        : `identity:${master}`
    )
  }
  if (published?.resourceKey) {
    candidates.push(`identity:key:${published.resourceKey.trim().toLowerCase()}`)
  }
  const code = line.resourceCode?.trim().toLowerCase()
  const table = line.rateSource?.split('.')[0]?.trim().toLowerCase()
  if (code) {
    // Qualified *or* bare, never both: keeping the bare key as a fallback would
    // hand a labour "01" the edit belonging to a material "01", which is the
    // collision qualifying it exists to prevent. When only one side names a
    // table the two fall through to description and unit instead, which is
    // right — a code alone is not evidence they are the same resource.
    candidates.push(table ? `resource:${table}:${code}` : `resource:${code}`)
  }
  const material = line.materialCode?.trim().toLowerCase()
  if (material) candidates.push(`material:${material}`)
  const description = line.description.trim().toLowerCase().replace(/\s+/g, ' ')
  candidates.push(`text:${description}|${line.unit.trim().toLowerCase()}`)
  return candidates
}

/** The strongest single name for a row — what a removal is recorded under. */
export function lineIdentity(line: RateAnalysisLine): string {
  return lineIdentityCandidates(line)[0]
}

/**
 * One published row, wearing whichever cells the estimator changed.
 *
 * Everything not listed in `editedFields` — including `sourceValues`, the
 * published figures kept for the audit trail — comes from the new year, so the
 * sheet shows what was actually published this year underneath the edit.
 */
function mergeLine(source: RateAnalysisLine, saved: RateAnalysisLine): RateAnalysisLine {
  const edited = saved.editedFields ?? []
  const merged: RateAnalysisLine = { ...source }
  for (const field of edited) {
    // A rate written by the Cement/Steel page is marked edited but carries a
    // `rateOverride`, and `materialRates.ts` uses exactly that pair to tell a
    // global application from a hand-typed rate. Holding it here would pin the
    // project to the material rate that was current when the sheet was last
    // opened, instead of the one it is being re-priced against now.
    if (field === 'rate' && saved.rateOverride) continue
    switch (field) {
      case 'sl_no':
        merged.slNo = saved.slNo
        break
      case 'description':
        merged.description = saved.description
        break
      case 'unit':
        merged.unit = saved.unit
        break
      case 'quantity':
        merged.quantity = saved.quantity
        break
      case 'rate':
        merged.rate = saved.rate
        break
      case 'amount':
        merged.amount = saved.amount
        break
    }
  }
  if (edited.length > 0) merged.editedFields = [...edited]
  // Lead and Seigniorage flags are estimator decisions about the row, not
  // published data, so they survive a revaluation like an edited cell does.
  if (saved.lead !== undefined) merged.lead = saved.lead
  if (saved.seigniorageApplicable !== undefined) {
    merged.seigniorageApplicable = saved.seigniorageApplicable
  }
  if (saved.seigniorageCode !== undefined) merged.seigniorageCode = saved.seigniorageCode
  return merged
}

/**
 * Merge one section's rows.
 *
 * The published order is the order of the result. Rows the estimator added have
 * no published counterpart, so each is re-inserted after whichever published
 * row it followed when it was saved — a row added under "cement" stays under
 * cement rather than falling to the bottom of the section.
 */
/** An edit the new schedule could not be given confidently. */
export interface UnresolvedEdit {
  /** Stable name for this warning, so dismissing it sticks across a re-merge. */
  key: string
  sectionKey: string
  description: string
  unit: string
  editedFields: string[]
  /**
   * The row as the estimator left it. A dropped edit has nowhere to go back to,
   * so putting it back means re-inserting this row — the values are needed for
   * the sheet to offer that rather than only an apology.
   */
  saved?: RateAnalysisLine
  /**
   * `dropped` — nothing in the new schedule answers to this row, so the edit is
   * gone. `weak-match` — it was carried, but only on the wording of the
   * description, which two different resources can share.
   */
  reason: 'dropped' | 'weak-match' | 'section-withdrawn'
}

/** True when the estimator owns something on this row that a merge could lose. */
function hasEstimatorEdit(line: RateAnalysisLine): boolean {
  if (line.userAdded) return false
  const edited = line.editedFields ?? []
  // A rate written by the Cement/Steel page is re-applied from the project, not
  // carried, so losing its marking costs nothing.
  if (edited.length === 1 && edited[0] === 'rate' && line.rateOverride) return false
  return edited.length > 0
}

function mergeSectionLines(
  sourceLines: RateAnalysisLine[],
  savedLines: RateAnalysisLine[],
  removed: ReadonlySet<string>
): { lines: RateAnalysisLine[]; unresolved: Omit<UnresolvedEdit, 'sectionKey'>[] } {
  // Each saved row is filed under every name it answers to, so a source row can
  // find it by whichever identity the two have in common. Duplicates (the same
  // material twice at different rates) are matched in order.
  const savedByIdentity = new Map<string, RateAnalysisLine[]>()
  const savedIdentities = new Set<string>()
  for (const line of savedLines) {
    if (line.userAdded) continue
    for (const identity of lineIdentityCandidates(line)) {
      savedIdentities.add(identity)
      const queue = savedByIdentity.get(identity)
      if (queue) queue.push(line)
      else savedByIdentity.set(identity, [line])
    }
  }

  const consumed = new Set<RateAnalysisLine>()
  const mergedForSaved = new Map<RateAnalysisLine, RateAnalysisLine>()
  /** How a saved row was found: 0 is the published identity, last is wording. */
  const matchedBy = new Map<RateAnalysisLine, number>()
  const takeSaved = (
    candidates: string[]
  ): RateAnalysisLine | undefined => {
    for (const [rank, identity] of candidates.entries()) {
      const queue = savedByIdentity.get(identity)
      if (!queue) continue
      // A row filed under several names may already have been taken by a
      // stronger match on an earlier source row.
      while (queue.length > 0) {
        const candidate = queue.shift() as RateAnalysisLine
        if (consumed.has(candidate)) continue
        matchedBy.set(candidate, rank)
        return candidate
      }
    }
    return undefined
  }

  const merged = sourceLines.flatMap((sourceLine) => {
    const candidates = lineIdentityCandidates(sourceLine)
    // A removal only suppresses a row the saved sheet no longer carries, so
    // adding the resource back is enough to undo it.
    const wasRemoved =
      candidates.some((identity) => removed.has(identity)) &&
      !candidates.some((identity) => savedIdentities.has(identity))
    if (wasRemoved) return []
    const saved = takeSaved(candidates)
    if (!saved) return [{ ...sourceLine }]
    consumed.add(saved)
    const line = mergeLine(sourceLine, saved)
    mergedForSaved.set(saved, line)
    return [line]
  })

  // Anchor each added row to the published row it followed. The anchor is the
  // merged row object itself, not a name: the two sides can be matched on
  // different candidates, so their strongest names need not agree.
  const addedAfter = new Map<RateAnalysisLine, RateAnalysisLine[]>()
  const addedFirst: RateAnalysisLine[] = []
  let anchor: RateAnalysisLine | null = null
  for (const line of savedLines) {
    if (!line.userAdded) {
      const mergedLine = mergedForSaved.get(line)
      if (mergedLine) anchor = mergedLine
      continue
    }
    if (anchor === null) {
      addedFirst.push(line)
      continue
    }
    const queue = addedAfter.get(anchor)
    if (queue) queue.push(line)
    else addedAfter.set(anchor, [line])
  }

  const result: RateAnalysisLine[] = [...addedFirst]
  for (const line of merged) {
    result.push(line)
    const added = addedAfter.get(line)
    if (added) {
      result.push(...added)
      addedAfter.delete(line)
    }
  }
  // An anchor that no longer exists this year must not take its rows with it.
  for (const remaining of addedAfter.values()) result.push(...remaining)

  const unresolved: Omit<UnresolvedEdit, 'sectionKey'>[] = []
  const weakestRank = (line: RateAnalysisLine): number =>
    lineIdentityCandidates(line).length - 1
  for (const line of savedLines) {
    if (!hasEstimatorEdit(line)) continue
    const entry = {
      key: lineIdentity(line),
      description: line.description,
      unit: line.unit,
      editedFields: [...(line.editedFields ?? [])],
      saved: line
    }
    if (!consumed.has(line)) {
      // Removed on purpose is not the same as lost.
      const wasRemoved = lineIdentityCandidates(line).some((name) => removed.has(name))
      if (!wasRemoved) unresolved.push({ ...entry, reason: 'dropped' })
      continue
    }
    // The last candidate is description-and-unit — carried, but not proven.
    if (matchedBy.get(line) === weakestRank(line)) {
      unresolved.push({ ...entry, reason: 'weak-match' })
    }
  }
  return { lines: result, unresolved }
}

/**
 * Published sections wearing the estimator's edits.
 *
 * Sections come from the new year: one added upstream this year appears, and
 * one withdrawn disappears. Only the rows within them carry edits across.
 */
export function mergeRecipeSections(
  sourceSections: RateAnalysisSection[],
  savedSections: RateAnalysisSection[],
  removedLines: readonly string[] = []
): RateAnalysisSection[] {
  return mergeRecipeSectionsWithReport(sourceSections, savedSections, removedLines).sections
}

/**
 * The merge, with what it could not do confidently.
 *
 * Silence is the danger here. An edit that finds no row in the new schedule is
 * simply gone, and one matched on wording alone may have landed on a different
 * resource that happens to read the same — neither shows up in a total. The
 * report names both so the sheet can say so against the row.
 */
export function mergeRecipeSectionsWithReport(
  sourceSections: RateAnalysisSection[],
  savedSections: RateAnalysisSection[],
  removedLines: readonly string[] = []
): { sections: RateAnalysisSection[]; unresolved: UnresolvedEdit[] } {
  const savedByKey = new Map(savedSections.map((section) => [section.key, section]))
  const removed = new Set(removedLines)
  const unresolved: UnresolvedEdit[] = []
  const sections = sourceSections.map((section) => {
    const saved = savedByKey.get(section.key)
    if (!saved) return section
    const merged = mergeSectionLines(section.lines, saved.lines, removed)
    unresolved.push(...merged.unresolved.map((entry) => ({ ...entry, sectionKey: section.key })))
    return { ...section, lines: merged.lines }
  })
  // A section the estimator edited that this year no longer publishes takes its
  // edits with it, and that has to be said too.
  for (const saved of savedSections) {
    if (sourceSections.some((section) => section.key === saved.key)) continue
    for (const line of saved.lines) {
      if (!hasEstimatorEdit(line)) continue
      unresolved.push({
        key: lineIdentity(line),
        sectionKey: saved.key,
        description: line.description,
        unit: line.unit,
        editedFields: [...(line.editedFields ?? [])],
        saved: line,
        reason: 'section-withdrawn'
      })
    }
  }
  return { sections, unresolved }
}

/**
 * The published recipe for the current year, wearing this project's edits.
 *
 * Published identity — the year, the zone, the layout, the source figures and
 * the published rate — always comes from `source`. Anything the estimator owns
 * comes from `saved`, per row and per field.
 */
export function mergeSavedRecipe(
  source: RateAnalysisRecipe,
  saved: RateAnalysisRecipe
): RateAnalysisRecipe {
  const merged = mergeRecipeSectionsWithReport(
    source.sections,
    saved.sections,
    saved.removedLines
  )
  return {
    ...source,
    ...saved,
    // Published identity is never inherited from an older edit.
    year: source.year,
    zone: source.zone,
    layout: source.layout,
    sourceFigures: source.sourceFigures,
    publishedRateBlocks: source.publishedRateBlocks,
    publishedRate: source.publishedRate,
    publishedRateText: source.publishedRateText,
    multiRateClassification: source.multiRateClassification,
    dataVariant: source.dataVariant,
    areaAllowancePercent: source.areaAllowancePercent,
    areaAllowanceLabel: source.areaAllowanceLabel,
    sections: merged.sections,
    acknowledgedEdits: saved.acknowledgedEdits,
    // Carried on the recipe so the DATA sheet can say, against the row, that an
    // edit did not survive the change of schedule. An empty list clears a
    // warning left by a previous year.
    unresolvedEdits: (() => {
      const dismissed = new Set(saved.acknowledgedEdits ?? [])
      const open = merged.unresolved.filter((entry) => !dismissed.has(entry.key))
      return open.length > 0 ? open : undefined
    })()
  }
}
