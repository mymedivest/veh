/* Profit & Loss dashboard and Table Info page. Needs script.js ($, api, esc, toast, mk, C, pct, showTab) and finform.js. */
let finRows = [], finLast = '';
const FT = Object.assign({ deduction: 0.5, feedback: 85, reimb: 250000, nonCaBudget: 8394000 }, CONFIG.FIN_TARGETS || {});
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mlab = m => MN[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
const fnum = v => Number(v) || 0;
const sumK = (l, k) => l.reduce((s, r) => s + r[k], 0);
const money = v => { const a = Math.abs(v), s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'k' : a.toFixed(0); return v < 0 ? `(RM${s})` : `RM${s}`; };
const grp = v => v < 0 ? '(' + Math.abs(Math.round(v)).toLocaleString('en-MY') + ')' : Math.round(v).toLocaleString('en-MY');

function parseFin(a) {
  const r = { m: a[0].slice(0, 7), seg: String(a[1]), rev: fnum(a[2]), revT: fnum(a[3]), cos: fnum(a[4]), opex: fnum(a[6]), ded: fnum(a[7]), pbtT: fnum(a[9]),
    vis: fnum(a[10]), sec: fnum(a[11]), ncv: fnum(a[12]), reimb: fnum(a[13]), subm: fnum(a[14]), fb: a[15] === '' ? null : fnum(a[15]), resp: fnum(a[16]),
    draw: fnum(a[17]), rep: fnum(a[18]), cash: fnum(a[19]), rem: String(a[20] || '') };
  r.gp = r.rev - r.cos; r.pbt = r.gp - r.opex - r.ded;
  return r;
}
async function loadFin(quiet) {
  try {
    const j = await api('finData');
    finRows = j.rows.filter(a => /^\d{4}-\d\d/.test(a[0])).map(parseFin);
    fillFinFilters(); renderFin();
    $('#plAsof').textContent = 'updated ' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' });
  } catch (e) { if (!finRows.length) $('#plKpis').innerHTML = `<div class="panel" style="grid-column:1/-1">${esc(e.message)}</div>`; if (!quiet) toast(e.message); }
}
function fillFinFilters() {
  const ms = [...new Set(finRows.map(r => r.m))].sort(), opt = ms.map(m => `<option value="${m}">${mlab(m)}</option>`).join('');
  const f = $('#pFrom'), t = $('#pTo'), pf = f.value, pt = t.value, wasLast = !pt || pt === finLast;
  f.innerHTML = t.innerHTML = opt;
  f.value = ms.includes(pf) ? pf : ms[0];
  t.value = wasLast || !ms.includes(pt) ? ms[ms.length - 1] : pt;
  finLast = ms[ms.length - 1];
}
const finView = () => finRows.filter(r => (!$('#pSegment').value || r.seg === $('#pSegment').value) && r.m >= $('#pFrom').value && r.m <= $('#pTo').value);

function renderFin() {
  const v = finView(), ms = [...new Set(v.map(r => r.m))].sort(), L = ms.map(mlab), per = fn => ms.map(m => fn(v.filter(r => r.m === m)));
  const ca = v.filter(r => r.seg === 'CA'), nc = v.filter(r => r.seg === 'Non-CA');
  const pbt = sumK(v, 'pbt'), rev = sumK(v, 'rev'), revT = sumK(v, 'revT'), caRev = sumK(ca, 'rev'), dedPct = caRev ? sumK(ca, 'ded') / caRev * 100 : 0;
  const resp = sumK(v, 'resp'), fb = resp ? v.reduce((s, r) => s + (r.fb == null ? 0 : r.fb * r.resp), 0) / resp : 0;
  const ncv = sumK(v, 'ncv'), vis = sumK(v, 'vis'), sec = sumK(v, 'sec');
  const k = (t, val, sub, c, cls) => `<div class="kpi" style="--c:${c}"><small>${t}</small><b class="${cls || ''}">${val}</b><span>${sub}</span></div>`;
  $('#plKpis').innerHTML =
    k('PBT (period)', money(pbt), `Target ${money(sumK(v, 'pbtT'))}`, '#14b8a6', pbt < 0 ? 'neg' : '') +
    k('Revenue', money(rev), `${pct(rev, revT)}% of ${money(revT)} target`, C.b) +
    k('Non-CA revenue', money(sumK(nc, 'rev')), `${pct(sumK(nc, 'rev'), sumK(nc, 'revT'))}% of ${money(sumK(nc, 'revT'))} target`, '#0ea5e9') +
    k('Contract deduction', dedPct.toFixed(2) + '%', `Target \u2264 ${FT.deduction.toFixed(2)}% \u00b7 gap ${dedPct - FT.deduction >= 0 ? '+' : ''}${(dedPct - FT.deduction).toFixed(2)}pp`, C.y, dedPct > FT.deduction ? 'neg' : 'good') +
    k('Customer feedback', fb.toFixed(0) + '%', `Target ${FT.feedback}% \u00b7 ${resp} respondents`, '#8b5cf6', fb >= FT.feedback ? 'good' : 'neg') +
    k('Non-CA secured value', money(ncv), `${pct(ncv, FT.nonCaBudget)}% of ${money(FT.nonCaBudget)} budget`, '#06b6d4') +
    k('Companies visited', vis, `${sec} secured \u00b7 ${pct(sec, vis)}% conversion`, C.y) +
    k('Reimbursable work', money(sumK(v, 'reimb')), `${sumK(v, 'subm')} submissions \u00b7 target ${money(FT.reimb)}`, '#a855f7');

  const K = { ticks: { callback: x => (x / 1000) + 'k' } };
  const tip = { callbacks: { label: c => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y1' && c.dataset.label.includes('%') ? c.raw + '%' : 'RM ' + grp(c.raw)}` } };
  const leg = { position: 'bottom' };
  const line = (label, data, color, extra) => Object.assign({ type: 'line', label, data, borderColor: color, backgroundColor: color, pointRadius: 3, tension: .25 }, extra);

  mk('pRev', { type: 'bar', data: { labels: L, datasets: [{ label: 'Revenue', backgroundColor: C.b, data: per(l => sumK(l, 'rev')) }, line('Target', per(l => sumK(l, 'revT')), C.y, { borderDash: [6, 4] })] }, options: { scales: { y: K }, plugins: { tooltip: tip, legend: leg } } });
  const pb = per(l => sumK(l, 'pbt'));
  mk('pPbt', { type: 'bar', data: { labels: L, datasets: [{ label: 'PBT', backgroundColor: pb.map(x => x < 0 ? C.r : C.g), data: pb }, line('PBT target', per(l => sumK(l, 'pbtT')), C.y, { borderDash: [6, 4] })] }, options: { scales: { y: K }, plugins: { tooltip: tip, legend: leg } } });
  mk('pSeg', { type: 'bar', data: { labels: L, datasets: [{ label: 'CA', backgroundColor: C.b, data: per(l => sumK(l.filter(r => r.seg === 'CA'), 'rev')) }, { label: 'Non-CA', backgroundColor: '#06b6d4', data: per(l => sumK(l.filter(r => r.seg === 'Non-CA'), 'rev')) }] }, options: { scales: { x: { stacked: true }, y: Object.assign({ stacked: true }, K) }, plugins: { tooltip: tip, legend: leg } } });
  mk('pCost', { type: 'bar', data: { labels: L, datasets: [{ label: 'Cost of sales', backgroundColor: '#64748b', data: per(l => sumK(l, 'cos')) }, { label: 'Operating expenses', backgroundColor: C.y, data: per(l => sumK(l, 'opex')) }, { label: 'Contract deduction', backgroundColor: C.r, data: per(l => sumK(l, 'ded')) }] }, options: { scales: { x: { stacked: true }, y: Object.assign({ stacked: true }, K) }, plugins: { tooltip: tip, legend: leg } } });
  const dd = per(l => { const c = l.filter(r => r.seg === 'CA'), x = sumK(c, 'rev'); return x ? +(sumK(c, 'ded') / x * 100).toFixed(2) : null; });
  mk('pDed', { type: 'line', data: { labels: L, datasets: [line('Deduction % of CA revenue', dd, C.r, { spanGaps: true }), line('Target', L.map(() => FT.deduction), C.g, { borderDash: [6, 4], pointRadius: 0 })] }, options: { scales: { y: { beginAtZero: true, ticks: { callback: x => x + '%' } } }, plugins: { legend: leg } } });
  const fbm = per(l => { const rs = sumK(l, 'resp'); return rs ? Math.round(l.reduce((s, r) => s + (r.fb == null ? 0 : r.fb * r.resp), 0) / rs * 10) / 10 : null; });
  mk('pFb', { type: 'line', data: { labels: L, datasets: [line('Customer feedback %', fbm, '#8b5cf6', { spanGaps: true }), line('Target', L.map(() => FT.feedback), C.g, { borderDash: [6, 4], pointRadius: 0 })] }, options: { scales: { y: { min: 60, max: 100, ticks: { callback: x => x + '%' } } }, plugins: { legend: leg } } });
  mk('pFin', { type: 'bar', data: { labels: L, datasets: [{ label: 'Loan drawdown', backgroundColor: C.g, data: per(l => sumK(l, 'draw')) }, { label: 'Loan repayment', backgroundColor: C.r, data: per(l => sumK(l, 'rep')) }, line('Closing cash', per(l => sumK(l, 'cash')), '#8b5cf6', { yAxisID: 'y1' })] },
    options: { scales: { y: K, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: x => (x / 1000) + 'k' } } }, plugins: { tooltip: tip, legend: leg } } });
  mk('pPipe', { type: 'bar', data: { labels: L, datasets: [{ label: 'Companies visited', backgroundColor: C.b, data: per(l => sumK(l, 'vis')) }, { label: 'Companies secured', backgroundColor: C.g, data: per(l => sumK(l, 'sec')) }, line('Conversion %', per(l => { const x = sumK(l, 'vis'); return x ? +(sumK(l, 'sec') / x * 100).toFixed(1) : null; }), C.y, { yAxisID: 'y1', spanGaps: true })] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: x => x + '%' } } }, plugins: { legend: leg } } });
  renderFinTable();
}

