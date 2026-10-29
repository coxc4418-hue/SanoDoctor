// Sano Doctor — Operaciones: pacientes, citas, consultas, documentos, cobros, caja e insumos
import { auth } from './firebase.js';
import { store, APPT_TYPES, APPT_STATUS, ACTIVE_APPT } from './store.js';
import { round2, round4, nowISO, todayKey, dayKey, PAY_METHODS, shortId, addDays } from './utils.js';
import { ageOf } from './clinical.js';

export const APP_URL = 'https://sano-doctor.web.app';
export const by = () => (auth.currentUser?.isAnonymous ? 'demo' : (auth.currentUser?.email || '').split('@')[0] || '—');
const FLOW0 = () => ({ inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 });

const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode(n = 7) {
  return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join('');
}
export const verifyUrl = (code) => `${APP_URL}/verificar/${code}`;
export const fmtSeq = (prefix, n, len = 5) => `${prefix}-${String(n).padStart(len, '0')}`;
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ======================================================================
// TOTALES
// ======================================================================
export function itemsTotal(items) { return round2((items || []).reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)); }
export function itemsCost(items) { return round2((items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0)); }
export function cleanItems(items) {
  return (items || []).filter((i) => i && i.name && Number(i.qty) > 0).map((i) => ({
    id: i.id || shortId(6), kind: i.productId ? 'insumo' : 'servicio', productId: i.productId || null, name: String(i.name).trim(),
    qty: round4(Number(i.qty) || 1), price: round2(Number(i.price) || 0), cost: round4(Number(i.cost) || 0)
  }));
}
export const servicePrice = (name) => Number(store.settings.services.find((s) => s.name === name)?.price) || 0;

// ======================================================================
// PAGOS Y CAJA
// ======================================================================
export function normalizePays(payments, rate) {
  return (payments || []).filter((p) => p.amount > 0.004).map((p) => {
    const cur = PAY_METHODS[p.method]?.cur || 'USD';
    return { method: p.method, currency: cur, amount: round2(p.amount), usd: round4(cur === 'BS' ? p.amount / rate : p.amount) };
  });
}
/** Lo que realmente queda por forma de pago (en $): lo pagado menos el vuelto, que sale del efectivo de esa moneda. */
export function methodNet(sale) {
  const m = {};
  (sale.payments || []).forEach((p) => { m[p.method] = round4((m[p.method] || 0) + (p.usd || 0)); });
  const ch = Number(sale.changeUSD) || 0;
  if (ch > 0.004) { const k = sale.changeCurrency === 'BS' ? 'efectivo_bs' : 'efectivo_usd'; m[k] = round4((m[k] || 0) - ch); }
  return m;
}
export function cashFlowOf(payments, changeUSD, changeCurrency, rate) {
  const f = FLOW0();
  for (const p of payments) {
    if (p.method === 'efectivo_usd') f.inUSD += p.amount;
    if (p.method === 'efectivo_bs') f.inBs += p.amount;
  }
  if (changeUSD > 0.004) {
    if (changeCurrency === 'BS') f.outBs += round2(changeUSD * rate);
    else f.outUSD += round2(changeUSD);
  }
  for (const k in f) f[k] = round2(f[k]);
  return f;
}
function shiftIncrements(flow, extra = {}) {
  const u = {};
  for (const k of ['inUSD', 'inBs', 'outUSD', 'outBs']) if (flow[k]) u[k] = store.inc(flow[k]);
  for (const [k, v] of Object.entries(extra)) if (v) u[k] = store.inc(round4(v));
  u.updatedAt = nowISO();
  return u;
}
function preparePayment({ amount, payments, changeCurrency = 'BS' }) {
  const rate = store.rate;
  if (!(rate > 0)) throw new Error('Configura la tasa del día antes de cobrar.');
  const shift = store.openShift;
  if (!shift) throw new Error('Abre la caja antes de cobrar (menú Caja).');
  const pays = normalizePays(payments, rate);
  const paidUSD = round4(pays.reduce((a, p) => a + p.usd, 0));
  if (paidUSD < amount - 0.01) throw new Error(`Falta por cobrar $${round2(amount - paidUSD).toFixed(2)}.`);
  const changeUSD = round2(Math.max(0, paidUSD - amount));
  const flow = cashFlowOf(pays, changeUSD, changeCurrency, rate);
  return { rate, shift, pays, paidUSD, changeUSD, changeCurrency, flow, received: round2(paidUSD - changeUSD) };
}
function addToShift(b, pay) {
  const byMethod = {};
  for (const [k, v] of Object.entries(methodNet({ payments: pay.pays, changeUSD: pay.changeUSD, changeCurrency: pay.changeCurrency }))) byMethod[`byMethod.${k}`] = v;
  b.update(store.ref('cash_shifts', pay.shift.id), shiftIncrements(pay.flow, { salesCount: 1, salesTotal: pay.received, ...byMethod }));
}
function paymentFields(pay) {
  return {
    rate: pay.rate, payments: pay.pays, paidUSD: pay.paidUSD, changeUSD: pay.changeUSD, changeCurrency: pay.changeCurrency,
    method: pay.pays.length === 1 ? pay.pays[0].method : pay.pays.length ? 'mixto' : 'ninguno', received: pay.received,
    shiftId: pay.shift?.id || null, cashFlow: pay.flow
  };
}
export function patientFields(p) {
  return { patientId: p?.id || null, patientName: p?.name || 'Paciente particular', patientPhone: p?.phone || '', patientIdDoc: p?.idDoc || '' };
}

