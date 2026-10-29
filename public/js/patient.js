// Sano Doctor — Pacientes: formulario de registro y ficha con historia clínica
import { store, SEX, BLOOD_TYPES, CHRONIC_TAGS, ALLERGY_TAGS, APPT_STATUS, APPT_TYPES, apptBadge } from './store.js';
import { savePatient, setPatientActive, addPatientFile, findByIdDoc, startConsultation } from './ops.js';
import { requirePin } from './auth.js';
import { openModal, esc, usd, toast, fmtDate, fmtDateTime, setBusy, confirmDialog, emptyState, initials, colorFor, compressImage, todayKey, methodLabel, normalize } from './utils.js';
import { icon } from './icons.js';
import { ageText, ageOf, bmi, taClass, parseTA } from './clinical.js';
import { waPatient } from './shared.js';
import { habitsText, printHistory } from './docs.js';

const HABITS = {
  tabaco: ['', 'No fuma', 'Ex fumador', 'Fuma ocasionalmente', 'Fuma a diario'],
  alcohol: ['', 'No consume', 'Ocasional / social', 'Fines de semana', 'Frecuente'],
  ejercicio: ['', 'Sedentario', 'Ocasional', '2-3 veces por semana', 'Diario'],
  dieta: ['', 'Balanceada', 'Alta en carbohidratos', 'Alta en grasas', 'Vegetariana', 'Hiposódica', 'Para diabéticos'],
  sueno: ['', 'Normal (7-8 h)', 'Insuficiente', 'Insomnio', 'Excesivo']
};
const HABIT_LABEL = { tabaco: 'Tabaco', alcohol: 'Alcohol', ejercicio: 'Actividad física', dieta: 'Alimentación', sueno: 'Sueño' };

export const patientAvatar = (p, size = '') => `<span class="avatar ${size}" style="background:${colorFor(p.name || '?')}">${esc(initials(p.name))}</span>`;
export const patientSub = (p) => [p.number, p.idDoc && 'C.I. ' + p.idDoc, p.birthDate && ageText(p.birthDate), p.sex && SEX[p.sex]].filter(Boolean).join(' · ');
export function allergyStrip(list = [], note = '') {
  if (!list?.length) return '';
  return `<div class="allergy-strip">${icon('alert')}<span><b>Alergias:</b> ${esc(list.join(', '))}${note ? ` · ${esc(note)}` : ''}</span></div>`;
}

