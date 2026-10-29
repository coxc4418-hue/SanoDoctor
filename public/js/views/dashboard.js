// Sano Doctor — Inicio: el día del consultorio de un vistazo
import { store, APPT_TYPES, ACTIVE_APPT, apptBadge } from '../store.js';
import { itemsTotal } from '../ops.js';
import { esc, usd, bs, fmtLongDate, fmtDate, fmtAgo, todayKey, dayKey, addDays, emptyState, qtyFmt, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { waPatient } from '../shared.js';
import { isBirthday, patientAvatar } from '../patient.js';

const due = (c) => round2(itemsTotal(c.charges) - (c.discount || 0));

export function mount(el, { navigate }) {
  function render() {
    const today = todayKey();
    const tomorrow = dayKey(addDays(new Date(), 1));
    const sales = store.recentSales.filter((s) => s.status !== 'voided');
    const todays = sales.filter((s) => s.dayKey === today);
    const income = todays.reduce((a, s) => a + (s.received || 0), 0);
    const appts = store.todayAppts.filter((a) => a.status !== 'cancelada');
    const attended = appts.filter((a) => a.status === 'atendida').length;
    const noShow = appts.filter((a) => a.status === 'no_asistio').length;
    const remaining = appts.filter((a) => ['programada', 'confirmada'].includes(a.status));
    const waiting = store.waiting;
    const pendingTotal = store.pending.reduce((a, c) => a + due(c), 0);
    const tomorrowUnconfirmed = store.apptsOn(tomorrow).filter((a) => a.status === 'programada' && !a.reminded);
    const birthdays = store.activePatients.filter(isBirthday);
    const low = store.lowProducts; const exp = store.expiringProducts;
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const doc = store.mainDoctor;
    const docName = doc ? `${doc.sex === 'F' ? 'Dra.' : 'Dr.'} ${doc.name.replace(/^(dr|dra)\.?\s+/i, '').split(' ')[0]}` : '';
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i - 6)));
    const perDay = days.map((k) => sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.received || 0), 0));
    const maxDay = Math.max(1, ...perDay);
    const nowStr = `${String(hour).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    const nextAppt = remaining.find((a) => a.time >= nowStr) || remaining[0];

    el.innerHTML = `
      <div class="view-header"><div><h1 class="view-title">${hello}${docName ? ', ' + esc(docName) : ''} 👋</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
        <div class="view-actions"><button class="btn btn-secondary" id="d-search">${icon('search')} Buscar paciente</button><button class="btn btn-primary" id="d-new">${icon('plus')} Nueva cita</button></div></div>

      <div class="quick" data-tour="quick">
        <button data-act="appt"><span class="kpi-icon tone-brand">${icon('calendar')}</span><span>Agendar cita<small>${remaining.length} por atender hoy</small></span></button>
        <button data-act="walkin"><span class="kpi-icon tone-violet">${icon('stethoscope')}</span><span>Consulta sin cita<small>Atender ahora</small></span></button>
        <button data-act="patient"><span class="kpi-icon tone-success">${icon('userPlus')}</span><span>Paciente nuevo<small>${store.activePatients.length} registrados</small></span></button>
        <button data-go="caja"><span class="kpi-icon tone-warning">${icon('wallet')}</span><span>${store.openShift ? 'Caja abierta' : 'Abrir caja'}<small>${store.openShift ? 'Turno ' + esc(store.openShift.number) : 'Necesaria para cobrar'}</small></span></button>
      </div>

      <div class="kpis" data-tour="kpis">
        <div class="card kpi click" data-go="agenda"><div class="kpi-top"><span class="kpi-label">Citas de hoy</span><span class="kpi-icon tone-brand">${icon('calendar')}</span></div><div class="kpi-value">${appts.length}</div><div class="kpi-sub">${attended} atendida(s) · ${remaining.length} por llegar${noShow ? ` · <span class="text-danger">${noShow} no asistió</span>` : ''}</div></div>
        <div class="card kpi click" data-go="agenda"><div class="kpi-top"><span class="kpi-label">En sala de espera</span><span class="kpi-icon tone-warning">${icon('clock')}</span></div><div class="kpi-value">${waiting.length}</div><div class="kpi-sub">${waiting[0] ? `Esperando desde ${fmtAgo(waiting[0].arrivedAt)}` : store.openConsults.length ? `${store.openConsults.length} en consulta` : 'Nadie esperando'}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado hoy</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(income)}</div><div class="kpi-sub text-bs">${bs(income * store.rate)}</div></div>
        <div class="card kpi click" data-go="cobrar"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-violet">${icon('file')}</span></div><div class="kpi-value">${usd(pendingTotal)}</div><div class="kpi-sub">${store.pending.length} consulta(s) pendiente(s)</div></div>
      </div>

      ${waiting.length || store.openConsults.length ? `<div class="card wait-card" style="margin-bottom:16px" data-tour="waiting">
        <div class="card-head"><div class="card-title">${icon('clock')} Sala de espera</div>${nextAppt ? `<span class="t-sub">Próxima cita: <b>${esc(nextAppt.time)} ${esc(nextAppt.patientName)}</b></span>` : ''}</div>
        <div class="wait-list">
          ${store.openConsults.map((c) => `<div class="wait-item in"><span class="kpi-icon tone-violet">${icon('stethoscope')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.patientName)}</b><div class="t-sub">En consulta · ${esc(c.number)} · desde ${fmtAgo(c.startedAt)}</div></div><button class="btn btn-secondary btn-sm" data-openc="${c.id}">Continuar</button></div>`).join('')}
          ${waiting.map((a, i) => `<div class="wait-item"><span class="wait-n">${i + 1}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(a.patientName)}</b><div class="t-sub">Cita ${esc(a.time)} · ${esc(APPT_TYPES[a.type]?.label || '')} · espera ${fmtAgo(a.arrivedAt)}</div></div><button class="btn btn-primary btn-sm" data-attend="${a.id}">${icon('stethoscope')} Atender</button></div>`).join('')}
        </div></div>` : ''}

      <div class="grid-main">
        <div class="stack">
          <div class="card card-flush" data-tour="today">
            <div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('calendar')} Agenda de hoy</div><button class="btn btn-ghost btn-sm" data-go="agenda">Ver agenda ${icon('arrowRight')}</button></div>
            ${appts.length ? `<div class="list" style="padding:4px 18px 8px">${appts.map((a) => `<div class="list-item click" data-appt="${a.id}"><b class="appt-time" style="min-width:46px">${esc(a.time)}</b><span class="type-dot" style="--c:${APPT_TYPES[a.type]?.color}"></span><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(a.patientName)}</div><div class="t-sub ellipsis">${esc(APPT_TYPES[a.type]?.label || '')}${a.reason ? ' · ' + esc(a.reason) : ''}</div></div>${apptBadge(a.status)}</div>`).join('')}</div>`
              : `<div style="padding:8px 18px 18px">${emptyState('calendar', 'Sin citas para hoy', 'Agenda una cita o atiende una consulta sin cita.')}</div>`}
          </div>
          <div class="card card-flush">
            <div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('file')} Consultas por cobrar</div><span class="badge ${store.pending.length ? 'badge-danger' : 'badge-neutral'}">${store.pending.length}</span></div>
            ${store.pending.length ? `<div class="list" style="padding:4px 18px 8px">${store.pending.slice(0, 6).map((c) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(c.patientName)}</div><div class="t-sub">${esc(c.number)} · ${fmtAgo(c.closedAt)}${c.diagnoses?.[0] ? ' · ' + esc(c.diagnoses[0].name) : ''}</div></div><b>${usd(due(c))}</b><button class="btn btn-primary btn-sm" data-charge="${c.id}">Cobrar</button></div>`).join('')}</div>`
              : `<div style="padding:8px 18px 18px">${emptyState('checkCircle', 'Todo cobrado', 'Las consultas que cierres sin cobrar aparecerán aquí.')}</div>`}
          </div>
        </div>
        <div class="stack">
          ${tomorrowUnconfirmed.length ? `<div class="card" data-tour="remind"><div class="card-head"><div class="card-title">${icon('whatsapp')} Recordar citas de mañana</div><span class="badge badge-warning">${tomorrowUnconfirmed.length}</span></div>
            <div class="list">${tomorrowUnconfirmed.slice(0, 6).map((a) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(a.patientName)}</div><div class="t-sub">${esc(a.time)} · ${esc(APPT_TYPES[a.type]?.label || '')}</div></div><button class="btn btn-whatsapp btn-sm" data-remind="${a.id}">${icon('whatsapp')}<span class="hide-sm">Recordar</span></button></div>`).join('')}</div></div>` : ''}
          ${birthdays.length ? `<div class="card"><div class="card-head"><div class="card-title">${icon('cake')} Cumpleaños de hoy</div></div>
            <div class="list">${birthdays.slice(0, 5).map((p) => `<div class="list-item">${patientAvatar(p)}<div class="grow click" data-pt="${p.id}" style="min-width:0"><div class="t-name ellipsis">${esc(p.name)}</div><div class="t-sub">${esc(p.phone || 'Sin teléfono')}</div></div>${p.phone ? `<button class="btn btn-whatsapp btn-sm" data-bday="${p.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div></div>` : ''}
          <div class="card">
            <div class="card-head"><div class="card-title">${icon('trend')} Cobrado últimos 7 días</div></div>
            <div class="bars">${days.map((k, i) => `<div class="bar ${k === today ? 'today' : ''}" title="${fmtDate(k)}: ${usd(perDay[i])}"><i style="height:${(perDay[i] / maxDay) * 100}%"></i><span>${['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(k + 'T12:00').getDay()]}</span></div>`).join('')}</div>
          </div>
          <div class="card" data-tour="stock">
            <div class="card-head"><div class="card-title">${icon('box')} Insumos y medicinas</div>${low.length || exp.length ? `<button class="btn btn-ghost btn-sm" data-go="inventario">Ver ${icon('arrowRight')}</button>` : ''}</div>
            ${low.length || exp.length ? `<div class="list">
              ${low.slice(0, 5).map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(p.name)}</div><div class="t-sub">${esc(p.category || '')} · mínimo ${qtyFmt(p.minStock || 0)}</div></div><span class="badge ${(p.stock || 0) <= 0 ? 'badge-danger' : 'badge-warning'}">${(p.stock || 0) <= 0 ? 'Agotado' : `Quedan ${qtyFmt(p.stock)}`}</span></div>`).join('')}
              ${exp.slice(0, 4).map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(p.name)}</div><div class="t-sub">Lote ${esc(p.lot || '—')} · ${qtyFmt(p.stock)} en existencia</div></div><span class="badge ${p.expiresAt < today ? 'badge-danger' : 'badge-warning'}">${p.expiresAt < today ? 'Vencido' : 'Vence ' + fmtDate(p.expiresAt)}</span></div>`).join('')}
            </div>` : emptyState('box', 'Inventario en orden', 'Sin insumos agotados ni por vencer.')}
          </div>
        </div>
      </div>`;

    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
    el.querySelectorAll('[data-appt]').forEach((b) => b.onclick = async () => { const { openApptDetail } = await import('./agenda.js'); openApptDetail(store.appointment(b.dataset.appt)); });
    el.querySelectorAll('[data-attend]').forEach((b) => b.onclick = async () => { b.disabled = true; const { callPatient } = await import('../consult.js'); try { await callPatient(store.appointment(b.dataset.attend)); } catch (e) { (await import('../utils.js')).toast(e.message, 'danger'); } b.disabled = false; });
    el.querySelectorAll('[data-openc]').forEach((b) => b.onclick = async () => { const { openConsultation } = await import('../consult.js'); openConsultation(b.dataset.openc); });
    el.querySelectorAll('[data-charge]').forEach((b) => b.onclick = async () => { const { chargePending } = await import('../consult.js'); chargePending(store.pending.find((c) => c.id === b.dataset.charge)); });
    el.querySelectorAll('[data-remind]').forEach((b) => b.onclick = async () => { const a = store.appointment(b.dataset.remind); waPatient('recordatorio', { appt: a, patient: store.patient(a.patientId) || {} }); const { markReminded } = await import('../ops.js'); markReminded(a); });
    el.querySelectorAll('[data-bday]').forEach((b) => b.onclick = () => waPatient('cumple', { patient: store.patient(b.dataset.bday) }));
    el.querySelectorAll('[data-pt]').forEach((b) => b.onclick = async () => { const { openPatient } = await import('../patient.js'); openPatient(b.dataset.pt); });
    el.querySelector('[data-act="appt"]').onclick = el.querySelector('#d-new').onclick = async () => { const { openApptForm } = await import('./agenda.js'); openApptForm(); };
    el.querySelector('[data-act="walkin"]').onclick = async () => { const { startWalkIn } = await import('../consult.js'); startWalkIn().catch((e) => import('../utils.js').then((u) => u.toast(e.message, 'danger'))); };
    el.querySelector('[data-act="patient"]').onclick = async () => { const { openPatientForm, openPatient } = await import('../patient.js'); const p = await openPatientForm(); if (p) openPatient(p.id); };
    el.querySelector('#d-search').onclick = () => import('./search.js').then((m) => m.openSearch());
  }
  render();
  const tick = setInterval(render, 60000);
  const off = store.on('*', (evt) => { if (['appointments', 'sales', 'products', 'shift', 'rate', 'pending', 'consults', 'patients', 'settings'].includes(evt)) render(); });
  return () => { clearInterval(tick); off(); };
}
