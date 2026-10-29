// Sano Doctor — Agenda de citas: día, semana, lista y sala de espera
import { store, APPT_STATUS, APPT_TYPES, ACTIVE_APPT, apptBadge, DAYS } from '../store.js';
import { saveAppointment, setApptStatus, apptConflicts, freeSlots, markReminded, minToTime, toMin, inBreak } from '../ops.js';
import { esc, toast, openModal, emptyState, fmtDate, fmtDateTime, fmtLongDate, todayKey, dayKey, addDays, fromKey, setBusy, confirmDialog, fmtAgo, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { waPatient, apptWhen } from '../shared.js';
import { pickPatient, openPatientForm, patientAvatar, patientSub } from '../patient.js';

const typeDot = (t) => `<span class="type-dot" style="--c:${APPT_TYPES[t]?.color || '#888'}"></span>`;
let viewState = { day: null, mode: 'dia', doctor: 'all' };

export function mount(el, { params = {} }) {
  const st = viewState;
  let scrolledDay = null;
  st.day = params.day || st.day || todayKey();
  if (params.mode) st.mode = params.mode;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Agenda</h1><p class="view-sub" id="ag-sub"></p></div>
    <div class="view-actions"><button class="btn btn-primary" id="ag-new">${icon('plus')} Nueva cita</button></div></div>
    <div id="ag-wait"></div>
    <div class="card card-flush">
      <div class="toolbar ag-toolbar">
        <div class="row" style="gap:6px"><button class="btn btn-secondary btn-icon btn-sm" id="ag-prev" aria-label="Anterior">${icon('arrowLeft')}</button><button class="btn btn-secondary btn-sm" id="ag-today">Hoy</button><button class="btn btn-secondary btn-icon btn-sm" id="ag-next" aria-label="Siguiente">${icon('arrowRight')}</button><input class="input input-sm" type="date" id="ag-date" style="width:auto"></div>
        <div class="seg" id="ag-mode">${[['dia', 'Día'], ['semana', 'Semana'], ['lista', 'Próximas']].map(([k, l]) => `<button data-m="${k}">${l}</button>`).join('')}</div>
        ${store.activeDoctors.length > 1 ? `<select class="select select-sm" id="ag-doc" style="width:auto"><option value="all">Todos los médicos</option>${store.activeDoctors.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="ag-body"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const byDoc = (a) => st.doctor === 'all' || !a.doctorId || a.doctorId === st.doctor;

  function renderWait() {
    const w = store.waiting.filter(byDoc);
    const inC = store.todayAppts.filter((a) => a.status === 'consulta' && byDoc(a));
    $('#ag-wait').innerHTML = w.length || inC.length ? `<div class="card wait-card" data-tour="waiting"><div class="card-head"><div class="card-title">${icon('clock')} Sala de espera</div><span class="badge badge-warning">${w.length} esperando</span></div>
      <div class="wait-list">${inC.map((a) => `<div class="wait-item in"><span class="kpi-icon tone-violet">${icon('stethoscope')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(a.patientName)}</b><div class="t-sub">En consulta · ${esc(a.time)}</div></div><button class="btn btn-secondary btn-sm" data-open-c="${a.consultationId}">Abrir</button></div>`).join('')}
      ${w.map((a, i) => `<div class="wait-item"><span class="wait-n">${i + 1}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(a.patientName)}</b><div class="t-sub">${typeDot(a.type)}${esc(APPT_TYPES[a.type]?.label || '')} · cita ${esc(a.time)} · espera <b>${fmtAgo(a.arrivedAt)}</b></div></div><button class="btn btn-primary btn-sm" data-attend="${a.id}">${icon('stethoscope')} Atender</button></div>`).join('')}</div></div>` : '';
    bindActions($('#ag-wait'));
  }

  function render() {
    if (!$('#ag-body')) return;
    $('#ag-date').value = st.day;
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
    const d = fromKey(st.day);
    const dayList = store.apptsOn(st.day).filter(byDoc);
    const act = dayList.filter((a) => ACTIVE_APPT.includes(a.status) || a.status === 'atendida');
    $('#ag-sub').textContent = st.mode === 'semana' ? `Semana del ${fmtDate(dayKey(weekStart(d)))}` : `${fmtLongDate(d)} · ${act.length} cita(s)`;
    renderWait();
    if (st.mode === 'dia') renderDay(dayList);
    if (st.mode === 'semana') renderWeek();
    if (st.mode === 'lista') renderList();
  }

  function renderDay(list) {
    const sch = store.settings.schedule;
    const wd = fromKey(st.day).getDay();
    const works = sch.days.includes(wd) || (wd === 6 && sch.sat);
    const start = toMin(wd === 6 && sch.sat ? sch.satStart : sch.start); const end = toMin(wd === 6 && sch.sat ? sch.satEnd : sch.end);
    const step = Number(sch.slot) || 30;
    const slots = [];
    if (works) for (let m = start; m < end; m += step) slots.push(m);
    // Citas fuera del horario también se muestran
    list.forEach((a) => { const m = toMin(a.time); const s = works ? start + Math.floor((m - start) / step) * step : m; if (!slots.includes(s)) slots.push(s); });
    slots.sort((a, b) => a - b);
    const past = st.day < todayKey();
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    $('#ag-body').innerHTML = slots.length ? `<div class="day-grid">${slots.map((s) => {
      const inSlot = list.filter((a) => { const m = toMin(a.time); return m >= s && m < s + step; });
      const busy = inSlot.some((a) => ACTIVE_APPT.includes(a.status) || a.status === 'atendida');
      const isNow = st.day === todayKey() && nowM >= s && nowM < s + step;
      const gone = past || (st.day === todayKey() && s + step <= nowM);
      return `<div class="slot ${isNow ? 'now' : ''} ${gone && !inSlot.length ? 'slot-gone' : ''}"><div class="slot-t">${minToTime(s)}</div><div class="slot-c">
        ${inSlot.map(apptCard).join('')}
        ${!busy && works && inBreak(s, step) ? '<span class="slot-break">Descanso</span>' : !busy && !gone && works ? `<button class="slot-free" data-book="${minToTime(s)}">${icon('plus')} Libre</button>` : ''}
      </div></div>`;
    }).join('')}</div>` : `<div style="padding:20px">${emptyState('calendar', works ? 'Sin horario' : `${DAYS[wd]}: el consultorio no atiende`, 'Cambia el horario de atención en Configuración › Agenda.')}</div>`;
    bindActions($('#ag-body'));
    // Hoy: lleva la vista a la hora actual (solo la primera vez)
    const nowEl = $('#ag-body .slot.now');
    if (nowEl && scrolledDay !== st.day) { scrolledDay = st.day; nowEl.scrollIntoView({ block: 'center' }); }
  }

  function apptCard(a) {
    const s = APPT_STATUS[a.status];
    const tel = a.type === 'telemedicina';
    return `<div class="appt appt-${a.status}" style="--c:${APPT_TYPES[a.type]?.color || '#888'}" data-tour="appt">
      <div class="appt-main click" data-detail="${a.id}">
        <div class="row" style="gap:8px;min-width:0"><b class="appt-time">${esc(a.time)}</b><b class="ellipsis">${esc(a.patientName)}</b></div>
        <div class="t-sub ellipsis">${typeDot(a.type)}${esc(APPT_TYPES[a.type]?.label || '')}${tel ? ' 📹' : ''}${a.reason ? ' · ' + esc(a.reason) : ''}${store.activeDoctors.length > 1 && a.doctor ? ' · ' + esc(a.doctor) : ''}</div>
      </div>
      <div class="appt-act">${apptBadge(a.status)}${quickActions(a)}</div>
    </div>`;
  }
  function quickActions(a) {
    const today = a.date === todayKey();
    if (a.status === 'programada') return `<button class="btn btn-ghost btn-icon btn-sm" data-remind="${a.id}" title="Recordatorio por WhatsApp">${icon('whatsapp')}</button><button class="btn btn-secondary btn-sm" data-confirm="${a.id}">${icon('check')}<span class="hide-sm">Confirmar</span></button>${today ? `<button class="btn btn-primary btn-sm" data-arrive="${a.id}">${icon('door')}<span class="hide-sm">Llegó</span></button>` : ''}`;
    if (a.status === 'confirmada') return `${today ? `<button class="btn btn-primary btn-sm" data-arrive="${a.id}">${icon('door')}<span class="hide-sm">Llegó</span></button>` : `<button class="btn btn-ghost btn-icon btn-sm" data-remind="${a.id}" title="Recordatorio">${icon('whatsapp')}</button>`}`;
    if (a.status === 'espera') return `<button class="btn btn-primary btn-sm" data-attend="${a.id}">${icon('stethoscope')}<span class="hide-sm">Atender</span></button>`;
    if (a.status === 'consulta') return `<button class="btn btn-secondary btn-sm" data-open-c="${a.consultationId}">Abrir</button>`;
    if (a.status === 'no_asistio') return `<button class="btn btn-ghost btn-sm" data-resched="${a.id}">${icon('calendar')}<span class="hide-sm">Reprogramar</span></button>`;
    return '';
  }

  function renderWeek() {
    const ws = weekStart(fromKey(st.day));
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(ws, i)));
    $('#ag-body').innerHTML = `<div class="week-grid">${days.map((k) => {
      const list = store.apptsOn(k).filter(byDoc).filter((a) => a.status !== 'cancelada');
      const d = fromKey(k);
      return `<div class="wcol ${k === todayKey() ? 'today' : ''}"><button class="wcol-h" data-goday="${k}"><span>${DAYS[d.getDay()].slice(0, 3)}</span><b>${d.getDate()}</b><small>${list.length || ''}</small></button>
        <div class="wcol-l">${list.map((a) => `<button class="wappt appt-${a.status}" style="--c:${APPT_TYPES[a.type]?.color}" data-detail="${a.id}"><b>${esc(a.time)}</b><span class="ellipsis">${esc(a.patientName)}</span></button>`).join('') || '<span class="faint small" style="padding:6px">—</span>'}</div></div>`;
    }).join('')}</div>`;
    el.querySelectorAll('[data-goday]').forEach((b) => b.onclick = () => { st.day = b.dataset.goday; st.mode = 'dia'; render(); });
    bindActions($('#ag-body'));
  }

  function renderList() {
    const from = todayKey();
    const list = store.appointments.filter((a) => a.date >= from && ['programada', 'confirmada', 'espera'].includes(a.status) && byDoc(a));
    const unconfirmed = list.filter((a) => a.status === 'programada' && a.date <= dayKey(addDays(new Date(), 1)));
    $('#ag-body').innerHTML = list.length ? `${unconfirmed.length ? `<div class="banner offline-banner" style="margin:12px;border-radius:12px"><span>${icon('whatsapp')} ${unconfirmed.length} cita(s) de hoy y mañana sin confirmar. Envía el recordatorio para reducir las inasistencias.</span></div>` : ''}
      <div class="table-wrap"><table class="table rt"><thead><tr><th>Fecha</th><th>Paciente</th><th class="hide-sm">Tipo / motivo</th><th>Estado</th><th class="r"></th></tr></thead><tbody>
      ${list.map((a) => `<tr><td class="nowrap"><b>${fmtDate(a.date)}</b><div class="t-sub">${DAYS[fromKey(a.date).getDay()]} · ${esc(a.time)}</div></td><td class="click" data-detail="${a.id}"><b>${esc(a.patientName)}</b><div class="t-sub">${esc(a.patientPhone || '')}</div></td><td class="hide-sm small">${typeDot(a.type)}${esc(APPT_TYPES[a.type]?.label || '')}${a.reason ? ' · ' + esc(a.reason) : ''}</td><td>${apptBadge(a.status)}${a.reminded ? '<div class="t-sub">Recordatorio enviado</div>' : ''}</td><td class="r nowrap">${quickActions(a)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div style="padding:20px">${emptyState('calendar', 'No hay citas próximas', 'Agenda una con “Nueva cita”.')}</div>`;
    bindActions($('#ag-body'));
  }

  function bindActions(root) {
    const A = (id) => store.appointment(id);
    root.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => openApptDetail(A(b.dataset.detail)));
    root.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => openApptForm({ date: st.day, time: b.dataset.book, doctorId: st.doctor !== 'all' ? st.doctor : null }));
    root.querySelectorAll('[data-confirm]').forEach((b) => b.onclick = async () => { await setApptStatus(A(b.dataset.confirm), 'confirmada', 'Confirmada por el paciente'); toast('Cita confirmada'); });
    root.querySelectorAll('[data-arrive]').forEach((b) => b.onclick = async () => { await setApptStatus(A(b.dataset.arrive), 'espera', 'Llegó al consultorio'); toast('Paciente en sala de espera'); });
    root.querySelectorAll('[data-attend]').forEach((b) => b.onclick = async () => { setBusy(b, true); const { callPatient } = await import('../consult.js'); try { await callPatient(A(b.dataset.attend)); } catch (e) { toast(e.message, 'danger'); } setBusy(b, false); });
    root.querySelectorAll('[data-open-c]').forEach((b) => b.onclick = async () => { const { openConsultation } = await import('../consult.js'); openConsultation(b.dataset.openC); });
    root.querySelectorAll('[data-remind]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.remind); waPatient('recordatorio', { appt: a, patient: store.patient(a.patientId) || {} }); await markReminded(a); });
    root.querySelectorAll('[data-resched]').forEach((b) => b.onclick = () => openApptForm({ appt: A(b.dataset.resched), reschedule: true }));
  }

  $('#ag-new').onclick = () => openApptForm({ date: st.day >= todayKey() ? st.day : todayKey(), doctorId: st.doctor !== 'all' ? st.doctor : null });
  $('#ag-prev').onclick = () => { st.day = dayKey(addDays(fromKey(st.day), st.mode === 'semana' ? -7 : -1)); render(); };
  $('#ag-next').onclick = () => { st.day = dayKey(addDays(fromKey(st.day), st.mode === 'semana' ? 7 : 1)); render(); };
  $('#ag-today').onclick = () => { st.day = todayKey(); render(); };
  $('#ag-date').onchange = (e) => { if (e.target.value) { st.day = e.target.value; render(); } };
  el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { st.mode = b.dataset.m; render(); });
  const ds = $('#ag-doc'); if (ds) { ds.value = st.doctor; ds.onchange = () => { st.doctor = ds.value; render(); }; }
  render();
  const tick = setInterval(renderWait, 60000);
  const off = store.on('*', (evt) => { if (['appointments', 'settings', 'patients'].includes(evt)) render(); });
  return () => { clearInterval(tick); off(); };
}

const weekStart = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; };