// ======================================================================
// FORMULARIO DE PACIENTE
// ======================================================================
/** Abre el formulario. Resuelve con el paciente guardado o null. */
export function openPatientForm({ patient = null, prefill = {} } = {}) {
  return new Promise((resolve) => {
    const p = { allergies: [], chronic: [], habits: {}, ...prefill, ...(patient || {}) };
    let tab = 'datos';
    let saved = null;
    const allergies = new Set(p.allergies || []);
    const chronic = new Set(p.chronic || []);
    const idParts = String(p.idDoc || '').match(/^([VEJPG])-?(.*)$/i);
    const m = openModal({
      title: patient ? `Editar paciente` : 'Nuevo paciente', sub: patient ? esc(`${p.name} · ${p.number || ''}`) : 'Los campos con * son obligatorios. Lo demás lo puedes completar después.', size: 'lg',
      body: `<div class="tabs" data-tabs><button data-t="datos" class="on">Datos personales</button><button data-t="ant">Antecedentes</button><button data-t="cont">Contacto y seguro</button></div>
        <form class="stack" data-f autocomplete="off">
          <div data-pane="datos" class="form-grid">
            <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(p.name || '')}" placeholder="Ej.: María José González Pérez" autofocus></div>
            <div class="field"><label>Cédula</label><div class="row" style="gap:6px"><select class="select" name="idType" style="width:72px;flex:none">${['V', 'E', 'P', 'J'].map((t) => `<option ${((idParts?.[1] || 'V').toUpperCase() === t) ? 'selected' : ''}>${t}</option>`).join('')}</select><input class="input" name="idNum" inputmode="numeric" value="${esc(idParts ? idParts[2] : p.idDoc || '')}" placeholder="12.345.678"></div><span class="hint" data-dup></span></div>
            <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(p.birthDate || '')}" max="${todayKey()}"><span class="hint" data-age>${p.birthDate ? esc(ageText(p.birthDate)) : 'La edad se calcula sola'}</span></div>
            <div class="field"><label>Sexo</label><div class="seg seg-block" data-sex>${Object.entries(SEX).map(([k, l]) => `<button type="button" data-s="${k}" class="${p.sex === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
            <div class="field"><label>Grupo sanguíneo</label><select class="select" name="bloodType"><option value="">No sabe</option>${BLOOD_TYPES.map((b) => `<option ${p.bloodType === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
            <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel" value="${esc(p.phone || '')}" placeholder="0414-1234567"></div>
            <div class="field"><label>Otro teléfono</label><input class="input" name="phone2" inputmode="tel" value="${esc(p.phone2 || '')}"></div>
            <div class="field"><label>Correo</label><input class="input" name="email" inputmode="email" value="${esc(p.email || '')}"></div>
            <div class="field"><label>Ocupación</label><input class="input" name="occupation" value="${esc(p.occupation || '')}" placeholder="Ej.: docente"></div>
            <div class="field"><label>Estado civil</label><select class="select" name="civilStatus">${['', 'Soltero(a)', 'Casado(a)', 'Concubino(a)', 'Divorciado(a)', 'Viudo(a)'].map((x) => `<option value="${x}" ${p.civilStatus === x ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select></div>
            <div class="field"><label>¿Quién lo refiere?</label><input class="input" name="referredBy" value="${esc(p.referredBy || '')}" placeholder="Ej.: Instagram, otro paciente…"></div>
            <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(p.address || '')}"></div>
          </div>
          <div data-pane="ant" class="stack" hidden>
            <div class="field"><label>${icon('alert')} Alergias</label><div class="chips chips-wrap" data-allergy>${chipList(ALLERGY_TAGS, allergies)}</div>
              <div class="row"><input class="input" data-allergy-new placeholder="Otra alergia (medicamento, alimento…)"><button type="button" class="btn btn-secondary" data-allergy-add>${icon('plus')}</button></div>
              <input class="input" name="allergyNote" value="${esc(p.allergyNote || '')}" placeholder="Reacción que presentó (opcional)"></div>
            <div class="field"><label>Enfermedades crónicas / antecedentes patológicos</label><div class="chips chips-wrap" data-chronic>${chipList(CHRONIC_TAGS, chronic)}</div></div>
            <div class="form-grid">
              <div class="field full"><label>Otros antecedentes personales</label><textarea class="textarea" name="personalHistory" placeholder="Hospitalizaciones, transfusiones, traumatismos…">${esc(p.personalHistory || '')}</textarea></div>
              <div class="field"><label>Quirúrgicos</label><textarea class="textarea" name="surgicalHistory" placeholder="Ej.: apendicectomía (2015)">${esc(p.surgicalHistory || '')}</textarea></div>
              <div class="field"><label>Familiares</label><textarea class="textarea" name="familyHistory" placeholder="Ej.: madre HTA, padre diabético">${esc(p.familyHistory || '')}</textarea></div>
              <div class="field full"><label>Medicamentos que toma actualmente</label><textarea class="textarea" name="currentMeds" placeholder="Ej.: losartán 50 mg una vez al día">${esc(p.currentMeds || '')}</textarea></div>
            </div>
            <div class="section-title">Hábitos</div>
            <div class="form-grid form-grid-3">${Object.entries(HABITS).map(([k, opts]) => `<div class="field"><label>${HABIT_LABEL[k]}</label><select class="select" name="h_${k}">${opts.map((o) => `<option value="${o}" ${p.habits?.[k] === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select></div>`).join('')}</div>
            <div class="form-grid">
              <div class="field" data-gyn ${p.sex === 'M' ? 'hidden' : ''}><label>Gineco-obstétricos</label><textarea class="textarea" name="gynecoHistory" placeholder="Menarquia, FUM, G_ P_ C_ A_, método anticonceptivo, citología…">${esc(p.gynecoHistory || '')}</textarea></div>
              <div class="field"><label>Inmunizaciones</label><textarea class="textarea" name="vaccines" placeholder="Ej.: esquema completo, influenza 2025, COVID-19 3 dosis">${esc(p.vaccines || '')}</textarea></div>
            </div>
          </div>
          <div data-pane="cont" class="form-grid" hidden>
            <div class="field"><label>Seguro / aseguradora</label><input class="input" name="insurance" value="${esc(p.insurance || '')}" placeholder="Particular, Seguros…"></div>
            <div class="field"><label>N° de póliza / carnet</label><input class="input" name="insuranceNumber" value="${esc(p.insuranceNumber || '')}"></div>
            <div class="field"><label>Contacto de emergencia</label><input class="input" name="emergencyName" value="${esc(p.emergencyName || '')}" placeholder="Nombre y parentesco"></div>
            <div class="field"><label>Teléfono de emergencia</label><input class="input" name="emergencyPhone" inputmode="tel" value="${esc(p.emergencyPhone || '')}"></div>
            <div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(p.city || '')}"></div>
            <div class="field full"><label>Notas internas</label><textarea class="textarea" name="notes" placeholder="Solo las ve el consultorio">${esc(p.notes || '')}</textarea></div>
          </div>
          <div class="error-msg" data-err></div>
        </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${patient ? 'Guardar cambios' : 'Registrar paciente'}</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const F = q('[data-f]').elements;
    let sex = p.sex || '';
    m.el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
      tab = b.dataset.t;
      m.el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      m.el.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== tab; });
    });
    m.el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => {
      sex = b.dataset.s; m.el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
      q('[data-gyn]').hidden = sex === 'M';
    });
    F.birthDate.oninput = () => { q('[data-age]').textContent = F.birthDate.value ? ageText(F.birthDate.value) : 'La edad se calcula sola'; };
    const idDoc = () => { const n = F.idNum.value.trim().replace(/[^0-9A-Za-z.]/g, ''); return n ? `${F.idType.value}-${n}` : ''; };
    const checkDup = () => { const d = findByIdDoc(idDoc(), patient?.id); q('[data-dup]').innerHTML = d ? `<span class="text-danger">Ya registrada: <b>${esc(d.name)}</b> (${esc(d.number || '')})</span>` : ''; };
    F.idNum.oninput = checkDup; F.idType.onchange = checkDup;
    const bindChips = (sel, set) => m.el.querySelectorAll(`${sel} [data-chip]`).forEach((b) => b.onclick = () => { const v = b.dataset.chip; set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle('on', set.has(v)); });
    bindChips('[data-allergy]', allergies); bindChips('[data-chronic]', chronic);
    const addAllergy = () => {
      const v = q('[data-allergy-new]').value.trim(); if (!v) return;
      allergies.add(v); q('[data-allergy-new]').value = '';
      q('[data-allergy]').innerHTML = chipList([...new Set([...ALLERGY_TAGS, ...allergies])], allergies); bindChips('[data-allergy]', allergies);
    };
    q('[data-allergy-add]').onclick = addAllergy;
    q('[data-allergy-new]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergy(); } };
    // Alergias personalizadas ya guardadas
    if ([...allergies].some((a) => !ALLERGY_TAGS.includes(a))) { q('[data-allergy]').innerHTML = chipList([...new Set([...ALLERGY_TAGS, ...allergies])], allergies); bindChips('[data-allergy]', allergies); }
    if ([...chronic].some((a) => !CHRONIC_TAGS.includes(a))) { q('[data-chronic]').innerHTML = chipList([...new Set([...CHRONIC_TAGS, ...chronic])], chronic); bindChips('[data-chronic]', chronic); }

    const save = async (e) => {
      e?.preventDefault();
      const err = q('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre del paciente.'; m.el.querySelector('[data-t="datos"]').click(); F.name.focus(); return; }
      if (F.birthDate.value && F.birthDate.value > todayKey()) { err.textContent = 'La fecha de nacimiento no puede ser futura.'; return; }
      const data = {
        name: F.name.value, idDoc: idDoc(), birthDate: F.birthDate.value, sex, bloodType: F.bloodType.value, phone: F.phone.value, phone2: F.phone2.value, email: F.email.value,
        occupation: F.occupation.value, civilStatus: F.civilStatus.value, referredBy: F.referredBy.value, address: F.address.value, city: F.city.value,
        allergies: [...allergies], allergyNote: F.allergyNote.value, chronic: [...chronic], personalHistory: F.personalHistory.value, surgicalHistory: F.surgicalHistory.value,
        familyHistory: F.familyHistory.value, currentMeds: F.currentMeds.value, habits: Object.fromEntries(Object.keys(HABITS).map((k) => [k, F['h_' + k].value]).filter(([, v]) => v)),
        gynecoHistory: sex === 'M' ? '' : F.gynecoHistory.value, vaccines: F.vaccines.value,
        insurance: F.insurance.value, insuranceNumber: F.insuranceNumber.value, emergencyName: F.emergencyName.value, emergencyPhone: F.emergencyPhone.value, notes: F.notes.value
      };
      const btn = q('[data-ok]'); setBusy(btn, true, 'Guardando…');
      try {
        saved = await savePatient(data, patient?.id || null);
        toast(patient ? 'Paciente actualizado' : `Paciente registrado · ${saved.number}`);
        m.close();
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
    q('[data-f]').onsubmit = save;
    q('[data-ok]').onclick = save;
  });
}
function chipList(all, set) { return all.map((t) => `<button type="button" class="chip ${set.has(t) ? 'on' : ''}" data-chip="${esc(t)}">${esc(t)}</button>`).join(''); }

/** Selector de paciente con búsqueda y registro rápido. Resuelve con el paciente o null. */
export function pickPatient({ title = 'Seleccionar paciente', allowNew = true } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search">${icon('search')}<input data-q placeholder="Nombre, cédula, teléfono o N° de historia" autofocus autocomplete="off"></label><div class="list pick-list" data-l></div></div>`,
      footer: `${allowNew ? `<button class="btn btn-secondary" data-new style="margin-right:auto">${icon('userPlus')} Paciente nuevo</button>` : ''}<button class="btn btn-ghost" data-close>Cancelar</button>`,
      onClose: () => resolve(picked)
    });
    const draw = (qv = '') => {
      const t = normalize(qv);
      const list = store.activePatients.filter((p) => !t || normalize(`${p.name} ${p.idDoc} ${p.phone} ${p.number}`).includes(t))
        .sort((a, b) => (b.lastVisitAt || '').localeCompare(a.lastVisitAt || '')).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.map((p) => `<div class="list-item click" data-p="${p.id}">${patientAvatar(p)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(patientSub(p))}</div></div>${p.allergies?.length ? `<span class="badge badge-danger" title="Alergias">${icon('alert')}</span>` : ''}</div>`).join('') || emptyState('users', t ? 'Sin coincidencias' : 'Aún no hay pacientes', allowNew ? 'Toca “Paciente nuevo” para registrarlo.' : '');
      m.el.querySelectorAll('[data-p]').forEach((x) => x.onclick = () => { picked = store.patient(x.dataset.p); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = async () => {
      const qv = m.el.querySelector('[data-q]').value.trim();
      const isId = /^\d[\d.]{4,}$/.test(qv);
      m.el.style.display = 'none';
      const p = await openPatientForm({ prefill: isId ? { idDoc: 'V-' + qv } : { name: qv } });
      if (p) picked = p;
      m.close();
    };
    draw();
  });
}

// ======================================================================
// FICHA DEL PACIENTE
// ======================================================================
export async function openPatient(idOrPatient, { tab = 'resumen' } = {}) {
  let p = typeof idOrPatient === 'string' ? await store.getPatient(idOrPatient) : idOrPatient;
  if (!p) { toast('No se encontró el paciente.', 'warning'); return; }
  let current = tab;
  let consults = null; let appts = null; let files = null; let sales = null;
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('repair-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const off = store.on('patients', () => { const f = store.patient(p.id); if (f && f.updatedAt !== p.updatedAt) { p = f; render(); } });
  const offA = store.on('appointments', () => { if (current === 'citas') loadAppts(); });
  const prev = m.close; m.close = () => { off(); offA(); prev(); };

  async function loadConsults() { consults = await store.patientConsults(p.id).catch(() => []); render(); }
  async function loadAppts() { appts = (await store.listEq('appointments', 'patientId', p.id).catch(() => [])).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)); if (current === 'citas') render(); }
  async function loadFiles() { files = (await store.listEq('files', 'patientId', p.id).catch(() => [])).sort((a, b) => (b.date || '').localeCompare(a.date || '')); if (current === 'archivos') render(); }
  async function loadSales() { sales = (await store.listEq('sales', 'patientId', p.id).catch(() => [])).sort((a, b) => (b.date || '').localeCompare(a.date || '')); if (current === 'pagos') render(); }

  function header() {
    const next = store.appointments.filter((a) => a.patientId === p.id && a.date >= todayKey() && ['programada', 'confirmada', 'espera'].includes(a.status)).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    const pend = store.pending.filter((c) => c.patientId === p.id).reduce((a, c) => a + (c.total || 0) - (c.discount || 0), 0);
    const open = store.openConsults.find((c) => c.patientId === p.id);
    return `<div class="rp-head">
      <div class="rp-dev">${patientAvatar(p, 'avatar-lg')}
        <div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(p.number || '')}</span>${p.active === false ? '<span class="badge badge-neutral">Archivado</span>' : ''}${p.insurance ? `<span class="badge badge-info">${esc(p.insurance)}</span>` : ''}${isBirthday(p) ? `<span class="badge badge-warning">${icon('cake')} ¡Cumpleaños hoy!</span>` : ''}</div>
          <div class="rp-title ellipsis">${esc(p.name)}</div>
          <div class="small muted ellipsis">${esc([p.idDoc && 'C.I. ' + p.idDoc, p.birthDate && `${ageText(p.birthDate)} (${fmtDate(p.birthDate)})`, SEX[p.sex], p.bloodType && 'Grupo ' + p.bloodType, p.phone].filter(Boolean).join(' · '))}</div>
        </div>
        <button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button>
      </div>
      ${allergyStrip(p.allergies, p.allergyNote)}
      <div class="rp-money">
        <div><span>Consultas</span><b>${p.visits || 0}</b></div>
        <div><span>Última visita</span><b>${p.lastVisitAt ? fmtDate(p.lastVisitAt) : '—'}</b></div>
        <div><span>Próxima cita</span><b class="${next ? 'text-brand' : ''}">${next ? `${next.date === todayKey() ? 'Hoy' : fmtDate(next.date)} ${esc(next.time)}${next.status === 'espera' ? ' · en espera' : ''}` : '—'}</b></div>
        <div><span>Por cobrar</span><b class="${pend > 0 ? 'text-danger' : ''}">${usd(pend)}</b></div>
        <div><span>Total pagado</span><b>${usd(p.totalSpent || 0)}</b></div>
      </div>
      <div class="tabs rp-tabs">${[['resumen', 'Resumen'], ['consultas', `Consultas${p.visits ? ` (${p.visits})` : ''}`], ['signos', 'Signos vitales'], ['citas', 'Citas'], ['archivos', 'Archivos'], ['pagos', 'Pagos']].map(([k, l]) => `<button data-tab="${k}" class="${k === current ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${open ? `<div class="banner demo-banner" style="margin:10px 0 0;border-radius:12px"><span>${icon('stethoscope')} Tiene una consulta abierta (${esc(open.number)})</span><button data-resume="${open.id}">Continuar</button></div>` : ''}
    </div>`;
  }

  function footer() {
    return `<div class="rp-foot">
      <div class="row row-wrap">
        <button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} WhatsApp</button>
        <button class="btn btn-secondary" data-edit>${icon('edit')} Editar</button>
        <button class="btn btn-secondary btn-icon" data-print title="Imprimir historia clínica">${icon('print')}</button>
      </div>
      <div class="row row-wrap">
        <button class="btn btn-secondary" data-appt>${icon('calendar')} Agendar cita</button>
        <button class="btn btn-primary" data-consult>${icon('stethoscope')} Iniciar consulta</button>
      </div>
    </div>`;
  }

  function tabResumen() {
    const v = p.lastVitals || {};
    const b = bmi(v); const ta = taClass(v.ta);
    const block = (t, val, empty = 'No refiere') => `<div><span>${t}</span><b class="${val ? '' : 'faint'}" style="font-weight:${val ? 650 : 500}">${esc(val || empty)}</b></div>`;
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card"><div class="card-title">${icon('clipboard')} Antecedentes</div>
          <div class="section-title mt">Patológicos</div>
          <div class="tagrow">${(p.chronic || []).map((t) => `<span class="tag tag-warn">${esc(t)}</span>`).join('') || '<span class="faint small">Niega enfermedades crónicas</span>'}</div>
          <div class="kv kv-1 mt">
            ${block('Otros personales', p.personalHistory)}${block('Quirúrgicos', p.surgicalHistory, 'Niega')}${block('Familiares', p.familyHistory)}
            ${block('Medicación habitual', p.currentMeds, 'Ninguna')}${block('Hábitos', habitsText(p.habits))}
            ${p.sex !== 'M' ? block('Gineco-obstétricos', p.gynecoHistory) : ''}${block('Inmunizaciones', p.vaccines, 'Sin datos')}
          </div>
        </div>
        ${p.notes ? `<div class="card"><div class="card-title">${icon('edit')} Notas internas</div><p class="small" style="margin:8px 0 0;white-space:pre-wrap">${esc(p.notes)}</p></div>` : ''}
      </div>
      <div class="stack">
        <div class="card"><div class="card-title">${icon('pulse')} Últimos signos vitales</div>
          ${v.at ? `<div class="vgrid mt">
            ${vcell('TA', v.ta, 'mmHg', ta)}${vcell('FC', v.fc, 'lpm')}${vcell('Temp.', v.temp, '°C')}${vcell('Sat O₂', v.sat, '%')}
            ${vcell('Peso', v.peso, 'kg')}${vcell('Talla', v.talla, 'cm')}${vcell('IMC', b?.value, '', b)}${vcell('Glicemia', v.glucemia, 'mg/dl')}
          </div><div class="t-sub mt">Registrados el ${fmtDate(v.at)}</div>` : emptyState('pulse', 'Sin signos registrados', 'Se guardan al cerrar cada consulta.')}
        </div>
        <div class="card"><div class="card-title">${icon('user')} Contacto</div>
          <div class="kv kv-1 mt">
            ${block('Teléfono', [p.phone, p.phone2].filter(Boolean).join(' / '), '—')}${block('Correo', p.email, '—')}${block('Dirección', [p.address, p.city].filter(Boolean).join(', '), '—')}
            ${block('Ocupación', p.occupation, '—')}${block('Emergencia', [p.emergencyName, p.emergencyPhone].filter(Boolean).join(' · '), '—')}
            ${block('Seguro', [p.insurance, p.insuranceNumber].filter(Boolean).join(' · '), 'Particular')}${block('Referido por', p.referredBy, '—')}
          </div>
        </div>
        ${p.lastDiagnoses?.length ? `<div class="card"><div class="card-title">${icon('stethoscope')} Últimos diagnósticos</div><div class="tagrow mt">${p.lastDiagnoses.map((d) => `<span class="tag">${esc(d)}</span>`).join('')}</div></div>` : ''}
      </div>
    </div>`;
  }

  function tabConsultas() {
    if (!consults) return '<div class="empty"><div class="spinner"></div></div>';
    const list = consults.filter((c) => c.status !== 'anulada');
    if (!list.length) return emptyState('stethoscope', 'Sin consultas', 'Toca “Iniciar consulta” para registrar la primera.');
    return `<div class="timeline">${list.map((c) => `<div class="tl-item click" data-c="${c.id}">
      <span class="tl-dot" style="background:${c.status === 'abierta' ? 'var(--violet-soft)' : 'var(--brand-soft)'};color:${c.status === 'abierta' ? 'var(--violet)' : 'var(--brand)'}">${icon('stethoscope')}</span>
      <div class="card grow" style="padding:12px 14px">
        <div class="between row-wrap"><b>${fmtDateTime(c.startedAt)} · ${esc(APPT_TYPES[c.type]?.label || 'Consulta')}</b><span class="row" style="gap:6px">${c.status === 'abierta' ? '<span class="badge badge-violet">En curso</span>' : ''}${c.billing === 'pendiente' ? '<span class="badge badge-danger">Por cobrar</span>' : ''}<span class="t-sub">${esc(c.number)}</span></span></div>
        ${c.reason ? `<div class="small mt-xs"><span class="muted">Motivo:</span> ${esc(c.reason)}</div>` : ''}
        ${c.diagnoses?.length ? `<div class="tagrow mt-xs">${c.diagnoses.map((d) => `<span class="tag">${esc(d.code)} · ${esc(d.name)}</span>`).join('')}</div>` : ''}
        ${c.rx?.length ? `<div class="t-sub mt-xs">${icon('pill')} ${esc(c.rx.map((r) => r.name).join(', '))}</div>` : ''}
        ${c.doctor ? `<div class="t-sub">${esc(c.doctor)}</div>` : ''}
      </div></div>`).join('')}</div>`;
  }

  function tabSignos() {
    if (!consults) return '<div class="empty"><div class="spinner"></div></div>';
    const rows = consults.filter((c) => c.status === 'cerrada' && c.vitals && Object.values(c.vitals).some((x) => String(x || '').trim())).slice().reverse();
    if (!rows.length) return emptyState('pulse', 'Sin registros de signos vitales');
    const w = rows.map((c) => parseFloat(String(c.vitals.peso || '').replace(',', '.'))).filter((x) => x > 0);
    const s = rows.map((c) => parseTA(c.vitals.ta)?.s).filter(Boolean);
    return `<div class="stack">
      <div class="grid-2">
        ${w.length > 1 ? `<div class="card"><div class="card-title">${icon('scale2')} Peso (kg)</div>${spark(w)}</div>` : ''}
        ${s.length > 1 ? `<div class="card"><div class="card-title">${icon('heart')} Tensión sistólica (mmHg)</div>${spark(s, 140)}</div>` : ''}
      </div>
      <div class="card card-flush"><div class="table-wrap"><table class="table rt"><thead><tr><th>Fecha</th><th>TA</th><th>FC</th><th>Temp.</th><th>Sat</th><th>Peso</th><th>IMC</th><th>Glic.</th></tr></thead><tbody>
      ${rows.slice().reverse().map((c) => { const v = c.vitals; const bb = bmi(v); const t = taClass(v.ta); return `<tr><td class="small nowrap">${fmtDate(c.startedAt)}</td><td>${v.ta ? `<span class="badge badge-${t?.tone || 'neutral'}">${esc(v.ta)}</span>` : '—'}</td><td>${esc(v.fc || '—')}</td><td>${esc(v.temp || '—')}</td><td>${esc(v.sat || '—')}</td><td>${esc(v.peso || '—')}</td><td>${bb ? bb.value : '—'}</td><td>${esc(v.glucemia || '—')}</td></tr>`; }).join('')}
      </tbody></table></div></div></div>`;
  }

  function tabCitas() {
    if (!appts) return '<div class="empty"><div class="spinner"></div></div>';
    if (!appts.length) return emptyState('calendar', 'Sin citas', 'Agenda la primera cita del paciente.');
    return `<div class="card card-flush"><div class="table-wrap"><table class="table rt"><thead><tr><th>Fecha</th><th>Tipo</th><th class="hide-sm">Motivo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${appts.map((a) => `<tr><td class="nowrap"><b>${fmtDate(a.date)}</b> ${esc(a.time)}</td><td><span class="type-dot" style="--c:${APPT_TYPES[a.type]?.color || '#888'}"></span>${esc(APPT_TYPES[a.type]?.label || '')}</td><td class="hide-sm small">${esc(a.reason || '')}</td><td>${apptBadge(a.status)}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-ap="${a.id}" title="Abrir">${icon('arrowRight')}</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  }

  function tabArchivos() {
    if (!files) return '<div class="empty"><div class="spinner"></div></div>';
    return `<div class="stack">
      <div class="card between row-wrap"><div><b>Resultados y documentos</b><div class="small muted">Fotos de exámenes de laboratorio, imágenes, informes de otros médicos (JPG, PNG o PDF hasta 700 KB).</div></div>
        <label class="btn btn-primary">${icon('upload')} Agregar archivo<input type="file" accept="image/*,application/pdf" data-up hidden multiple></label></div>
      ${files.length ? `<div class="photo-grid files-grid">${files.map((f) => `<div class="photo file-card">${f.data?.startsWith('data:image') ? `<img src="${f.data}" alt="" data-view="${f.id}">` : `<button class="file-pdf" data-view="${f.id}">${icon('file')}<span>PDF</span></button>`}<div class="file-meta"><b class="ellipsis">${esc(f.name)}</b><span>${fmtDate(f.date)}</span></div></div>`).join('')}</div>` : emptyState('paperclip', 'Sin archivos')}
    </div>`;
  }

  function tabPagos() {
    if (!sales) return '<div class="empty"><div class="spinner"></div></div>';
    const pend = store.pending.filter((c) => c.patientId === p.id);
    return `<div class="stack">
      ${pend.length ? `<div class="card"><div class="card-title">${icon('clock')} Por cobrar</div><div class="list mt">${pend.map((c) => `<div class="list-item"><div class="grow"><b>${esc(c.number)} · ${fmtDate(c.closedAt)}</b><div class="t-sub">${esc((c.charges || []).map((i) => i.name).join(', '))}</div></div><b class="text-danger">${usd((c.total || 0) - (c.discount || 0))}</b><button class="btn btn-primary btn-sm" data-charge="${c.id}">Cobrar</button></div>`).join('')}</div></div>` : ''}
      ${sales.length ? `<div class="card card-flush"><div class="table-wrap"><table class="table rt"><thead><tr><th>Recibo</th><th>Fecha</th><th class="hide-sm">Detalle</th><th class="hide-sm">Pago</th><th class="r">Total</th></tr></thead><tbody>
        ${sales.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}</td><td class="small nowrap">${fmtDateTime(s.date)}</td><td class="hide-sm small">${esc((s.items || []).map((i) => i.name).join(', '))}</td><td class="hide-sm small">${esc((s.payments || []).map((x) => methodLabel(x.method)).join(', '))}</td><td class="r"><b>${usd(s.total)}</b></td></tr>`).join('')}
      </tbody></table></div></div>` : emptyState('wallet', 'Sin pagos registrados')}
    </div>`;
  }

  function render() {
    const body = { resumen: tabResumen, consultas: tabConsultas, signos: tabSignos, citas: tabCitas, archivos: tabArchivos, pagos: tabPagos }[current]();
    rootEl.innerHTML = `${header()}<div class="rp-body">${body}</div>${footer()}`;
    const q = (s) => rootEl.querySelector(s);
    q('[data-x]').onclick = () => m.close();
    rootEl.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
      current = b.dataset.tab; render();
      if ((current === 'consultas' || current === 'signos') && !consults) loadConsults();
      if (current === 'citas' && !appts) loadAppts();
      if (current === 'archivos' && !files) loadFiles();
      if (current === 'pagos' && !sales) loadSales();
    });
    q('[data-wa]').onclick = () => waMenu(p);
    q('[data-edit]').onclick = async () => { const s = await openPatientForm({ patient: p }); if (s) { p = { ...p, ...s }; render(); } };
    q('[data-print]').onclick = async () => { const list = consults || await store.patientConsults(p.id).catch(() => []); printHistory(p, list); };
    q('[data-appt]').onclick = async () => { const { openApptForm } = await import('./views/agenda.js'); openApptForm({ patient: p }); };
    q('[data-consult]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try { const c = await startConsultation({ patient: p }); m.close(); const { openConsultation } = await import('./consult.js'); openConsultation(c); }
      catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
    };
    const rs = q('[data-resume]'); if (rs) rs.onclick = async () => { m.close(); const { openConsultation } = await import('./consult.js'); openConsultation(rs.dataset.resume); };
    rootEl.querySelectorAll('[data-c]').forEach((x) => x.onclick = async () => { const { openConsultation } = await import('./consult.js'); openConsultation(consults.find((c) => c.id === x.dataset.c)); });
    rootEl.querySelectorAll('[data-ap]').forEach((x) => x.onclick = async () => { const { openApptForm } = await import('./views/agenda.js'); openApptForm({ appt: appts.find((a) => a.id === x.dataset.ap) }); });
    rootEl.querySelectorAll('[data-charge]').forEach((x) => x.onclick = async () => { const { chargePending } = await import('./consult.js'); await chargePending(store.consult(x.dataset.charge)); loadSales(); });
    const up = q('[data-up]');
    if (up) up.onchange = async () => {
      for (const file of up.files) {
        try {
          let data;
          if (file.type.startsWith('image/')) data = await compressImage(file, 1400, 0.8);
          else if (file.type === 'application/pdf') {
            if (file.size > 700 * 1024) { toast(`${file.name}: el PDF supera 700 KB`, 'warning'); continue; }
            data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
          } else continue;
          await addPatientFile(p, { name: file.name.replace(/\.[^.]+$/, ''), data, kind: file.type.startsWith('image/') ? 'imagen' : 'pdf' });
        } catch (ex) { toast('No se pudo agregar ' + file.name, 'danger'); }
      }
      toast('Archivo(s) agregado(s)'); loadFiles();
    };
    rootEl.querySelectorAll('[data-view]').forEach((x) => x.onclick = () => viewFile(files.find((f) => f.id === x.dataset.view), () => loadFiles()));
  }

  render();
  if (current === 'consultas' || current === 'signos') loadConsults();
  return m;
}

function vcell(label, val, unit, tone = null) {
  return `<div class="vcell ${tone ? 'tone-' + tone.tone : ''}"><span>${label}</span><b>${val != null && String(val).trim() ? esc(val) : '—'}</b><small>${tone?.label ? esc(tone.label) : unit}</small></div>`;
}
function spark(vals, ref = null) {
  const W = 320, H = 90, pad = 8;
  const min = Math.min(...vals, ref ?? Infinity) - 2, max = Math.max(...vals, ref ?? -Infinity) + 2;
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, vals.length - 1);
  const y = (v) => H - pad - ((v - min) / Math.max(1, max - min)) * (H - pad * 2);
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none">${ref != null ? `<line x1="0" x2="${W}" y1="${y(ref)}" y2="${y(ref)}" class="spark-ref"/>` : ''}<polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" class="spark-line"/>${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" class="spark-dot"><title>${v}</title></circle>`).join('')}</svg><div class="between t-sub"><span>Primera: ${vals[0]}</span><span>Última: <b>${vals[vals.length - 1]}</b></span></div>`;
}
export function isBirthday(p) {
  if (!p.birthDate) return false;
  const t = todayKey();
  return p.birthDate.slice(5) === t.slice(5);
}

function viewFile(f, onChange) {
  if (!f) return;
  const m = openModal({
    title: esc(f.name), sub: fmtDateTime(f.date), size: 'xl',
    body: f.data?.startsWith('data:image') ? `<img src="${f.data}" style="width:100%;border-radius:12px">` : `<iframe src="${f.data}" style="width:100%;height:70vh;border:0;border-radius:12px"></iframe>`,
    footer: `<button class="btn btn-danger-soft" data-del style="margin-right:auto">${icon('trash')} Eliminar</button><a class="btn btn-secondary" href="${f.data}" download="${esc(f.name)}">${icon('download')} Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>`
  });
  m.el.querySelector('[data-del]').onclick = async () => {
    if (!(await requirePin('Eliminar un archivo del paciente'))) return;
    await store.remove('files', f.id); m.close(); toast('Archivo eliminado'); onChange?.();
  };
}

export function waMenu(p) {
  const next = store.appointments.filter((a) => a.patientId === p.id && a.date >= todayKey() && ['programada', 'confirmada'].includes(a.status)).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const opts = [
    next && ['recordatorio', `${icon('calendar')} Recordatorio de la cita del ${fmtDate(next.date)}`, { appt: next }],
    ['control', `${icon('history')} Invitar a control`, {}],
    isBirthday(p) && ['cumple', `${icon('cake')} Felicitar por su cumpleaños`, {}],
    ['libre', `${icon('whatsapp')} Mensaje en blanco`, {}]
  ].filter(Boolean);
  const m = openModal({
    title: 'Escribir por WhatsApp', sub: esc(`${p.name} · ${p.phone || 'sin teléfono'}`), size: 'sm',
    body: `<div class="help-list">${opts.map(([k, l], i) => `<button class="help-item" data-i="${i}"><span class="grow"><b>${l}</b></span>${icon('arrowRight')}</button>`).join('')}</div>`,
    footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
  });
  m.el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const [k, , ctx] = opts[+b.dataset.i]; waPatient(k, { patient: p, ...ctx }); m.close(); });
}

export async function archivePatient(p) {
  if (!(await requirePin(p.active === false ? 'Restaurar paciente' : 'Archivar paciente'))) return false;
  const ok = await confirmDialog({ title: p.active === false ? 'Restaurar paciente' : 'Archivar paciente', message: p.active === false ? `<b>${esc(p.name)}</b> volverá a la lista de pacientes.` : `<b>${esc(p.name)}</b> dejará de aparecer en la lista. Su historia clínica se conserva y puedes restaurarlo cuando quieras.`, confirmText: p.active === false ? 'Restaurar' : 'Archivar', danger: p.active !== false });
  if (!ok) return false;
  await setPatientActive(p, p.active === false);
  toast(p.active === false ? 'Paciente restaurado' : 'Paciente archivado');
  return true;
}

export { APPT_STATUS, ageOf };
