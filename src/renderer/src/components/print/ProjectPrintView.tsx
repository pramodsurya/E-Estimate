import { useRef } from 'react'
import { Pencil } from 'lucide-react'
import { useStore } from '../../store/useStore'
import type { EestimateProject, PageTemplateId, ProjectNode } from '../../types/project'
import type { ProjectAbstract } from '../../lib/projectAbstract'
import type { ProjectPrintSettings } from '../../lib/projectPrintSettings'
import { isDocumentEmpty } from '../../lib/documentHtml'
import { paperMm } from '../../lib/seignioragePrintLayout'
import type { RateAnalysisRecipe } from '../../types/rateAnalysis'
import UniverDocument from '../editors/UniverDocument'
import ComponentPrintPreviewStack from './ComponentPrintPreviewStack'
import DocumentPrintPreviewStack from './DocumentPrintPreviewStack'
import GeneralAbstractPage from './GeneralAbstractPage'
import LeadPrintPreviewModal from '../lead/LeadPrintPreviewModal'
import { DataDashboardReport } from '../data/DataDashboard'
import { SeignioragePrintPages } from '../seigniorage/SeignioragePrintPreviewModal'
import type { SeigniorageCalculation } from '../../lib/seigniorage'
import {
  LEAD_SIGNATURE_SCOPE,
  SEIGNIORAGE_SIGNATURE_SCOPE,
  resolveSignatureFooter
} from '../../lib/signatureFooter'

const ignorePrintEdit = (): void => undefined

/**
 * A live document preview only re-reads its content when it is remounted, so
 * the key has to change whenever the document does — and *only* then.
 *
 * Keying on `project.updatedAt` changed it on every edit anywhere in the
 * estimate, which tore down and rebuilt a whole Univer engine — plugins,
 * canvas renderers and all — because a rate or a signature moved somewhere
 * else entirely. Mutations share structure (see `patchNode`), so this node's
 * own `documentData` changes identity exactly when this document changes.
 */
function useContentRevision(content: unknown): number {
  const seen = useRef({ content, revision: 0 })
  if (seen.current.content !== content) {
    seen.current = { content, revision: seen.current.revision + 1 }
  }
  return seen.current.revision
}

function LiveDocumentPage({
  node,
  allowImages
}: {
  node: ProjectNode
  allowImages: boolean
}): JSX.Element {
  const revision = useContentRevision(node.documentData)
  return (
    <UniverDocument
      key={`vpv:${node.id}:${revision}`}
      node={node}
      allowImages={allowImages}
      preview
    />
  )
}

interface Props {
  project: EestimateProject
  abstract: ProjectAbstract
  seigniorage: SeigniorageCalculation
  settings: ProjectPrintSettings
  rateOf: (node: ProjectNode) => number | undefined
  recipes: Record<string, RateAnalysisRecipe>
}

function pinnedPage(project: EestimateProject, template: PageTemplateId): ProjectNode | undefined {
  return project.root.children.find((child) => child.pageTemplate === template)
}

/**
 * The project print output, shown in place of the dashboard.
 *
 * The Front Page and Introduction are the estimator's own documents, so they are
 * rendered from their stored content rather than from a layout defined here.
 * The General Abstract is the one statement this view composes itself.
 */
