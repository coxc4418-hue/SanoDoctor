// Sano Doctor — Consulta médica: evaluación, diagnóstico, récipe, exámenes, documentos y cierre
import { store, APPT_TYPES, SEX } from './store.js';
import { saveConsultation, closeConsultation, chargeConsultation, waiveConsultation, addAddendum, discardConsultation, revokeDocument, freeSlots, DOC_KINDS, verifyUrl, itemsTotal, servicePrice } from './ops.js';
import { requirePin } from './auth.js';
import { openModal, esc, usd, bs, num, toast, fmtDate, fmtDateTime, fmtTime, setBusy, confirmDialog, emptyState, shortId, debounce, todayKey, dayKey, addDays, round2, parseNum, normalize, qtyFmt, fromKey, loc } from './utils.js';
import { icon } from './icons.js';
import { searchCIE, searchMeds, allergyConflict, LAB_GROUPS, IMAGING, SPECIALTIES, VITALS, bmi, taClass, vitalAlerts, ageText, EXAM_TEMPLATE, ROUTES_ADMIN, FREQUENCIES, DURATIONS } from './clinical.js';
import { printRecipe, printLabOrder, printRest, printAttendance, printHealth, printReport, printReferral, rxQty } from './docs.js';
import { waPatient, printReceipt, notifyLowStock } from './shared.js';
import { openPay, showPaid } from './pay.js';
import { allergyStrip } from './patient.js';

const TABS = [['eval', 'Evaluación', 'pulse'], ['dx', 'Diagnóstico', 'clipboard'], ['rx', 'Récipe', 'pill'], ['exams', 'Exámenes', 'flask'], ['docs', 'Documentos', 'file'], ['close', 'Cierre y cobro', 'checkCircle']];
const QUICK_IND = ['Reposo relativo.', 'Abundantes líquidos (2 litros de agua al día).', 'Dieta blanda, fraccionada, sin grasas ni irritantes.', 'Dieta hiposódica (baja en sal).', 'Control de tensión arterial en casa y anotar valores.', 'Control de glicemia en ayunas y anotar valores.', 'Compresas frías en la zona 3 veces al día.', 'Evitar automedicarse.', 'Acudir a emergencia si presenta fiebre persistente, dificultad para respirar o empeoramiento.', 'Traer resultados de exámenes al próximo control.'];

