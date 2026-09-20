import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const workspaceDir = 'C:/Users/napra/OneDrive/Desktop/Software E-estimate';
const SKILL_DIR = 'C:/Users/napra/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const RUNTIME_PYTHON = 'C:/Users/napra/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const buildDir = path.join(workspaceDir, '.ppt-build');
const FINAL_PPTX = path.join(workspaceDir, 'deliverables', 'E-Estimate-Software-Pitch.pptx');
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, 'container_tools/artifact_tool_utils.mjs')).href);
const font = resolvePresentationFont({ fontFamily: 'Aptos' });
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { navy:'#10243A', ink:'#18314B', blue:'#1E6FA8', cyan:'#4EB7C5', sand:'#E9D8B9', pale:'#F4F7F8', white:'#FFFFFF', muted:'#5F7180', line:'#D8E2E6', gold:'#D59A37' };
const cover = new Uint8Array(await fs.readFile(path.join(workspaceDir,'pitch-deck/media/estimate-cover.png')));
const bund = new Uint8Array(await fs.readFile(path.join(workspaceDir,'pitch-deck/media/bund-diagram.png')));
function box(s,x,y,w,h,fill, radius=0, line='none') { return s.shapes.add({ geometry: radius ? 'roundRect' : 'rect', position:{left:x,top:y,width:w,height:h}, fill, line:{fill:line,width:line==='none'?0:1}, borderRadius:radius||undefined }); }
function text(s, value, x,y,w,h, size=20, color=C.ink, bold=false, align='left') { const q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}}); q.text=value; q.text.style={typeface:font,fontSize:size,color,bold,alignment:align,autoFit:'shrinkText'}; return q; }
function title(s, n, value, sub) { text(s, String(n).padStart(2,'0'),72,42,48,25,13,C.cyan,true); text(s,value,72,76,970,52,34,C.navy,true); if(sub) text(s,sub,72,132,910,28,17,C.muted,false); box(s,72,178,1136,2,C.cyan); }
function footer(s, n) { text(s,'E-ESTIMATE  |  CONFIDENTIAL PRODUCT PITCH',72,678,500,16,10,C.muted,true); text(s,String(n).padStart(2,'0'),1158,676,50,18,11,C.muted,true,'right'); }
function note(s, v) { s.speakerNotes.textFrame.setText(v); }

// 1 cover
{ const s=p.slides.add(); s.background.fill=C.navy; s.images.add({blob:cover,contentType:'image/png',alt:'E-Estimate construction estimation screen',fit:'cover',position:{left:650,top:0,width:630,height:720}}); box(s,0,0,760,720,C.navy); box(s,72,106,88,5,C.cyan); text(s,'E-ESTIMATE',72,144,380,30,16,C.cyan,true); text(s,'Construction estimates\nthat stay connected',72,192,540,120,44,C.white,true); text(s,'A Windows desktop workspace for Telangana SOR/SSR estimate preparation, calculation and print-ready documentation.',72,338,500,74,21,'#DCE8EE'); text(s,'Software pitch  |  September 2026',72,630,360,24,14,'#B5CBD8'); note(s,'Product pitch prepared from the E-Estimate repository README and product assets.'); }

// 2 problem
{ const s=p.slides.add(); s.background.fill=C.white; title(s,2,'The estimate process spans too many disconnected tasks','Teams need one working record from item selection to the final document.'); const items=[['Estimate inputs','Item quantities, rates and project data must remain traceable.'],['Technical checks','Lead, rate analysis, seigniorage and bund work add calculation depth.'],['Deliverables','Stakeholders need consistent, print-ready project documents.']]; items.forEach((a,i)=>{const x=72+i*380; box(s,x,238,330,268,C.pale,18); text(s,`0${i+1}`,x+28,266,60,38,26,C.cyan,true); text(s,a[0],x+28,322,270,34,23,C.navy,true); text(s,a[1],x+28,374,266,80,17,C.muted);}); text(s,'E-Estimate keeps these workflows in a single desktop workspace.',72,570,830,36,26,C.navy,true); footer(s,2); note(s,'Challenge framing is a product-positioning summary, not a quantified market claim.'); }

//3 solution
{ const s=p.slides.add(); s.background.fill=C.pale; title(s,3,'One workspace for the estimate lifecycle','E-Estimate keeps project data, calculations and output preparation close together.'); box(s,72,232,472,324,C.navy,20); text(s,'The operating model',108,270,300,28,18,C.cyan,true); text(s,'Build the estimate once.\nUse the same project data\nthrough calculation and print.',108,320,372,118,31,C.white,true); text(s,'A desktop application designed for estimation work, not a collection of loose spreadsheets.',108,476,355,47,16,'#C7D9E2'); s.images.add({blob:cover,contentType:'image/png',alt:'E-Estimate application preview',fit:'cover',position:{left:602,top:228,width:606,height:342},geometry:'roundRect',borderRadius:20}); footer(s,3); note(s,'Product capability summary based on README.md.'); }

