import { findNode } from '../../tree'
import type { EestimateProject } from '../../../types/project'
import { bundCompileInputs } from './bundTypst'

type Request = { project: EestimateProject; nodeId: string }

self.onmessage = (event: MessageEvent<Request>): void => {
  try {
    const { project, nodeId } = event.data
    const node = findNode(project.root, nodeId)
    if (!node || node.templateId !== 'bund' || !node.bund) {
      throw new Error('The bund component is no longer available for printing.')
    }
    self.postMessage({ ok: true, inputs: bundCompileInputs(project, node) })
  } catch (reason) {
    self.postMessage({ ok: false, error: reason instanceof Error ? reason.message : String(reason) })
  }
}
