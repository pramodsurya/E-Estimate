import type { SlrbData } from '../types/slrb'
const esc=(text:string):string=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
/** Illustrative SVG only. Missing inputs affect labels, never measurement arithmetic. */
export function slrbDrawingSvg(data: SlrbData, heights: Record<string,number|null>, selected=''): string {
  const n=data.spans.length,step=520/n
  const labels:string[]=[]
  data.spans.forEach((span,i)=>{
    const x=45+i*step
    labels.push(`<rect x="${x+4}" y="60" width="${step-8}" height="32" fill="${selected===span.id?'#dedede':'#f7f7f7'}" stroke="#333"/><text x="${x+step/2}" y="48" text-anchor="middle">Span ${i+1}: ${esc(span.clearSpan===null?'opening pending':span.clearSpan+' m clear')}</text><text x="${x+step/2}" y="80" text-anchor="middle">${esc(span.thickness===null?'depth pending':span.thickness+' m slab')}</text>`)
  })
  data.supports.forEach((support,i)=>{
    const x=45+i*step
    labels.push(`<rect x="${x-9}" y="94" width="18" height="70" fill="${selected===support.id?'#bbb':'#eee'}" stroke="#333"/><rect x="${x-19}" y="164" width="38" height="12" fill="#eee" stroke="#333"/><text x="${x}" y="195" text-anchor="middle">${esc(support.id)}</text><text x="${x}" y="212" text-anchor="middle">${esc(heights[support.id]===null||heights[support.id]===undefined?'height pending':heights[support.id]!.toFixed(3)+' m')}</text>`)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 242" role="img" aria-label="Bridge elevation showing spans, supports and entered heights"><rect width="620" height="242" fill="white"/><g font-family="Arial,sans-serif" font-size="11" fill="#222">${labels.join('')}<text x="310" y="235" text-anchor="middle">Illustrative elevation — not to scale. Pending dimensions need a drawing/detail.</text></g></svg>`
}

export function slrbDetailSvg(data:SlrbData,heights:Record<string,number|null>,selected:string,chapter:number):string {
  const fmt=(n:number|null|undefined):string=>n===null||n===undefined?'pending':`${Number(n.toFixed(3))} m`
  const label=(x:number,y:number,text:string):string=>`<text x="${x}" y="${y}">${esc(text)}</text>`
  let drawing=''
  if(chapter===4) {
    const span=data.spans.find(s=>s.id===selected)??data.spans[0]
    drawing=`<rect x="40" y="65" width="310" height="22" fill="#eee" stroke="#333"/><rect x="40" y="120" width="310" height="55" fill="#eee" stroke="#333"/>${label(40,48,`Wearing: ${data.wearingPresence==='none'?'absent':fmt(data.wearingThickness)}`)}${label(40,110,`Deck thickness: ${fmt(span?.thickness)}`)}${label(40,200,`Structural width: ${fmt(data.slabWidth)}`)}${label(40,221,`Actual panel length: ${fmt(span?.panelLength)}`)}`
  }else if(chapter===6) {
    const wall=data.walls.find(w=>w.id===selected)??data.walls[0]
    drawing=wall?`<polygon points="50,190 350,190 350,65 50,110" fill="#eee" stroke="#333"/>${label(45,92,`Start H: ${fmt(wall.startHeight)}`)}${label(230,48,`End H: ${fmt(wall.endHeight)}`)}${label(60,216,`Length: ${fmt(wall.length)}`)}${label(60,240,`Section thicknesses: ${fmt(wall.topThickness)} / ${fmt(wall.bottomThickness)}`)}`:label(35,110,'Select or add each wall / fitting from the drawing.')
  }else if(chapter===7) {
    const bar=data.bars.find(b=>b.memberId===selected)??data.bars[0]
    drawing=`<path d="M55 140 L55 90 L330 90 L330 140" fill="none" stroke="#333" stroke-width="4"/>${label(35,55,bar?`Bar ${bar.mark||'mark pending'} — ${bar.diameterMm??'?'} mm`:'Bar schedule needed')}${label(35,180,`Whole count: ${bar?.count??'pending'}`)}${label(35,206,`Complete cut length: ${fmt(bar?.cutLengthM)}`)}${label(35,232,'Illustration only; actual shape, anchors and laps need BBS.')}`
  }else {
    const support=data.supports.find(s=>s.id===selected)??data.supports[0]
    if(support) drawing=`<rect x="105" y="45" width="190" height="18" fill="#eee" stroke="#333"/><rect x="145" y="80" width="110" height="100" fill="#eee" stroke="#333"/><rect x="95" y="180" width="210" height="25" fill="#eee" stroke="#333"/><rect x="85" y="215" width="230" height="12" fill="#eee" stroke="#333"/><path d="M325 80 L325 180 M320 80 L330 80 M320 180 L330 180" stroke="#333" fill="none"/>${label(25,33,`${support.id} cap: ${support.capPresence==='none'?'absent':fmt(support.cap.height)}`)}${label(340,127,fmt(heights[support.id]))}${label(265,78,'Cap underside')}${label(310,195,'Footing top')}${label(30,246,`Footing: ${fmt(support.footing.length)} × ${fmt(support.footing.width)}`)}${label(30,268,`Body shape: ${support.body.shape}; footing depth ${fmt(support.footing.height)}`)}`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 292" role="img" aria-label="Selected bridge member dimensions and height endpoints"><rect width="520" height="292" fill="white"/><g font-family="Arial,sans-serif" font-size="12" fill="#222">${drawing}${label(30,286,'Dimension guide — not to scale')}</g></svg>`
}