// ======================================================================
// INVENTARIO: descuento de insumos usados
// ======================================================================
function applyStockDelta(b, oldItems, newItems, refLabel, type = 'uso') {
  const qtyMap = (items) => {
    const m = new Map();
    (items || []).forEach((i) => { if (i.productId) m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.qty) || 0)); });
    return m;
  };
  const before = qtyMap(oldItems); const after = qtyMap(newItems);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const date = nowISO();
  const low = [];
  for (const id of ids) {
    const p = store.product(id);
    const delta = round4((after.get(id) || 0) - (before.get(id) || 0));
    if (!p || !delta || p.trackStock === false) continue;
    b.update(store.ref('products', id), { stock: store.inc(-delta), ...(type === 'venta' && delta > 0 ? { sold: store.inc(delta) } : {}), updatedAt: date });
    b.set(store.newRef('inventory_logs'), { productId: id, name: p.name, date, dayKey: todayKey(), type: delta > 0 ? type : 'devolucion', qty: -delta, cost: Number(p.cost) || 0, reason: refLabel, by: by() });
    const left = (Number(p.stock) || 0) - delta;
    if (delta > 0 && left <= (Number(p.minStock) || 0)) low.push({ ...p, stock: left });
  }
  return low;
}
function checkStock(items) {
  for (const l of items) {
    const p = l.productId && store.product(l.productId);
    if (p && p.trackStock !== false && (Number(p.stock) || 0) < l.qty - 1e-9) throw new Error(`No hay suficiente ${p.name} (quedan ${Number(p.stock) || 0}).`);
  }
}

// ======================================================================
// PACIENTES
// ======================================================================
const PATIENT_FIELDS = ['name', 'idDoc', 'birthDate', 'sex', 'phone', 'phone2', 'email', 'address', 'city', 'occupation', 'civilStatus', 'bloodType',
  'allergies', 'allergyNote', 'chronic', 'personalHistory', 'surgicalHistory', 'familyHistory', 'currentMeds', 'habits', 'gynecoHistory', 'vaccines',
  'insurance', 'insuranceNumber', 'emergencyName', 'emergencyPhone', 'referredBy', 'notes'];

export function cleanPatient(data) {
  const out = {};
  for (const k of PATIENT_FIELDS) {
    if (data[k] === undefined) continue;
    out[k] = Array.isArray(data[k]) ? data[k].map((x) => String(x).trim()).filter(Boolean) : typeof data[k] === 'object' && data[k] ? data[k] : String(data[k] ?? '').trim();
  }
  if (out.name) out.name = out.name.replace(/\s+/g, ' ');
  if (out.idDoc) out.idDoc = out.idDoc.toUpperCase().replace(/\s+/g, '');
  return out;
}

/** Busca un paciente con la misma cédula (para evitar duplicados) */
export function findByIdDoc(idDoc, exceptId = null) {
  const k = String(idDoc || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^[VEJPG]/, '');
  if (k.length < 5) return null;
  return store.patients.find((p) => p.id !== exceptId && String(p.idDoc || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^[VEJPG]/, '') === k) || null;
}

export async function savePatient(data, id = null) {
  const clean = cleanPatient(data);
  if (!id && !clean.name) throw new Error('Escribe el nombre del paciente.');
  const dup = clean.idDoc && findByIdDoc(clean.idDoc, id);
  if (dup) throw new Error(`Ya existe un paciente con esa cédula: ${dup.name} (${dup.number}).`);
  const b = store.batch();
  const date = nowISO();
  if (id) {
    b.set(store.ref('patients', id), { ...clean, updatedAt: date }, { merge: true });
    await store.commit(b);
    return { id, ...(store.patient(id) || {}), ...clean };
  }
  const ref = store.newRef('patients');
  const seq = store.nextSeq(b, 'hc');
  const p = { ...clean, number: fmtSeq('HC', seq, 4), seq, active: true, visits: 0, totalSpent: 0, createdAt: date, updatedAt: date, lastVisitAt: null, by: by() };
  b.set(ref, p);
  await store.commit(b);
  return { id: ref.id, ...p };
}

