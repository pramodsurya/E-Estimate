import manifest from './manifest.json'
import { defaultSlrbData, buildSlrbOutputModel, syncSlrbItems } from '../../lib/slrb'
import { slrbCompileInputs, slrbVariablesPrelude, injectSlrbLayout } from '../../lib/typist-output/slrb/slrbTypst'
/** First-party package boundary. Host-owned persistence and native services stay
 * outside the addon; the same outputs feed component reports and ordinary items. */
export const slrbAddon = {
  manifest, kind:'slrb' as const, createData:defaultSlrbData,
  buildRenderData:buildSlrbOutputModel, proposeItems:syncSlrbItems,
  compileInputs:slrbCompileInputs, variablesPrelude:slrbVariablesPrelude, inject:injectSlrbLayout,
  loadDetailView:()=>import('../../components/slrb/SlrbDashboard')
}