// ======================================================================
// FORMULARIO DE CITA
// ======================================================================
export function openApptForm({ appt = null, patient = null, date = null, time = null, doctorId = null, reschedule = false } = {}) {
  return new Promise((resolve) => {
    let pt = patient || (appt ? store.patient(appt.patientId) || { id: appt.patientId, name: appt.patientName, phone: appt.patientPhone } : null);
    let type = appt?.type || (pt?.visits ? 'control' : 'primera');
    let saved = null;
    const day0 = appt?.date && !reschedule ? appt.date : date || todayKey();
    const doc0 = appt?.doctorId || doctorId || store.mainDoctor?.id || '';
    const m = openModal({
      title: appt ? (reschedule ? 'Reprogramar cita' : 'Editar cita') : 'Nueva cita', size: 'lg',
      sub: appt ? esc(`${appt.patientName} · ${fmtDate(appt.date)} ${appt.time}`) : 'Busca al paciente o regístralo en el momento.',
      body: `<form class="stack" data-f autocomplete="off">
        <div class="field"><label>Paciente *</label><div data-pt></div></div>
        <div class="field"><label>Tipo de cita</label><div class="type-grid">${Object.entries(APPT_TYPES).map(([k, t]) => `<button type="button" class="type-btn ${k === type ? 'on' : ''}" data-type="${k}" style="--c:${t.color}"><span class="type-dot" style="--c:${t.color}"></span>${t.label}<small>${t.minutes} min</small></button>`).join('')}</div></div>
        <div class="form-grid">
          <div class="field"><label>Fecha *</label><input class="input" type="date" name="date" value="${day0}" min="${appt ? '' : todayKey()}"></div>
          <div class="field"><label>Hora *</label><div class="row" style="gap:6px"><select class="select" name="slot"></select><input class="input" type="time" name="time" style="width:120px;flex:none" value="${esc(appt && !reschedule ? appt.time : time || '')}"></div><span class="hint" data-slot-hint></span></div>
          <div class="field"><label>Duración (min)</label><input class="input" name="minutes" inputmode="numeric" value="${appt?.minutes || APPT_TYPES[type].minutes}"></div>
          ${store.activeDoctors.length ? `<div class="field"><label>Médico</label><select class="select" name="doctorId">${store.activeDoctors.map((d) => `<option value="${d.id}" ${d.id === doc0 ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>` : ''}
          <div class="field full"><label>Motivo</label><input class="input" name="reason" value="${esc(appt?.reason || '')}" placeholder="Ej.: control de tensión, dolor lumbar, resultados de laboratorio…"></div>
          <div class="field full"><label>Nota interna</label><input class="input" name="notes" value="${esc(appt?.notes || '')}" placeholder="Opcional"></div>
        </div>
        <div data-conflict></div>
        <label class="check"><input type="checkbox" name="wa" ${appt && !reschedule ? '' : 'checked'}> <span>Enviar la confirmación al paciente por WhatsApp</span></label>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${appt && !reschedule ? 'Guardar' : 'Agendar cita'}</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const F = q('[data-f]').elements;
    const drawPt = () => {
      q('[data-pt]').innerHTML = pt ? `<div class="pt-pick">${patientAvatar(pt)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(pt.name)}</b><div class="t-sub ellipsis">${esc(patientSub(pt) || pt.phone || '')}</div></div>${appt ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-chg>Cambiar</button>`}</div>`
        : `<div class="row row-wrap" style="gap:6px"><button type="button" class="btn btn-secondary grow" data-search>${icon('search')} Buscar paciente</button><button type="button" class="btn btn-secondary grow" data-newpt>${icon('userPlus')} Paciente nuevo</button></div>`;
      const ch = q('[data-chg]') || q('[data-search]');
      if (ch) ch.onclick = async () => { m.el.style.visibility = 'hidden'; const p = await pickPatient({ title: 'Paciente de la cita' }); m.el.style.visibility = ''; if (p) { pt = p; if (!appt) { type = p.visits ? 'control' : 'primera'; drawType(); } drawPt(); } };
      const np = q('[data-newpt]'); if (np) np.onclick = async () => { m.el.style.visibility = 'hidden'; const p = await openPatientForm(); m.el.style.visibility = ''; if (p) { pt = p; type = 'primera'; drawType(); drawPt(); } };
    };
    const drawType = () => { m.el.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === type)); };
    m.el.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { type = b.dataset.type; F.minutes.value = APPT_TYPES[type].minutes; drawType(); drawSlots(); });
    const docId = () => F.doctorId?.value || null;
    const drawSlots = () => {
      const slots = F.date.value ? freeSlots(F.date.value, { doctorId: docId(), minutes: Number(F.minutes.value) || 30 }) : [];
      const cur = F.time.value;
      F.slot.innerHTML = `<option value="">${slots.length ? `${slots.length} horarios libres` : 'Sin horarios libres'}</option>` + slots.map((t) => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
      const wd = F.date.value ? fromKey(F.date.value).getDay() : null;
      q('[data-slot-hint]').textContent = wd != null && !slots.length && !store.settings.schedule.days.includes(wd) && !(wd === 6 && store.settings.schedule.sat) ? `${DAYS[wd]}: fuera del horario de atención (puedes escribir la hora).` : 'Elige un horario libre o escribe la hora.';
      checkConflict();
    };
    const checkConflict = () => {
      const t = F.time.value;
      const list = t && F.date.value ? apptConflicts({ date: F.date.value, time: t, minutes: Number(F.minutes.value) || 30, doctorId: docId(), exceptId: appt?.id }) : [];
      q('[data-conflict]').innerHTML = list.length ? `<div class="vital-alert warning">${icon('alert')} Se cruza con: ${list.map((a) => `<b>${esc(a.time)} ${esc(a.patientName)}</b>`).join(', ')}</div>` : '';
      const dup = pt?.id && F.date.value ? store.apptsOn(F.date.value).find((a) => a.patientId === pt.id && a.id !== appt?.id && ACTIVE_APPT.includes(a.status)) : null;
      if (dup) q('[data-conflict]').innerHTML += `<div class="vital-alert warning mt-xs">${icon('alert')} Este paciente ya tiene cita ese día a las ${esc(dup.time)}.</div>`;
    };
    F.slot.onchange = () => { if (F.slot.value) F.time.value = F.slot.value; checkConflict(); };
    F.time.oninput = checkConflict; F.date.onchange = drawSlots; F.minutes.oninput = debounce(drawSlots, 200);
    if (F.doctorId) F.doctorId.onchange = drawSlots;
    drawPt(); drawSlots();

    const save = async (e) => {
      e?.preventDefault();
      const err = q('[data-err]'); err.textContent = '';
      if (!pt) { err.textContent = 'Selecciona o registra al paciente.'; return; }
      if (!F.date.value || !F.time.value) { err.textContent = 'Indica la fecha y la hora.'; return; }
      if (!appt && `${F.date.value} ${F.time.value}` < `${todayKey()} ${minToTime(new Date().getHours() * 60 + new Date().getMinutes())}` && !(await confirmDialog({ title: 'Hora pasada', message: 'La hora elegida ya pasó. ¿Agendar de todas formas?', confirmText: 'Agendar' }))) return;
      const conf = apptConflicts({ date: F.date.value, time: F.time.value, minutes: Number(F.minutes.value) || 30, doctorId: docId(), exceptId: appt?.id });
      if (conf.length && !(await confirmDialog({ title: 'Horario ocupado', message: `A esa hora ya hay ${conf.length} cita(s). ¿Agendar igual (sobrecupo)?`, confirmText: 'Agendar igual' }))) return;
      const btn = q('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        saved = await saveAppointment({ patient: pt, date: F.date.value, time: F.time.value, minutes: F.minutes.value, type, reason: F.reason.value, notes: F.notes.value, doctorId: docId() }, appt?.id || null);
        const wa = F.wa.checked;
        m.close();
        toast(appt ? (reschedule ? 'Cita reprogramada' : 'Cita actualizada') : `Cita agendada: ${apptWhen(saved)}`);
        if (wa) waPatient(appt ? 'reprogramada' : 'agendada', { appt: saved, patient: store.patient(saved.patientId) || pt });
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
    q('[data-f]').onsubmit = save;
    q('[data-ok]').onclick = save;
  });
}

// ======================================================================
// DETALLE DE CITA
// ======================================================================
export function openApptDetail(a) {
  if (!a) return;
  const p = store.patient(a.patientId);
  const today = a.date === todayKey();
  const m = openModal({
    title: esc(a.patientName), sub: `${fmtLongDate(fromKey(a.date))} · ${esc(a.time)} · ${a.minutes || 30} min`, size: 'md',
    body: `<div class="stack">
      <div class="row row-wrap" style="gap:6px">${apptBadge(a.status)}<span class="badge badge-neutral">${typeDot(a.type)}${esc(APPT_TYPES[a.type]?.label || '')}</span>${a.reminded ? '<span class="badge badge-info">Recordatorio enviado</span>' : ''}</div>
      <div class="kv">
        <div><span>Motivo</span><b>${esc(a.reason || '—')}</b></div><div><span>Médico</span><b>${esc(a.doctor || '—')}</b></div>
        <div><span>Teléfono</span><b>${esc(a.patientPhone || '—')}</b></div><div><span>Historia</span><b>${esc(p?.number || '—')}</b></div>
        ${a.notes ? `<div><span>Nota</span><b>${esc(a.notes)}</b></div>` : ''}${a.arrivedAt ? `<div><span>Llegó</span><b>${fmtDateTime(a.arrivedAt)}</b></div>` : ''}
      </div>
      ${p?.allergies?.length ? `<div class="allergy-strip">${icon('alert')}<span><b>Alergias:</b> ${esc(p.allergies.join(', '))}</span></div>` : ''}
      <div class="section-title">Historial</div>
      <div class="list">${(a.history || []).slice().reverse().map((h) => `<div class="list-item"><div class="grow"><div class="small">${esc(h.note)}</div><div class="t-sub">${fmtDateTime(h.at)} · ${esc(h.by || '')}</div></div></div>`).join('')}</div>
    </div>`,
    footer: `<div class="row row-wrap" style="margin-right:auto;gap:6px">
        ${ACTIVE_APPT.includes(a.status) && a.status !== 'consulta' ? `<button class="btn btn-ghost btn-sm" data-cancel>${icon('x')} Cancelar</button>` : ''}
        ${['programada', 'confirmada'].includes(a.status) && a.date <= todayKey() ? `<button class="btn btn-ghost btn-sm" data-noshow>No asistió</button>` : ''}
      </div>
      <button class="btn btn-whatsapp" data-wa>${icon('whatsapp')}</button>
      <button class="btn btn-secondary" data-pt>${icon('user')} Ficha</button>
      ${a.status !== 'atendida' && a.status !== 'consulta' ? `<button class="btn btn-secondary" data-edit>${icon('calendar')} ${['no_asistio', 'cancelada'].includes(a.status) ? 'Reprogramar' : 'Editar'}</button>` : ''}
      ${today && ['programada', 'confirmada'].includes(a.status) ? `<button class="btn btn-primary" data-arrive>${icon('door')} Llegó</button>` : ''}
      ${a.status === 'espera' || (today && ['programada', 'confirmada'].includes(a.status)) ? `<button class="btn btn-primary" data-attend>${icon('stethoscope')} Atender</button>` : ''}
      ${a.status === 'consulta' ? `<button class="btn btn-primary" data-openc>${icon('stethoscope')} Abrir consulta</button>` : ''}`
  });
  const q = (s) => m.el.querySelector(s);
  const on = (s, fn) => { const b = q(s); if (b) b.onclick = fn; };
  on('[data-wa]', () => {
    const kind = a.status === 'no_asistio' ? 'no_asistio' : a.status === 'cancelada' ? 'cancelada' : 'recordatorio';
    waPatient(kind, { appt: a, patient: p || {} }); if (kind === 'recordatorio') markReminded(a);
  });
  on('[data-pt]', async () => { m.close(); const { openPatient } = await import('../patient.js'); openPatient(a.patientId); });
  on('[data-edit]', () => { m.close(); openApptForm({ appt: a, reschedule: ['no_asistio', 'cancelada'].includes(a.status) }); });
  on('[data-arrive]', async () => { await setApptStatus(a, 'espera', 'Llegó al consultorio'); m.close(); toast('Paciente en sala de espera'); });
  on('[data-attend]', async (e) => { setBusy(e.currentTarget, true); m.close(); const { callPatient } = await import('../consult.js'); try { await callPatient(a); } catch (ex) { toast(ex.message, 'danger'); } });
  on('[data-openc]', async () => { m.close(); const { openConsultation } = await import('../consult.js'); openConsultation(a.consultationId); });
  on('[data-noshow]', async () => { await setApptStatus(a, 'no_asistio', 'No asistió'); m.close(); toast('Marcada como inasistencia', 'warning'); });
  on('[data-cancel]', async () => {
    const m2 = openModal({ title: 'Cancelar cita', size: 'sm', body: `<div class="field"><label>Motivo</label><select class="select" data-r><option>Solicitud del paciente</option><option>Médico no disponible</option><option>Reprogramará luego</option><option>Error al agendar</option></select></div>`, footer: '<button class="btn btn-secondary" data-close>Volver</button><button class="btn btn-danger" data-ok>Cancelar cita</button>' });
    m2.el.querySelector('[data-ok]').onclick = async () => { await setApptStatus(a, 'cancelada', 'Cancelada: ' + m2.el.querySelector('[data-r]').value); m2.close(); m.close(); toast('Cita cancelada', 'warning'); };
  });
}
