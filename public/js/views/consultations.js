// Sano Doctor — Consultas: abiertas, por cobrar e historial por fechas
import { store, APPT_TYPES } from '../store.js';
import { itemsTotal } from '../ops.js';
import { esc, usd, emptyState, fmtDate, fmtTime, fmtAgo, normalize, todayKey, dayKey, addDays, startOfDay, endOfDay, fromKey, download, toCSV, round2, toast } from '../utils.js';
import { icon } from '../icons.js';
import { openConsultation, chargePending, startWalkIn } from '../consult.js';

const BILL = {
  abierta: '<span class="badge badge-info">En curso</span>', pendiente: '<span class="badge badge-danger">Por cobrar</span>',
  pagada: '<span class="badge badge-success">Pagada</span>', sin_cargo: '<span class="badge badge-neutral">Sin cargo</span>', anulada: '<span class="badge badge-danger">Anulada</span>'
};
const due = (c) => round2(itemsTotal(c.charges) - (c.discount || 0));
let state = { tab: 'historial', from: null, to: null, q: '', doctor: 'all' };

export function mount(el) {
  state.from ||= dayKey(addDays(new Date(), -6)); state.to ||= todayKey();
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Consultas</h1><p class="view-sub">Historias de cada atención: evaluación, diagnóstico, récipe y documentos.</p></div>
    <div class="view-actions"><button class="btn btn-primary" id="cs-new">${icon('stethoscope')} Consulta sin cita</button></div></div>
    <div class="seg mb" id="cs-tabs">
      <button data-t="abiertas">En curso <span class="seg-n" id="n-open"></span></button>
      <button data-t="pendientes">Por cobrar <span class="seg-n" id="n-pend"></span></button>
      <button data-t="historial">Historial</button>
    </div>
    <div class="card card-flush"><div id="cs-tool"></div><div id="cs-body"></div></div>`;
  const $ = (s) => el.querySelector(s);
  let hist = null; let loading = false;

  async function loadHist() {
    loading = true; renderBody();
    try {
      const list = await store.listBetween('consultations', 'startedAt', startOfDay(fromKey(state.from)).toISOString(), endOfDay(fromKey(state.to)).toISOString());
      hist = list.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    } catch (e) { hist = []; toast('No se pudo cargar el historial: ' + e.message, 'danger'); }
    loading = false; renderBody();
  }

  function renderTool() {
    $('#n-open').textContent = store.openConsults.length || '';
    $('#n-pend').textContent = store.pending.length || '';
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === state.tab));
    $('#cs-tool').innerHTML = state.tab === 'historial' ? `<div class="toolbar">
      <div class="row row-wrap" style="gap:6px"><input type="date" class="input input-sm" id="cs-from" value="${state.from}" style="width:auto"><span class="faint">a</span><input type="date" class="input input-sm" id="cs-to" value="${state.to}" style="width:auto">
      <button class="btn btn-ghost btn-sm" data-r="0">Hoy</button><button class="btn btn-ghost btn-sm" data-r="6">7 días</button><button class="btn btn-ghost btn-sm" data-r="29">30 días</button></div>
      <label class="search grow">${icon('search')}<input id="cs-q" placeholder="Paciente, N° de consulta o diagnóstico…" value="${esc(state.q)}"></label>
      ${store.activeDoctors.length > 1 ? `<select class="select select-sm" id="cs-doc" style="width:auto"><option value="all">Todos los médicos</option>${store.activeDoctors.map((d) => `<option value="${d.id}" ${state.doctor === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}
      <button class="btn btn-secondary btn-sm" id="cs-csv">${icon('download')} CSV</button></div>` : '';
    if (state.tab !== 'historial') return;
    $('#cs-from').onchange = (e) => { state.from = e.target.value || state.from; loadHist(); };
    $('#cs-to').onchange = (e) => { state.to = e.target.value || state.to; loadHist(); };
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { state.to = todayKey(); state.from = dayKey(addDays(new Date(), -Number(b.dataset.r))); renderTool(); loadHist(); });
    let t; $('#cs-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderBody(); }, 150); };
    const ds = $('#cs-doc'); if (ds) ds.onchange = () => { state.doctor = ds.value; renderBody(); };
    $('#cs-csv').onclick = () => {
      const rows = [['Consulta', 'Fecha', 'Paciente', 'Cédula', 'Tipo', 'Médico', 'Motivo', 'Diagnósticos', 'Estado', 'Cobro', 'Monto $']];
      histFiltered().forEach((c) => rows.push([c.number, fmtDate(c.startedAt) + ' ' + fmtTime(c.startedAt), c.patientName, c.patientIdDoc, APPT_TYPES[c.type]?.label || '', c.doctor, c.reason, (c.diagnoses || []).map((d) => `${d.code ? d.code + ' ' : ''}${d.name}`).join(' | '), c.status, c.billing, c.status === 'anulada' ? 0 : due(c)]));
      download(`consultas-${state.from}-a-${state.to}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    };
  }

  function histFiltered() {
    const qq = normalize(state.q);
    return (hist || []).filter((c) => (state.doctor === 'all' || c.doctorId === state.doctor)
      && (!qq || normalize(`${c.patientName} ${c.number} ${c.patientIdDoc || ''} ${c.reason || ''} ${(c.diagnoses || []).map((d) => d.name + ' ' + (d.code || '')).join(' ')}`).includes(qq)));
  }

  const row = (c, action = '') => `<tr class="click" data-open="${c.id}">
    <td class="nowrap"><b>${esc(c.number)}</b><div class="t-sub">${fmtDate(c.startedAt)} ${fmtTime(c.startedAt)}</div></td>
    <td><b class="ellipsis">${esc(c.patientName)}</b><div class="t-sub">${esc(APPT_TYPES[c.type]?.label || '')}${store.activeDoctors.length > 1 && c.doctor ? ' · ' + esc(c.doctor) : ''}</div></td>
    <td class="hide-sm small">${(c.diagnoses || []).slice(0, 2).map((d) => `${d.code ? `<span class="dx-code">${esc(d.code)}</span> ` : ''}${esc(d.name)}`).join('<br>') || `<span class="faint">${esc(c.reason || '—')}</span>`}</td>
    <td class="nowrap">${c.status === 'anulada' ? BILL.anulada : BILL[c.billing] || ''}${c.status !== 'anulada' ? `<div class="t-sub">${usd(due(c))}</div>` : ''}</td>
    <td class="r nowrap">${action}</td></tr>`;
  const table = (rows) => `<div class="table-wrap"><table class="table rt"><thead><tr><th>Consulta</th><th>Paciente</th><th class="hide-sm">Diagnóstico</th><th>Cobro</th><th class="r"></th></tr></thead><tbody>${rows}</tbody></table></div>`;

  function renderBody() {
    const body = $('#cs-body'); if (!body) return;
    if (state.tab === 'abiertas') {
      const list = store.openConsults;
      body.innerHTML = list.length ? table(list.map((c) => row(c, `<span class="t-sub">${fmtAgo(c.startedAt)}</span> <button class="btn btn-primary btn-sm" data-cont="${c.id}">Continuar</button>`)).join(''))
        : `<div style="padding:20px">${emptyState('stethoscope', 'No hay consultas en curso', 'Atiende a un paciente desde la sala de espera o con “Consulta sin cita”.')}</div>`;
    } else if (state.tab === 'pendientes') {
      const list = store.pending;
      const total = list.reduce((a, c) => a + due(c), 0);
      body.innerHTML = list.length ? `<div class="between" style="padding:12px 16px"><span class="muted small">${list.length} consulta(s) cerradas sin cobrar</span><b>Total ${usd(total)}</b></div>` + table(list.map((c) => row(c, `<button class="btn btn-primary btn-sm" data-charge="${c.id}">${icon('dollar')} Cobrar</button>`)).join(''))
        : `<div style="padding:20px">${emptyState('checkCircle', 'Nada por cobrar', 'Todas las consultas están cobradas o exoneradas.')}</div>`;
    } else {
      if (loading || !hist) { body.innerHTML = '<div class="empty"><div class="spinner" style="margin:30px auto"></div></div>'; return; }
      const list = histFiltered();
      const valid = list.filter((c) => c.status !== 'anulada');
      body.innerHTML = list.length ? `<div class="between row-wrap" style="padding:12px 16px;gap:8px"><span class="muted small">${valid.length} consulta(s) · ${new Set(valid.map((c) => c.patientId)).size} paciente(s)</span><span class="small">Facturado <b>${usd(valid.filter((c) => c.billing === 'pagada').reduce((a, c) => a + due(c), 0))}</b> · por cobrar <b>${usd(valid.filter((c) => c.billing === 'pendiente').reduce((a, c) => a + due(c), 0))}</b></span></div>` + table(list.map((c) => row(c)).join(''))
        : `<div style="padding:20px">${emptyState('clipboard', 'Sin consultas en estas fechas', 'Cambia el rango de fechas o la búsqueda.')}</div>`;
    }
    body.querySelectorAll('[data-open]').forEach((r) => r.onclick = (e) => { if (e.target.closest('button')) return; const c = [...store.openConsults, ...store.pending, ...(hist || [])].find((x) => x.id === r.dataset.open); openConsultation(c || r.dataset.open); });
    body.querySelectorAll('[data-cont]').forEach((b) => b.onclick = () => openConsultation(b.dataset.cont));
    body.querySelectorAll('[data-charge]').forEach((b) => b.onclick = () => chargePending(store.pending.find((c) => c.id === b.dataset.charge)));
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { state.tab = b.dataset.t; renderTool(); if (state.tab === 'historial' && !hist) loadHist(); else renderBody(); });
  $('#cs-new').onclick = () => startWalkIn().catch((e) => toast(e.message, 'danger'));
  if (store.openConsults.length) state.tab = 'abiertas';
  renderTool();
  if (state.tab === 'historial') loadHist(); else renderBody();
  return store.on('*', (evt) => {
    if (evt === 'consults' || evt === 'pending') { renderTool(); if (state.tab !== 'historial') renderBody(); else if (evt === 'pending' && !loading) loadHist(); }
  });
}