/* ---------- Table Info ---------- */
const FCOLS = [['Month', r => mlab(r.m)], ['Segment', 'seg'], ['Revenue', 'rev', 'm'], ['Revenue target', 'revT', 'm'], ['Cost of sales', 'cos', 'm'], ['Gross profit', 'gp', 'm'], ['Opex', 'opex', 'm'], ['Contract deduction', 'ded', 'm'],
  ['PBT', 'pbt', 'm'], ['PBT target', 'pbtT', 'm'], ['Visited', 'vis', 'i'], ['Secured', 'sec', 'i'], ['Non-CA value', 'ncv', 'm'], ['Reimbursable', 'reimb', 'm'], ['Submissions', 'subm', 'i'], ['Feedback %', 'fb', 'p'],
  ['Respondents', 'resp', 'i'], ['Loan drawdown', 'draw', 'm'], ['Loan repayment', 'rep', 'm'], ['Closing cash', 'cash', 'c'], ['Remarks', 'rem']];
function renderFinTable() {
  const q = $('#fq').value.toLowerCase();
  const l = finRows.filter(r => !q || (mlab(r.m) + ' ' + r.m + ' ' + Object.values(r).join(' ')).toLowerCase().includes(q)).sort((a, b) => a.m.localeCompare(b.m) || a.seg.localeCompare(b.seg));
  $('#fcount').textContent = l.length + ' rows';
  const cellOf = (c, r) => { const k = c[1], t = c[2], x = typeof k === 'function' ? k(r) : r[k];
    if (t === 'm' || t === 'c') return `<td class="num${x < 0 ? ' neg' : ''}">${grp(x)}</td>`;
    if (t === 'i') return `<td class="num">${x}</td>`; if (t === 'p') return `<td class="num">${x == null ? '' : x}</td>`; return `<td>${esc(x)}</td>`; };
  const tot = FCOLS.map(c => c[2] === 'm' && c[1] !== 'cash' || c[2] === 'i' ? `<td class="num"><b>${grp(sumK(l, c[1]))}</b></td>` : '<td></td>');
  tot[0] = '<td><b>Total</b></td>';
  $('#finTable').innerHTML = '<tr>' + FCOLS.map(c => `<th>${c[0]}</th>`).join('') + '</tr>' + l.map(r => '<tr>' + FCOLS.map(c => cellOf(c, r)).join('') + '</tr>').join('') + (l.length ? `<tr class="totals">${tot.join('')}</tr>` : '');
}

/* ---------- wiring ---------- */
['#pSegment', '#pFrom', '#pTo'].forEach(s => $(s).onchange = renderFin);
$('#pReset').onclick = () => { $('#pSegment').value = ''; $('#pFrom').selectedIndex = 0; $('#pTo').selectedIndex = $('#pTo').options.length - 1; renderFin(); };
$('#tableInfoBtn').onclick = () => showTab('fin');
$('#finBack').onclick = () => showTab('pl');
$('#fq').oninput = renderFinTable;
$('#finNew').onclick = () => {
  buildFinForm($('#finForm'), '<button class="btn primary">Save to sheet</button> <button type="button" class="btn" id="finCancel">Cancel</button>');
  $('#finCancel').onclick = () => $('#finDlg').close(); $('#finDlg').showModal();
};
$('#finForm').onsubmit = async e => {
  e.preventDefault();
  try { await api('finAdd', { row: finPayload(e.target) }); toast('Row added to Finance - Dummy'); $('#finDlg').close(); await loadFin(true); }
  catch (err) { toast('Could not save: ' + err.message); }
};
