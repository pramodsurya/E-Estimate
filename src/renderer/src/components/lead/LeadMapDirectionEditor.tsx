import { PenLine, Plus, Route, Trash2 } from 'lucide-react'
import { newId } from '../../lib/tree'
import type {
  LeadAssignment,
  LeadMapCoordinate,
  LeadMapDirection,
  LeadPoint,
  LeadVariant,
  ProjectLocation
} from '../../types/project'

export interface LeadMapDirectionDraft {
  id?: string
  label: string
  variantId: string
  color: string
  points: LeadMapCoordinate[]
}

interface LeadSelectablePoint extends LeadPoint {
  deletable?: boolean
}

interface Props {
  variants: LeadVariant[]
  assignments: LeadAssignment[]
  directions: LeadMapDirection[]
  points: LeadSelectablePoint[]
  site: ProjectLocation | null
  draft: LeadMapDirectionDraft
  drawing: boolean
  onDraftChange: (draft: LeadMapDirectionDraft) => void
  onDrawingChange: (drawing: boolean) => void
  onSave: (direction: LeadMapDirection) => void
  onDelete: (directionId: string) => void
}

const DEFAULT_DIRECTION_COLOR = '#0e639c'

export function blankLeadMapDirectionDraft(variant?: LeadVariant | null): LeadMapDirectionDraft {
  return {
    label: variant ? defaultDirectionLabel(variant) : 'Lead direction',
    variantId: variant?.id ?? '',
    color: DEFAULT_DIRECTION_COLOR,
    points: []
  }
}

export function draftFromLeadMapDirection(direction: LeadMapDirection): LeadMapDirectionDraft {
  return {
    id: direction.id,
    label: direction.label,
    variantId: direction.variantId ?? '',
    color: direction.color || DEFAULT_DIRECTION_COLOR,
    points: direction.points ?? []
  }
}

export function leadMapDirectionFromDraft(draft: LeadMapDirectionDraft): LeadMapDirection {
  const now = new Date().toISOString()
  return {
    id: draft.id ?? newId(),
    label: draft.label.trim() || 'Lead direction',
    variantId: draft.variantId || undefined,
    color: draft.color || DEFAULT_DIRECTION_COLOR,
    points: draft.points,
    active: true,
    createdAt: draft.id ? now : now,
    updatedAt: now
  }
}

export default function LeadMapDirectionEditor({
  variants,
  assignments,
  directions,
  points,
  site,
  draft,
  drawing,
  onDraftChange,
  onDrawingChange,
  onSave,
  onDelete
}: Props): JSX.Element {
  const canSave = draft.points.length >= 2 && draft.label.trim().length > 0

  const loadDirection = (directionId: string): void => {
    const direction = directions.find((candidate) => candidate.id === directionId)
    if (!direction) {
      onDraftChange(blankLeadMapDirectionDraft(variants[0]))
      onDrawingChange(false)
      return
    }
    onDraftChange(draftFromLeadMapDirection(direction))
    onDrawingChange(false)
  }

  const seedFromVariant = (): void => {
    const variant = variants.find((candidate) => candidate.id === draft.variantId)
    if (!variant) return
    const seeded = routePointsForVariant(variant, assignments, points, site)
    if (!seeded) return
    onDraftChange({
      ...draft,
      label: draft.label.trim() || defaultDirectionLabel(variant),
      points: seeded
    })
  }

  return (
    <div className="lead-map-editor">
      <div className="lead-form-grid">
        <label className="span-2">
          Direction
          <select
            className="select-input"
            value={draft.id ?? ''}
            onChange={(event) => loadDirection(event.target.value)}
          >
            <option value="">New direction</option>
            {directions.map((direction) => (
              <option key={direction.id} value={direction.id}>
                {direction.label}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Label
          <input
            className="text-input"
            value={draft.label}
            onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
          />
        </label>
        <label>
          Variant link
          <select
            className="select-input"
            value={draft.variantId}
            onChange={(event) => {
              const variant = variants.find((candidate) => candidate.id === event.target.value)
              onDraftChange({
                ...draft,
                variantId: event.target.value,
                label:
                  draft.label === 'Lead direction' && variant
                    ? defaultDirectionLabel(variant)
                    : draft.label
              })
            }}
          >
            <option value="">Manual direction</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {defaultDirectionLabel(variant)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Color
          <input
            className="text-input"
            type="color"
            value={draft.color}
            onChange={(event) => onDraftChange({ ...draft, color: event.target.value })}
          />
        </label>
      </div>
      <div className="lead-map-editor-actions">
        <button
          className={`btn ${drawing ? '' : 'ghost'}`}
          type="button"
          onClick={() => onDrawingChange(!drawing)}
        >
          <PenLine size={14} /> {drawing ? 'Stop Line Tool' : 'Line Tool'}
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={!draft.variantId}
          onClick={seedFromVariant}
        >
          <Route size={14} /> Use Variant Line
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => onDraftChange({ ...draft, points: draft.points.slice(0, -1) })}
          disabled={draft.points.length === 0}
        >
          Undo Point
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => onDraftChange({ ...draft, points: [] })}
          disabled={draft.points.length === 0}
        >
          Clear
        </button>
        <button
          className="btn"
          type="button"
          disabled={!canSave}
          onClick={() => onSave(leadMapDirectionFromDraft(draft))}
        >
          <Plus size={14} /> Save Direction
        </button>
        {draft.id && (
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              onDelete(draft.id!)
              onDraftChange(blankLeadMapDirectionDraft(variants[0]))
              onDrawingChange(false)
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
      <div className="lead-map-editor-status">
        {drawing
          ? 'Line tool is active. Click the map to add direction points in order.'
          : `${draft.points.length} direction point${draft.points.length === 1 ? '' : 's'} set.`}
      </div>
    </div>
  )
}

function routePointsForVariant(
  variant: LeadVariant,
  assignments: LeadAssignment[],
  points: LeadSelectablePoint[],
  site: ProjectLocation | null
): LeadMapCoordinate[] | null {
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const assignment = variant.assignmentId
    ? assignments.find((candidate) => candidate.id === variant.assignmentId)
    : null
  const start =
    (variant.startPointId ? pointsById.get(variant.startPointId) : null) ??
    (assignment ? pointsById.get(assignment.pointId) : null) ??
    sitePoint(site)
  const end = (variant.endPointId ? pointsById.get(variant.endPointId) : null) ?? sitePoint(site)
  if (!start || !end) return null
  return [
    { lat: start.lat, lon: pointLon(start) },
    { lat: end.lat, lon: pointLon(end) }
  ]
}

function sitePoint(site: ProjectLocation | null): (ProjectLocation & { lon?: number }) | null {
  return site ? { ...site, lon: site.lng } : null
}

function pointLon(point: LeadSelectablePoint | (ProjectLocation & { lon?: number })): number {
  return typeof point.lon === 'number' ? point.lon : (point as ProjectLocation).lng
}

function defaultDirectionLabel(variant: LeadVariant): string {
  const lead = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  }).format(variant.leadKm)
  return `${variant.variantName || variant.materialName} - ${lead} km`
}