/** Abre la consulta (por id u objeto). Abierta = editable; cerrada = ficha de solo lectura con notas adicionales. */
export async function openConsultation(idOrC, { tab = 'eval' } = {}) {
  let c = typeof idOrC === 'string' ? await store.getConsult(idOrC) : idOrC;
  if (!c) { toast('No se encontró la consulta.', 'warning'); return; }
  if (c.status !== 'abierta') return openConsultView(c);
  c = JSON.parse(JSON.stringify(c));
  let current = tab;
  let dirty = false; let saving = null;
  const patient = () => store.patient(c.patientId) || {};

  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>', dismissible: false });
  m.el.querySelector('.modal').classList.add('repair-modal', 'consult-modal');
  const rootEl = m.el.querySelector('[data-root]');
  let timer = setInterval(() => { const el = rootEl.querySelector('[data-elapsed]'); if (el) el.textContent = elapsed(c.startedAt); }, 30000);
  const prevClose = m.close;
  m.close = async () => { clearInterval(timer); await flush(); prevClose(); };

  // ---------- Guardado automático ----------
  const status = (t, cls = '') => { const el = rootEl.querySelector('[data-save]'); if (el) { el.textContent = t; el.className = 'save-state ' + cls; } };
  const doSave = async () => {
    if (!dirty) return;
    dirty = false; status('Guardando…');
    try { const { id, ...rest } = c; saving = saveConsultation(c, rest); await saving; status('Guardado', 'ok'); }
    catch (e) { dirty = true; status('Sin guardar', 'bad'); toast(e.message, 'danger'); }
    finally { saving = null; }
  };
  const later = debounce(doSave, 900);
  const touch = () => { dirty = true; status('Cambios sin guardar…'); later(); };
  async function flush() { if (saving) await saving; if (dirty) await doSave(); }

  // ---------- Encabezado ----------
  function header() {
    const p = patient();
    const doctors = store.activeDoctors;
    return `<div class="rp-head">
      <div class="rp-dev"><span class="rp-icon">${icon('stethoscope')}</span>
        <div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(c.number)}</span><span class="badge badge-violet"><i class="dotc"></i>En consulta</span><span class="badge badge-neutral">${esc(APPT_TYPES[c.type]?.label || 'Consulta')}</span><span class="t-sub">${icon('clock')} <span data-elapsed>${elapsed(c.startedAt)}</span></span></div>
          <div class="rp-title ellipsis click" data-pt>${esc(c.patientName)}</div>
          <div class="small muted ellipsis">${esc([c.patientNumber, c.patientIdDoc && 'C.I. ' + c.patientIdDoc, ageText(c.patientBirth), SEX[c.patientSex], p.bloodType && 'Grupo ' + p.bloodType].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="row" style="gap:6px;align-items:center">${doctors.length > 1 ? `<select class="select select-sm" data-doctor title="Médico tratante">${doctors.map((d) => `<option value="${d.id}" ${d.id === c.doctorId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}<button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button></div>
      </div>
      ${allergyStrip(c.allergies, p.allergyNote)}
      ${(c.chronic?.length || p.currentMeds || p.lastDiagnoses?.length) ? `<div class="ctx-strip">${c.chronic?.length ? `<span>${icon('heart')} ${esc(c.chronic.join(', '))}</span>` : ''}${p.currentMeds ? `<span>${icon('pill')} ${esc(p.currentMeds)}</span>` : ''}${p.lastVisitAt ? `<span>${icon('history')} Última visita ${fmtDate(p.lastVisitAt)}${p.lastDiagnoses?.length ? ': ' + esc(p.lastDiagnoses.join(', ')) : ''}</span>` : '<span>' + icon('sparkle') + ' Primera consulta</span>'}</div>` : ''}
      <div class="tabs rp-tabs">${TABS.map(([k, l, ic]) => `<button data-tab="${k}" class="${k === current ? 'on' : ''}">${icon(ic)} ${l}${badgeFor(k)}</button>`).join('')}</div>
    </div>`;
  }
  const badgeFor = (k) => {
    const n = k === 'dx' ? c.diagnoses.length : k === 'rx' ? c.rx.length : k === 'exams' ? c.labs.length + c.imaging.length + (c.referral?.to ? 1 : 0) : k === 'docs' ? c.docs.length : 0;
    return n ? ` <span class="tab-n">${n}</span>` : '';
  };
  function footer() {
    const i = TABS.findIndex(([k]) => k === current);
    return `<div class="rp-foot">
      <div class="row row-wrap"><span class="save-state ok" data-save>Guardado</span><button class="btn btn-ghost btn-sm" data-discard>${icon('trash')} Descartar</button></div>
      <div class="row row-wrap">
        ${c.rx.length ? `<button class="btn btn-secondary" data-print-rx>${icon('print')} Récipe</button>` : ''}
        ${i < TABS.length - 1 ? `<button class="btn btn-secondary" data-next>${TABS[i + 1][1]} ${icon('arrowRight')}</button>` : ''}
        <button class="btn btn-primary" data-finish>${icon('checkCircle')} Cerrar consulta</button>
      </div>
    </div>`;
  }

  // ---------- Pestañas ----------
  function tabEval() {
    const v = c.vitals || {};
    const b = bmi(v); const ta = taClass(v.ta);
    const al = vitalAlerts(v, c.age);
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card stack"><div class="card-title">${icon('clipboard')} Motivo de consulta</div>
          <textarea class="textarea" data-k="reason" placeholder="Ej.: dolor de garganta y fiebre desde hace 2 días" style="min-height:70px">${esc(c.reason)}</textarea>
          <div class="field"><label>Enfermedad actual</label><textarea class="textarea" data-k="illness" placeholder="Inicio, evolución, características, síntomas asociados, tratamientos recibidos…" style="min-height:120px">${esc(c.illness)}</textarea></div>
        </div>
        <div class="card stack"><div class="between"><div class="card-title">${icon('user')} Examen físico</div><button class="btn btn-ghost btn-sm" data-tpl>${icon('copy')} Plantilla normal</button></div>
          <textarea class="textarea" data-k="exam" placeholder="Hallazgos por sistemas" style="min-height:160px">${esc(c.exam)}</textarea>
        </div>
      </div>
      <div class="stack">
        <div class="card stack" data-tour="vitals"><div class="card-title">${icon('pulse')} Signos vitales</div>
          <div class="vitals-form">${VITALS.map(([k, l, u, ph]) => `<label class="vf"><span>${l}</span><div class="input-group"><input class="input input-sm" data-v="${k}" value="${esc(v[k] || '')}" placeholder="${ph}" inputmode="${k === 'ta' ? 'text' : 'decimal'}"><span class="suffix">${u}</span></div></label>`).join('')}</div>
          <div class="vitals-calc" data-vcalc>${vitalsCalc(b, ta, al)}</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('list')} Revisión por sistemas <span class="faint small">(opcional)</span></div>
          <textarea class="textarea" data-k="systems" placeholder="Síntomas referidos por aparatos y sistemas">${esc(c.systems)}</textarea></div>
      </div>
    </div>`;
  }
  const vitalsCalc = (b, ta, al) => `
    <div class="row row-wrap" style="gap:6px">${b ? `<span class="badge badge-${b.tone}">IMC ${b.value} · ${b.label}</span>` : '<span class="faint small">IMC: escribe peso y talla</span>'}${ta ? `<span class="badge badge-${ta.tone}">TA ${ta.label}</span>` : ''}</div>
    ${al.filter((a) => a.k !== 'imc' && a.k !== 'ta').map((a) => `<div class="vital-alert ${a.tone}">${icon('alert')} ${esc(a.text)}</div>`).join('')}`;

  function tabDx() {
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card stack" data-tour="dx-search"><div class="card-title">${icon('search')} Buscar diagnóstico (CIE-10)</div>
          <label class="search">${icon('search')}<input data-cie placeholder="Escribe: faringitis, hipertensión, J02, lumbago…" autocomplete="off"></label>
          <div class="list dx-results" data-cie-res></div>
          <div class="hint">¿No está en la lista? Escríbelo y toca “Agregar como texto”.</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('edit')} Plan y conducta</div>
          <textarea class="textarea" data-k="plan" placeholder="Conducta terapéutica, educación al paciente, seguimiento…" style="min-height:120px">${esc(c.plan)}</textarea></div>
      </div>
      <div class="card stack"><div class="card-title">${icon('clipboard')} Impresión diagnóstica</div>
        ${c.diagnoses.length ? `<div class="stack-sm">${c.diagnoses.map((d, i) => `<div class="dx-item"><span class="dx-code">${esc(d.code || '—')}</span><div class="grow" style="min-width:0"><b>${esc(d.name)}</b><div class="row" style="gap:6px;margin-top:4px"><button class="chip chip-xs ${i === 0 ? 'on' : ''}" data-main="${i}">${i === 0 ? 'Principal' : 'Hacer principal'}</button><select class="select select-xs" data-dxtype="${i}">${['Presuntivo', 'Definitivo', 'Descartar'].map((t) => `<option ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><input class="input input-sm mt-xs" data-dxnote="${i}" value="${esc(d.note || '')}" placeholder="Nota (opcional)"></div><button class="btn btn-ghost btn-icon btn-sm" data-dxrm="${i}">${icon('x')}</button></div>`).join('')}</div>` : emptyState('clipboard', 'Sin diagnósticos', 'Busca y toca un diagnóstico para agregarlo.')}
      </div>
    </div>`;
  }

  function tabRx() {
    const favs = store.settings.favMeds || [];
    return `<div class="stack">
      <div class="card stack" data-tour="rx-search"><div class="between row-wrap"><div class="card-title">${icon('pill')} Agregar medicamento</div>${favs.length ? `<span class="t-sub">${icon('star')} ${favs.length} favorito(s)</span>` : ''}</div>
        <label class="search">${icon('search')}<input data-med placeholder="Escribe el medicamento: amoxicilina, losartán, ibuprofeno…" autocomplete="off"></label>
        <div class="med-results" data-med-res>${favs.length ? medResults(searchMeds('', 12, favs)) : ''}</div>
      </div>
      ${c.rx.length ? `<div class="stack-sm">${c.rx.map((r, i) => rxLine(r, i)).join('')}</div>` : `<div class="card">${emptyState('pill', 'Récipe vacío', 'Busca un medicamento: la dosis, frecuencia y duración se llenan solas y puedes cambiarlas.')}</div>`}
      <div class="card stack"><div class="card-title">${icon('list')} Indicaciones generales</div>
        <div class="chips chips-wrap">${QUICK_IND.map((t, i) => `<button type="button" class="chip chip-xs" data-qi="${i}">${icon('plus')} ${esc(t.length > 42 ? t.slice(0, 40) + '…' : t)}</button>`).join('')}</div>
        <textarea class="textarea" data-k="indications" placeholder="Dieta, reposo, signos de alarma, cuidados…" style="min-height:110px">${esc(c.indications)}</textarea>
      </div>
    </div>`;
  }
  const medResults = (list) => list.map((md, i) => {
    const conf = allergyConflict(md, c.allergies);
    return `<button type="button" class="med-opt ${conf ? 'conflict' : ''}" data-addmed="${i}">${md.fav ? icon('star') : icon('pill')}<span class="grow"><b>${esc(md.name)}</b> <span class="muted">${esc(md.presentation)}</span><small>${esc([md.dose, md.frequency, md.duration].filter(Boolean).join(' · '))}</small></span>${conf ? `<span class="badge badge-danger">${icon('alert')} Alergia: ${esc(conf)}</span>` : icon('plus')}</button>`;
  }).join('');
  function rxLine(r, i) {
    const conf = allergyConflict(r, c.allergies);
    const q = rxQty(r);
    return `<div class="card rx-line ${conf ? 'conflict' : ''}">
      <div class="between row-wrap" style="gap:8px"><div class="row" style="gap:10px;min-width:0"><span class="rx-n">${i + 1}</span><div style="min-width:0"><b class="ellipsis">${esc(r.name)}</b><div class="t-sub">${esc(r.presentation || '')}</div></div></div>
        <div class="row" style="gap:4px">${conf ? `<span class="badge badge-danger">${icon('alert')} Alérgico a ${esc(conf)}</span>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-rxfav="${i}" title="Guardar como favorito">${icon('star')}</button><button class="btn btn-ghost btn-icon btn-sm" data-rxup="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp')}</button><button class="btn btn-ghost btn-icon btn-sm" data-rxrm="${i}" title="Quitar">${icon('trash')}</button></div></div>
      <div class="rx-grid mt">
        <label class="field"><span class="lbl">Presentación</span><input class="input input-sm" data-rx="${i}" data-f="presentation" value="${esc(r.presentation || '')}"></label>
        <label class="field"><span class="lbl">Dosis</span><input class="input input-sm" data-rx="${i}" data-f="dose" value="${esc(r.dose || '')}"></label>
        <label class="field"><span class="lbl">Frecuencia</span><input class="input input-sm" data-rx="${i}" data-f="frequency" value="${esc(r.frequency || '')}" list="dl-freq"></label>
        <label class="field"><span class="lbl">Duración</span><input class="input input-sm" data-rx="${i}" data-f="duration" value="${esc(r.duration || '')}" list="dl-dur"></label>
        <label class="field"><span class="lbl">Vía</span><select class="select select-sm" data-rx="${i}" data-f="route">${ROUTES_ADMIN.map((x) => `<option ${x === (r.route || 'Oral') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Cantidad</span><input class="input input-sm" data-rx="${i}" data-f="qty" value="${esc(r.qty || '')}" placeholder="${q ? q + ' (calculada)' : 'Ej.: 1 caja'}"></label>
        <label class="field full"><span class="lbl">Nota para el paciente</span><input class="input input-sm" data-rx="${i}" data-f="note" value="${esc(r.note || '')}" placeholder="Ej.: tomar con abundante agua, no suspender"></label>
      </div>
    </div>`;
  }

  function tabExams() {
    const labs = new Set(c.labs); const img = new Set(c.imaging); const ref = c.referral || {};
    return `<div class="stack">
      <div class="card stack" data-tour="labs"><div class="between row-wrap"><div class="card-title">${icon('flask')} Laboratorio</div><span class="t-sub">${labs.size} seleccionado(s)</span></div>
        <div class="row row-wrap" style="gap:6px"><button class="btn btn-secondary btn-sm" data-pack="basico">${icon('plus')} Perfil básico</button><button class="btn btn-secondary btn-sm" data-pack="metabolico">${icon('plus')} Perfil metabólico</button><button class="btn btn-secondary btn-sm" data-pack="prenatal">${icon('plus')} Perfil prenatal</button><button class="btn btn-secondary btn-sm" data-pack="preop">${icon('plus')} Preoperatorio</button></div>
        ${Object.entries(LAB_GROUPS).map(([g, items]) => `<div><div class="section-title">${g}</div><div class="chips chips-wrap">${items.map((t) => `<button type="button" class="chip chip-xs ${labs.has(t) ? 'on' : ''}" data-lab="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`).join('')}
        <div class="row"><input class="input" data-lab-new placeholder="Otro examen…"><button class="btn btn-secondary" data-lab-add>${icon('plus')}</button></div>
        ${[...labs].filter((t) => !Object.values(LAB_GROUPS).flat().includes(t)).length ? `<div class="tagrow">${[...labs].filter((t) => !Object.values(LAB_GROUPS).flat().includes(t)).map((t) => `<span class="tag">${esc(t)} <button class="tag-x" data-lab="${esc(t)}">${icon('x')}</button></span>`).join('')}</div>` : ''}
      </div>
      <div class="card stack"><div class="card-title">${icon('image')} Imágenes y estudios especiales</div>
        <div class="chips chips-wrap">${IMAGING.map((t) => `<button type="button" class="chip chip-xs ${img.has(t) ? 'on' : ''}" data-img="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <textarea class="textarea" data-k="labNote" placeholder="Indicaciones para los exámenes (ayuno de 8 horas, traer orden…)">${esc(c.labNote)}</textarea>
      </div>
      <div class="card stack"><div class="card-title">${icon('send')} Referencia a especialista</div>
        <div class="form-grid">
          <div class="field"><label>Especialidad</label><input class="input" data-ref="to" value="${esc(ref.to || '')}" list="dl-spec" placeholder="Ej.: Cardiología"></div>
          <div class="field"><label>Médico (opcional)</label><input class="input" data-ref="doctor" value="${esc(ref.doctor || '')}" placeholder="Dr(a)."></div>
          <div class="field full"><label>Motivo de la referencia</label><input class="input" data-ref="reason" value="${esc(ref.reason || '')}" placeholder="Ej.: evaluación cardiovascular por soplo"></div>
          <div class="field"><label>Prioridad</label><div class="seg seg-block">${[['normal', 'Normal'], ['urgente', 'Urgente']].map(([k, l]) => `<button type="button" data-refp="${k}" class="${(ref.priority || 'normal') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        </div>
      </div>
    </div>`;
  }

  function tabDocs() {
    const issued = c.docs || [];
    const card = (k, ic, title, desc, extra = '') => `<div class="card doc-card"><span class="kpi-icon tone-brand">${icon(ic)}</span><div class="grow" style="min-width:0"><b>${title}</b><div class="t-sub">${desc}</div>${extra}</div><button class="btn btn-secondary btn-sm" data-doc="${k}">${icon('print')} Imprimir</button></div>`;
    return `<div class="stack">
      <div class="grid-2" data-tour="docs">
        ${card('recipe', 'pill', 'Récipe e indicaciones', c.rx.length ? `${c.rx.length} medicamento(s) · ${store.settings.rxFormat === 'carta' ? 'hoja carta' : 'media carta lado a lado'}` : 'Agrega medicamentos en la pestaña Récipe')}
        ${card('labs', 'flask', 'Orden de exámenes', c.labs.length + c.imaging.length ? `${c.labs.length} de laboratorio · ${c.imaging.length} de imagen` : 'Selecciona exámenes en la pestaña Exámenes')}
        ${card('rest', 'bed', 'Constancia de reposo', 'Días de reposo con fecha de reintegro', `<div class="row row-wrap mt-xs" style="gap:6px"><input class="input input-sm" data-rest-days inputmode="numeric" value="${esc(c.rest?.days || 3)}" style="width:70px"><span class="small muted">días desde</span><input class="input input-sm" type="date" data-rest-from value="${esc(c.rest?.from || todayKey())}" style="width:auto"><label class="check small"><input type="checkbox" data-rest-dx ${c.rest?.includeDx === false ? '' : 'checked'}> <span>con diagnóstico</span></label></div>`)}
        ${card('attendance', 'door', 'Constancia de asistencia', 'Hora de llegada y salida, para el trabajo o el colegio', `<input class="input input-sm mt-xs" data-companion placeholder="Acompañante (opcional)">`)}
        ${card('health', 'shieldCheck', 'Certificado de salud', 'Apto para trabajo, estudio o deporte', `<select class="select select-sm mt-xs" data-purpose>${['fines laborales', 'fines académicos', 'actividad física y deportiva', 'manipulación de alimentos', 'viajar', 'licencia de conducir'].map((x) => `<option>${x}</option>`).join('')}</select>`)}
        ${card('report', 'file', 'Informe médico', 'Resumen completo de la consulta')}
        ${card('referral', 'send', 'Referencia médica', c.referral?.to ? `A ${esc(c.referral.to)}` : 'Completa la referencia en la pestaña Exámenes')}
        <div class="card doc-card"><span class="kpi-icon tone-success">${icon('whatsapp')}</span><div class="grow"><b>Indicaciones por WhatsApp</b><div class="t-sub">El tratamiento y el próximo control, en un mensaje listo</div></div><button class="btn btn-whatsapp btn-sm" data-wa-ind>${icon('whatsapp')} Enviar</button></div>
      </div>
      <div class="card"><div class="card-title">${icon('qr')} Documentos emitidos</div>
        ${issued.length ? `<div class="list mt">${issued.map((d) => `<div class="list-item"><div class="grow" style="min-width:0"><b>${esc(DOC_KINDS[d.kind] || d.kind)}</b> ${d.revoked ? '<span class="badge badge-danger">Anulado</span>' : ''}<div class="t-sub ellipsis">${esc(d.summary || '')} · ${fmtTime(d.at)}</div></div><a class="mono small" href="${verifyUrl(d.code)}" target="_blank" rel="noopener">${esc(d.code)}</a></div>`).join('')}</div>
          <p class="hint mt">Cada documento lleva un código QR. Quien lo reciba (farmacia, empresa, colegio) puede comprobar que es auténtico en sano-doctor.web.app/verificar.</p>` : `<p class="small muted" style="margin:8px 0 0">Aún no has impreso documentos en esta consulta. Cada uno se registra con un código de verificación.</p>`}
      </div>
    </div>`;
  }

  function tabClose() {
    const items = c.charges || [];
    const total = itemsTotal(items);
    const prods = store.products.filter((p) => p.active !== false && (Number(p.stock) || 0) > 0);
    const nv = c.nextVisit || {};
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card stack" data-tour="charges"><div class="card-title">${icon('wallet')} Cargos de la consulta</div>
          ${items.length ? `<div class="stack-sm">${items.map((it, i) => `<div class="charge-line"><div class="grow" style="min-width:0"><b class="ellipsis">${esc(it.name)}</b><div class="t-sub">${it.productId ? 'Insumo del inventario' : 'Servicio'}</div></div><div class="stepper"><button data-cq="${i}" data-d="-1">${icon('minus')}</button><span>${qtyFmt(it.qty)}</span><button data-cq="${i}" data-d="1">${icon('plus')}</button></div><div class="input-group" style="width:110px;flex:none"><span class="prefix">${esc(loc().sym)}</span><input class="input input-sm" data-cp="${i}" inputmode="decimal" value="${num(it.price)}"></div><button class="btn btn-ghost btn-icon btn-sm" data-crm="${i}">${icon('x')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Sin cargos: la consulta se cerrará sin costo.</p>'}
          <div class="row row-wrap" style="gap:6px">
            <select class="select select-sm" data-add-svc style="flex:1;min-width:180px"><option value="">+ Agregar servicio…</option>${store.settings.services.map((s, i) => `<option value="${i}">${esc(s.name)} · ${usd(s.price)}</option>`).join('')}</select>
            ${prods.length ? `<select class="select select-sm" data-add-prod style="flex:1;min-width:180px"><option value="">+ Insumo usado / vendido…</option>${prods.map((p) => `<option value="${p.id}">${esc(p.name)} · ${usd(p.price)} (${qtyFmt(p.stock)})</option>`).join('')}</select>` : ''}
          </div>
          <div class="pay-total" style="margin:0"><div class="small muted">Total de la consulta</div><b>${usd(total)}</b><span>${bs(total * store.rate)}</span></div>
        </div>
      </div>
      <div class="stack">
        <div class="card stack" data-tour="next"><div class="card-title">${icon('calendar')} Próximo control</div>
          <div class="chips chips-wrap">${[[7, '1 semana'], [15, '15 días'], [30, '1 mes'], [90, '3 meses'], [180, '6 meses']].map(([d, l]) => `<button type="button" class="chip chip-xs" data-nvq="${d}">${l}</button>`).join('')}<button type="button" class="chip chip-xs" data-nvq="0">Sin control</button></div>
          <div class="form-grid"><div class="field"><label>Fecha</label><input class="input" type="date" data-nv-date value="${esc(nv.date || '')}" min="${todayKey()}"></div>
          <div class="field"><label>Hora</label><select class="select" data-nv-time>${nv.date ? slotOptions(nv.date, nv.time) : '<option value="">Elige la fecha</option>'}</select></div></div>
          <div class="hint" data-nv-hint>${nv.date ? 'Se agendará la cita de control al cerrar.' : 'Opcional. Se agenda una cita de control automáticamente.'}</div>
        </div>
        <div class="card stack"><div class="card-title">${icon('checkCircle')} Resumen</div>
          <div class="summary-box">
            <div class="summary-row"><span>Motivo</span><b class="ellipsis" style="max-width:60%">${esc(c.reason || '—')}</b></div>
            <div class="summary-row"><span>Diagnósticos</span><b>${c.diagnoses.length}</b></div>
            <div class="summary-row"><span>Medicamentos</span><b>${c.rx.length}</b></div>
            <div class="summary-row"><span>Exámenes</span><b>${c.labs.length + c.imaging.length}</b></div>
            <div class="summary-row"><span>Documentos</span><b>${c.docs.length}</b></div>
          </div>
          ${!c.reason && !c.diagnoses.length ? `<div class="vital-alert warning">${icon('alert')} Falta el motivo de consulta o un diagnóstico.</div>` : ''}
          <button class="btn btn-success btn-lg btn-block" data-close-pay ${total > 0 ? '' : 'hidden'}>${icon('dollar')} Cerrar y cobrar ${usd(total)}</button>
          <button class="btn btn-secondary btn-block" data-close-pend ${total > 0 ? '' : 'hidden'}>${icon('clock')} Cerrar y dejar por cobrar</button>
          <button class="btn ${total > 0 ? 'btn-ghost' : 'btn-primary btn-lg'} btn-block" data-close-free>${icon('checkCircle')} ${total > 0 ? 'Cerrar sin cargo (cortesía)' : 'Cerrar consulta'}</button>
        </div>
      </div>
    </div>`;
  }
  const slotOptions = (date, sel) => {
    const slots = freeSlots(date, { doctorId: c.doctorId, minutes: APPT_TYPES.control.minutes });
    if (sel && !slots.includes(sel)) slots.unshift(sel);
    return slots.length ? slots.map((t) => `<option ${t === sel ? 'selected' : ''}>${t}</option>`).join('') : '<option value="">Sin horarios libres ese día</option>';
  };

  // ---------- Render y eventos ----------
  function render() {
    const body = { eval: tabEval, dx: tabDx, rx: tabRx, exams: tabExams, docs: tabDocs, close: tabClose }[current]();
    rootEl.innerHTML = `${header()}<div class="rp-body">${body}</div>${footer()}
      <datalist id="dl-freq">${FREQUENCIES.map((x) => `<option value="${x}">`).join('')}</datalist><datalist id="dl-dur">${DURATIONS.map((x) => `<option value="${x}">`).join('')}</datalist><datalist id="dl-spec">${SPECIALTIES.map((x) => `<option value="${x}">`).join('')}</datalist>`;
    bind();
  }
  const rerenderKeepScroll = () => { const b = rootEl.querySelector('.rp-body'); const st = b ? m.el.querySelector('.modal').scrollTop : 0; render(); m.el.querySelector('.modal').scrollTop = st; };

  function bind() {
    const q = (s) => rootEl.querySelector(s);
    const all = (s, fn) => rootEl.querySelectorAll(s).forEach(fn);
    q('[data-x]').onclick = () => m.close();
    q('[data-pt]').onclick = async () => { await flush(); const { openPatient } = await import('./patient.js'); openPatient(c.patientId); };
    all('[data-tab]', (b) => b.onclick = async () => { current = b.dataset.tab; render(); m.el.querySelector('.modal').scrollTop = 0; });
    const nx = q('[data-next]'); if (nx) nx.onclick = () => { const i = TABS.findIndex(([k]) => k === current); current = TABS[i + 1][0]; render(); m.el.querySelector('.modal').scrollTop = 0; };
    q('[data-finish]').onclick = () => { current = 'close'; render(); };
    const ds = q('[data-doctor]'); if (ds) ds.onchange = () => { const d = store.doctor(ds.value); c.doctorId = d?.id || null; c.doctor = d?.name || ''; touch(); };
    q('[data-discard]').onclick = async () => {
      if (!(await requirePin('Descartar la consulta'))) return;
      if (!(await confirmDialog({ title: 'Descartar consulta', message: `Se anulará <b>${esc(c.number)}</b> y lo escrito no se guardará en la historia. ${c.appointmentId ? 'La cita vuelve a la sala de espera.' : ''}`, confirmText: 'Descartar', danger: true }))) return;
      dirty = false; await discardConsultation(c, 'Descartada por el médico'); clearInterval(timer); prevClose(); toast('Consulta descartada', 'warning');
    };
    const prx = q('[data-print-rx]'); if (prx) prx.onclick = () => runDoc('recipe');

    // Campos de texto simples y signos
    all('[data-k]', (el) => el.oninput = () => { c[el.dataset.k] = el.value; touch(); });
    all('[data-v]', (el) => el.oninput = () => {
      c.vitals = { ...c.vitals, [el.dataset.v]: el.value.trim() }; touch();
      const v = c.vitals; q('[data-vcalc]').innerHTML = vitalsCalc(bmi(v), taClass(v.ta), vitalAlerts(v, c.age));
    });
    const tpl = q('[data-tpl]'); if (tpl) tpl.onclick = () => { const t = q('[data-k="exam"]'); t.value = t.value ? t.value + '\n' + EXAM_TEMPLATE : EXAM_TEMPLATE; c.exam = t.value; touch(); };

    // Diagnósticos
    const cie = q('[data-cie]');
    if (cie) {
      const draw = () => {
        const v = cie.value.trim();
        const res = searchCIE(v);
        q('[data-cie-res]').innerHTML = res.map((d, i) => `<button type="button" class="list-item click dx-opt" data-dx="${i}"><span class="dx-code">${esc(d.code)}</span><span class="grow">${esc(d.name)}</span>${icon('plus')}</button>`).join('')
          + (v.length > 2 ? `<button type="button" class="list-item click dx-opt" data-dxfree><span class="dx-code">—</span><span class="grow">Agregar como texto: <b>${esc(v)}</b></span>${icon('plus')}</button>` : '');
        rootEl.querySelectorAll('[data-dx]').forEach((b) => b.onclick = () => addDx(res[+b.dataset.dx]));
        const fr = rootEl.querySelector('[data-dxfree]'); if (fr) fr.onclick = () => addDx({ code: '', name: v.charAt(0).toUpperCase() + v.slice(1) });
      };
      cie.oninput = debounce(draw, 80);
      cie.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = rootEl.querySelector('.dx-opt'); f?.click(); } };
      setTimeout(() => cie.focus(), 50);
    }
    const addDx = (d) => {
      if (c.diagnoses.some((x) => x.name === d.name)) { toast('Ese diagnóstico ya está agregado', 'info'); return; }
      c.diagnoses.push({ code: d.code, name: d.name, type: 'Presuntivo', note: '' }); touch(); rerenderKeepScroll();
      setTimeout(() => rootEl.querySelector('[data-cie]')?.focus(), 30);
    };
    all('[data-dxrm]', (b) => b.onclick = () => { c.diagnoses.splice(+b.dataset.dxrm, 1); touch(); rerenderKeepScroll(); });
    all('[data-main]', (b) => b.onclick = () => { const i = +b.dataset.main; const [d] = c.diagnoses.splice(i, 1); c.diagnoses.unshift(d); touch(); rerenderKeepScroll(); });
    all('[data-dxtype]', (el) => el.onchange = () => { c.diagnoses[+el.dataset.dxtype].type = el.value; touch(); });
    all('[data-dxnote]', (el) => el.oninput = () => { c.diagnoses[+el.dataset.dxnote].note = el.value; touch(); });

    // Récipe
    const med = q('[data-med]');
    if (med) {
      let res = [];
      const draw = () => { res = searchMeds(med.value, 14, store.settings.favMeds || []); q('[data-med-res]').innerHTML = medResults(res); rootEl.querySelectorAll('[data-addmed]').forEach((b) => b.onclick = () => addMed(res[+b.dataset.addmed])); };
      med.oninput = debounce(draw, 80);
      med.onkeydown = (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        if (res[0]) addMed(res[0]); else if (med.value.trim()) addMed({ name: med.value.trim(), presentation: '', dose: '', frequency: '', duration: '', route: 'Oral' });
      };
      res = searchMeds('', 12, store.settings.favMeds || []);
      rootEl.querySelectorAll('[data-addmed]').forEach((b) => b.onclick = () => addMed(res[+b.dataset.addmed]));
    }
    const addMed = async (md) => {
      const conf = allergyConflict(md, c.allergies);
      if (conf && !(await confirmDialog({ title: '⚠️ Posible alergia', message: `El paciente es <b>alérgico a ${esc(conf)}</b> y <b>${esc(md.name)}</b> pertenece a esa familia de medicamentos. ¿Agregarlo de todas formas?`, confirmText: 'Agregar igual', danger: true }))) return;
      if (c.rx.some((r) => normalize(r.name) === normalize(md.name) && normalize(r.presentation) === normalize(md.presentation))) { toast('Ese medicamento ya está en el récipe', 'info'); return; }
      c.rx.push({ id: shortId(6), name: md.name, presentation: md.presentation || '', dose: md.dose || '', frequency: md.frequency || '', duration: md.duration || '', route: md.route || 'Oral', family: md.family || '', qty: '', note: md.note || '' });
      touch(); rerenderKeepScroll();
      setTimeout(() => { const i = rootEl.querySelector('[data-med]'); if (i) { i.value = ''; i.focus(); } }, 30);
    };
    all('[data-rx]', (el) => { const h = () => { c.rx[+el.dataset.rx][el.dataset.f] = el.value; touch(); }; el.oninput = h; el.onchange = h; });
    all('[data-rxrm]', (b) => b.onclick = () => { c.rx.splice(+b.dataset.rxrm, 1); touch(); rerenderKeepScroll(); });
    all('[data-rxup]', (b) => b.onclick = () => { const i = +b.dataset.rxup; [c.rx[i - 1], c.rx[i]] = [c.rx[i], c.rx[i - 1]]; touch(); rerenderKeepScroll(); });
    all('[data-rxfav]', (b) => b.onclick = async () => {
      const r = c.rx[+b.dataset.rxfav];
      const favs = (store.settings.favMeds || []).filter((f) => !(normalize(f.name) === normalize(r.name) && normalize(f.presentation) === normalize(r.presentation)));
      await store.saveSettings({ favMeds: [{ name: r.name, presentation: r.presentation, dose: r.dose, frequency: r.frequency, duration: r.duration, route: r.route, family: r.family || '', note: r.note || '' }, ...favs].slice(0, 60) });
      toast(`${r.name} guardado en favoritos con esta posología`);
    });
    all('[data-qi]', (b) => b.onclick = () => { const t = q('[data-k="indications"]'); const add = QUICK_IND[+b.dataset.qi]; if (t.value.includes(add)) return; t.value = (t.value ? t.value.trimEnd() + '\n' : '') + '• ' + add; c.indications = t.value; touch(); });

    // Exámenes
    all('[data-lab]', (b) => b.onclick = () => { const t = b.dataset.lab; c.labs = c.labs.includes(t) ? c.labs.filter((x) => x !== t) : [...c.labs, t]; touch(); rerenderKeepScroll(); });
    all('[data-img]', (b) => b.onclick = () => { const t = b.dataset.img; c.imaging = c.imaging.includes(t) ? c.imaging.filter((x) => x !== t) : [...c.imaging, t]; touch(); rerenderKeepScroll(); });
    const PACKS = {
      basico: ['Hematología completa', 'Glicemia en ayunas', 'Urea', 'Creatinina', 'Uroanálisis', 'Coproanálisis (heces)'],
      metabolico: ['Glicemia en ayunas', 'Hemoglobina glicosilada (HbA1c)', 'Perfil lipídico', 'Ácido úrico', 'TGO (AST)', 'TGP (ALT)', 'Creatinina', 'TSH'],
      prenatal: ['Hematología completa', 'Grupo sanguíneo y factor Rh', 'Glicemia en ayunas', 'VDRL', 'VIH (prueba rápida / ELISA)', 'Hepatitis B (HBsAg)', 'Toxoplasmosis IgG/IgM', 'Uroanálisis', 'Urocultivo con antibiograma'],
      preop: ['Hematología completa', 'Tiempo de protrombina (PT)', 'Tiempo parcial de tromboplastina (PTT)', 'Glicemia en ayunas', 'Urea', 'Creatinina', 'Grupo sanguíneo y factor Rh', 'VIH (prueba rápida / ELISA)', 'VDRL', 'Electrocardiograma']
    };
    all('[data-pack]', (b) => b.onclick = () => { c.labs = [...new Set([...c.labs, ...PACKS[b.dataset.pack]])]; touch(); rerenderKeepScroll(); });
    const la = q('[data-lab-add]'); if (la) { const add = () => { const v = q('[data-lab-new]').value.trim(); if (v && !c.labs.includes(v)) { c.labs.push(v); touch(); rerenderKeepScroll(); } }; la.onclick = add; q('[data-lab-new]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }; }
    all('[data-ref]', (el) => el.oninput = () => { c.referral = { ...(c.referral || {}), [el.dataset.ref]: el.value }; touch(); });
    all('[data-refp]', (b) => b.onclick = () => { c.referral = { ...(c.referral || {}), priority: b.dataset.refp }; all('[data-refp]', (x) => x.classList.toggle('on', x === b)); touch(); });

    // Documentos
    all('[data-doc]', (b) => b.onclick = () => runDoc(b.dataset.doc, b));
    const wi = q('[data-wa-ind]'); if (wi) wi.onclick = () => waPatient('indicaciones', { consult: c, patient: patient() });
    const rd = q('[data-rest-days]'); if (rd) { const h = () => { c.rest = { days: Math.max(1, Math.round(parseNum(rd.value)) || 1), from: q('[data-rest-from]').value || todayKey(), includeDx: q('[data-rest-dx]').checked }; touch(); }; rd.oninput = h; q('[data-rest-from]').onchange = h; q('[data-rest-dx]').onchange = h; }

    // Cierre
    all('[data-cq]', (b) => b.onclick = () => { const it = c.charges[+b.dataset.cq]; it.qty = Math.max(1, (Number(it.qty) || 1) + Number(b.dataset.d)); touch(); rerenderKeepScroll(); });
    all('[data-cp]', (el) => el.onchange = () => { c.charges[+el.dataset.cp].price = round2(parseNum(el.value)); touch(); rerenderKeepScroll(); });
    all('[data-crm]', (b) => b.onclick = () => { c.charges.splice(+b.dataset.crm, 1); touch(); rerenderKeepScroll(); });
    const as = q('[data-add-svc]'); if (as) as.onchange = () => { const s = store.settings.services[+as.value]; if (s) { c.charges.push({ id: shortId(6), productId: null, name: s.name, qty: 1, price: s.price, cost: 0 }); touch(); rerenderKeepScroll(); } };
    const ap = q('[data-add-prod]'); if (ap) ap.onchange = () => { const p = store.product(ap.value); if (p) { const ex = c.charges.find((x) => x.productId === p.id); if (ex) ex.qty += 1; else c.charges.push({ id: shortId(6), productId: p.id, name: p.name, qty: 1, price: p.price || 0, cost: p.cost || 0 }); touch(); rerenderKeepScroll(); } };
    const nvd = q('[data-nv-date]');
    if (nvd) {
      const setNv = () => { const d = nvd.value; const t = q('[data-nv-time]').value; c.nextVisit = d && t ? { date: d, time: t } : null; q('[data-nv-hint]').textContent = c.nextVisit ? `Se agendará el control el ${fmtDate(d)} a las ${t}.` : d ? 'Elige una hora disponible.' : 'Opcional. Se agenda una cita de control automáticamente.'; touch(); };
      nvd.onchange = () => { q('[data-nv-time]').innerHTML = nvd.value ? slotOptions(nvd.value) : '<option value="">Elige la fecha</option>'; setNv(); };
      q('[data-nv-time]').onchange = setNv;
      all('[data-nvq]', (b) => b.onclick = () => {
        const d = +b.dataset.nvq;
        if (!d) { nvd.value = ''; q('[data-nv-time]').innerHTML = '<option value="">Elige la fecha</option>'; setNv(); return; }
        // Primer día hábil con horario libre a partir de la fecha sugerida
        let day = addDays(new Date(), d);
        for (let k = 0; k < 14 && !freeSlots(dayKey(day), { doctorId: c.doctorId }).length; k++) day = addDays(day, 1);
        nvd.value = dayKey(day); q('[data-nv-time]').innerHTML = slotOptions(nvd.value); setNv();
      });
    }
    const cp = q('[data-close-pay]'); if (cp) cp.onclick = () => finish('pay');
    const cpe = q('[data-close-pend]'); if (cpe) cpe.onclick = () => finish('pending');
    q('[data-close-free]') && (q('[data-close-free]').onclick = () => finish('free'));
  }

  async function runDoc(kind, btn = null) {
    await flush();
    if (btn) setBusy(btn, true);
    try {
      const p = patient();
      if (kind === 'recipe') await printRecipe(c);
      if (kind === 'labs') await printLabOrder(c);
      if (kind === 'rest') { const r = c.rest || { days: 3, from: todayKey(), includeDx: true }; await printRest(c, r); }
      if (kind === 'attendance') await printAttendance(c, { companion: rootEl.querySelector('[data-companion]')?.value.trim() || '' });
      if (kind === 'health') await printHealth(c, { purpose: rootEl.querySelector('[data-purpose]')?.value || 'fines laborales' });
      if (kind === 'report') await printReport(c, p);
      if (kind === 'referral') await printReferral(c);
      if (current === 'docs') rerenderKeepScroll();
    } catch (ex) { toast(ex.message, 'warning'); }
    finally { if (btn && document.contains(btn)) setBusy(btn, false); }
  }

  async function finish(mode) {
    await flush();
    if (!c.reason && !c.diagnoses.length) { toast('Indica el motivo de consulta o un diagnóstico antes de cerrar.', 'warning'); current = c.reason ? 'dx' : 'eval'; render(); return; }
    const conflicts = c.rx.map((r) => allergyConflict(r, c.allergies)).filter(Boolean);
    if (conflicts.length && !(await confirmDialog({ title: '⚠️ Récipe con posible alergia', message: `Hay medicamentos que chocan con las alergias del paciente (${esc([...new Set(conflicts)].join(', '))}). ¿Cerrar de todas formas?`, confirmText: 'Cerrar igual', danger: true }))) return;
    const nextAppt = c.nextVisit?.date && c.nextVisit?.time ? c.nextVisit : null;
    const total = itemsTotal(c.charges);
    const done = (out) => { dirty = false; clearInterval(timer); prevClose(); afterClose(out); };
    try {
      if (mode === 'pay') {
        await openPay({
          title: `Cobrar consulta ${c.number}`, sub: esc(c.patientName), amount: total, baseTotal: total, discount: true, printLabel: 'Imprimir recibo',
          onConfirm: async (res) => {
            const out = await closeConsultation(c, { charge: { payments: res.payments, changeCurrency: res.changeCurrency, discount: res.discount }, nextAppt });
            if (res.print && out.sale) printReceipt(out.sale);
            done(out); return out;
          }
        });
      } else {
        if (mode === 'free' && total > 0 && !(await confirmDialog({ title: 'Cerrar sin cargo', message: `La consulta se registrará como cortesía (sin cobro de ${usd(total)}).`, confirmText: 'Cerrar sin cargo' }))) return;
        const out = await closeConsultation(c, { nextAppt, waive: mode === 'free' });
        done(out);
      }
    } catch (ex) { toast(ex.message, 'danger', 5000); }
  }

  render();
  return m;
}

function elapsed(iso) { const mm = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); return mm < 60 ? `${mm} min` : `${Math.floor(mm / 60)} h ${mm % 60} min`; }

/** Pantalla tras cerrar: imprimir, enviar indicaciones y pasar al siguiente paciente */
function afterClose({ consultation: c, sale, low, control }) {
  notifyLowStock(low);
  const next = store.waiting.find((a) => a.patientId !== c.patientId);
  const m = openModal({
    size: 'md',
    body: `<div class="center stack" style="padding:14px 0 4px;align-items:center">
      <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('checkCircle')}</div>
      <div><div class="muted small">Consulta cerrada</div><div style="font-size:26px;font-weight:800;letter-spacing:-.02em">${esc(c.number)} · ${esc(c.patientName)}</div></div>
      <div class="row row-wrap" style="justify-content:center;gap:6px">${sale ? `<span class="badge badge-success">Cobrada ${usd(sale.received ?? sale.total)} · ${esc(sale.number)}</span>` : c.billing === 'pendiente' ? `<span class="badge badge-warning">Por cobrar ${usd(c.total)}</span>` : '<span class="badge badge-neutral">Sin cargo</span>'}${control ? `<span class="badge badge-info">${icon('calendar')} Control ${fmtDate(control.date)} ${esc(control.time)}</span>` : ''}</div>
      ${sale?.changeUSD > 0.009 ? `<div class="badge badge-warning" style="height:28px;font-size:13px">Vuelto: ${sale.changeCurrency === 'BS' ? bs(sale.changeUSD * sale.rate) : usd(sale.changeUSD)}</div>` : ''}
    </div>
    <div class="grid-2 mt">
      ${c.rx?.length ? `<button class="btn btn-secondary" data-rx>${icon('print')} Récipe e indicaciones</button>` : ''}
      ${c.rx?.length || c.nextVisit ? `<button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Indicaciones por WhatsApp</button>` : ''}
      ${sale ? `<button class="btn btn-secondary" data-rc>${icon('print')} Recibo ${esc(sale.number)}</button>` : ''}
      ${control ? `<button class="btn btn-secondary" data-wc>${icon('calendar')} Avisar el control</button>` : ''}
    </div>`,
    footer: `${next ? `<button class="btn btn-primary" data-next>${icon('arrowRight')} Siguiente: ${esc(next.patientName.split(' ')[0])}</button>` : ''}<button class="btn ${next ? 'btn-secondary' : 'btn-primary'}" data-close>Listo</button>`
  });
  const q = (s) => m.el.querySelector(s);
  if (q('[data-rx]')) q('[data-rx]').onclick = () => printRecipe(c).catch((e) => toast(e.message, 'warning'));
  if (q('[data-wa]')) q('[data-wa]').onclick = () => waPatient('indicaciones', { consult: c, patient: store.patient(c.patientId) || {} });
  if (q('[data-rc]')) q('[data-rc]').onclick = () => printReceipt(sale);
  if (q('[data-wc]')) q('[data-wc]').onclick = () => waPatient('agendada', { appt: control, patient: store.patient(c.patientId) || {} });
  if (q('[data-next]')) q('[data-next]').onclick = async () => { m.close(); await callPatient(next); };
}

/** Pasa a consulta al paciente de una cita (desde sala de espera o agenda) */
export async function callPatient(appt) {
  const { startConsultation } = await import('./ops.js');
  const p = store.patient(appt.patientId) || await store.getPatient(appt.patientId);
  if (!p) { toast('No se encontró el paciente de la cita.', 'danger'); return; }
  const c = await startConsultation({ patient: p, appointment: appt });
  return openConsultation(c);
}

/** Cobra una consulta que quedó pendiente */
export async function chargePending(c) {
  if (!c) return null;
  const total = round2(itemsTotal(c.charges) - (c.discount || 0));
  return openPay({
    title: `Cobrar consulta ${c.number}`, sub: esc(c.patientName), amount: total, baseTotal: total, discount: true, printLabel: 'Imprimir recibo',
    onConfirm: async (res) => {
      const out = await chargeConsultation(c, { payments: res.payments, changeCurrency: res.changeCurrency, discount: res.discount });
      if (res.print) printReceipt(out.sale);
      showPaid(out.sale, { title: 'Consulta cobrada', onPrint: () => printReceipt(out.sale) });
      return out;
    }
  });
}

// ======================================================================
// CONSULTA CERRADA (solo lectura)
// ======================================================================
export function openConsultView(c) {
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('repair-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const sec = (t, v, ic = 'clipboard') => v ? `<div class="card"><div class="card-title">${icon(ic)} ${t}</div><p class="small" style="margin:8px 0 0;white-space:pre-wrap">${esc(v)}</p></div>` : '';
  function render() {
    const v = c.vitals || {}; const b = bmi(v); const ta = taClass(v.ta);
    const vit = VITALS.filter(([k]) => String(v[k] || '').trim());
    rootEl.innerHTML = `<div class="rp-head">
        <div class="rp-dev"><span class="rp-icon">${icon('stethoscope')}</span><div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(c.number)}</span>${c.status === 'anulada' ? '<span class="badge badge-danger">Anulada</span>' : '<span class="badge badge-success">Cerrada</span>'}${c.billing === 'pendiente' ? '<span class="badge badge-danger">Por cobrar</span>' : c.billing === 'pagada' ? `<span class="badge badge-success">Pagada ${esc(c.saleNumber || '')}</span>` : c.billing === 'sin_cargo' ? '<span class="badge badge-neutral">Sin cargo</span>' : ''}<span class="badge badge-neutral">${esc(APPT_TYPES[c.type]?.label || '')}</span></div>
          <div class="rp-title ellipsis click" data-pt>${esc(c.patientName)}</div>
          <div class="small muted">${fmtDateTime(c.startedAt)}${c.closedAt ? ' – ' + fmtTime(c.closedAt) : ''} · ${esc(c.doctor || '')} · ${esc([c.patientIdDoc, ageText(c.patientBirth)].filter(Boolean).join(' · '))}</div>
        </div><button class="x-btn" data-x>${icon('x')}</button></div>
        ${allergyStrip(c.allergies)}
      </div>
      <div class="rp-body"><div class="rp-grid">
        <div class="stack">
          ${sec('Motivo de consulta', c.reason)}${sec('Enfermedad actual', c.illness, 'history')}${sec('Examen físico', c.exam, 'user')}${sec('Revisión por sistemas', c.systems, 'list')}
          ${c.diagnoses?.length ? `<div class="card"><div class="card-title">${icon('clipboard')} Diagnósticos</div><div class="stack-sm mt">${c.diagnoses.map((d, i) => `<div class="dx-item"><span class="dx-code">${esc(d.code || '—')}</span><div class="grow"><b>${esc(d.name)}</b><div class="t-sub">${i === 0 ? 'Principal · ' : ''}${esc(d.type || '')}${d.note ? ' · ' + esc(d.note) : ''}</div></div></div>`).join('')}</div></div>` : ''}
          ${sec('Plan', c.plan, 'edit')}
        </div>
        <div class="stack">
          ${vit.length ? `<div class="card"><div class="card-title">${icon('pulse')} Signos vitales</div><div class="vgrid mt">${vit.map(([k, l, u]) => `<div class="vcell ${k === 'ta' && ta ? 'tone-' + ta.tone : ''}"><span>${l}</span><b>${esc(v[k])}</b><small>${u}</small></div>`).join('')}${b ? `<div class="vcell tone-${b.tone}"><span>IMC</span><b>${b.value}</b><small>${b.label}</small></div>` : ''}</div></div>` : ''}
          ${c.rx?.length ? `<div class="card"><div class="card-title">${icon('pill')} Tratamiento</div><div class="list mt">${c.rx.map((r, i) => `<div class="list-item"><span class="rx-n">${i + 1}</span><div class="grow"><b>${esc(r.name)}</b> <span class="muted small">${esc(r.presentation || '')}</span><div class="t-sub">${esc([r.dose, r.frequency, r.duration && 'por ' + r.duration].filter(Boolean).join(', '))}</div></div></div>`).join('')}</div>${c.indications ? `<p class="small" style="white-space:pre-wrap;margin:10px 0 0">${esc(c.indications)}</p>` : ''}</div>` : ''}
          ${c.labs?.length || c.imaging?.length ? `<div class="card"><div class="card-title">${icon('flask')} Exámenes solicitados</div><div class="tagrow mt">${[...(c.labs || []), ...(c.imaging || [])].map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
          ${c.referral?.to ? `<div class="card"><div class="card-title">${icon('send')} Referencia</div><p class="small" style="margin:8px 0 0">${esc(c.referral.to)}${c.referral.reason ? ': ' + esc(c.referral.reason) : ''}</p></div>` : ''}
          ${c.nextVisit?.date ? `<div class="card"><div class="card-title">${icon('calendar')} Próximo control</div><p style="margin:8px 0 0"><b>${fmtDate(c.nextVisit.date)}</b> ${esc(c.nextVisit.time || '')}</p></div>` : ''}
          ${c.docs?.length ? `<div class="card"><div class="card-title">${icon('qr')} Documentos emitidos</div><div class="list mt">${c.docs.map((d) => `<div class="list-item"><div class="grow"><b>${esc(DOC_KINDS[d.kind] || d.kind)}</b>${d.revoked ? ' <span class="badge badge-danger">Anulado</span>' : ''}<div class="t-sub">${esc(d.summary || '')}</div></div><span class="mono small">${esc(d.code)}</span>${d.revoked ? '' : `<button class="btn btn-ghost btn-icon btn-sm" data-revoke="${d.code}" title="Anular documento">${icon('x')}</button>`}</div>`).join('')}</div></div>` : ''}
          <div class="card"><div class="card-title">${icon('edit')} Notas adicionales</div>
            ${(c.addenda || []).map((a) => `<div class="addendum"><div class="t-sub">${fmtDateTime(a.at)} · ${esc(a.by)}</div><div class="small" style="white-space:pre-wrap">${esc(a.text)}</div></div>`).join('') || '<p class="small muted" style="margin:8px 0">La nota médica cerrada no se modifica. Agrega aquí resultados, evolución o correcciones.</p>'}
            ${c.status === 'cerrada' ? `<textarea class="textarea mt" data-add placeholder="Ej.: trae resultados: hemoglobina 12,5 g/dl…"></textarea><button class="btn btn-secondary btn-sm mt" data-add-btn>${icon('plus')} Agregar nota</button>` : ''}
          </div>
        </div>
      </div></div>
      <div class="rp-foot">
        <div class="row row-wrap">${c.rx?.length ? `<button class="btn btn-secondary" data-p="recipe">${icon('print')} Récipe</button>` : ''}${c.labs?.length || c.imaging?.length ? `<button class="btn btn-secondary" data-p="labs">${icon('flask')} Exámenes</button>` : ''}<button class="btn btn-secondary" data-p="report">${icon('file')} Informe</button>${c.referral?.to ? `<button class="btn btn-secondary" data-p="referral">${icon('send')} Referencia</button>` : ''}</div>
        <div class="row row-wrap"><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Indicaciones</button>${c.billing === 'pendiente' ? `<button class="btn btn-ghost" data-waive>Exonerar</button><button class="btn btn-primary" data-charge>${icon('dollar')} Cobrar ${usd((c.total || 0) - (c.discount || 0))}</button>` : ''}</div>
      </div>`;
    const q = (s) => rootEl.querySelector(s);
    q('[data-x]').onclick = () => m.close();
    q('[data-pt]').onclick = async () => { const { openPatient } = await import('./patient.js'); openPatient(c.patientId); };
    rootEl.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => {
      try {
        const k = b.dataset.p;
        if (k === 'recipe') await printRecipe(c); if (k === 'labs') await printLabOrder(c); if (k === 'report') await printReport(c); if (k === 'referral') await printReferral(c);
        render();
      } catch (ex) { toast(ex.message, 'warning'); }
    });
    q('[data-wa]').onclick = () => waPatient('indicaciones', { consult: c, patient: store.patient(c.patientId) || {} });
    const ab = q('[data-add-btn]'); if (ab) ab.onclick = async () => { try { c = await addAddendum(c, q('[data-add]').value); toast('Nota agregada'); render(); } catch (ex) { toast(ex.message, 'warning'); } };
    const ch = q('[data-charge]'); if (ch) ch.onclick = async () => { const out = await chargePending(c); if (out) { c = { ...c, billing: 'pagada', saleNumber: out.sale.number }; render(); } };
    const wv = q('[data-waive]'); if (wv) wv.onclick = async () => { if (!(await requirePin('Exonerar el cobro de una consulta'))) return; await waiveConsultation(c, 'Exonerada'); c = { ...c, billing: 'sin_cargo' }; toast('Consulta exonerada'); render(); };
    rootEl.querySelectorAll('[data-revoke]').forEach((b) => b.onclick = async () => {
      if (!(await requirePin('Anular un documento emitido'))) return;
      if (!(await confirmDialog({ title: 'Anular documento', message: 'Al verificarlo aparecerá como ANULADO.', confirmText: 'Anular', danger: true }))) return;
      await revokeDocument(c, b.dataset.revoke); toast('Documento anulado', 'warning'); render();
    });
  }
  render();
  return m;
}

/** Consulta sin cita: elige (o registra) al paciente y abre la consulta de inmediato */
export async function startWalkIn(patient = null) {
  const { pickPatient } = await import('./patient.js');
  const p = patient || await pickPatient({ title: 'Consulta sin cita · ¿a quién atiendes?' });
  if (!p) return null;
  const { startConsultation } = await import('./ops.js');
  const todays = store.todayAppts.find((a) => a.patientId === p.id && ['programada', 'confirmada', 'espera'].includes(a.status));
  const c = await startConsultation({ patient: p, appointment: todays || null });
  return openConsultation(c);
}