export async function setPatientActive(p, active) {
  await store.save('patients', p.id, { active, updatedAt: nowISO() });
}

/** Archivos del paciente (resultados de laboratorio, imágenes, informes externos) */
export async function addPatientFile(patient, { name, data, kind = 'imagen', note = '' }) {
  const ref = store.newRef('files');
  const f = { patientId: patient.id, name: name || 'Archivo', kind, data, note, date: nowISO(), by: by() };
  await store.save('files', ref.id, f, false);
  return { id: ref.id, ...f };
}

// ======================================================================
// CITAS
// ======================================================================
/** Citas activas que se cruzan con el horario propuesto (mismo médico) */
export function apptConflicts({ date, time, minutes = 30, doctorId = null, exceptId = null }) {
  const s = toMin(time); const e = s + (Number(minutes) || 30);
  return store.apptsOn(date).filter((a) => a.id !== exceptId && ACTIVE_APPT.includes(a.status) && (!doctorId || !a.doctorId || a.doctorId === doctorId)
    && toMin(a.time) < e && toMin(a.time) + (Number(a.minutes) || 30) > s);
}

/** ¿El bloque [m, m+dur) cae en el descanso (almuerzo) del horario? */
export function inBreak(m, dur = 1) {
  const sch = store.settings.schedule;
  if (!sch.breakStart || !sch.breakEnd) return false;
  return m < toMin(sch.breakEnd) && m + dur > toMin(sch.breakStart);
}

/** Horarios libres del día según el horario de atención */
export function freeSlots(date, { doctorId = null, minutes = null } = {}) {
  const sch = store.settings.schedule;
  const d = new Date(date + 'T12:00');
  const wd = d.getDay();
  let start = sch.start; let end = sch.end;
  if (wd === 6 && sch.sat) { start = sch.satStart; end = sch.satEnd; } else if (!sch.days.includes(wd)) return [];
  const step = Number(sch.slot) || 30; const dur = Number(minutes) || step;
  const out = [];
  const now = new Date(); const isToday = date === todayKey();
  for (let m = toMin(start); m + dur <= toMin(end); m += step) {
    if (isToday && m < now.getHours() * 60 + now.getMinutes()) continue;
    if (inBreak(m, dur)) continue;
    if (!apptConflicts({ date, time: minToTime(m), minutes: dur, doctorId }).length) out.push(minToTime(m));
  }
  return out;
}

export async function saveAppointment(data, id = null) {
  if (!data.date || !/^\d{2}:\d{2}$/.test(data.time || '')) throw new Error('Indica la fecha y la hora de la cita.');
  let patient = data.patient;
  const b = store.batch();
  const date = nowISO();
  if (patient && !patient.id) {
    if (!patient.name) throw new Error('Escribe el nombre del paciente.');
    const dup = patient.idDoc && findByIdDoc(patient.idDoc);
    if (dup) patient = dup;
    else {
      const pref = store.newRef('patients');
      const seq = store.nextSeq(b, 'hc');
      const p = { ...cleanPatient(patient), number: fmtSeq('HC', seq, 4), seq, active: true, visits: 0, totalSpent: 0, createdAt: date, updatedAt: date, lastVisitAt: null, by: by() };
      b.set(pref, p);
      patient = { id: pref.id, ...p };
    }
  }
  if (!patient?.id) throw new Error('Selecciona o registra al paciente.');
  const type = APPT_TYPES[data.type] ? data.type : 'control';
  const doc = store.doctor(data.doctorId) || store.mainDoctor;
  const fields = {
    patientId: patient.id, patientName: patient.name, patientPhone: patient.phone || '', patientIdDoc: patient.idDoc || '',
    date: data.date, time: data.time, minutes: Number(data.minutes) || APPT_TYPES[type].minutes, type, reason: String(data.reason || '').trim(),
    doctorId: doc?.id || null, doctor: doc?.name || '', notes: String(data.notes || '').trim(), updatedAt: date
  };
  let out;
  if (id) {
    const prev = store.appointment(id) || {};
    const moved = prev.date && (prev.date !== fields.date || prev.time !== fields.time);
    const history = [...(prev.history || []), ...(moved ? [{ at: date, note: `Reprogramada del ${prev.date} ${prev.time} al ${fields.date} ${fields.time}`, by: by() }] : [])];
    b.set(store.ref('appointments', id), { ...fields, history, ...(moved && ['no_asistio', 'cancelada'].includes(prev.status) ? { status: 'programada' } : {}) }, { merge: true });
    out = { ...prev, ...fields, id, history };
  } else {
    const ref = store.newRef('appointments');
    const a = { ...fields, status: data.status || 'programada', createdAt: date, by: by(), consultationId: null, reminded: false, history: [{ at: date, note: 'Cita agendada', by: by() }] };
    b.set(ref, a);
    out = { id: ref.id, ...a };
  }
  await store.commit(b);
  return out;
}

