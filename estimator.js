async function loadJSON(p){ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) throw new Error(p); return r.json(); }

const byId = id => document.getElementById(id);
const money = n => `$${(Math.round(n*100)/100).toLocaleString()}`;

let FEES = null, PERMITS = null;

async function bootEstimator(){
  try{
    FEES = await loadJSON('./data/fees.village.json');
  }catch(e){ console.warn('fees load failed', e); }
  try{
    PERMITS = await loadJSON('./data/permits.village.json');
  }catch(e){ console.warn('permits load failed', e); }

  const form = byId('estimator-form');
  form.addEventListener('submit', (e)=>{e.preventDefault(); runEstimate();});
  byId('btn-print').addEventListener('click', printSummary);
}

function runEstimate(){
  const addr = byId('addr').value.trim();
  const valuation = Number(byId('valuation').value || 0);
  const desc = byId('desc').value.trim();

  const wantElec = byId('t-elec').checked || /\b(light|outlet|circuit|electrical|recess)/i.test(desc);
  const wantPlum = byId('t-plum').checked || /\b(plumb|sink|toilet|water|drain|fixture)/i.test(desc);
  const wantHVAC = byId('t-hvac').checked || /\b(hvac|furnace|ac|duct|mechanical|vent)/i.test(desc);

  // Base building fees (valuation + plan exam + erosion ctrl)
  let lines = [];
  let total = 0;
  if(FEES){
    const rate = FEES?.building?.res_add_alt_deck_pool?.rate_per_1000 ?? 13.5;
    const planAlt = FEES?.building?.plan_exam?.residential?.alteration ?? 65;
    const erosion = FEES?.building?.erosion_control?.res_additions_alterations ?? 60;
    const minFee = FEES?.minimum_fee ?? 60;

    let building = valuation>0 ? (valuation/1000)*rate : 0;
    if (building && building < minFee) building = minFee;

    if (valuation>0){
      lines.push({label:'Building (res. alteration)', amt:building, meta:`${rate}/$1,000`});
      total += building;
    }
    lines.push({label:'Plan exam (alteration)', amt:planAlt});
    total += planAlt;
    lines.push({label:'Erosion control (res. add/alt)', amt:erosion});
    total += erosion;
  }

  // Trade minimums + inspections
  const inspections = [];
  if (wantElec){
    const min = FEES?.electrical?.portal_minimum ?? 40;
    lines.push({label:'Electrical trade (portal minimum)', amt:min});
    total += min;
    inspections.push('Rough Electrical','Final Electrical');
  }
  if (wantPlum){
    const min = FEES?.plumbing?.portal_minimum ?? 40;
    lines.push({label:'Plumbing trade (portal minimum)', amt:min});
    total += min;
    inspections.push('Rough Plumbing','Final Plumbing');
  }
  if (wantHVAC){
    const min = Math.max(FEES?.hvac?.distribution_minimum ?? 60, 60);
    lines.push({label:'HVAC/Mechanical (minimum)', amt:min});
    total += min;
    inspections.push('Rough HVAC','Mechanical Final');
  }
  // Building final only if valuation/alteration present
  if (valuation>0 || desc){
    inspections.push('Final Building Inspection');
  }

  // Optional per‑fixture reference
  const ref = [];
  const cf = FEES?.electrical?.reference_unit_fees || {};
  const pf = FEES?.plumbing?.reference_unit_fees || {};
  const nRecess = Number(byId('f-recess').value||0);
  const nGfci   = Number(byId('f-gfci').value||0);
  const nOut    = Number(byId('f-outlet').value||0);
  const nWater  = Number(byId('f-water').value||0);
  let refTotal = 0;
  if (nRecess && cf.recessed_light){ ref.push({label:`Recessed lights ×${nRecess}`, amt:nRecess*cf.recessed_light}); refTotal += nRecess*cf.recessed_light; }
  if (nGfci && cf.gfc_outlet){ ref.push({label:`GFCI outlets ×${nGfci}`, amt:nGfci*cf.gfc_outlet}); refTotal += nGfci*cf.gfc_outlet; }
  if (nOut && cf.standard_outlet){ ref.push({label:`Std outlets ×${nOut}`, amt:nOut*cf.standard_outlet}); refTotal += nOut*cf.standard_outlet; }
  if (nWater && pf.water_line){ ref.push({label:`Water lines ×${nWater}`, amt:nWater*pf.water_line}); refTotal += nWater*pf.water_line; }

  // Render
  const out = [];
  out.push(`<div class="sub">Address: ${addr || '<em>(not provided)</em>'}</div>`);
  out.push(`<div class="sub">Project: ${desc || '<em>(not provided)</em>'}${valuation?` · Valuation: ${money(valuation)}`:''}</div>`);

  out.push(`<table class="table" style="margin-top:10px"><thead><tr><th>Fee line</th><th style="text-align:right">Amount</th></tr></thead><tbody>`);
  for(const l of lines){ out.push(`<tr><td>${l.label}${l.meta?` <span class="sub">(${l.meta})</span>`:''}</td><td style="text-align:right">${money(l.amt)}</td></tr>`); }
  out.push(`<tr><th>Total (estimated)</th><th style="text-align:right">${money(total)}</th></tr>`);
  out.push(`</tbody></table>`);

  if (ref.length){
    out.push(`<div class="sub" style="margin-top:6px"><strong>Reference per‑fixture</strong> (portal uses minimums; this is informational):</div>`);
    out.push(`<table class="table"><tbody>`);
    for(const r of ref){ out.push(`<tr><td>${r.label}</td><td style="text-align:right">${money(r.amt)}</td></tr>`); }
    out.push(`<tr><th>Reference subtotal</th><th style="text-align:right">${money(refTotal)}</th></tr>`);
    out.push(`</tbody></table>`);
  }

  if (inspections.length){
    const unique = [...new Set(inspections)];
    out.push(`<div style="margin-top:8px"><strong>Inspections Required</strong><ul>${unique.map(i=>`<li>${i}</li>`).join('')}</ul></div>`);
  }

  out.push(`<div class="sub">Next: you can copy this summary into the Village portal. A printable PDF is available below.</div>`);
  byId('estimator-result').innerHTML = out.join('');
  byId('btn-print').disabled = false;

  // cache for print
  window.__permitnow_summary = { addr, valuation, desc, lines, total, ref, refTotal, inspections };
}

