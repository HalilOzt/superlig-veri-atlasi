import { nearest } from './metrics.js';

const svgNS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs, text) => {
  const element = document.createElementNS(svgNS,tag);
  for (const [name,value] of Object.entries(attrs)) element.setAttribute(name,value);
  if (text !== undefined) element.textContent = text;
  return element;
};
const compact = (text, length) => text.length > length ? text.slice(0,length - 1) + '…' : text;
const lin = (i, size, low, high) => size > 1 ? low + i*(high-low)/(size-1) : (low+high)/2;
const palette = { club:'#c4f36a', person:'#6fc4b6', company:'#f1b579' };

function dot(svg,p,label,type,action,pressed=false) {
  const group = node('g', { class:'graph-node',transform:'translate('+p.x+' '+p.y+')',role:'button',tabindex:'0',
    'aria-label':label, 'aria-pressed':String(pressed) });
  group.append(node('title',{},label));
  group.append(node('circle',{r:type==='club'?9:7,fill:palette[type]}));
  group.append(node('text',{x:14,y:5},compact(label,p.max ?? 36)));
  group.addEventListener('click',action);
  group.addEventListener('keydown',(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  });
  svg.append(group);
}

function edge(svg,a,b) {
  const mid = (a.x+b.x)/2;
  svg.append(node('path', { class:'edge',d:'M'+a.x+','+a.y+' C'+mid+','+a.y+' '+mid+','+b.y+' '+b.x+','+b.y }));
}
const heading = (svg,x,title) => svg.append(node('text',{x,y:26,fill:'#9bbcac','font-size':12,'font-weight':700},title));

export function associationGraph(mount, teams, links, team, person, company, onSelect) {
  const svg = node('svg',{ viewBox:'0 0 760 440', 'aria-label':'Gezilebilir kulüp ve şirket grafiği' });
  const arrange = (array,x,low,high,max) => array.map((value,i) => ({value,x,y:lin(i,array.length,low,high),max}));
  if (!team) {
    const counts = new Map();
    for (const [id] of links) counts.set(id,(counts.get(id) || 0)+1);
    const clubs = [...counts.keys()].sort((a,b)=>teams.get(a).name.localeCompare(teams.get(b).name,'tr'));
    const center = {x:295,y:218};
    const left = arrange(clubs.slice(0,Math.ceil(clubs.length/2)),25,64,394,23);
    const right = arrange(clubs.slice(Math.ceil(clubs.length/2)),512,64,394,25);
    for (const club of [...left,...right]) edge(svg,center,club);
    svg.append(node('circle',{cx:center.x,cy:center.y,r:12,fill:palette.club}));
    svg.append(node('text',{x:center.x+20,y:center.y+6,fill:'#e8f5e9','font-size':15,'font-weight':700},'Kulüp bağlantıları'));
    heading(svg,25,'KULÜP SEÇ');
    for (const c of [...left,...right]) dot(svg,c,teams.get(c.value).name,'club',()=>onSelect(c.value,null,null));
    mount.replaceChildren(svg);
    return;
  }
  const active = links.filter((r)=>r[0]===team);
  const people = [...new Set(active.map((r)=>r[1]))];
  const companies = [...new Set(active.map((r)=>r[4]))];
  const height = Math.max(420,companies.length*31+64);
  svg.setAttribute('viewBox','0 0 760 '+height);
  const pPoints = arrange(people,234,59,height-23,25);
  const cPoints = arrange(companies,500,59,height-23,32);
  const root = {x:23,y:height/2,max:23};
  const pMap = new Map(pPoints.map((p)=>[p.value,p]));
  const cMap = new Map(cPoints.map((c)=>[c.value,c]));
  for (const p of pPoints) edge(svg,root,p);
  for (const r of active) edge(svg,pMap.get(r[1]),cMap.get(r[4]));
  heading(svg,23,'KULÜP');
  heading(svg,234,'YÖNETİCİ');
  heading(svg,500,'ŞİRKET / MARKA');
  dot(svg,root,teams.get(team).name,'club',()=>onSelect(0,null,null));
  for (const p of pPoints) dot(svg,p,p.value,'person',()=>onSelect(team,p.value===person?null:p.value,null),p.value===person);
  for (const c of cPoints) dot(svg,c,c.value,'company',()=>onSelect(team,null,c.value===company?null:c.value),c.value===company);
  mount.replaceChildren(svg);
}

const monthDay = new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const axisNumber = new Intl.NumberFormat('tr-TR',{maximumFractionDigits:1});
const valueNumber = new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2});
const clamp = (x,min,max) => Math.max(min,Math.min(max,x));