export async function setApptStatus(appt, status, note = '') {
  if (!APPT_STATUS[status]) throw new Error('Estado inválido');
  const date = nowISO();
  const patch = { status, updatedAt: date, history: [...(appt.history || []), { at: date, note: note || APPT_STATUS[status].label, by: by() }] };
  if (status === 'espera') patch.arrivedAt = date;
  if (status === 'confirmada') patch.confirmedAt = date;
  if (status === 'cancelada') patch.cancelReason = note;
  await store.save('appointments', appt.id, patch);
  return { ...appt, ...patch };
}
export async function markReminded(appt) { await store.save('appointments', appt.id, { reminded: true, remindedAt: nowISO() }); }

// ======================================================================
// CONSULTAS
// ======================================================================
const EMPTY_VITALS = { ta: '', fc: '', fr: '', temp: '', sat: '', peso: '', talla: '', glucemia: '', cintura: '' };

/** Inicia una consulta (desde una cita o sin cita). Si la cita ya tiene consulta abierta, la devuelve. */
export async function startConsultation({ patient, appointment = null, type = null }) {
  if (appointment?.consultationId) {
    const ex = await store.getConsult(appointment.consultationId);
    if (ex && ex.status === 'abierta') return ex;
  }
  const open = store.openConsults.find((c) => c.patientId === patient.id);
  if (open) return open;
  const b = store.batch();
  const date = nowISO();
  const seq = store.nextSeq(b, 'con');
  const ref = store.newRef('consultations');
  const t = APPT_TYPES[type || appointment?.type] ? (type || appointment?.type) : (patient.visits ? 'control' : 'primera');
  const doc = store.doctor(appointment?.doctorId) || store.mainDoctor;
  // Arrastra el peso/talla del último control para no volver a pedirlos
  const last = patient.lastVitals || {};
  const svc = APPT_TYPES[t].service;
  const c = {
    number: fmtSeq('C', seq), seq, status: 'abierta', billing: 'abierta', startedAt: date, updatedAt: date, dayKey: todayKey(),
    ...patientFields(patient), patientNumber: patient.number || '', patientSex: patient.sex || '', patientBirth: patient.birthDate || '', patientBlood: patient.bloodType || '',
    age: ageOf(patient.birthDate), allergies: patient.allergies || [], chronic: patient.chronic || [],
    appointmentId: appointment?.id || null, type: t, doctorId: doc?.id || null, doctor: doc?.name || '',
    reason: appointment?.reason || '', illness: '', vitals: { ...EMPTY_VITALS, talla: last.talla || '' }, exam: '', systems: '',
    diagnoses: [], plan: '', rx: [], indications: '', labs: [], imaging: [], labNote: '', referral: null, rest: null,
    nextVisit: null, docs: [], addenda: [],
    charges: svc ? [{ id: shortId(6), productId: null, name: svc, qty: 1, price: servicePrice(svc), cost: 0 }] : [],
    by: by()
  };
  b.set(ref, c);
  if (appointment) b.update(store.ref('appointments', appointment.id), { status: 'consulta', consultationId: ref.id, startedAt: date, updatedAt: date, history: [...(appointment.history || []), { at: date, note: `En consulta · ${c.number}`, by: by() }] });
  await store.commit(b);
  return { id: ref.id, ...c };
}

/** Guarda el borrador de la consulta (solo mientras está abierta) */
export async function saveConsultation(c, patch) {
  if (c.status !== 'abierta') throw new Error('La consulta ya está cerrada. Agrega una nota adicional.');
  const next = { ...c, ...patch, updatedAt: nowISO() };
  const { id, ...data } = next;
  await store.save('consultations', c.id, data, false);
  return next;
}

