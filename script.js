const els = {
  fees: document.getElementById('fees-content'),
  inspections: document.getElementById('inspections-content'),
  contractors: document.getElementById('contractors-content'),
  contacts: document.getElementById('contacts-content'),
};

async function getJSON(path){
  try{
    const r = await fetch(path, {cache:'no-store'});
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  }catch(e){
    return { __error: `Missing or unreadable: ${path}` };
  }
}

function fallbackRender(target, obj){
  target.innerHTML =
    `<div class="sub">Structure not recognized; showing raw data.</div>
     <pre class="json">${escapeHtml(JSON.stringify(obj,null,2))}</pre>`;
}
const escapeHtml = (s)=>s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));

// ---- FEES ----
function renderFees(data){
  if(data.__error){ els.fees.innerHTML = `<div class="sub">${data.__error}</div>`; return; }

  // Two common shapes supported:
  // A) rev2 structure with building.res_add_alt_deck_pool.rate_per_1000, plan_exam, erosion_control
  // B) simple valuation_schedule array (min/max/base_fee/per_thousand)

  // A) rev2-style
  const a = data?.building?.res_add_alt_deck_pool?.rate_per_1000;
  if (a){
    const planAlt = data?.building?.plan_exam?.residential?.alteration ?? null;
    const deckPool = data?.building?.plan_exam?.residential?.deck_pool ?? null;
    const erosion = data?.building?.erosion_control?.res_additions_alterations ?? null;
    const minFee = data?.minimum_fee ?? null;

    els.fees.innerHTML = `
      <div class="sub">Village valuation schedule; residential alterations.</div>
      <table class="table">
        <tbody>
          <tr><th>Building (res. alteration)</th><td>$${a}/$1,000 of valuation</td></tr>
          ${planAlt!==null ? `<tr><th>Plan Exam (alteration)</th><td>$${planAlt}</td></tr>` : ``}
          ${deckPool!==null ? `<tr><th>Plan Exam (deck/pool)</th><td>$${deckPool}</td></tr>` : ``}
          ${erosion!==null ? `<tr><th>Erosion control (res. add/alt)</th><td>$${erosion}</td></tr>` : ``}
          ${minFee!==null ? `<tr><th>Minimum fee</th><td>$${minFee}</td></tr>` : ``}
        </tbody>
      </table>
      <div class="sub">Mode: <span class="badge">${data.fee_mode || 'village_strict'}</span></div>
    `;
    return;
  }

  // B) valuation_schedule list
  if (Array.isArray(data?.valuation_schedule)){
    els.fees.innerHTML = `
      <div class="sub">Valuation tiers:</div>
      <table class="table">
        <thead><tr><th>Range</th><th>Base</th><th>Per $1,000</th></tr></thead>
        <tbody>
          ${data.valuation_schedule.map(t =>
            `<tr>
              <td>$${t.min.toLocaleString()}–$${t.max.toLocaleString()}</td>
              <td>$${t.base_fee}</td>
              <td>$${t.per_thousand}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    return;
  }

  // Unknown shape → fallback
  fallbackRender(els.fees, data);
}

// ---- INSPECTIONS (from permits.village.json) ----
function renderInspections(data){
  if(data.__error){ els.inspections.innerHTML = `<div class="sub">${data.__error}</div>`; return; }

  const permits = data.permits || data || [];
  if (!permits || (Array.isArray(permits) && !permits.length)){
    fallbackRender(els.inspections, data); return;
  }

  // Normalize to array of {type, requires[], notes}
  const rows = Array.isArray(permits)
    ? permits
    : Object.values(permits);

  els.inspections.innerHTML = `
    <table class="table">
      <thead><tr><th>Permit</th><th>Inspections</th><th>Notes</th></tr></thead>
      <tbody>
        ${rows.map(p => `
          <tr>
            <td>${p.name || p.type || 'Permit'}</td>
            <td>${Array.isArray(p.inspections) ? p.inspections.map(i=>i.type || i).join(', ')
                 : Array.isArray(p.requires) ? p.requires.join(', ') : '—'}</td>
            <td>${p.notes || ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="sub">Reminder: Rough inspections must be approved before covering walls/ceilings when electrical, plumbing, or HVAC are involved.</div>
  `;
}

// ---- CONTRACTORS (placeholder until you supply a JSON) ----
function renderContractors(){
  els.contractors.innerHTML = `
    <div class="sub">Add a <code>data/contractors.json</code> to list MIR (or others), license #, phone, email.</div>
    <table class="table">
      <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
      <tbody>
        <tr><td>MIR Improvements</td><td>—</td><td>—</td><td>—</td></tr>
      </tbody>
    </table>`;
}

// ---- CONTACTS (Village staff) ----
function renderContacts(){
  // You mentioned: Jim Micech, Building Inspector · 262-375-5305
  els.contacts.innerHTML = `
    <table class="table">
      <tbody>
        <tr>
          <th>Building Inspections</th>
          <td>Jim Micech — Building Inspector</td>
          <td>262-375-5305</td>
          <td><a href="tel:12623755305">Call</a></td>
        </tr>
      </tbody>
    </table>
    <div class="sub">We can replace this with a <code>data/contacts.json</code> later if you prefer to manage it in a file.</div>
  `;
}

async function init(){
  // Fees
  renderFees(await getJSON('data/fees.village.json'));

  // Inspections
  renderInspections(await getJSON('data/permits.village.json'));

  // Contractors & contacts (simple placeholders for now)
  renderContractors();
  renderContacts();

  // Notify Squarespace iframe host to resize (if embedded)
  postHeight();
}
function postHeight(){
  const h = document.documentElement.scrollHeight;
  if (window.parent && window.parent !== window){
    window.parent.postMessage({type:'permitnow-height', value:h}, '*');
  }
}
window.addEventListener('load', init);
window.addEventListener('resize', postHeight);