export function drawStocks(canvas,tooltip,series,colors,mode) {
  const context = canvas.getContext('2d');
  const rows = [...series].filter(([,points])=>points.length);
  let width = 0, height = 0, selected = null, bounds;
  const clear = () => { selected = null; tooltip.hidden = true; render(); };
  function render() {
    const size = canvas.getBoundingClientRect();
    width = size.width;
    height = size.height;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
      canvas.width = Math.round(width*dpr);
      canvas.height = Math.round(height*dpr);
    }
    context.setTransform(dpr,0,0,dpr,0,0);
    context.clearRect(0,0,width,height);
    if (!rows.length) {
      context.fillStyle='#51665e';
      context.font='600 15px system-ui';
      context.textAlign='center';
      context.fillText('Grafikte görmek için bir hisse seç.',width/2,height/2);
      return;
    }
    const left = width<490?53:67, right=width-17, top=19, bottom=height-32;
    const [minDate,maxDate] = [Math.min(...rows.map(([,s])=>s[0][0])),Math.max(...rows.map(([,s])=>s.at(-1)[0]))];
    const highest = Math.max(...rows.flatMap(([,s])=>s.map(([,value])=>value)));
    const step = highest > 0 ? 10 ** Math.floor(Math.log10(highest/4)) : 1;
    const interval = Math.ceil(highest/(4*step))*step || 1;
    const maxValue = interval*4;
    const x = (date) => left+(date-minDate)/Math.max(1,maxDate-minDate)*(right-left);
    const y = (value) => bottom-value/maxValue*(bottom-top);
    bounds = {left,right,minDate,maxDate,x,y};
    context.font='12px system-ui';
    context.textAlign='right';
    context.textBaseline='middle';
    context.lineWidth=1;
    for (let i=0;i<=4;i++) {
      const value=i*interval;
      context.strokeStyle='#dce8df';
      context.beginPath();context.moveTo(left,y(value));context.lineTo(right,y(value));context.stroke();
      context.fillStyle='#4e675b';
      context.fillText(axisNumber.format(value),left-8,y(value));
    }
    const ticks=width<510?3:6;
    context.textAlign='center';
    context.textBaseline='top';
    for (let i=0;i<ticks;i++) {
      const time=lin(i,ticks,minDate,maxDate);
      const label=new Intl.DateTimeFormat('tr-TR',{month:'short',year:'2-digit',timeZone:'UTC'}).format(time);
      context.fillText(label,clamp(x(time),left+10,right-10),bottom+9);
    }
    for (const [code,points] of rows) {
      context.strokeStyle=colors[code];
      context.lineWidth=1.65;
      context.beginPath();
      points.forEach(([date,value],i)=>i?context.lineTo(x(date),y(value)):context.moveTo(x(date),y(value)));
      context.stroke();
    }
    if (selected === null) return;
    const time = clamp(selected,minDate,maxDate);
    const active = nearest(rows[0][1],time)[0];
    const labelled = rows.map(([code,s])=>[code,nearest(s,active)[1]]);
    const guide = x(active);
    context.strokeStyle='#405d4de0';
    context.lineWidth=1;
    context.setLineDash([4,3]);
    context.beginPath();context.moveTo(guide,top);context.lineTo(guide,bottom);context.stroke();context.setLineDash([]);
    for (const [code,value] of labelled) {
      context.fillStyle=colors[code];context.beginPath();
      context.arc(guide,y(value),3.5,0,2*Math.PI);context.fill();
    }
    const title=document.createElement('strong');
    title.textContent=monthDay.format(active);
    tooltip.replaceChildren(title,...labelled.map(([code,value])=>{
      const line=document.createElement('span');
      const codeLabel=document.createElement('b');
      codeLabel.textContent=code;
      line.append(codeLabel,document.createTextNode(valueNumber.format(value)+(mode==='close'?' TL':'')));
      return line;
    }));
    tooltip.hidden=false;
    tooltip.style.top='12px';
    tooltip.style.left=Math.max(0,Math.min(guide+10,width-tooltip.offsetWidth-2))+'px';
  }
  const observer=new ResizeObserver(render);
  observer.observe(canvas);
  canvas.onpointermove=(event)=>{
    if (!rows.length || !bounds) return;
    const {left,right,minDate,maxDate}=bounds;
    const at=clamp(event.clientX-canvas.getBoundingClientRect().left,left,right);
    selected=minDate+(at-left)/(right-left)*(maxDate-minDate);
    render();
  };
  canvas.onpointerleave=clear;
  canvas.onblur=clear;
  canvas.onkeydown=(event)=>{
    if (!rows.length || !bounds || !['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const dates=rows[0][1];
    const point=nearest(dates,selected ?? bounds.maxDate);
    const idx=dates.indexOf(point);
    const next=event.key==='Home'?0:event.key==='End'?dates.length-1:clamp(idx+(event.key==='ArrowRight'?1:-1),0,dates.length-1);
    selected=dates[next][0];
    render();
  };
  render();
  return ()=>observer.disconnect();
}
