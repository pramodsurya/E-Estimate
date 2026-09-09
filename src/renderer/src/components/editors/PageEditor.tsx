import { useState } from 'react'
import { FileCode } from 'lucide-react'
import { NodeIcon, kindLabel } from '../nodeVisual'
import type { ProjectNode } from '../../types/project'
import UniverDocument from './UniverDocument'
import { useStore } from '../../store/useStore'
import EEstimatePrintStudio from '../typst/EEstimatePrintStudio'
import {
  COVER_STUDIO_SCOPE,
  coverCompileInputs,
  coverDocumentSettings,
  coverRenderData,
  coverShadowFiles,
  coverTypstTemplate,
} from '../../lib/typist-output/coverTypst'
import {
  buildItemSheetRenderData,
  EE_ITEM_TABLE_PRELUDE,
  itemSheetCompileInputs,
  itemSheetScopeKey,
  itemSheetShadowFiles,
  itemSheetTypstTemplate,
  resolveItemSheetDocumentSettings
} from '../../lib/typist-output/itemTypst'

export default function PageEditor({ node }: { node: ProjectNode }): JSX.Element {
  const project = useStore((state) => state.project)
  const [introductionStudioOpen, setIntroductionStudioOpen] = useState(false)
  const isFrontPage = node.pageTemplate === 'front'
  const isIntroduction = node.pageTemplate === 'introduction'

  if (isFrontPage && project) {
    const savedCover = project.printStudioDocuments?.[COVER_STUDIO_SCOPE]
    return (
      <EEstimatePrintStudio
        scopeKey={COVER_STUDIO_SCOPE}
        key={project.id + COVER_STUDIO_SCOPE}
        title="Front Page — Typst Print Studio"
        subtitle={node.name}
        defaultTypstSource={coverTypstTemplate(project)}
        savedTypstSource={savedCover}
        compileInputs={coverCompileInputs(project)}
        shadowFiles={coverShadowFiles(project)}
        runtimeData={coverRenderData(project)}
        projectDocumentSettings={coverDocumentSettings(project, node)}
        savedDocumentSettings={project.printStudioDocumentSettings?.[COVER_STUDIO_SCOPE]}
        onSave={async (source, settings) => {
          useStore.getState().updatePrintStudioDocument(COVER_STUDIO_SCOPE, source, settings)
          await useStore.getState().saveProject({ requireSaved: true })
        }}
        onClose={() => useStore.getState().select(project.root.id)}
      />
    )
  }

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <NodeIcon node={node} size={14} />
        <span className="et-title">{node.name}</span>
        <span className="editor-badge">{kindLabel(node)}</span>
        <button className="btn ghost" onClick={() => setIntroductionStudioOpen(true)}>
          <FileCode size={14} /> Open Print Studio
        </button>
      </div>
      <UniverDocument node={node} />
      {introductionStudioOpen && project && (
        <EEstimatePrintStudio
          scopeKey={itemSheetScopeKey(node)}
          key={itemSheetScopeKey(node)}
          title={`${node.name} — Typst Print Studio`}
          subtitle={node.name}
          defaultTypstSource={itemSheetTypstTemplate(project, node)}
          savedTypstSource={project.printStudioDocuments?.[itemSheetScopeKey(node)]}
          compileInputs={itemSheetCompileInputs(project, node)}
          shadowFiles={itemSheetShadowFiles(node)}
          compilePrelude={EE_ITEM_TABLE_PRELUDE}
          runtimeData={buildItemSheetRenderData(project, node)}
          projectDocumentSettings={resolveItemSheetDocumentSettings(project, node)}
          savedDocumentSettings={project.printStudioDocumentSettings?.[itemSheetScopeKey(node)]}
          onSave={async (source, settings) => {
            useStore.getState().updatePrintStudioDocument(itemSheetScopeKey(node), source, settings)
            await useStore.getState().saveProject({ requireSaved: true })
          }}
          onClose={() => setIntroductionStudioOpen(false)}
        />
      )}
    </div>
  )
}
