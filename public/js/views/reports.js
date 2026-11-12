// Sano Doctor — Reportes del consultorio (protegidos con PIN)
import { store, APPT_TYPES, APPT_STATUS, SEX } from '../store.js';
import { methodNet, itemsTotal } from '../ops.js';
import { esc, usd, bs, num, emptyState, startOfDay, endOfDay, addDays, dayKey, fromKey, fmtDate, PAY_METHODS, methodLabel, toCSV, download, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';

const RANGES = { hoy: 'Hoy', '7': '7 días', '30': '30 días', mes: 'Este mes', anio: 'Este año', custom: 'Personalizado' };
const AGE_GROUPS = [['0-11', 0, 11], ['12-17', 12, 17], ['18-39', 18, 39], ['40-59', 40, 59], ['60+', 60, 200]];

export function mount(el) {
  let range = '30';
  let from = dayKey(addDays(new Date(), -29)); let to = dayKey();
  let data = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Consultas, pacientes, diagnósticos más frecuentes, inasistencias e ingresos.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="r-csv">${icon('download')} Excel</button><button class="btn btn-secondary" id="r-print">${icon('print')} Imprimir</button></div></div>
    <div class="card" style="margin-bottom:16px;padding:12px 14px"><div class="row row-wrap"><div class="chips" id="r-ranges"></div><div class="row" id="r-custom" hidden><input class="input input-sm" type="date" id="r-from" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="r-to" style="width:auto"></div>
      ${store.activeDoctors.length > 1 ? `<select class="select select-sm" id="r-doc" style="width:auto"><option value="all">Todos los médicos</option>${store.activeDoctors.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>` : ''}</div></div>
    <div id="r-body"><div class="empty"><div class="spinner"></div></div></div>`;
  const $ = (s) => el.querySelector(s);
  let doctor = 'all';

  function setRange(k) {
    range = k; const now = new Date();
    if (k === 'hoy') { from = to = dayKey(); }
    if (k === '7') { from = dayKey(addDays(now, -6)); to = dayKey(); }
    if (k === '30') { from = dayKey(addDays(now, -29)); to = dayKey(); }
    if (k === 'mes') { from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); to = dayKey(); }
    if (k === 'anio') { from = dayKey(new Date(now.getFullYear(), 0, 1)); to = dayKey(); }
    $('#r-ranges').innerHTML = Object.entries(RANGES).map(([v, l]) => `<button class="chip ${v === range ? 'on' : ''}" data-r="${v}">${l}</button>`).join('');
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => setRange(b.dataset.r));
    $('#r-custom').hidden = k !== 'custom';
    $('#r-from').value = from; $('#r-to').value = to;
    load();
  }

  async function load() {
    $('#r-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    const a = startOfDay(fromKey(from)).toISOString(), b = endOfDay(fromKey(to)).toISOString();
    try {
      const [sales, consults, appts, newPts] = await Promise.all([
        store.salesBetween(a, b), store.listBetween('consultations', 'startedAt', a, b),
        store.listBetween('appointments', 'date', from, to), store.listBetween('patients', 'createdAt', a, b)
      ]);
      data = { sales: sales.filter((s) => s.status !== 'voided'), consults: consults.filter((c) => c.status === 'cerrada'), appts, newPts };
    } catch (e) { $('#r-body').innerHTML = `<div class="card">${emptyState('alert', 'No se pudo cargar', esc(e.message))}</div>`; return; }
    render();
  }

  const top = (map, n = 8) => Object.entries(map).sort((x, y) => y[1] - x[1]).slice(0, n);
  function hbars(rows, fmt = (v) => v, unit = '') {
    if (!rows.length) return emptyState('chart', 'Sin datos en el período');
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return rows.map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${fmt(v)}${unit}"><span class="ellipsis">${esc(k)}</span><div class="track"><i style="width:${Math.max(2, v / max * 100)}%"></i></div><b class="num">${fmt(v)}${unit}</b></div>`).join('');
  }

  function compute() {
    const byDoc = (x) => doctor === 'all' || x.doctorId === doctor;
    const sales = data.sales.filter((s) => doctor === 'all' || s.doctorId === doctor || (!s.doctorId && s.kind === 'servicio'));
    const consults = data.consults.filter(byDoc);
    const appts = data.appts.filter(byDoc);
    const billed = sales.reduce((a, s) => a + (s.total || 0), 0);
    const cost = sales.reduce((a, s) => a + (s.cost || 0), 0);
    const cash = sales.reduce((a, s) => a + (s.received || 0), 0);
    const consultIncome = sales.filter((s) => s.kind === 'consulta').reduce((a, s) => a + s.total, 0);
    const otherIncome = billed - consultIncome;
    const pendingAmt = consults.filter((c) => c.billing === 'pendiente').reduce((a, c) => a + round2(itemsTotal(c.charges) - (c.discount || 0)), 0);
    const free = consults.filter((c) => c.billing === 'sin_cargo').length;
    const patients = new Set(consults.map((c) => c.patientId));
    const firstTime = consults.filter((c) => c.type === 'primera').length;
    const days = []; for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) days.push(dayKey(d));
    const perDay = days.map((k) => [k, consults.filter((c) => c.dayKey === k).length]);
    const incomeDay = days.map((k) => [k, sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.received || 0), 0)]);
    const dx = {}; consults.forEach((c) => (c.diagnoses || []).forEach((d) => { const k = d.code ? `${d.code} · ${d.name}` : d.name; dx[k] = (dx[k] || 0) + 1; }));
    const meds = {}; consults.forEach((c) => (c.rx || []).forEach((r) => { if (r.name) meds[r.name] = (meds[r.name] || 0) + 1; }));
    const types = {}; consults.forEach((c) => { const k = APPT_TYPES[c.type]?.label || 'Otra'; types[k] = (types[k] || 0) + 1; });
    const sex = {}; consults.forEach((c) => { const k = SEX[c.patientSex] || 'Sin indicar'; sex[k] = (sex[k] || 0) + 1; });
    const ages = Object.fromEntries(AGE_GROUPS.map(([l]) => [l + ' años', 0])); consults.forEach((c) => { const g = AGE_GROUPS.find(([, a, b]) => c.age != null && c.age >= a && c.age <= b); if (g) ages[g[0] + ' años']++; });
    const docs = {}; consults.forEach((c) => { const k = c.doctor || 'Sin médico'; docs[k] = (docs[k] || 0) + 1; });
    const services = {}; sales.forEach((s) => (s.items || []).forEach((i) => { const k = i.name; services[k] = (services[k] || 0) + i.price * i.qty; }));
    const methods = {}; sales.forEach((s) => Object.entries(methodNet(s)).forEach(([k, v]) => { methods[k] = (methods[k] || 0) + v; }));
    const apptSt = {}; appts.forEach((a) => { apptSt[a.status] = (apptSt[a.status] || 0) + 1; });
    const past = appts.filter((a) => a.date < dayKey() || ['atendida', 'no_asistio'].includes(a.status));
    const resolved = past.filter((a) => ['atendida', 'no_asistio'].includes(a.status));
    const noShowRate = resolved.length ? (apptSt.no_asistio || 0) / resolved.length * 100 : 0;
    const hours = {}; appts.filter((a) => a.status !== 'cancelada').forEach((a) => { const h = a.time?.slice(0, 2) + ':00'; hours[h] = (hours[h] || 0) + 1; });
    const docsIssued = {}; consults.forEach((c) => (c.docs || []).forEach((d) => { docsIssued[d.kind] = (docsIssued[d.kind] || 0) + 1; }));
    const avgMin = (() => { const l = consults.filter((c) => c.closedAt && c.startedAt).map((c) => (new Date(c.closedAt) - new Date(c.startedAt)) / 60000).filter((x) => x > 0 && x < 240); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; })();
    return { sales, consults, appts, billed, cost, cash, consultIncome, otherIncome, pendingAmt, free, patients, firstTime, perDay, incomeDay, dx, meds, types, sex, ages, docs, services, methods, apptSt, noShowRate, hours, docsIssued, avgMin };
  }

  function render() {
    const c = compute();
    const max = Math.max(1, ...c.perDay.map((x) => x[1]));
    const maxI = Math.max(1, ...c.incomeDay.map((x) => x[1]));
    const showDays = c.perDay.length <= 31;
    const avgTicket = c.consults.length ? c.consultIncome / Math.max(1, c.sales.filter((s) => s.kind === 'consulta').length) : 0;
    $('#r-body').innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Consultas</span><span class="kpi-icon tone-brand">${icon('stethoscope')}</span></div><div class="kpi-value">${c.consults.length}</div><div class="kpi-sub">${c.patients.size} paciente(s) · ${c.firstTime} de primera vez${c.avgMin ? ` · ${num(c.avgMin, 0)} min promedio` : ''}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Pacientes nuevos</span><span class="kpi-icon tone-success">${icon('userPlus')}</span></div><div class="kpi-value">${data.newPts.length}</div><div class="kpi-sub">${store.activePatients.length} activos en total</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Facturado</span><span class="kpi-icon tone-info">${icon('dollar')}</span></div><div class="kpi-value">${usd(c.billed)}</div><div class="kpi-sub">Consultas ${usd(c.consultIncome)} · otros ${usd(c.otherIncome)}${avgTicket ? ` · promedio ${usd(avgTicket)}` : ''}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Inasistencia</span><span class="kpi-icon tone-warning">${icon('calendar')}</span></div><div class="kpi-value">${num(c.noShowRate, 0)}%</div><div class="kpi-sub">${c.apptSt.no_asistio || 0} no asistió · ${c.apptSt.cancelada || 0} canceladas · ${c.appts.length} citas</div></div>
      </div>
      <div class="kpis kpis-sm">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span></div><div class="kpi-value">${usd(c.cash)}</div><div class="kpi-sub text-bs">${bs(c.cash * store.rate)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Por cobrar del período</span></div><div class="kpi-value">${usd(c.pendingAmt)}</div><div class="kpi-sub">${c.free} consulta(s) sin cargo</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Margen de insumos</span></div><div class="kpi-value">${usd(c.billed - c.cost)}</div><div class="kpi-sub">Costo de insumos ${usd(c.cost)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Documentos emitidos</span></div><div class="kpi-value">${Object.values(c.docsIssued).reduce((a, b) => a + b, 0)}</div><div class="kpi-sub">Récipes, reposos, constancias e informes</div></div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><div class="card-title">${icon('stethoscope')} Consultas por día</div></div>
          ${showDays ? `<div class="bars">${c.perDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${v}"><i style="height:${v / max * 100}%"></i><span>${c.perDay.length > 14 ? k.slice(8) : fmtDate(k).slice(0, 5)}</span></div>`).join('')}</div>` : '<p class="muted">Elige un período de 31 días o menos para ver el detalle diario.</p>'}</div>
        <div class="card"><div class="card-head"><div class="card-title">${icon('dollar')} Cobrado por día</div></div>
          ${showDays ? `<div class="bars">${c.incomeDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${usd(v)}"><i style="height:${v / maxI * 100}%"></i><span>${c.incomeDay.length > 14 ? k.slice(8) : fmtDate(k).slice(0, 5)}</span></div>`).join('')}</div>` : '<p class="muted">Elige un período de 31 días o menos.</p>'}</div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('clipboard')} Diagnósticos más frecuentes</div>${hbars(top(c.dx, 10))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('pill')} Medicamentos más indicados</div>${hbars(top(c.meds, 10))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('calendar')} Tipos de consulta</div>${hbars(top(c.types))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('users')} Pacientes por edad y sexo</div>${hbars(Object.entries(c.ages).filter(([, v]) => v))}<div class="mt">${hbars(top(c.sex))}</div></div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('clock')} Horas con más citas</div>${hbars(Object.entries(c.hours).sort())}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('checkCircle')} Estado de las citas</div>${hbars(Object.entries(c.apptSt).map(([k, v]) => [APPT_STATUS[k]?.label || k, v]).sort((a, b) => b[1] - a[1]))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('file')} Servicios e insumos facturados</div>${hbars(top(c.services), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('card')} Formas de pago</div>${Object.keys(c.methods).length ? Object.entries(PAY_METHODS).filter(([k]) => Math.abs(c.methods[k] || 0) > 0.004).map(([k, p]) => `<div class="hbar" title="${p.label}: ${usd(c.methods[k])}"><span class="row"><i style="width:10px;height:10px;border-radius:50%;background:${p.color}"></i>${p.label}</span><div class="track"><i style="width:${Math.max(2, c.methods[k] / Math.max(...Object.values(c.methods)) * 100)}%;background:${p.color}"></i></div><b class="num">${usd(c.methods[k])}</b></div>`).join('') : emptyState('card', 'Sin cobros')}</div>
        ${store.activeDoctors.length > 1 ? `<div class="card"><div class="card-title" style="margin-bottom:10px">${icon('stethoscope')} Consultas por médico</div>${hbars(top(c.docs))}</div>` : ''}
      </div>`;
  }

  $('#r-from').onchange = (e) => { from = e.target.value; load(); };
  $('#r-to').onchange = (e) => { to = e.target.value; load(); };
  const rd = $('#r-doc'); if (rd) rd.onchange = () => { doctor = rd.value; if (data) render(); };
  $('#r-csv').onclick = () => {
    if (!data) return;
    const c = compute();
    download(`reporte-consultas-${from}-${to}.csv`, toCSV([['Consulta', 'Fecha', 'Paciente', 'Cédula', 'Edad', 'Sexo', 'Tipo', 'Médico', 'Motivo', 'Diagnósticos', 'Medicamentos', 'Cobro', 'Monto $'],
      ...c.consults.map((x) => [x.number, x.startedAt.slice(0, 10), x.patientName, x.patientIdDoc, x.age ?? '', SEX[x.patientSex] || '', APPT_TYPES[x.type]?.label || '', x.doctor, x.reason, (x.diagnoses || []).map((d) => `${d.code ? d.code + ' ' : ''}${d.name}`).join(' | '), (x.rx || []).map((r) => r.name).join(' | '), x.billing, round2(itemsTotal(x.charges) - (x.discount || 0)).toFixed(2)]),
      [], ['Documento', 'Tipo', 'Fecha', 'Paciente', 'Detalle', 'Total $', 'Cobrado $', 'Pago'],
      ...c.sales.map((s) => [s.number, s.kind, s.date.slice(0, 10), s.patientName, (s.items || []).map((i) => i.name).join(' + '), (s.total || 0).toFixed(2), (s.received || 0).toFixed(2), (s.payments || []).map((p) => methodLabel(p.method)).join(' + ')])]));
  };
  $('#r-print').onclick = () => {
    if (!data) return;
    const c = compute();
    const tbl = (rows, f = (v) => v) => `<table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${f(v)}</td></tr>`).join('') || '<tr><td>Sin datos</td></tr>'}</tbody></table>`;
    printDoc(`Reporte del ${fmtDate(from)} al ${fmtDate(to)}`, `
      <div class="kpis"><div class="kpi">Consultas<b>${c.consults.length}</b></div><div class="kpi">Pacientes atendidos<b>${c.patients.size}</b></div><div class="kpi">Pacientes nuevos<b>${data.newPts.length}</b></div><div class="kpi">Facturado<b>${usd(c.billed)}</b></div><div class="kpi">Cobrado<b>${usd(c.cash)}</b></div><div class="kpi">Inasistencia<b>${num(c.noShowRate, 0)}%</b></div></div>
      <h2>Diagnósticos más frecuentes</h2>${tbl(top(c.dx, 15))}
      <h2>Medicamentos más indicados</h2>${tbl(top(c.meds, 10))}
      <h2>Tipos de consulta</h2>${tbl(top(c.types))}
      <h2>Pacientes por edad</h2>${tbl(Object.entries(c.ages))}
      <h2>Formas de pago</h2>${tbl(Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => [methodLabel(k), v]), (v) => usd(v))}`);
  };
  setRange('30');
  return null;
}