/**
 * Cierra la consulta: firma la nota, descuenta los insumos usados, actualiza al paciente y la cita,
 * agenda el control si se pidió y deja el cobro pendiente o lo cobra en el mismo momento.
 * charge: { payments, changeCurrency, discount } o null (queda por cobrar)
 */
export async function closeConsultation(c, { charge = null, nextAppt = null, waive = false } = {}) {
  if (c.status !== 'abierta') throw new Error('La consulta ya está cerrada.');
  if (!c.reason && !c.diagnoses?.length) throw new Error('Indica al menos el motivo de consulta o un diagnóstico.');
  const items = cleanItems(c.charges);
  checkStock(items);
  const total = round2(itemsTotal(items) - (Number(charge?.discount) || 0));
  const pay = charge && total > 0.004 ? preparePayment({ amount: total, payments: charge.payments, changeCurrency: charge.changeCurrency }) : null;
  const b = store.batch();
  const date = nowISO();
  const low = applyStockDelta(b, [], items, `Consulta ${c.number}`);
  const billing = waive || total <= 0.004 ? 'sin_cargo' : pay ? 'pagada' : 'pendiente';
  const next = { ...c, charges: items, total: itemsTotal(items), cost: itemsCost(items), discount: round2(Number(charge?.discount) || 0), status: 'cerrada', billing, closedAt: date, updatedAt: date, closedBy: by(), stockApplied: true };
  let sale = null;
  if (pay) sale = consultSale(b, next, items, pay, next.discount);
  if (sale) Object.assign(next, { saleId: sale.id, saleNumber: sale.number, paidAt: date });
  // Cita
  if (c.appointmentId) {
    const a = store.appointment(c.appointmentId);
    b.set(store.ref('appointments', c.appointmentId), { status: 'atendida', finishedAt: date, updatedAt: date, history: [...(a?.history || []), { at: date, note: `Atendida · ${c.number}`, by: by() }] }, { merge: true });
  }
  // Control programado
  let control = null;
  if (nextAppt?.date && nextAppt?.time) {
    const cref = store.newRef('appointments');
    control = {
      ...patientFields({ id: c.patientId, name: c.patientName, phone: c.patientPhone, idDoc: c.patientIdDoc }),
      date: nextAppt.date, time: nextAppt.time, minutes: APPT_TYPES.control.minutes, type: 'control', reason: nextAppt.reason || `Control (${c.diagnoses?.[0]?.name || 'seguimiento'})`,
      doctorId: c.doctorId, doctor: c.doctor, notes: '', status: 'programada', createdAt: date, updatedAt: date, by: by(), consultationId: null, reminded: false, fromConsultation: c.id,
      history: [{ at: date, note: `Control indicado en ${c.number}`, by: by() }]
    };
    b.set(cref, control);
    control = { id: cref.id, ...control };
    next.nextVisit = { date: nextAppt.date, time: nextAppt.time, appointmentId: cref.id };
  }
  const { id, ...data } = next;
  b.set(store.ref('consultations', c.id), data);
  // Paciente: última visita, diagnósticos y signos
  const pt = store.patient(c.patientId);
  if (pt) {
    const v = c.vitals || {};
    const lastVitals = { ...(pt.lastVitals || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => String(x || '').trim())), at: date };
    b.update(store.ref('patients', c.patientId), {
      visits: store.inc(1), lastVisitAt: date, lastConsultId: c.id, lastDiagnoses: (c.diagnoses || []).slice(0, 3).map((d) => d.name), lastVitals,
      nextVisitAt: next.nextVisit?.date || null, ...(sale ? { totalSpent: store.inc(sale.total) } : {}), updatedAt: date
    });
  }
  await store.commit(b);
  return { consultation: next, sale, low, control };
}

function consultSale(b, c, items, pay, discount = 0) {
  const seq = store.nextSeq(b, 'inv');
  const ref = store.newRef('sales');
  const subtotal = itemsTotal(items);
  const total = round2(subtotal - discount);
  const sale = {
    number: fmtSeq(store.settings.invoicePrefix || 'F', seq, 6), seq, kind: 'consulta', date: nowISO(), dayKey: todayKey(),
    items: items.map((x) => ({ ...x, total: round2(x.price * x.qty) })), subtotal, discount: round2(discount), total, cost: itemsCost(items), totalBs: round2(total * pay.rate),
    ...paymentFields(pay),
    patientId: c.patientId, patientName: c.patientName, patientPhone: c.patientPhone, patientIdDoc: c.patientIdDoc || '',
    consultationId: c.id, consultationNumber: c.number, doctorId: c.doctorId || null, doctor: c.doctor || '', diagnosis: c.diagnoses?.[0]?.name || '',
    status: 'completed', by: by()
  };
  b.set(ref, sale);
  addToShift(b, pay);
  return { id: ref.id, ...sale };
}

