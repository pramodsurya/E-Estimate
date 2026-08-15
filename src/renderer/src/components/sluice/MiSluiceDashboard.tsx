import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Settings2, Waves } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type {
  MiSluiceMaterialRole,
  MiSluiceNewData,
  ProjectNode
} from '../../types/project'
import {
  MI_SLUICE_DEFAULT_CODES,
  crownCover,
  hydraulicCapacity,
  miSluiceIssues,
  miSluiceQuantityGroups,
  miSluiceRoleLabel,
  openingArea,
  openingCrownLevel,
  openingLabel
} from '../../lib/miSluiceNew'
import { resolveNodeSettings } from '../../lib/nodeSettings'
import MaterialPicker from '../templates/MaterialPicker'
import SsrCode from '../templates/SsrCode'
import TemplateDefaultVariantButton from '../templates/TemplateDefaultVariantButton'
import MiSluiceSectionDiagram from './MiSluiceSectionDiagram'
import NumberField from './NumberField'

const qty3 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

interface Props {
  node: ProjectNode
  data: MiSluiceNewData
  onEditSetup: (step: 1 | 2) => void
}

const CIVIL_ROLES: MiSluiceMaterialRole[] = ['excavation', 'pcc', 'rcc', 'reinforcement']
const MECHANICAL_ROLES: MiSluiceMaterialRole[] = [
  'embedded',
  'gate',
  'hoist',
  'embedded-paint',
  'gate-paint',
  'hoist-paint'
]

/** The nested geometry blocks the dashboard edits field by field. */
type MiSluiceBlockKey =
  | 'levels'
  | 'hydraulic'
  | 'opening'
  | 'barrel'
  | 'excavation'
  | 'pcc'
  | 'intake'
  | 'downstreamHeadwall'
  | 'wingWalls'
  | 'returnWalls'
  | 'cutoffWalls'
  | 'stillingBasin'
  | 'mechanical'

/** SSR subject the role's default code lives in, so the picker opens there. */
function categoryForRole(role: MiSluiceMaterialRole): string {
  return MI_SLUICE_DEFAULT_CODES[role].split('-').slice(0, 2).join('-')
}