function printSummary(){
  const s = window.__permitnow_summary;
  if(!s){ return; }
  const html = `
  <!doctype html><html><head>
    <meta charset="utf-8">
    <title>PermitNow Summary</title>
    <style>
      body{font:14px/1.45 -apple-system,Segoe UI,Inter,Roboto,sans-serif;margin:24px;color:#111}
      h1{font-size:20px;margin:0 0 12px}
      table{width:100%;border-collapse:collapse;margin:8px 0}
      th,td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left}
      th:last-child,td:last-child{text-align:right}
      .sub{color:#555}
    </style>
  </head><body>
    <h1>PermitNow – Estimate Summary</h1>
    <div class="sub">Address: ${s.addr || '(not provided)'}<br>Project: ${s.desc || '(not provided)'}${s.valuation?` · Valuation: ${money(s.valuation)}`:''}</div>

    <h3>Fees</h3>
    <table><thead><tr><th>Line</th><th>Amount</th></tr></thead><tbody>
      ${s.lines.map(l=>`<tr><td>${l.label}${l.meta?` (${l.meta})`:''}</td><td>${money(l.amt)}</td></tr>`).join('')}
      <tr><th>Total</th><th>${money(s.total)}</th></tr>
    </tbody></table>

    ${s.ref?.length ? `
      <h3>Reference per‑fixture</h3>
      <table><tbody>
        ${s.ref.map(r=>`<tr><td>${r.label}</td><td>${money(r.amt)}</td></tr>`).join('')}
        <tr><th>Reference subtotal</th><th>${money(s.refTotal)}</th></tr>
      </tbody></table>` : ''}

    ${s.inspections?.length ? `
      <h3>Inspections</h3>
      <ul>${[...new Set(s.inspections)].map(i=>`<li>${i}</li>`).join('')}</ul>` : ''}

    <div class="sub" style="margin-top:6px">Generated by PermitNow · ${new Date().toLocaleString()}</div>
    <script>window.print()</script>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.open(); w.document.write(html); w.document.close();
}

window.addEventListener('load', bootEstimator);