/** Cobra una consulta cerrada que quedó pendiente */
export async function chargeConsultation(c, { payments, changeCurrency = 'BS', discount = 0 }) {
  if (c.billing !== 'pendiente') throw new Error('Esta consulta no tiene cobro pendiente.');
  const items = cleanItems(c.charges);
  const total = round2(itemsTotal(items) - discount);
  const pay = preparePayment({ amount: total, payments, changeCurrency });
  const b = store.batch();
  const sale = consultSale(b, c, items, pay, discount);
  const date = nowISO();
  b.update(store.ref('consultations', c.id), { billing: 'pagada', saleId: sale.id, saleNumber: sale.number, paidAt: date, discount: round2(discount), updatedAt: date });
  if (c.patientId && store.patient(c.patientId)) b.update(store.ref('patients', c.patientId), { totalSpent: store.inc(sale.total) });
  await store.commit(b);
  return { sale };
}

/** Exonera una consulta pendiente (cortesía) */
export async function waiveConsultation(c, reason = '') {
  await store.save('consultations', c.id, { billing: 'sin_cargo', waivedReason: reason, waivedAt: nowISO(), updatedAt: nowISO() });
}

/** Nota adicional sobre una consulta cerrada (la nota original no se modifica) */
export async function addAddendum(c, text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Escribe la nota.');
  const addenda = [...(c.addenda || []), { at: nowISO(), text: t, by: by() }];
  await store.save('consultations', c.id, { addenda, updatedAt: nowISO() });
  return { ...c, addenda };
}

/** Anula una consulta abierta creada por error (la cita vuelve a la sala de espera) */
export async function discardConsultation(c, reason = '') {
  if (c.status !== 'abierta') throw new Error('Solo se puede descartar una consulta abierta.');
  const b = store.batch();
  const date = nowISO();
  b.set(store.ref('consultations', c.id), { status: 'anulada', billing: 'anulada', voidReason: reason, voidedAt: date, updatedAt: date }, { merge: true });
  if (c.appointmentId) {
    const a = store.appointment(c.appointmentId);
    b.set(store.ref('appointments', c.appointmentId), { status: 'espera', consultationId: null, updatedAt: date, history: [...(a?.history || []), { at: date, note: `Consulta ${c.number} descartada`, by: by() }] }, { merge: true });
  }
  await store.commit(b);
}

// ======================================================================
// DOCUMENTOS MÉDICOS CON VERIFICACIÓN PÚBLICA
// ======================================================================
export const DOC_KINDS = {
  recipe: 'Récipe e indicaciones', labs: 'Orden de exámenes', rest: 'Constancia de reposo', attendance: 'Constancia de asistencia',
  health: 'Certificado de salud', report: 'Informe médico', referral: 'Referencia médica', history: 'Historia clínica'
};
const initialsOf = (name) => String(name || '').trim().split(/\s+/).map((w) => w[0] ? w[0].toUpperCase() + '.' : '').join(' ');
const maskId = (id) => { const s = String(id || ''); return s.length > 4 ? s.slice(0, Math.min(4, s.length - 3)) + '•••' + s.slice(-3) : s; };

/** Registra un documento emitido (código de verificación) y lo agrega a la consulta. Devuelve el código. */
export async function issueDocument(c, kind, summary = '') {
  const existing = (c.docs || []).find((d) => d.kind === kind && d.summary === summary);
  if (existing) return existing.code;
  const code = genCode(7);
  const doc = store.doctor(c.doctorId) || store.mainDoctor || {};
  const s = store.settings;
  const b = store.batch();
  b.set(store.verifyRef(code), {
    tenantId: store.tenantId, code, kind, kindLabel: DOC_KINDS[kind] || kind, issuedAt: nowISO(), number: c.number || '',
    clinic: { name: store.businessName, phone: s.phone || '', whatsapp: s.whatsapp || s.phone || '', address: s.address || '' },
    doctor: { name: doc.name || '', specialty: doc.specialty || '', mpps: doc.mpps || '', cmv: doc.cmv || '' },
    patient: { initials: initialsOf(c.patientName), id: maskId(c.patientIdDoc) }, summary: String(summary || '').slice(0, 240), valid: true, demo: store.isDemo
  });
  const docs = [...(c.docs || []), { kind, code, at: nowISO(), summary }];
  if (c.id && c.status) b.set(store.ref('consultations', c.id), { docs, updatedAt: nowISO() }, { merge: true });
  await store.commit(b);
  c.docs = docs;
  return code;
}
export async function revokeDocument(c, code) {
  const b = store.batch();
  b.set(store.verifyRef(code), { valid: false, revokedAt: nowISO() }, { merge: true });
  const docs = (c.docs || []).map((d) => (d.code === code ? { ...d, revoked: true } : d));
  b.set(store.ref('consultations', c.id), { docs }, { merge: true });
  await store.commit(b);
  c.docs = docs;
}