export default function MiSluiceDashboard({ node, data, onEditSetup }: Props): JSX.Element {
  const setMiSluiceNew = useStore((s) => s.setMiSluiceNew)
  const setMiSluiceNewMaterial = useStore((s) => s.setMiSluiceNewMaterial)
  const project = useStore((s) => s.project)
  const fontScale =
    (project ? resolveNodeSettings(project.root, node.id).reportFontPercent : 100) / 100

  const [picker, setPicker] = useState<MiSluiceMaterialRole | null>(null)

  const issues = useMemo(() => miSluiceIssues(data), [data])
  const groups = useMemo(() => miSluiceQuantityGroups(data), [data])
  const capacity = hydraulicCapacity(data)

  const update = (patch: Partial<MiSluiceNewData>): void =>
    setMiSluiceNew(node.id, { ...data, ...patch })

  /** Patch one nested block (barrel, wingWalls, …) without touching the rest. */
  const updateBlock = <K extends MiSluiceBlockKey>(
    key: K,
    patch: Partial<MiSluiceNewData[K]>
  ): void =>
    update({ [key]: { ...data[key], ...patch } } as unknown as Partial<MiSluiceNewData>)

  const materialCard = (role: MiSluiceMaterialRole): JSX.Element => {
    const ref = data.materials[role]
    const group = groups.find((entry) => entry.role === role)
    return (
      <div key={role} className="gw-material-card">
        <div className="gw-panel-label">{miSluiceRoleLabel(role)}</div>
        {ref ? (
          <>
            <SsrCode code={ref.code} description={ref.description} className="gw-material-code" />
            <small>
              {ref.unit ? `${ref.unit} · ` : ''}
              {group ? `${qty3.format(group.total)} ${group.unit.toLowerCase()}` : 'no quantity yet'}
            </small>
            <TemplateDefaultVariantButton
              ownerId={node.id}
              code={ref.code}
              defaultCode={MI_SLUICE_DEFAULT_CODES[role]}
              selection={ref.dataVariant}
            />
          </>
        ) : (
          <small>No code attached — this quantity stays in the dashboard only.</small>
        )}
        <button className="btn ghost" onClick={() => setPicker(role)}>
          <Pencil size={13} /> {ref ? 'Change code' : 'Attach code'}
        </button>
        {picker === role && (
          <MaterialPicker
            initialCategory={categoryForRole(role)}
            onClose={() => setPicker(null)}
            onPick={(item) => {
              setMiSluiceNewMaterial(node.id, role, item)
              setPicker(null)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="gw-dashboard mis-dashboard" style={{ '--gw-font': fontScale } as React.CSSProperties}>
      <div className="gw-toolbar">
        <span className="component-section-label">
          <Waves size={15} /> New MI tank sluice
        </span>
        <span className="gw-badge">
          {data.intakeType === 'tower' ? 'Intake tower' : 'Headwall'} · {openingLabel(data)}
        </span>
        <span className="gw-badge">
          {capacity.toFixed(3)} m³/s available vs {data.hydraulic.designDischarge.toFixed(3)} required
        </span>
        <button className="btn ghost" onClick={() => onEditSetup(1)}>
          <Settings2 size={14} /> Edit setup
        </button>
      </div>

      {issues.length > 0 && (
        <div className="mis-issues">
          {issues.map((issue, index) => (
            <div key={index} className={`mis-issue is-${issue.kind}`}>
              <AlertTriangle size={13} /> {issue.message}
            </div>
          ))}
        </div>
      )}

      <MiSluiceSectionDiagram data={data} />

      <section className="gw-panel">
        <div className="gw-panel-label">Hydraulic check</div>
        <div className="mis-grid">
          <NumberField
            label="Design discharge"
            suffix="m³/s"
            value={data.hydraulic.designDischarge}
            onChange={(designDischarge) => updateBlock('hydraulic', { designDischarge })}
          />
          <NumberField
            label="Coefficient of discharge"
            title="Orifice coefficient adopted for the vent, normally 0.6 for a sharp-edged opening"
            value={data.hydraulic.dischargeCoefficient}
            onChange={(dischargeCoefficient) => updateBlock('hydraulic', { dischargeCoefficient })}
          />
          <NumberField
            label="Minimum crown cover"
            suffix="m"
            value={data.hydraulic.minimumCrownCover}
            onChange={(minimumCrownCover) => updateBlock('hydraulic', { minimumCrownCover })}
          />
        </div>
        <ul className="mis-check-list">
          <li>
            <span>Clear vent area</span>
            <b>{openingArea(data).toFixed(3)} m²</b>
          </li>
          <li>
            <span>Vent crown level</span>
            <b>{openingCrownLevel(data).toFixed(2)} m</b>
          </li>
          <li>
            <span>Cover over the crown</span>
            <b>{crownCover(data).toFixed(2)} m</b>
          </li>
          <li>
            <span>Full-open capacity</span>
            <b>{capacity.toFixed(3)} m³/s</b>
          </li>
        </ul>
        <div className="settings-note">
          Capacity is Cd · A · √(2gh) with the head measured from the minimum operating level to the
          centre of the opening.
        </div>
      </section>

      <section className="gw-panel">
        <div className="gw-panel-label">Levels and vent</div>
        <div className="mis-grid">
          <NumberField
            label="Sill level"
            suffix="m RL"
            min={-Infinity}
            value={data.levels.sill}
            onChange={(sill) => updateBlock('levels', { sill })}
          />
          <NumberField
            label="Minimum operating level"
            suffix="m RL"
            min={-Infinity}
            value={data.levels.minimumOperating}
            onChange={(minimumOperating) => updateBlock('levels', { minimumOperating })}
          />
          <NumberField
            label="F.T.L"
            suffix="m RL"
            min={-Infinity}
            value={data.levels.ftl}
            onChange={(ftl) => updateBlock('levels', { ftl })}
          />
          <NumberField
            label="M.W.L"
            suffix="m RL"
            min={-Infinity}
            value={data.levels.mwl}
            onChange={(mwl) => updateBlock('levels', { mwl })}
          />
          <NumberField
            label="T.B.L"
            suffix="m RL"
            min={-Infinity}
            value={data.levels.tbl}
            onChange={(tbl) => updateBlock('levels', { tbl })}
          />
          <NumberField
            label="Number of vents"
            min={1}
            value={data.vents}
            onChange={(vents) => update({ vents })}
          />
          {data.openingShape === 'circular' ? (
            <NumberField
              label="Clear diameter"
              suffix="m"
              value={data.opening.diameter}
              onChange={(diameter) => updateBlock('opening', { diameter })}
            />
          ) : (
            <>
              <NumberField
                label="Clear width"
                suffix="m"
                value={data.opening.width}
                onChange={(width) => updateBlock('opening', { width })}
              />
              <NumberField
                label="Clear height"
                suffix="m"
                value={data.opening.height}
                onChange={(height) => updateBlock('opening', { height })}
              />
            </>
          )}
        </div>
        <div className="settings-note">
          The vent shape and the type of intake are chosen in <b>Edit setup</b>.
        </div>
      </section>

      <section className="gw-panel">
        <div className="gw-panel-label">Structure geometry — as per the approved drawing</div>
        <div className="mis-blocks">
          <div className="mis-block">
            <div className="gw-panel-label">Excavation</div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.excavation.length}
                onChange={(length) => updateBlock('excavation', { length })}
              />
              <NumberField
                label="Width"
                suffix="m"
                value={data.excavation.width}
                onChange={(width) => updateBlock('excavation', { width })}
              />
              <NumberField
                label="Depth"
                suffix="m"
                value={data.excavation.depth}
                onChange={(depth) => updateBlock('excavation', { depth })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">M10 levelling course</div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.pcc.length}
                onChange={(length) => updateBlock('pcc', { length })}
              />
              <NumberField
                label="Width"
                suffix="m"
                value={data.pcc.width}
                onChange={(width) => updateBlock('pcc', { width })}
              />
              <NumberField
                label="Thickness"
                suffix="m"
                value={data.pcc.thickness}
                onChange={(thickness) => updateBlock('pcc', { thickness })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Barrel</div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.barrel.length}
                onChange={(length) => updateBlock('barrel', { length })}
              />
              <NumberField
                label="Outer width"
                suffix="m"
                value={data.barrel.outerWidth}
                onChange={(outerWidth) => updateBlock('barrel', { outerWidth })}
              />
              <NumberField
                label="Outer height"
                suffix="m"
                value={data.barrel.outerHeight}
                onChange={(outerHeight) => updateBlock('barrel', { outerHeight })}
              />
            </div>
            <div className="settings-note">
              Concrete is the outer section less the clear vent over the barrel length.
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">
              {data.intakeType === 'tower' ? 'Intake tower' : 'Upstream headwall'}
            </div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.intake.length}
                onChange={(length) => updateBlock('intake', { length })}
              />
              <NumberField
                label="Average thickness"
                suffix="m"
                value={data.intake.averageThickness}
                onChange={(averageThickness) => updateBlock('intake', { averageThickness })}
              />
              <NumberField
                label="Height"
                suffix="m"
                value={data.intake.height}
                onChange={(height) => updateBlock('intake', { height })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Downstream headwall</div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.downstreamHeadwall.length}
                onChange={(length) => updateBlock('downstreamHeadwall', { length })}
              />
              <NumberField
                label="Average thickness"
                suffix="m"
                value={data.downstreamHeadwall.averageThickness}
                onChange={(averageThickness) =>
                  updateBlock('downstreamHeadwall', { averageThickness })
                }
              />
              <NumberField
                label="Height"
                suffix="m"
                value={data.downstreamHeadwall.height}
                onChange={(height) => updateBlock('downstreamHeadwall', { height })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Wing walls</div>
            <div className="mis-grid">
              <NumberField
                label="Number"
                value={data.wingWalls.count}
                onChange={(count) => updateBlock('wingWalls', { count })}
              />
              <NumberField
                label="Length"
                suffix="m"
                value={data.wingWalls.length}
                onChange={(length) => updateBlock('wingWalls', { length })}
              />
              <NumberField
                label="Average thickness"
                suffix="m"
                value={data.wingWalls.averageThickness}
                onChange={(averageThickness) => updateBlock('wingWalls', { averageThickness })}
              />
              <NumberField
                label="Average height"
                suffix="m"
                value={data.wingWalls.averageHeight}
                onChange={(averageHeight) => updateBlock('wingWalls', { averageHeight })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Return walls</div>
            <div className="mis-grid">
              <NumberField
                label="Number"
                value={data.returnWalls.count}
                onChange={(count) => updateBlock('returnWalls', { count })}
              />
              <NumberField
                label="Length"
                suffix="m"
                value={data.returnWalls.length}
                onChange={(length) => updateBlock('returnWalls', { length })}
              />
              <NumberField
                label="Average thickness"
                suffix="m"
                value={data.returnWalls.averageThickness}
                onChange={(averageThickness) => updateBlock('returnWalls', { averageThickness })}
              />
              <NumberField
                label="Average height"
                suffix="m"
                value={data.returnWalls.averageHeight}
                onChange={(averageHeight) => updateBlock('returnWalls', { averageHeight })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Cut-off walls / collars</div>
            <div className="mis-grid">
              <NumberField
                label="Number"
                value={data.cutoffWalls.count}
                onChange={(count) => updateBlock('cutoffWalls', { count })}
              />
              <NumberField
                label="Width"
                suffix="m"
                value={data.cutoffWalls.width}
                onChange={(width) => updateBlock('cutoffWalls', { width })}
              />
              <NumberField
                label="Thickness"
                suffix="m"
                value={data.cutoffWalls.thickness}
                onChange={(thickness) => updateBlock('cutoffWalls', { thickness })}
              />
              <NumberField
                label="Depth"
                suffix="m"
                value={data.cutoffWalls.depth}
                onChange={(depth) => updateBlock('cutoffWalls', { depth })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Stilling basin</div>
            <div className="mis-grid">
              <NumberField
                label="Length"
                suffix="m"
                value={data.stillingBasin.length}
                onChange={(length) => updateBlock('stillingBasin', { length })}
              />
              <NumberField
                label="Width"
                suffix="m"
                value={data.stillingBasin.width}
                onChange={(width) => updateBlock('stillingBasin', { width })}
              />
              <NumberField
                label="Slab thickness"
                suffix="m"
                value={data.stillingBasin.slabThickness}
                onChange={(slabThickness) => updateBlock('stillingBasin', { slabThickness })}
              />
              <NumberField
                label="Side walls"
                value={data.stillingBasin.sideWallCount}
                onChange={(sideWallCount) => updateBlock('stillingBasin', { sideWallCount })}
              />
              <NumberField
                label="Side wall thickness"
                suffix="m"
                value={data.stillingBasin.sideWallThickness}
                onChange={(sideWallThickness) => updateBlock('stillingBasin', { sideWallThickness })}
              />
              <NumberField
                label="Side wall height"
                suffix="m"
                value={data.stillingBasin.sideWallHeight}
                onChange={(sideWallHeight) => updateBlock('stillingBasin', { sideWallHeight })}
              />
            </div>
          </div>

          <div className="mis-block">
            <div className="gw-panel-label">Reinforcement</div>
            <div className="mis-grid">
              <NumberField
                label="Steel per cum of concrete"
                suffix="kg/cum"
                value={data.reinforcementKgPerCum}
                onChange={(reinforcementKgPerCum) => update({ reinforcementKgPerCum })}
              />
            </div>
            <div className="settings-note">
              Applied to every structural concrete quantity above. Replace it with the bar bending
              schedule total once the drawing is approved.
            </div>
          </div>
        </div>
      </section>

      <section className="gw-panel">
        <div className="gw-panel-label">Mechanical bill of material and painting</div>
        <div className="mis-grid">
          <NumberField
            label="Embedded parts"
            suffix="tonne"
            value={data.mechanical.embeddedTonnes}
            onChange={(embeddedTonnes) => updateBlock('mechanical', { embeddedTonnes })}
          />
          <NumberField
            label="Sluice gate"
            suffix="tonne"
            value={data.mechanical.gateTonnes}
            onChange={(gateTonnes) => updateBlock('mechanical', { gateTonnes })}
          />
          <NumberField
            label="Hoist and hoist bridge"
            suffix="tonne"
            value={data.mechanical.hoistTonnes}
            onChange={(hoistTonnes) => updateBlock('mechanical', { hoistTonnes })}
          />
          <NumberField
            label="Painting embedded parts"
            suffix="sqm"
            value={data.mechanical.embeddedPaintSqm}
            onChange={(embeddedPaintSqm) => updateBlock('mechanical', { embeddedPaintSqm })}
          />
          <NumberField
            label="Painting gate"
            suffix="sqm"
            value={data.mechanical.gatePaintSqm}
            onChange={(gatePaintSqm) => updateBlock('mechanical', { gatePaintSqm })}
          />
          <NumberField
            label="Painting hoist"
            suffix="sqm"
            value={data.mechanical.hoistPaintSqm}
            onChange={(hoistPaintSqm) => updateBlock('mechanical', { hoistPaintSqm })}
          />
        </div>
        <div className="settings-note">
          Weights come from the approved mechanical BOM; a role left at zero writes no item into the
          estimate.
        </div>
      </section>

      <section className="gw-materials">
        <div className="gw-materials-title">Civil SSR codes</div>
        <div className="gw-materials-grid">{CIVIL_ROLES.map(materialCard)}</div>
        <div className="gw-materials-title">Mechanical and painting SSR codes</div>
        <div className="gw-materials-grid">{MECHANICAL_ROLES.map(materialCard)}</div>
      </section>

      <section className="gw-panel">
        <div className="gw-panel-label">Computed quantities — these are the items in the estimate</div>
        <div className="gw-table-scroll">
          <table className="gw-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Description</th>
                <th>Calculation</th>
                <th>Code</th>
                <th className="num">Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => (
                <Fragment key={group.role}>
                  {group.rows.map((row, index) => (
                    <tr key={`${group.role}-${row.label}-${index}`}>
                      <td>{index === 0 ? groupIndex + 1 : ''}</td>
                      <td>{row.label}</td>
                      <td className="gw-formula">{row.formula}</td>
                      <td>
                        {index === 0 && (
                          <span className="gw-row-code">{group.ref?.code ?? 'no code'}</span>
                        )}
                      </td>
                      <td className="num">{qty3.format(row.quantity)}</td>
                      <td>{row.unit.toLowerCase()}</td>
                    </tr>
                  ))}
                  <tr className="gw-total-row">
                    <td colSpan={4}>{group.label} total</td>
                    <td className="num">{qty3.format(group.total)}</td>
                    <td>{group.unit.toLowerCase()}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gw-total-line">
          {groups.length} SSR item{groups.length === 1 ? '' : 's'} generated from this template.
        </div>
      </section>
    </div>
  )
}
