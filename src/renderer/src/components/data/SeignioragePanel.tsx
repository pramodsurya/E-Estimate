import { useMemo, useState } from 'react'
import { CircleDot, Gem, Search } from 'lucide-react'
import {
  computeSeigniorageTable,
  type SeigniorageCharge,
  type SeigniorageItemRow
} from '../../lib/seigniorage'
import type { SeigniorageApplicabilityPolicy } from '../../types/rateAnalysis'
import { useStore } from '../../store/useStore'
import { dashboardContextMatches } from '../../lib/dashboardSync'

const money = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

interface SeigniorageMaterialGroup {
  key: string
  label: string
  rows: SeigniorageItemRow[]
  seigCode: string | null
  total: number
}

export default function SeignioragePanel(): JSX.Element {
  const selection = useStore((state) => state.seigniorageSelection)
  const openSeigniorage = useStore((state) => state.openSeigniorage)
  const project = useStore((state) => state.project)
  const [query, setQuery] = useState('')
  const snapshotValid = project
    ? dashboardContextMatches(project.dashboardSnapshot, project)
    : false
  const charges: SeigniorageCharge[] = snapshotValid
    ? project?.dashboardSnapshot?.seigniorageCharges ?? []
    : []
  const policyByCode: Record<string, SeigniorageApplicabilityPolicy> = snapshotValid
    ? project?.dashboardSnapshot?.seignioragePolicies ?? {}
    : {}

  const materialGroups = useMemo(
    () => groupSeigniorageMaterials(computeSeigniorageTable(project, charges, [], policyByCode).rows),
    [charges, policyByCode, project]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return materialGroups
    return materialGroups.filter((group) =>
      [group.key, group.label, group.seigCode, ...group.rows.map((row) => row.recipeMaterialDesc)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    )
  }, [materialGroups, query])

  return (
    <div className="seig-panel">
      <div className="lead-abstract-title">
        <strong>Seigniorage</strong>
        <span>{materialGroups.length}</span>
      </div>

      <label className="seig-search">
        <Search size={12} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search material..."
        />
      </label>

      {filtered.length === 0 ? (
        <div className="lead-panel-empty">
          {snapshotValid
            ? 'No seigniorage materials found in DATA.'
            : 'Sync the total Seigniorage or Project Dashboard to populate materials.'}
        </div>
      ) : null}

      <div className="seig-list">
        {filtered.map((group) => {
          const selected = selection?.materialKey === group.key
          return (
            <button
              className={`seig-row ${selected ? 'selected' : ''}`}
              key={group.key}
              onClick={() => openSeigniorage({ seigCode: group.seigCode, materialKey: group.key })}
              title={group.label}
            >
              <CircleDot size={12} />
              <span>
                <strong>{group.label}</strong>
                <small>{group.rows.length} DATA row(s)</small>
              </span>
              <b>Rs. {money.format(group.total)}</b>
            </button>
          )
        })}
      </div>

      <button className="seig-open-all" onClick={() => openSeigniorage()}>
        <Gem size={12} />
        Open full table
      </button>
    </div>
  )
}

function groupSeigniorageMaterials(rows: SeigniorageItemRow[]): SeigniorageMaterialGroup[] {
  const groups = new Map<string, SeigniorageMaterialGroup>()
  for (const row of rows) {
    if (!row.materialKey && !row.charge && row.seigRate === null) continue
    const key = row.materialKey || row.materialLabel || row.charge?.seig_code || 'UNASSIGNED'
    const label = row.materialLabel || row.charge?.mineral_name || 'Unassigned'
    const group =
      groups.get(key) ??
      {
        key,
        label,
        rows: [],
        seigCode: row.charge?.seig_code ?? null,
        total: 0
      }
    group.rows.push(row)
    if (!group.seigCode && row.charge?.seig_code) group.seigCode = row.charge.seig_code
    group.total += (row.seigniorage ?? 0) + (row.dmft ?? 0) + (row.smft ?? 0)
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
}