// ======================================================================
// COBRO DE SERVICIOS E INSUMOS (sin consulta)
// ======================================================================
export function cartTotals(lines, discount = 0) {
  const subtotal = round2((lines || []).reduce((a, l) => a + l.price * l.qty, 0));
  const disc = round2(Math.min(subtotal, Math.max(0, Number(discount) || 0)));
  return { subtotal, discount: disc, total: round2(subtotal - disc) };
}

export async function chargeSale({ lines, patient = null, discount = 0, payments = [], changeCurrency = 'BS', note = '' }) {
  const clean = cleanItems(lines);
  if (!clean.length) throw new Error('No hay nada para cobrar.');
  checkStock(clean);
  const t = cartTotals(clean, discount);
  const pay = preparePayment({ amount: t.total, payments, changeCurrency });
  const b = store.batch();
  const date = nowISO();
  const seq = store.nextSeq(b, 'inv');
  const number = fmtSeq(store.settings.invoicePrefix || 'F', seq, 6);
  const ref = store.newRef('sales');
  const low = applyStockDelta(b, [], clean, `Cobro ${number}`, 'venta');
  const sale = {
    number, seq, kind: 'servicio', date, dayKey: todayKey(),
    items: clean.map((x) => ({ ...x, total: round2(x.price * x.qty) })), ...t, cost: itemsCost(clean), totalBs: round2(t.total * pay.rate),
    ...paymentFields(pay), ...patientFields(patient), note, status: 'completed', by: by()
  };
  b.set(ref, sale);
  addToShift(b, pay);
  if (patient?.id && store.patient(patient.id)) b.update(store.ref('patients', patient.id), { totalSpent: store.inc(t.total), lastVisitAt: date });
  await store.commit(b);
  return { sale: { id: ref.id, ...sale }, low };
}

/** Anula una factura: revierte caja e insumos y, si era de una consulta, la deja otra vez por cobrar */
export async function voidSale(sale, reason = '') {
  if (sale.status === 'voided') throw new Error('El documento ya está anulado.');
  const b = store.batch();
  const date = nowISO();
  b.update(store.ref('sales', sale.id), { status: 'voided', voidedAt: date, voidReason: reason || '', voidedBy: by() });
  if (sale.kind === 'servicio') applyStockDelta(b, sale.items, [], `Anulación ${sale.number}`, 'venta');
  if (sale.consultationId) {
    b.set(store.ref('consultations', sale.consultationId), { billing: 'pendiente', saleId: null, saleNumber: null, paidAt: null, updatedAt: date }, { merge: true });
  }
  if (sale.patientId && store.patient(sale.patientId)) b.update(store.ref('patients', sale.patientId), { totalSpent: store.inc(-(sale.total || 0)) });
  const shift = store.openShift;
  const f = sale.cashFlow || FLOW0();
  const reverse = { inUSD: f.outUSD || 0, inBs: f.outBs || 0, outUSD: f.inUSD || 0, outBs: f.inBs || 0 };
  let cashReverted = false;
  if (shift && (sale.received || 0) > 0) {
    const extra = {};
    if (sale.shiftId === shift.id) {
      extra.salesCount = -1; extra.salesTotal = -(sale.received || 0);
      for (const [k, v] of Object.entries(methodNet(sale))) extra[`byMethod.${k}`] = -v;
    }
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(reverse, extra));
    if (reverse.inUSD || reverse.inBs || reverse.outUSD || reverse.outBs) {
      b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'void', direction: 'out', currency: 'USD', amount: 0, flow: reverse, concept: `Anulación ${sale.number}`, category: 'Anulaciones', refId: sale.id, by: by() });
    }
    cashReverted = true;
  }
  await store.commit(b);
  return { cashReverted };
}