export default function ProjectPrintView({
  project,
  abstract,
  seigniorage,
  settings,
  rateOf,
  recipes
}: Props): JSX.Element {
  const select = useStore((state) => state.select)

  const paper = paperMm(settings.pageSize)
  const width = settings.orientation === 'landscape' ? paper.h : paper.w
  const height = settings.orientation === 'landscape' ? paper.w : paper.h
  const pageStyle = {
    width: `${width}mm`,
    height: `${height}mm`,
    minHeight: `${height}mm`,
    padding: `${settings.margins.top}mm ${settings.margins.right}mm ${settings.margins.bottom}mm ${settings.margins.left}mm`,
    fontSize: `${settings.fontPercent}%`
  }
  const documentPageStyle = {
    width: `${width}mm`,
    height: `${height}mm`,
    padding: 0
  }

  const front = pinnedPage(project, 'front')
  const introduction = pinnedPage(project, 'introduction')
  const documentPage = (node: ProjectNode | undefined, label: string): JSX.Element | null => {
    if (!node) return null
    const empty = isDocumentEmpty(node.documentData)
    if (node.pageTemplate !== 'front') {
      return (
        <section key={node.id} className="pp-native-stack pp-document-stack">
          <div className="pp-section-heading">
            <span>{label}</span>
            <button className="btn-mini" onClick={() => select(node.id)}>
              <Pencil size={12} /> Edit
            </button>
          </div>
          {empty ? (
            <div className="pp-empty">Nothing written yet. Choose <strong>Edit</strong> to open {label} and type into it.</div>
          ) : (
            <DocumentPrintPreviewStack project={project} node={node} />
          )}
        </section>
      )
    }
    return (
      <article key={node.id} className="pp-page pp-live-document" style={documentPageStyle}>
        <div className="pp-page-tag">
          <span>{label}</span>
          <button className="btn-mini" onClick={() => select(node.id)}>
            <Pencil size={12} /> Edit
          </button>
        </div>
        {empty ? (
          <div className="pp-empty">
            Nothing written yet. Choose <strong>Edit</strong> to open {label} and type into it.
          </div>
        ) : (
          <LiveDocumentPage node={node} allowImages={node.pageTemplate === 'front'} />
        )}
      </article>
    )
  }

  return (
    <div className="pp-scroll">
      {settings.sections.cover && documentPage(front, 'Front Page')}
      {settings.sections.introduction && documentPage(introduction, 'Introduction')}

      {settings.sections.abstract && (
        <GeneralAbstractPage project={project} abstract={abstract} pageStyle={pageStyle} />
      )}

      {/* Each component's own print section, in tree order — the same component
          renders identically here and on its own dashboard. */}
      {project.root.children.map((child) => {
        if (child.pageTemplate) return null
        if (child.kind === 'page') return documentPage(child, child.name)
        if (child.kind !== 'component' || !settings.sections.components) return null
        return (
          <section key={child.id} className="pp-component-stack">
            <div className="pp-section-heading">
              <span>{child.name}</span>
              <button className="btn-mini" onClick={() => select(child.id)}>
                <Pencil size={12} /> Open Component
              </button>
            </div>
            <ComponentPrintPreviewStack
              project={project}
              component={child}
              rateOf={rateOf}
              recipes={recipes}
              fontScale={settings.fontPercent / 100}
            />
          </section>
        )
      })}

      {settings.sections.lead && (
        <section className="pp-native-stack">
          <div className="pp-section-heading"><span>Lead Print Preview</span></div>
          <LeadPrintPreviewModal
            year={project.meta.sorYear}
            zone={project.meta.sorZone ?? 'zone_3'}
            variants={project.leadChart?.variants ?? []}
            applications={project.leadChart?.applications ?? []}
            assignments={project.leadChart?.assignments ?? []}
            points={project.leadChart?.points ?? []}
            site={project.meta.location ?? null}
            mapDirections={project.leadChart?.mapDirections ?? []}
            printSettings={project.leadChart?.printSettings}
            signatureFooter={resolveSignatureFooter(project, LEAD_SIGNATURE_SCOPE)}
            onUpdatePrintSettings={ignorePrintEdit}
            onClose={ignorePrintEdit}
            rates={project.dashboardSnapshot?.leadRates ?? []}
            embedded
          />
        </section>
      )}

      {settings.sections.seigniorage && (
        <section className="pp-native-stack">
          <div className="pp-section-heading"><span>Seigniorage Print Preview</span></div>
          <SeignioragePrintPages
            calc={seigniorage}
            projectName={project.meta.name || project.root.name}
            printSettings={project.seignioragePrintSettings}
            signatureFooter={resolveSignatureFooter(
              project,
              SEIGNIORAGE_SIGNATURE_SCOPE
            )}
          />
        </section>
      )}

      {settings.sections.data && (
        <section className="pp-native-stack pp-data-stack">
          <DataDashboardReport
            project={project}
            entries={project.dashboardSnapshot?.dataDashboardEntries ?? []}
            fontScale={settings.fontPercent / 100}
          />
        </section>
      )}
    </div>
  )
}
