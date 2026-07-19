import { Box, Component as ComponentIcon, FileText, Layers, Table2 } from 'lucide-react'
import type { ProjectNode } from '../types/project'

export function NodeIcon({ node, size = 15 }: { node: ProjectNode; size?: number }): JSX.Element {
  switch (node.kind) {
    case 'title':
      return <Box size={size} color="var(--title)" />
    case 'component':
      return <ComponentIcon size={size} color="var(--component)" />
    case 'subcomponent':
      return <Layers size={size} color="var(--subcomponent)" />
    case 'page':
      return <FileText size={size} color="var(--page)" />
    case 'item':
    default:
      if (node.itemEditorType === 'document') {
        return (
          <FileText
            size={size}
            color={node.itemSource === 'SOR' ? 'var(--item-sor)' : 'var(--item-ssr)'}
          />
        )
      }
      return (
        <Table2
          size={size}
          color={node.itemSource === 'SOR' ? 'var(--item-sor)' : 'var(--item-ssr)'}
        />
      )
  }
}

export function nodeDisplayName(node: ProjectNode): string {
  if (node.kind === 'item' && node.splitFromItemKey) return node.name
  if (node.kind === 'item' && node.itemCode) {
    return node.dataVariant ? `${node.itemCode} - ${node.dataVariant.label}` : node.itemCode
  }
  return node.name
}

/** SOR/SSR item names are locked; only "Others" items and structural nodes can be renamed. */
export function isRenamable(node: ProjectNode): boolean {
  if (node.kind === 'item') return node.itemSource === 'OTHERS'
  return true
}

export function kindLabel(node: ProjectNode): string {
  switch (node.kind) {
    case 'title':
      return 'Project'
    case 'component':
      return 'Component'
    case 'subcomponent':
      return 'Sub-component'
    case 'page':
      return 'Page'
    case 'item':
      return node.itemSource === 'OTHERS' ? 'Item (Others)' : `${node.itemSource ?? ''} Item`
  }
}
