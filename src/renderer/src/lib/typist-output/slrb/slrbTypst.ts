import layout from './slrb.typ?raw'
import type { EestimateProject, ProjectNode } from '../../../types/project'
import { slrbReportData } from '../../slrbReport'
export function slrbCompileInputs(project:EestimateProject,node:ProjectNode):Record<string,string> {
  return {'ee-slrb':JSON.stringify(slrbReportData(project,node))}
}
export const slrbVariablesPrelude=():string=>'#let SLRB = json(bytes(sys.inputs.at("ee-slrb")))'
export function injectSlrbLayout(source:string,hasExternal:boolean):string {
  const start=source.indexOf('// Section 2: Detailed Estimates (Child Items)')
  const end=source.indexOf('// Section 3: Signatures')
  if(start<0||end<start) throw new Error('The component host layout is missing its detail injection markers.')
  const external=hasExternal?'\n#for item in EE.items [\n#if not item.at("templateGenerated", default: false) [#render-component-item(item) #v(12pt)]\n]\n':''
  return `${source.slice(0,start)}\n#pagebreak(weak: true)\n${layout}\n${external}\n${source.slice(end)}`
}