// ======================================================================
// CAJA
// ======================================================================
export async function cashMovement({ direction, currency, amount, concept, category, note = '' }) {
  const shift = store.openShift;
  if (!shift) throw new Error('No hay caja abierta.');
  const b = store.batch();
  const flow = FLOW0();
  flow[(direction === 'in' ? 'in' : 'out') + (currency === 'BS' ? 'Bs' : 'USD')] = round2(amount);
  const date = nowISO();
  b.set(store.newRef('cash_movements'), {
    shiftId: shift.id, date, dayKey: todayKey(), type: direction === 'in' ? 'income' : 'expense', direction, currency,
    amount: round2(amount), rate: store.rate, flow, concept, category, note, by: by()
  });
  const usdV = currency === 'BS' ? amount / store.rate : amount;
  b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, direction === 'out' ? { expensesUSD: usdV } : { incomeUSD: usdV }));
  await store.commit(b);
}

export async function openShift({ openingUSD, openingBs, note = '' }) {
  if (store.openShift) throw new Error('Ya hay una caja abierta.');
  const ref = store.newRef('cash_shifts');
  const b = store.batch();
  const seq = store.nextSeq(b, 'shift');
  b.set(ref, {
    status: 'open', openedAt: nowISO(), openedBy: by(), dayKey: todayKey(), number: fmtSeq('T', seq, 4),
    openingUSD: round2(openingUSD), openingBs: round2(openingBs), rateAtOpen: store.rate,
    inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note
  });
  await store.commit(b);
  return ref.id;
}

export function shiftExpected(shift) {
  return {
    usd: round2((shift.openingUSD || 0) + (shift.inUSD || 0) - (shift.outUSD || 0)),
    bs: round2((shift.openingBs || 0) + (shift.inBs || 0) - (shift.outBs || 0))
  };
}

export async function closeShift(shift, { countedUSD, countedBs, note = '' }) {
  const exp = shiftExpected(shift);
  const b = store.batch();
  b.update(store.ref('cash_shifts', shift.id), {
    status: 'closed', closedAt: nowISO(), closedBy: by(), rateAtClose: store.rate,
    expectedUSD: exp.usd, expectedBs: exp.bs, countedUSD: round2(countedUSD), countedBs: round2(countedBs),
    diffUSD: round2(countedUSD - exp.usd), diffBs: round2(countedBs - exp.bs), closeNote: note
  });
  await store.commit(b);
}

// ======================================================================
// INVENTARIO DE INSUMOS
// ======================================================================
/** mode: 'compra' (entrada con costo) | 'entrada' | 'merma' | 'salida' | 'conteo' (fija el stock) */
export async function moveProduct(p, { mode, qty, unitCost = 0, reason = '', payFromCash = false, payCurrency = 'USD', lot = '', expiresAt = '' }) {
  const current = Number(store.product(p.id)?.stock ?? p.stock) || 0;
  const q = round4(Number(qty) || 0);
  const delta = round4(mode === 'compra' || mode === 'entrada' ? q : mode === 'conteo' ? q - current : -q);
  const date = nowISO();
  const b = store.batch();
  const patch = { stock: store.inc(delta), updatedAt: date };
  if (mode === 'compra' && unitCost > 0) {
    const stockNow = Math.max(0, current);
    const avg = stockNow + q > 0 ? (stockNow * (Number(p.cost) || 0) + q * unitCost) / (stockNow + q) : unitCost;
    patch.cost = round4(avg); patch.lastCost = round4(unitCost); patch.lastPurchaseAt = date;
  }
  if ((mode === 'compra' || mode === 'entrada') && lot) patch.lot = lot;
  if ((mode === 'compra' || mode === 'entrada') && expiresAt) patch.expiresAt = !p.expiresAt || current <= 0 || expiresAt < p.expiresAt ? expiresAt : p.expiresAt;
  b.update(store.ref('products', p.id), patch);
  b.set(store.newRef('inventory_logs'), { productId: p.id, name: p.name, date, dayKey: todayKey(), type: mode, qty: delta, cost: mode === 'compra' ? unitCost : Number(p.cost) || 0, reason, lot: lot || '', expiresAt: expiresAt || '', by: by() });
  if (mode === 'compra' && payFromCash && unitCost > 0) {
    const shift = store.openShift;
    if (!shift) throw new Error('Abre la caja para pagar la compra con dinero de la caja.');
    const totalUSD = round2(unitCost * q);
    const amount = payCurrency === 'BS' ? round2(totalUSD * store.rate) : totalUSD;
    const flow = FLOW0(); flow[payCurrency === 'BS' ? 'outBs' : 'outUSD'] = amount;
    b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'expense', direction: 'out', currency: payCurrency, amount, rate: store.rate, flow, concept: `Compra: ${q} × ${p.name}`, category: 'Compra de insumos', by: by() });
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { expensesUSD: totalUSD }));
  }
  await store.commit(b);
}

export { addDays, dayKey, toMin };