//4 workflows
{ const s=p.slides.add(); s.background.fill=C.white; title(s,4,'Core estimation workflows','Purpose-built modules keep specialist work connected to the project record.'); const data=[['SOR / SSR catalogue','Find and reuse schedule items.'],['Rate analysis','Build transparent rate inputs.'],['Lead calculations','Model material movement and leads.'],['Seigniorage','Handle applicable royalty workflows.'],['Bund analysis','Prepare bund data and simulation inputs.']]; data.forEach((a,i)=>{const y=218+i*76; box(s,90,y,54,54,i===4?C.gold:C.cyan,12); text(s,String(i+1),90,y+14,54,26,18,C.white,true,'center'); text(s,a[0],174,y+3,246,28,21,C.navy,true); text(s,a[1],174,y+32,332,26,15,C.muted); if(i<4) box(s,118,y+55,2,21,C.line);}); s.images.add({blob:bund,contentType:'image/png',alt:'Bund diagram generated by E-Estimate',fit:'contain',position:{left:590,top:222,width:548,height:318}}); text(s,'Bund workflow visual from the product repository',630,560,420,20,13,C.muted); footer(s,4); note(s,'Module names and visual sourced from E-Estimate repository.'); }

//5 documents
{ const s=p.slides.add(); s.background.fill=C.pale; title(s,5,'From project data to print-ready documents','The same project record supports calculation, review and formal output.'); const steps=[['Project setup','Capture estimate data in the project workspace.'],['Calculation','Apply rate, lead, seigniorage and related workflows.'],['Document preparation','Assemble the project book and required print content.'],['Windows delivery','Package the desktop app for installation and use.']]; steps.forEach((a,i)=>{const x=72+i*286; box(s,x,276,244,180,C.white,16); text(s,`0${i+1}`,x+24,300,60,28,18,C.cyan,true); text(s,a[0],x+24,340,198,32,20,C.navy,true); text(s,a[1],x+24,384,194,48,14,C.muted); if(i<3){box(s,x+244,361,42,2,C.cyan);}}); text(s,'Project data remains central throughout the workflow.',72,554,700,38,26,C.navy,true); footer(s,5); note(s,'Workflow synthesized from README and repository structure, including Typst print compilation and Tauri packaging.'); }

//6 regional fit
{ const s=p.slides.add(); s.background.fill=C.white; title(s,6,'Designed around Telangana SOR/SSR workflows','E-Estimate focuses the product on the rules and documents that estimation teams already use.'); box(s,72,238,1136,258,C.navy,22); text(s,'TELANGANA',108,278,230,28,17,C.cyan,true); text(s,'A domain-specific estimation environment',108,324,520,44,31,C.white,true); text(s,'The product brings SOR/SSR catalogue work, rate analysis, leads, seigniorage and project output into one application.',108,390,626,66,18,'#D6E2E8'); box(s,832,268,260,168,C.gold,18); text(s,'FOCUSED\nWORKFLOWS',858,301,206,56,22,C.navy,true); text(s,'Built around the estimation process.',858,374,185,35,14,C.navy); footer(s,6); note(s,'Regional focus stated in README.md.'); }

//7 delivery
{ const s=p.slides.add(); s.background.fill=C.pale; title(s,7,'Desktop delivery for everyday estimation work','E-Estimate ships as a packaged Windows application.'); const cols=[['Windows desktop','A native desktop shell built with Tauri 2 and WebView2.'],['Print-ready output','Typst-based document compilation supports formal estimate output.'],['Packaged distribution','The project produces a Windows NSIS installer.']]; cols.forEach((a,i)=>{const x=72+i*378; box(s,x,258,336,234,C.white,16); box(s,x,258,336,8,i===0?C.cyan:i===1?C.blue:C.gold); text(s,a[0],x+28,302,278,34,22,C.navy,true); text(s,a[1],x+28,361,272,76,17,C.muted);}); text(s,'The pitch can support a product demo, pilot discussion or stakeholder review.',72,557,920,34,23,C.navy,true); footer(s,7); note(s,'Technical delivery details are sourced from README.md.'); }

//8 close
{ const s=p.slides.add(); s.background.fill=C.navy; text(s,'E-ESTIMATE',72,98,260,28,16,C.cyan,true); text(s,'A clearer working record\nfor every estimate',72,152,710,112,43,C.white,true); text(s,'Next conversation',72,334,200,28,19,C.cyan,true); text(s,'Select a pilot estimate, walk through the workflow, and define the output needed by your team.',72,382,690,58,23,'#DCE8EE'); box(s,72,534,170,5,C.gold); text(s,'Thank you',72,568,240,36,26,C.white,true); text(s,'E-Estimate  |  Construction cost estimation software',72,622,520,22,14,'#B5CBD8'); note(s,'Closing slide.'); }

await fs.mkdir(path.dirname(FINAL_PPTX),{recursive:true});
const candidatePath=path.join(buildDir,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const result=await finalizePresentation({workspaceDir,candidatePath,finalPath:FINAL_PPTX,pythonExecutable:RUNTIME_PYTHON,integrityValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(buildDir,'validation.json')});
console.log(JSON.stringify(result,null,2));
const montage=await p.export({format:'png',montage:true,scale:1}); await fs.writeFile(path.join(buildDir,'montage.png'),new Uint8Array(await montage.arrayBuffer()));
