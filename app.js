import { compare, number, rankings, resultsFor, stockSeries, teamSide } from './metrics.js';
import { associationGraph, drawStocks } from './visuals.js';

const iconPaths = {
  compare:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  weather:'<path d="M4 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.7 1A3.5 3.5 0 0 1 17 17H4zM18 4v3m4 2h-3m1-5-2 2"/>',
  network:'<path d="m6 8 6 4m0 0 6-6m-6 6 5 6"/><circle cx="5" cy="7" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="18" cy="19" r="2.5"/><circle cx="11.5" cy="12" r="2.5"/>',
  stock:'<path d="M4 4v16h16M7 15l4-4 4 2 5-6"/>',
  table:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16M10 10v9"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};
const icon = (name) => '<i aria-hidden="true" data-icon="'+name+'"><svg viewBox="0 0 24 24">'+iconPaths[name]+'</svg></i>';
for (const element of document.querySelectorAll('i[data-icon]')) {
  element.outerHTML = icon(element.dataset.icon);
}
document.querySelector('#open-sources').insertAdjacentHTML('afterbegin',icon('info'));
for (const id of ['open-sources','footer-sources']) {
  document.getElementById(id).onclick = () => document.getElementById('sources').showModal();
}

const views = {
  karsilastir:['Takım karşılaştırması','İki takım seç. Aralarındaki Süper Lig maçlarını, yakın tarihe daha fazla ağırlık vererek karşılaştır.'],
  saha:['Saha koşulları','Takımların şehir, sıcaklık ve rakibe göre Süper Lig performansını keşfet.'],
  ag:['Kulüplerin şirket ağı','Kulüplerden yöneticilere ve belgeli şirket bağlantılarına ilerle.'],
  hisse:['Futbol hisseleri','Borsa İstanbul’daki dört futbol şirketini aynı grafikte karşılaştır.'],
  puan:['Tarihsel puan durumu','Süper Lig kulüplerinin dönem toplamlarını ve sezon puanlarını incele.'],
};
const content = document.getElementById('content');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const state = {
  first:3604, second:3592, years:3, matchesVisible:8, fieldTeam:3604, fieldVenue:'all', fieldMinimum:5, fieldMetric:'points',
  networkTeam:0, networkPerson:null, networkCompany:null, stockYears:0, stockMode:'index', hiddenStocks:new Set(),
  season:'all', query:'',
};
const teamStyles = {
  3604:['GS','#f8dfbc','#862e1c'],3592:['FB','#e3e8fc','#182c76'],3590:['BJK','#e6eae8','#152322'],
  3596:['TS','#d9eaf5','#81344f'],3665:['BFK','#ffe1c5','#84430a'],3688:['GÖZ','#fee6b6','#862d23'],
  3597:['SAM','#ffe4df','#8d382b'],3600:['KON','#e0f1e4','#145c36'],3601:['BUR','#dbece1','#23604b'],
};
const stockColors = { BJKAS:'#586477', FENER:'#a36311', GSRAY:'#bb4c32', TSPOR:'#266b9d' };
const stockTeams = { BJKAS:'Beşiktaş', FENER:'Fenerbahçe', GSRAY:'Galatasaray', TSPOR:'Trabzonspor' };
const outcomeColors = ['#0c7656','#b0c3b7','#996440'];
const teamColors = [outcomeColors[0],outcomeColors[2]];
const nf = (digits) => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const dates = new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const n0 = nf(0), n1 = nf(1), n2 = nf(2);
const shown = (v, digits=n1) => number(v) ? digits.format(v) : '—';
const percent = (v) => number(v) ? '%' + n1.format(v*100) : '—';
const millions = (v) => number(v) ? n2.format(v/1000000)+' mn €' : '—';
const date = (iso) => dates.format(Date.parse(iso));
const html = (value) => String(value ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeExternal = (link) => /^https?:\/\//i.test(link ?? '') ? html(link) : '#';
const empty = (text) => '<p class="empty" role="status">'+html(text)+'</p>';
const head = (title, subtitle='', right='') => '<header class="panel-head"><div><h2>'+html(title)+'</h2>'+
  (subtitle ? '<p>'+html(subtitle)+'</p>' : '')+'</div>'+right+'</header>';
const pill = (text) => '<span class="count-pill">'+html(text)+'</span>';
let data, teams, alphabet, renderCleanup;
const defaultTab = 'karsilastir';

const selectedTab = () => location.hash.slice(1) in views ? location.hash.slice(1) : defaultTab;
function badge(team, big = false) {
  const name = teams.get(team).name;
  const [abbr,bg,fg] = teamStyles[team] ?? [name.replaceAll(' ','').slice(0,3).toLocaleUpperCase('tr-TR'),'#e2eee6','#205541'];
  return '<span class="badge'+(big?' big':'')+'" aria-hidden="true" style="--badge-bg:'+bg+';--badge-fg:'+fg+'">'+html(abbr)+'</span>';
}
const option = (value,label,current) => '<option value="'+html(value)+'"'+(String(value)===String(current)?' selected':'')+'>'+html(label)+'</option>';
const select = (label,id,options,addClass='') => '<label class="field '+addClass+'" for="'+id+'">'+html(label)+'<select id="'+id+'">'+options+'</select></label>';
function teamSelect(label,id,current,disabledTeam) {
  const options = alphabet.filter((t)=>t.id!==disabledTeam).map((t)=>option(t.id,t.name,current)).join('');
  return '<label class="field" for="'+id+'">'+html(label)+'<span class="select-wrap has-badge">'+badge(current)+
    '<select id="'+id+'">'+options+'</select></span></label>';
}
function listenSelect(id, callback) {
  document.getElementById(id).onchange = (event) => {
    callback(event.currentTarget.value);
    render();
    document.getElementById(id)?.focus({preventScroll:true});
  };
}
function statsLine(title,stats,formatter=shown) {
  const magnitudes = stats.map((entry)=>entry.value ?? 0);
  const total = Math.max(1e-9,...magnitudes);
  const sample = stats.map((entry)=>entry.count).join(' / ');
  return '<div class="bar-stat" title="'+html(sample)+' maç"><div class="stat-meta"><strong>'+formatter(stats[0].value)+
    '</strong><span>'+html(title)+'</span><strong>'+formatter(stats[1].value)+'</strong></div><div class="dualbar" aria-hidden="true">'+
    magnitudes.map((v,i)=>'<span class="track"><b style="width:'+100*v/total+'%;background:'+teamColors[i]+'"></b></span>').join('')+'</div></div>';
}
const noteLine = (label,value,count) => '<p class="soft-note"><strong>'+html(label)+'</strong> '+html(value)+(count===undefined?'':' · '+n0.format(count)+' maç')+'</p>';

function comparison() {
  const left=teams.get(state.first).name, right=teams.get(state.second).name;
  const report=compare(data,state.first,state.second,state.years);
  const matches=[...report.games].reverse();
  const controls = '<div class="controls card">'+teamSelect('Takım 1','first-team',state.first,state.second)+
    '<button class="icon-button" type="button" id="swap" aria-label="Takımların yerini değiştir" title="Takımların yerini değiştir">'+icon('compare')+'</button>'+
    teamSelect('Takım 2','second-team',state.second,state.first)+
    select('Zaman ağırlığı','weight-years',[[1,'1 yıl yarı ömür'],[3,'3 yıl yarı ömür'],[5,'5 yıl yarı ömür'],[0,'Tüm maçlar eşit']].map(([v,x])=>option(v,x,state.years)).join(''),'weight-field')+'</div>';
  if (!matches.length) {
    content.innerHTML=controls+'<section class="card">'+empty('Bu iki takımın arşiv kapsamında oynanmış Süper Lig karşılaşması yok.')+'</section>';
    bindComparison();
    return;
  }
  const total=matches.length;
  const subtitle=state.years ? state.years+' yıl yarı ömür · '+date(matches.at(-1).date)+' tarihinden beri' : 'Tüm karşılaşmalar eşit ağırlıkta';
  const average=report.score.map((r)=>shown(r.value,n2));
  const [l,d,r]=report.outcomes;
  const gradient='conic-gradient('+outcomeColors[0]+' 0 '+100*l+'%, '+outcomeColors[1]+' '+100*l+'% '+100*(l+d)+'%, '+outcomeColors[2]+' '+100*(l+d)+'% 100%)';
  const distribution=[left,'Beraberlik',right].map((label,i)=>'<div class="legend-item"><span class="legend-dot" style="--dot:'+outcomeColors[i]+'"></span><span class="legend-label" title="'+html(label)+'">'+html(label)+'</span><strong>'+percent([l,d,r][i])+'</strong></div>').join('');
  const header='<div class="overview-grid"><section class="card panel score-card">'+head('Ortalama skor',subtitle,pill(n0.format(total)+' maç'))+
    '<div class="score"><div class="score-team">'+badge(state.first,true)+'<strong>'+html(left)+'</strong></div>'+
    '<div><span class="score-number">'+average[0]+'<b>–</b>'+average[1]+'</span><span class="score-caption">Maç başına gol</span></div>'+
    '<div class="score-team">'+badge(state.second,true)+'<strong>'+html(right)+'</strong></div></div>'+
    '<div class="xg" aria-label="Beklenen gol, gol modeli"><strong>'+shown(report.goalModel[0],n2)+'</strong><small>Beklenen gol<br>Gol modeli</small><strong>'+shown(report.goalModel[1],n2)+'</strong></div></section>'+
    '<section class="card panel">'+head('Sonuç dağılımı',state.years?'Ağırlıklı gerçekleşen sonuçlar':'Gerçekleşen sonuçlar')+
    '<div class="distribution"><div class="donut" aria-hidden="true" style="background:'+gradient+'"><div><strong>'+total+'</strong><small>MAÇ</small></div></div><div class="legend">'+distribution+'</div></div></section></div>';
  const cols='<div class="bar-column-names"><span>'+html(left)+'</span><span>'+html(right)+'</span></div>';
  const stats=['Şut bazlı xG','Toplam şut','İsabetli şut','Korner','Faul','Sarı kart','Kırmızı kart'];
  const metrics=stats.map((label,i)=>statsLine(label,report.advanced[i],(v)=>shown(v,i===0?n2:n1))).join('');
  const xgCount=report.advanced[0][0].count;
  const matchesRows=matches.slice(0,state.matchesVisible).map((m)=>{
    const reversed=teamSide(m,state.first)===1;
    const [home,away]=m.goals;
    return '<tr><td>'+date(m.date)+'</td><td><a href="https://www.tff.org/Default.aspx?pageID=29&amp;macId='+m.id+
      '" target="_blank" rel="noopener" aria-label="'+html(teams.get(m.home).name)+' - '+html(teams.get(m.away).name)+' TFF maç kaydı">'+
      html(teams.get(m.home).name)+' '+home+'–'+away+' '+html(teams.get(m.away).name)+'</a></td><td>'+html(m.city ?? '—')+
      '</td><td class="num">'+shown(m.temp)+(number(m.temp)?' °C':'')+'</td><td class="num">'+shown(m.advanced[0][Number(reversed)],n2)+' / '+
      shown(m.advanced[0][Number(!reversed)],n2)+'</td></tr>';
  }).join('');
  content.innerHTML=controls+header+'<div class="subgrid"><section class="card panel">'+head('Saha istatistikleri','Maç başına ağırlıklı ortalama')+
    cols+metrics+'<p class="soft-note">'+(xgCount ? 'Şut bazlı xG bulunan '+xgCount+' maç · 2026/27' : 'Bu eşleşmede şut bazlı xG kaydı yok.')+
    '</p></section><section class="card panel">'+head('Kadro, oran ve hava','Mevcut maç kayıtlarından hesaplanır')+cols+
    statsLine('Tam kadro',report.squad,millions)+statsLine('İlk 11',report.eleven,millions)+statsLine('Galibiyet oranı',report.odds,(v)=>shown(v,n2))+
    statsLine('Piyasa galibiyet olasılığı',[report.market[0],report.market[2]],percent)+
    noteLine('Piyasa beraberlik olasılığı',percent(report.market[1].value))+
    noteLine('Beraberlik oranı',shown(report.drawOdds.value,n2))+noteLine('Ortalama sıcaklık',shown(report.temp.value)+' °C',report.temp.count)+
    '</section></div><section class="card panel transcript">'+head('Karşılaşma geçmişi',total+' oynanmış maç',total>8?'<button type="button" class="table-action" id="show-matches">'+
      (state.matchesVisible<total?'Tümünü göster':'Son 8 maçı göster')+'</button>':'')+
    '<div class="table-scroll"><table aria-label="Karşılaşma geçmişi"><thead><tr><th>Tarih</th><th>TFF skoru</th><th>Şehir</th><th class="num">Sıcaklık</th><th class="num">xG · Takım 1 / 2</th></tr></thead><tbody>'+matchesRows+'</tbody></table></div></section>';
  bindComparison();
  const more=document.getElementById('show-matches');
  if (more) more.onclick=()=>{
    state.matchesVisible=state.matchesVisible<total?total:8;
    render();
    document.getElementById('show-matches')?.focus({preventScroll:true});
  };
}
function bindComparison() {
  listenSelect('first-team',(v)=>{state.first=Number(v);state.matchesVisible=8;});
  listenSelect('second-team',(v)=>{state.second=Number(v);state.matchesVisible=8;});
  listenSelect('weight-years',(v)=>{state.years=Number(v);});
  document.getElementById('swap').onclick=()=>{
    [state.first,state.second]=[state.second,state.first];
    render();
    document.getElementById('swap').focus({preventScroll:true});
  };
}

function field() {
  const all=resultsFor(data.matches,state.fieldTeam).filter((m)=>state.fieldVenue==='all' || (state.fieldVenue==='home'?m.home:m.away)===state.fieldTeam);
  const metric=state.fieldMetric;
  const controls='<div class="controls card simple">'+teamSelect('Takım','field-team',state.fieldTeam)+
    select('Saha','field-venue',[['all','Tüm maçlar'],['home','Ev sahibi'],['away','Deplasman']].map(([v,l])=>option(v,l,state.fieldVenue)).join(''))+
    select('Performans ölçüsü','field-metric',[['points','Puan / maç'],['wins','Galibiyet oranı'],['difference','Gol farkı / maç']].map(([v,l])=>option(v,l,metric)).join(''))+
    select('En az maç','field-minimum',[1,3,5,10,20].map((v)=>option(v,v+' maç',state.fieldMinimum)).join(''))+'</div>';
  const kpis=[['city','Şehre göre'],['temperature','Sıcaklığa göre'],['opponent','Rakibe göre']];
  const format=(v)=>metric==='wins'?percent(v):shown(v,n2);
  const cards=kpis.map(([key,title])=>{
    const result=rankings(all,state.fieldTeam,key,state.fieldMinimum,metric);
    const maximum=metric==='wins'?1:metric==='points'?3:Math.max(1,...result.map((g)=>Math.abs(g.value)));
    const lines=result.map((g)=>{
      const title=key==='opponent'?teams.get(g.key).name:g.key;
      return '<div class="rank-row"><strong>'+html(title)+'</strong><span class="num">'+format(g.value)+'</span><small>'+
        g.played+' maç · '+g.wins+' galibiyet</small><span class="track" aria-hidden="true"><b style="width:'+
        100*Math.abs(g.value)/maximum+'%;background:'+(g.value<0?'#996440':'#278362')+'"></b></span></div>';
    }).join('');
    return '<section class="card panel">'+head(title,'Yüksekten düşüğe',pill(result.length+' grup'))+
      (lines||empty('Bu filtrede yeterli maç bulunamadı.'))+'</section>';
  }).join('');
  content.innerHTML=controls+'<div class="condition-summary"><strong>'+html(teams.get(state.fieldTeam).name)+' · '+all.length+
    ' oynanmış maç</strong><span>Maç başına puan hesabı: galibiyet 3, beraberlik 1.</span></div><div class="cond-grid">'+cards+'</div>';
  listenSelect('field-team',(v)=>{state.fieldTeam=Number(v);});
  listenSelect('field-venue',(v)=>{state.fieldVenue=v;});
  listenSelect('field-metric',(v)=>{state.fieldMetric=v;});
  listenSelect('field-minimum',(v)=>{state.fieldMinimum=Number(v);});
}

function network() {
  const linked=new Set(data.links.map((r)=>r[0]));
  const dropdown=option(0,'Tüm kulüpler',state.networkTeam)+alphabet.map((t)=>option(t.id,t.name+(linked.has(t.id)?'':' · kayıt yok'),state.networkTeam)).join('');
  const entries=data.links.filter((r)=>(!state.networkTeam||r[0]===state.networkTeam) &&
    (!state.networkPerson||r[1]===state.networkPerson) && (!state.networkCompany||r[4]===state.networkCompany));
  const title=state.networkPerson??state.networkCompany??(state.networkTeam?teams.get(state.networkTeam).name:'Belgeli bağlantılar');
  const lines=entries.map((r)=>'<article class="company-item"><strong>'+html(r[4])+'</strong><span>'+html(r[1])+' · '+html(r[5])+
    '</span><p>'+html(teams.get(r[0]).name)+' · '+html(r[2])+' · '+html(r[3])+'</p><div class="company-links"><a target="_blank" rel="noopener" href="'+
    safeExternal(r[6])+'">Şirket belgesi</a><a target="_blank" rel="noopener" href="'+safeExternal(r[7])+'">Kulüp belgesi</a></div></article>').join('');
  content.innerHTML='<div class="controls card simple">'+select('Kulüp','network-team',dropdown)+'</div>'+
    '<div class="graph-layout"><section class="card graph-box">'+head('Bağlantı grafiği','Detayları görmek için bir düğüm seç.')+
    '<div class="graph-mount" id="graph-mount"></div><div class="graph-key"><span><i class="legend-dot" style="--dot:#6b8b27"></i>Kulüp</span><span>'+
    '<i class="legend-dot" style="--dot:#3c887d"></i>Yönetici</span><span><i class="legend-dot" style="--dot:#ba7134"></i>Şirket / marka</span></div></section>'+
    '<section class="card panel">'+head(title,entries.length+' kayıt · Kaynak bağlantıları',
      state.networkPerson||state.networkCompany?'<button id="clear-node" class="small-button" type="button">Seçimi kaldır</button>':'')+
    '<div class="company-list">'+(lines||empty('Bu kulüp için arşivde doğrulanmış şirket bağlantısı bulunmuyor.'))+'</div></section></div>';
  const mount=document.getElementById('graph-mount');
  if (!state.networkTeam||linked.has(state.networkTeam)) {
    associationGraph(mount,teams,data.links,state.networkTeam,state.networkPerson,state.networkCompany,(team,person,company)=>{
      state.networkTeam=team;state.networkPerson=person;state.networkCompany=company;
      render();
      if (!person && !company) document.getElementById('network-team').focus({preventScroll:true});
      else document.getElementById('clear-node')?.focus({preventScroll:true});
    });
  } else {
    mount.classList.add('no-graph');
    mount.innerHTML=empty('Bu seçim için grafik verisi yok.');
  }
  listenSelect('network-team',(v)=>{state.networkTeam=Number(v);state.networkPerson=null;state.networkCompany=null;});
  const clear=document.getElementById('clear-node');
  if (clear) clear.onclick=()=>{
    state.networkPerson=null;state.networkCompany=null;
    render();
    document.getElementById('network-team').focus({preventScroll:true});
  };
}

function stocks() {
  const series=stockSeries(data.stocks,state.stockYears,state.stockMode,data.end);
  const mode=state.stockMode;
  const range=select('Zaman aralığı','stock-range',[[1,'Son 1 yıl'],[3,'Son 3 yıl'],[5,'Son 5 yıl'],[0,'Tüm dönem']].map(([v,t])=>option(v,t,state.stockYears)).join(''));
  const display=select('Gösterim','stock-mode',[['index','Düzeltilmiş · 100 bazında'],['close','Kapanış · TL']].map(([v,t])=>option(v,t,mode)).join(''));
  const buttons=[...series].map(([code,points])=>{
    const statistic=points.at(-1)?.[1];
    return '<button type="button" data-stock="'+code+'" class="stock-toggle" aria-pressed="'+String(!state.hiddenStocks.has(code))+'" title="'+
      html(stockTeams[code])+'"><span class="legend-dot" style="--dot:'+stockColors[code]+'"></span><strong>'+code+'</strong><small>'+
      shown(statistic,n2)+(mode==='close'?' TL':'')+'</small></button>';
  }).join('');
  const visible=new Map([...series].filter(([code])=>!state.hiddenStocks.has(code)));
  content.innerHTML='<div class="controls card simple">'+range+display+'</div><section class="card stocks-card">'+
    head('Günlük hisse fiyatları',mode==='index'?'İlk düzeltilmiş kapanış = 100':'Tarihsel seans kapanışı · TL')+
    '<div class="stock-legend" aria-label="Grafikte gösterilen hisseler">'+buttons+'</div>'+
    '<div class="chart-wrap"><canvas id="stock-canvas" role="img" tabindex="0" aria-label="Dört futbol hissesinin günlük zaman serisi. Tarihte ilerlemek için sağ ve sol okları kullanın."></canvas>'+
    '<div id="stock-tooltip" class="chart-tooltip" hidden></div></div>'+
    '<p class="soft-note">'+(mode==='index'?'Düzeltilmiş seri 19 Kasım 2026’ya, TL kapanış serisi 20 Kasım 2026’ya kadar.':'Veriler işlem günlerini kapsar. Son kapanış 20 Kasım 2026.')+'</p></section>';
  renderCleanup=drawStocks(document.getElementById('stock-canvas'),document.getElementById('stock-tooltip'),visible,stockColors,mode);
  listenSelect('stock-range',(v)=>{state.stockYears=Number(v);});
  listenSelect('stock-mode',(v)=>{state.stockMode=v;});
  for (const b of document.querySelectorAll('[data-stock]')) b.onclick=()=>{
    const code=b.dataset.stock;
    if (state.hiddenStocks.has(code)) state.hiddenStocks.delete(code);
    else state.hiddenStocks.add(code);
    render();
    document.querySelector('[data-stock="'+code+'"]').focus({preventScroll:true});
  };
}

function standings() {
  const season=state.season;
  const list=season==='all'?data.teams.map((t)=>({...t, played:t.matches})):
    Object.entries(data.seasons[season]).map(([team,[played,points]])=>({...teams.get(Number(team)),played,points}));
  list.sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'tr'));
  const tableRows = () => {
    const query=state.query.trim().toLocaleLowerCase('tr-TR');
    const rows=list.flatMap((t,i)=>!query||t.name.toLocaleLowerCase('tr-TR').includes(query)?
      ['<tr><td class="num">'+(i+1)+'</td><td class="team-cell"><span>'+badge(t.id)+html(t.name)+'</span></td>'+
        (season==='all'?'<td class="num">'+t.seasons+'</td>':'')+'<td class="num">'+n0.format(t.played)+
        '</td><td class="num points">'+n0.format(t.points)+'</td></tr>']:[]);
    return rows.join('')||'<tr><td colspan="'+(season==='all'?5:4)+'">'+empty('Aramana uyan takım yok.')+'</td></tr>';
  };
  content.innerHTML='<div class="controls card simple">'+select('Sezon','standing-season',option('all','Tüm sezonların toplamı',season)+
    Object.keys(data.seasons).sort().reverse().map((s)=>option(s,s,season)).join(''))+
    '<label class="field" for="lookup">Takım ara<input class="search-input" id="lookup" type="search" value="'+html(state.query)+'" placeholder="Örn. Trabzonspor"></label></div>'+
    '<section class="card panel standings-table">'+head(season==='all'?'Tüm sezonlar toplamı':season+' sezonu',
      'Puan eşitliğinde alfabetik sıralama',pill(list.length+' kulüp'))+
    '<div class="table-scroll"><table aria-label="Süper Lig puanları"><thead><tr><th class="num">Sıra</th><th>Kulüp</th>'+
    (season==='all'?'<th class="num">Sezon</th>':'')+'<th class="num">Maç</th><th class="num">Puan</th></tr></thead><tbody id="standing-rows">'+
    tableRows()+'</tbody></table></div><p class="soft-note">2011/12 ve 2026/27 kapsamla sınırlı. Süper Final’de kazanılan yeni puanlar dahildir.</p></section>';
  listenSelect('standing-season',(v)=>{state.season=v;});
  document.getElementById('lookup').oninput=(e)=>{
    state.query=e.currentTarget.value;
    document.getElementById('standing-rows').innerHTML=tableRows();
  };
}

