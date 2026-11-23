(function(){
'use strict';
const D=window.RADAR||{rows:[],live:[],model:{},watchlist_size:0,board_size:0,early_size:0,live_size:0,as_of:'',source:'',floor_usd:0,model_version:''};
const fmtUsd=n=>{n=Number(n);if(!Number.isFinite(n))return 'n/a';const a=Math.abs(n),s=n<0?'-':'';if(a>=1e12)return s+'$'+(a/1e12).toFixed(2)+'T';if(a>=1e9)return s+'$'+(a/1e9).toFixed(2)+'B';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(1)+'K';return s+'$'+Math.round(a).toLocaleString('en-US')};
const fmtPct=n=>{if(n===null||n===undefined||!Number.isFinite(Number(n)))return 'n/a';const v=Number(n);return (v>0?'+':'')+v.toFixed(2)+'%'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const age=a=>a===null||a===undefined?'unknown':a+' days';
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y));
const belowFloor=r=>Number(r.tvl_usd)<Number(D.floor_usd);
function farmPlan(r){
  const chain=r.chains&&r.chains.length?r.chains[0]:'its main chain';
  const cap=r.tvl_usd>=5e9?250:r.tvl_usd>=1e9?150:r.tvl_usd>=1e8?100:50;
  const hold=r.age_days==null?30:r.age_days<180?60:r.age_days<365?45:30;
  const cat=(r.category||'').toLowerCase();
  let action=`Deposit $${cap} into ${r.name} on ${chain}, use the core feature once, and keep the position open.`;
  if(/lend|cdp|collateral/.test(cat)) action=`Supply $${cap} of a stable asset to ${r.name} on ${chain} and keep lending activity active.`;
  else if(/dex|yield|farm/.test(cat)) action=`Provide $${cap} of liquidity in ${r.name}'s main pool on ${chain} and keep the LP position active.`;
  else if(/bridge/.test(cat)) action=`Bridge $${cap} through ${r.name} to ${chain} and make one follow-up app transaction on destination.`;
  else if(/staking|restak/.test(cat)) action=`Stake $${cap} worth of chain asset through ${r.name} on ${chain} and hold the receipt position.`;
  else if(/perp|deriv/.test(cat)) action=`Deposit $${cap} margin on ${r.name} and place one small hedged trade to create real protocol usage.`;
  else if(/rwa/.test(cat)) action=`Deposit $${cap} into ${r.name}'s onchain yield product on ${chain} and hold through one reporting cycle.`;
  return [
    {t:`Use a fresh wallet funded only for farming and keep seed phrase offline before interacting with ${r.name}.`,c:'under $3 gas',tm:'5 min'},
    {t:action,c:`$${cap} capital + ~$${cap>=150?8:4} gas`,tm:'15 min'},
    {t:`Repeat one qualifying action weekly on ${r.name} (deposit, swap, borrow, or vote) to build consistent activity across snapshots.`,c:'~$2 gas/week',tm:'10 min/week'},
    {t:`Hold the position for at least ${hold} days and avoid withdrawing only around rumors; consistency matters more than bursts.`,c:`$${cap} deployed`,tm:`${hold} days`},
    {t:`Track wallet, chain, dates, tx hashes, and costs in a log so you can prove activity and measure net cost.`,c:'no extra capital',tm:'5 min/week'},
    {t:`Monitor ${r.name} official docs/governance for points or token updates and claim only from links published by the protocol itself.`,c:'no fee to check',tm:'10 min'},
  ];
}
const state={q:'',cat:'All',chain:'All',view:'radar',sort:'rank',dir:'asc',minTvl:0,selected:null};
const cats=uniq((D.rows||[]).map(r=>r.category||'Uncategorized'));
const chains=uniq((D.rows||[]).flatMap(r=>r.chains||[]));
function filtered(){
  let rows=(state.view==='live'? (D.live||[]).map((r,i)=>({...r,rank:i+1,implied_value_usd:r.mcap_usd,token_status:'live',age_days:null,growth_multiplier:1,maturity_multiplier:1,signal_multiplier:1})) : (D.rows||[])).slice();
  if(state.view==='early') rows=rows.filter(belowFloor);
  if(state.view==='watchlist') rows=rows.filter(r=>!belowFloor(r));
  const q=state.q.trim().toLowerCase();
  if(q) rows=rows.filter(r=>[r.name,r.slug,r.category,(r.chains||[]).join(' ')].join(' ').toLowerCase().includes(q));
  if(state.cat!=='All') rows=rows.filter(r=>(r.category||'Uncategorized')===state.cat);
  if(state.chain!=='All') rows=rows.filter(r=>(r.chains||[]).includes(state.chain));
  if(state.minTvl>0) rows=rows.filter(r=>Number(r.tvl_usd)>=state.minTvl);
  const dir=state.dir==='asc'?1:-1;
  rows.sort((a,b)=>{ const k=state.sort; const av=k==='name'?a.name:(k==='change_7d'? (a.change_7d??-99999):Number(a[k]??0)); const bv=k==='name'?b.name:(k==='change_7d'? (b.change_7d??-99999):Number(b[k]??0)); if(av<bv) return -1*dir; if(av>bv) return 1*dir; return (a.rank||0)-(b.rank||0); });
  return rows;
}
function sortBy(k){ if(state.sort===k){state.dir=state.dir==='asc'?'desc':'asc';} else {state.sort=k; state.dir=(k==='rank'||k==='name')?'asc':'desc';} render(); }
function render(){
  const rows=filtered();
  const sel=rows.find(r=>r.slug===state.selected) || rows[0] || null;
  state.selected=sel?sel.slug:null;
  document.getElementById('app').innerHTML=`<div class="wrap">
  <section class="hero">
    <div class="card">
      <span class="pill">DefiLlama snapshot ${esc(D.as_of)} · ${esc(D.model_version)}</span>
      <h1 style="margin-top:10px">Token Launch Radar</h1>
      <p class="muted" style="margin-top:8px;max-width:70ch">Ranks pre-token protocols by implied launch value from snapshot figures only: TVL, 7d growth, age, and signal (chain breadth/category/age window). Watchlist is the floor; early protocols below floor are included when they have no token record.</p>
      <div class="stats">
        <div class="stat"><span class="muted">Watchlist floor</span><b>${fmtUsd(D.floor_usd)}</b></div>
        <div class="stat"><span class="muted">Watchlist covered</span><b>${D.watchlist_size}</b></div>
        <div class="stat"><span class="muted">Ranked rows</span><b>${D.board_size}</b></div>
        <div class="stat"><span class="muted">Early finds</span><b>${D.early_size}</b></div>
      </div>
    </div>
    <div class="card"><h2>Value model</h2><div class="model">implied = TVL × <strong>${D.model.base_multiple}</strong> × growthMult × maturityMult × signalMult
growthMult = 1 + clamp(7d%, <strong>${D.model.growth_floor}</strong>, <strong>${D.model.growth_cap}</strong>) / 100 × <strong>${D.model.growth_weight}</strong>
maturityMult = <strong>${D.model.maturity_floor}</strong> + min(ageDays, ${D.model.maturity_days}) / ${D.model.maturity_days} × <strong>${D.model.maturity_range}</strong>
signalMult = chain/category/age signal, weight <strong>${D.model.signal_weight}</strong>
Unknown age uses ${D.model.unknown_age_days} days. Live-token protocols are shown separately and never ranked by this model.</div></div>
  </section>
  <section class="card">
    <div class="toolbar" role="toolbar" aria-label="View">
      ${[['radar','All pre-token'],['watchlist','Watchlist floor'],['early','Early below floor'],['live','Live tokens']].map(([v,l])=>`<button class="btn" aria-pressed="${state.view===v}" data-view="${v}">${l}</button>`).join('')}
    </div>
    <div class="controls">
      <label>Search<input id="q" type="search" value="${esc(state.q)}" placeholder="name, slug, chain, category"></label>
      <label>Category<select id="cat"><option>All</option>${cats.map(c=>`<option ${state.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label>Chain<select id="chain"><option>All</option>${chains.map(c=>`<option ${state.chain===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label>Min TVL<select id="minTvl">${[0,5e7,1e8,5e8,1e9,5e9].map(v=>`<option value="${v}" ${state.minTvl===v?'selected':''}>${v===0?'Any':fmtUsd(v)+'+'}</option>`).join('')}</select></label>
      <label>Sort<select id="sort">${[['rank','Rank'],['implied_value_usd',state.view==='live'?'Market cap':'Implied value'],['tvl_usd','TVL'],['change_7d','7d change'],['age_days','Age'],['name','Name']].map(([k,l])=>`<option value="${k}" ${state.sort===k?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="muted" style="margin-bottom:8px">${rows.length} shown · click a row for detail and farm plan.</div>
    <div class="layout">
      <div class="table-wrap"><table class="table"><thead><tr>
        <th><button data-sort="rank">#</button></th><th><button data-sort="name">Protocol</button></th><th>Category</th>
        <th><button data-sort="tvl_usd">TVL</button></th><th><button data-sort="change_7d">7d</button></th>
        <th><button data-sort="implied_value_usd">${state.view==='live'?'Mcap':'Implied'}</button></th><th><button data-sort="age_days">Age</button></th><th>Status</th>
      </tr></thead><tbody>
      ${rows.map(r=>{const selc=r.slug===state.selected;const ch=r.change_7d;return `<tr class="${selc?'sel':''}" data-slug="${esc(r.slug)}">
        <td class="num">${r.rank}</td>
        <td><span class="name">${esc(r.name)}</span><span class="sub">${esc(r.slug)} · ${(r.chains||[]).slice(0,3).map(esc).join(', ')||'—'}</span></td>
        <td><span class="badge">${esc(r.category||'Uncategorized')}</span></td>
        <td class="num">${fmtUsd(r.tvl_usd)}</td>
        <td class="num ${ch>0?'pos':ch<0?'neg':''}">${fmtPct(ch)}</td>
        <td class="num">${fmtUsd(state.view==='live'?r.mcap_usd:r.implied_value_usd)}</td>
        <td class="num">${state.view==='live'?'live':age(r.age_days)}</td>
        <td>${state.view==='live'?'<span class="badge">Token live</span>':belowFloor(r)?'<span class="badge early">Early</span>':'<span class="badge">Watchlist</span>'}</td>
      </tr>`;}).join('') || `<tr><td colspan="8"><div class="empty">No protocols match filters. <button class="btn" id="clear">Clear filters</button></div></td></tr>`}
      </tbody></table></div>
      <aside class="card detail" aria-live="polite">${sel?detail(sel):'<div class="empty">Select a protocol.</div>'}</aside>
    </div>
    <div class="foot">Source: ${esc(D.source)}. Implied values are model estimates from snapshot figures, not predictions of token issuance or price. Live-token protocols are excluded from pre-token ranking.</div>
  </section></div>`;
  bind();
}
function detail(r){
  const live=state.view==='live';
  const plan=live?[]:farmPlan(r);
  const max=Math.max(...(D.rows||[]).map(x=>Number(x.implied_value_usd)||1),1);
  const val=Number(live?r.mcap_usd:r.implied_value_usd)||0;
  return `<div class="dhead"><div><span class="pill">${live?'Live token context':'Pre-token radar'}</span><h2>${esc(r.name)}</h2><div class="muted">${esc(r.slug)} · ${esc(r.category||'Uncategorized')} · ${(r.chains||[]).map(esc).join(', ')||'No chain listed'}</div></div><button class="x" id="closeDetail" aria-label="Close detail">×</button></div>
  <div class="kv">
    <div><span>${live?'Market cap':'Implied value'}</span><b>${fmtUsd(val)}</b></div>
    <div><span>TVL</span><b>${fmtUsd(r.tvl_usd)}</b></div>
    <div><span>7d change</span><b class="${r.change_7d>0?'pos':r.change_7d<0?'neg':''}">${fmtPct(r.change_7d)}</b></div>
    <div><span>Age / listed</span><b>${live?'live':age(r.age_days)}${r.listed_at?' · '+esc(r.listed_at):''}</b></div>
  </div>
  ${!live?`<section><h2>Why this rank</h2><div class="model">base = TVL × ${D.model.base_multiple} = ${fmtUsd(r.tvl_usd*D.model.base_multiple)}
growthMult = ${Number(r.growth_multiplier).toFixed(4)} (7d ${fmtPct(r.change_7d)})
maturityMult = ${Number(r.maturity_multiplier).toFixed(4)} (age ${age(r.age_days)})
signalMult = ${Number(r.signal_multiplier).toFixed(4)} (chains/category/age)
implied = ${fmtUsd(r.implied_value_usd)}</div>
  <div style="margin-top:10px"><div class="muted" style="font-size:12px;margin-bottom:4px">Relative implied value</div><div style="height:8px;background:#223431;border-radius:999px"><div style="width:${Math.max(2,Math.min(100,val/max*100)).toFixed(2)}%;height:8px;background:linear-gradient(90deg,#62d39b,#8bd3ff);border-radius:999px"></div></div></div></section>
  <section style="margin-top:14px"><h2>Farm plan</h2><ol class="steps">${plan.map(s=>`<li><div>${esc(s.t)}</div><span class="cost">Cost: ${esc(s.c)} · Time: ${esc(s.tm)}</span></li>`).join('')}</ol></section>`
  :`<section><h2>Live token context</h2><p class="muted">This protocol already has token market data in the snapshot (${r.symbol?esc(r.symbol):'token recorded'}). It is shown for comparison only and excluded from pre-token implied-value ranking.</p></section>`}`;
}
function bind(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view; state.selected=null; if(state.view==='live'){state.sort='rank';state.dir='asc';} render();}));
  document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>sortBy(b.dataset.sort)));
  document.querySelectorAll('tbody tr[data-slug]').forEach(tr=>tr.addEventListener('click',()=>{state.selected=tr.dataset.slug; render();}));
  const q=document.getElementById('q'); if(q) q.addEventListener('input',e=>{state.q=e.target.value; render();});
  const cat=document.getElementById('cat'); if(cat) cat.addEventListener('change',e=>{state.cat=e.target.value; render();});
  const chain=document.getElementById('chain'); if(chain) chain.addEventListener('change',e=>{state.chain=e.target.value; render();});
  const minTvl=document.getElementById('minTvl'); if(minTvl) minTvl.addEventListener('change',e=>{state.minTvl=Number(e.target.value); render();});
  const sort=document.getElementById('sort'); if(sort) sort.addEventListener('change',e=>{state.sort=e.target.value; render();});
  const clear=document.getElementById('clear'); if(clear) clear.addEventListener('click',()=>{state.q='';state.cat='All';state.chain='All';state.minTvl=0;state.sort='rank';state.dir='asc';render();});
  const close=document.getElementById('closeDetail'); if(close) close.addEventListener('click',()=>{state.selected=null; render();});
}
render();
})();