const renderers={karsilastir:comparison,saha:field,ag:network,hisse:stocks,puan:standings};
function render() {
  if (!data) return;
  if (renderCleanup) {renderCleanup();renderCleanup=undefined;}
  const page=selectedTab();
  const [title,desc]=views[page];
  document.getElementById('hero-title').textContent=title;
  document.getElementById('hero-description').textContent=desc;
  content.setAttribute('aria-labelledby','tab-'+page);
  for (const tab of tabs) {
    tab.setAttribute('aria-selected',String(tab.dataset.tab===page));
    tab.tabIndex=tab.dataset.tab===page?0:-1;
  }
  renderers[page]();
  content.setAttribute('aria-busy','false');
}
function moveTo(tab) {
  if (selectedTab()===tab && location.hash) return;
  location.hash=tab;
}
for (const [i,tab] of tabs.entries()) {
  tab.onclick=()=>moveTo(tab.dataset.tab);
  tab.onkeydown=(event)=>{
    const directions={ArrowRight:1,ArrowLeft:-1};
    const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:
      event.key in directions?(i+directions[event.key]+tabs.length)%tabs.length:null;
    if (index===null) return;
    event.preventDefault();
    tabs[index].focus();
    moveTo(tabs[index].dataset.tab);
  };
}
window.addEventListener('hashchange',render);
fetch(new URL('./data.json',import.meta.url)).then((response)=>{
  if (!response.ok) throw new Error('Veri dosyası okunamadı.');
  return response.json();
}).then((loaded)=>{
  data=loaded;
  teams=new Map(data.teams.map((team)=>[team.id,team]));
  alphabet=[...teams.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  render();
}).catch((error)=>{
  console.error(error);
  content.setAttribute('aria-busy','false');
  content.innerHTML='<div class="card">'+empty('Arşiv yüklenemedi. Sayfayı yenileyip tekrar deneyin.')+'</div>';
});
