// Sano Doctor — Capa de datos multisede (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { addDays, startOfDay, sha256, toast, todayKey, dayKey } from './utils.js';

// ---------- Citas ----------
export const APPT_STATUS = {
  programada: { label: 'Programada', short: 'Programada', tone: 'info', icon: 'calendar' },
  confirmada: { label: 'Confirmada', short: 'Confirmada', tone: 'brand', icon: 'check' },
  espera: { label: 'En sala de espera', short: 'En espera', tone: 'warning', icon: 'clock' },
  consulta: { label: 'En consulta', short: 'En consulta', tone: 'violet', icon: 'stethoscope' },
  atendida: { label: 'Atendida', short: 'Atendida', tone: 'success', icon: 'checkCircle' },
  no_asistio: { label: 'No asistió', short: 'No asistió', tone: 'danger', icon: 'x' },
  cancelada: { label: 'Cancelada', short: 'Cancelada', tone: 'neutral', icon: 'x' }
};
export const ACTIVE_APPT = ['programada', 'confirmada', 'espera', 'consulta'];
export const apptBadge = (s) => {
  const st = APPT_STATUS[s] || { label: s, tone: 'neutral' };
  return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`;
};

export const APPT_TYPES = {
  primera: { label: 'Primera vez', service: 'Consulta de primera vez', minutes: 30, color: '#0d9488' },
  control: { label: 'Control', service: 'Consulta de control', minutes: 20, color: '#2563eb' },
  emergencia: { label: 'Emergencia', service: 'Consulta de emergencia', minutes: 30, color: '#dc2626' },
  procedimiento: { label: 'Procedimiento', service: 'Cura / procedimiento menor', minutes: 30, color: '#7c3aed' },
  telemedicina: { label: 'Telemedicina', service: 'Teleconsulta', minutes: 20, color: '#0891b2' },
  certificado: { label: 'Certificado médico', service: 'Certificado de salud', minutes: 15, color: '#b45309' }
};

export const SEX = { F: 'Femenino', M: 'Masculino' };
export const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
export const CHRONIC_TAGS = ['Hipertensión arterial', 'Diabetes tipo 2', 'Diabetes tipo 1', 'Asma', 'EPOC', 'Hipotiroidismo', 'Hipertiroidismo', 'Cardiopatía', 'Dislipidemia', 'Obesidad', 'Enfermedad renal crónica', 'Epilepsia', 'Artritis', 'Gastritis', 'Migraña', 'Depresión', 'Ansiedad', 'VIH', 'Cáncer', 'ACV previo'];
export const ALLERGY_TAGS = ['Penicilina', 'Sulfas', 'AINES', 'Aspirina', 'Cefalosporinas', 'Quinolonas', 'Dipirona', 'Látex', 'Yodo', 'Mariscos', 'Maní', 'Huevo', 'Polen / ácaros'];
export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const PRODUCT_CATEGORIES = ['Medicamentos', 'Inyectables', 'Material de curas', 'Material descartable', 'Sueros y soluciones', 'Vacunas', 'Muestras médicas', 'Otros'];
export const DEFAULT_SERVICES = [
  { name: 'Consulta de primera vez', price: 30 },
  { name: 'Consulta de control', price: 20 },
  { name: 'Consulta de emergencia', price: 40 },
  { name: 'Teleconsulta', price: 15 },
  { name: 'Certificado de salud', price: 10 },
  { name: 'Cura / procedimiento menor', price: 15 },
  { name: 'Nebulización', price: 8 },
  { name: 'Colocación de inyectable', price: 5 },
  { name: 'Electrocardiograma', price: 15 },
  { name: 'Retiro de puntos', price: 10 },
  { name: 'Glicemia capilar', price: 3 },
  { name: 'Toma de tensión arterial', price: 2 }
];
export const DEFAULT_SCHEDULE = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30, sat: false, satStart: '08:00', satEnd: '12:00' };
export const DEFAULT_RX_NOTE = 'Récipe válido por 30 días. No se automedique. Ante cualquier reacción adversa suspenda el tratamiento y consulte.';

const DEFAULT_SETTINGS = {
  businessName: '',
  rif: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  instagram: '',
  receiptFooter: '¡Gracias por su confianza! Cuide su salud.',
  receiptFormat: '80mm',
  rxFormat: 'media',
  rxNote: DEFAULT_RX_NOTE,
  docTitle: 'RECIBO',
  rate: 0,
  rateUpdatedAt: null,
  rateAuto: true,
  iva: 0,
  services: DEFAULT_SERVICES,
  categories: PRODUCT_CATEGORIES,
  doctors: [],
  schedule: DEFAULT_SCHEDULE,
  favMeds: []
};

class Store {
  constructor() {
    this.tenantId = null;
    this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.security = {};
    this.counters = {};
    this.announcement = null;
    this.patients = [];
    this.appointments = [];
    this.openConsults = [];
    this.pending = [];
    this.products = [];
    this.openShift = null;
    this.recentSales = [];
    this.ready = false;
    this._unsubs = [];
    this._listeners = {};
    this._loaded = new Set();
  }

  // ---------- Eventos ----------
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  // ---------- Referencias ----------
  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  verifyRef(code) { return doc(db, 'verify', String(code)); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /**
   * Confirma un lote. La caché local aplica el cambio al instante (también sin internet);
   * se espera la confirmación del servidor como máximo unos segundos para no bloquear la consulta.
   */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la sede esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }

  async save(name, id, data, merge = true) {
    const b = this.batch();
    b.set(this.ref(name, id), data, { merge });
    await this.commit(b);
  }
  async remove(name, id) {
    const b = this.batch();
    b.delete(this.ref(name, id));
    await this.commit(b);
  }

  // ---------- Ciclo de vida ----------
  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'patients', 'appointments', 'consults', 'pending', 'products', 'shift', 'sales'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      for (const k of ['categories', 'services']) {
        if (!Array.isArray(this.settings[k]) || !this.settings[k].length) this.settings[k] = DEFAULT_SETTINGS[k];
      }
      if (!Array.isArray(this.settings.doctors)) this.settings.doctors = [];
      if (!Array.isArray(this.settings.favMeds)) this.settings.favMeds = [];
      this.settings.schedule = { ...DEFAULT_SCHEDULE, ...(this.settings.schedule || {}) };
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('patients'), 'patients', (s) => { this.patients = rows(s).sort(byName); this._ptMap = null; });
    // Agenda: desde hace 14 días en adelante (el historial completo se consulta aparte)
    const fromDay = dayKey(addDays(new Date(), -14));
    listen(query(this.col('appointments'), where('date', '>=', fromDay)), 'appointments', (s) => {
      this.appointments = rows(s).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    });
    listen(query(this.col('consultations'), where('status', '==', 'abierta')), 'consults', (s) => {
      this.openConsults = rows(s).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    });
    listen(query(this.col('consultations'), where('billing', '==', 'pendiente')), 'pending', (s) => {
      this.pending = rows(s).filter((c) => c.status === 'cerrada').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
    });
    listen(this.col('products'), 'products', (s) => { this.products = rows(s).sort(byName); this._pMap = null; });
    listen(query(this.col('cash_shifts'), where('status', '==', 'open')), 'shift', (s) => {
      this.openShift = rows(s).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))[0] || null;
    });
    const since = startOfDay(addDays(new Date(), -7)).toISOString();
    listen(query(this.col('sales'), where('date', '>=', since)), 'sales', (s) => {
      this.recentSales = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });

    // Nunca bloquear más de 8 s (p. ej. sin internet y sin caché)
    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
    this.ready = false;
    this.tenant = null; this.patients = []; this.appointments = []; this.openConsults = []; this.pending = []; this.products = [];
    this.openShift = null; this.recentSales = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this._pMap = null; this._ptMap = null;
  }

  // ---------- Ajustes ----------
  get rate() { return Number(this.settings.rate) || 0; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi consultorio'; }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  async setRate(rate, auto = false) {
    const v = Number(rate);
    if (!(v > 0)) throw new Error('Tasa inválida');
    await this.saveSettings({ rate: v, rateUpdatedAt: new Date().toISOString(), rateSource: auto ? 'bcv' : 'manual' });
    this.emit('rate', v);
  }

  /** Correlativo (historias "hc", consultas "con", facturas "inv"…). Se reserva en el mismo lote que el documento. */
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN de administrador ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) {
      const s = await getDoc(this.ref('config', 'security')).catch(() => null);
      if (s?.exists()) this.security = s.data();
    }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Búsquedas ----------
  product(id) {
    if (!this._pMap) this._pMap = new Map(this.products.map((p) => [p.id, p]));
    return this._pMap.get(id);
  }
  patient(id) {
    if (!this._ptMap) this._ptMap = new Map(this.patients.map((p) => [p.id, p]));
    return this._ptMap.get(id);
  }
  appointment(id) { return this.appointments.find((a) => a.id === id); }
  consult(id) { return this.openConsults.find((c) => c.id === id) || this.pending.find((c) => c.id === id); }
  doctor(id) { return this.settings.doctors.find((d) => d.id === id); }
  get activeDoctors() { return this.settings.doctors.filter((d) => d.active !== false); }
  get mainDoctor() { return this.activeDoctors[0] || null; }
  get activePatients() { return this.patients.filter((p) => p.active !== false); }

  // ---------- Agenda ----------
  apptsOn(day) { return this.appointments.filter((a) => a.date === day); }
  get todayAppts() { return this.apptsOn(todayKey()); }
  get waiting() { return this.todayAppts.filter((a) => a.status === 'espera').sort((a, b) => (a.arrivedAt || '').localeCompare(b.arrivedAt || '')); }

  // ---------- Alertas de inventario ----------
  get lowProducts() {
    return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || 0));
  }
  get outProducts() { return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= 0); }
  /** Insumos vencidos o que vencen en los próximos 60 días (con existencia) */
  get expiringProducts() {
    const lim = dayKey(addDays(new Date(), 60));
    return this.products.filter((p) => p.active !== false && p.expiresAt && p.expiresAt <= lim && (Number(p.stock) || 0) > 0)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  }

  // ---------- Consultas a la base ----------
  async listBetween(name, field, fromISO, toISO) {
    const s = await getDocs(query(this.col(name), where(field, '>=', fromISO), where(field, '<=', toISO)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async salesBetween(fromISO, toISO) { return this.listBetween('sales', 'date', fromISO, toISO); }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async getDocById(name, id) {
    const s = await getDoc(this.ref(name, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }
  async getConsult(id) { return this.consult(id) || this.getDocById('consultations', id); }
  async getPatient(id) { return this.patient(id) || this.getDocById('patients', id); }
  async patientConsults(patientId) {
    return (await this.listEq('consultations', 'patientId', patientId)).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }
  async closedShifts(max = 30) {
    const s = await getDocs(query(this.col('cash_shifts'), where('status', '==', 'closed')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, max);
  }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'sales'), where('date', '>=', fromISO)));
  return s.docs.map((d) => d.data());
}
export async function tenantApptsOn(tenantId, day) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'appointments'), where('date', '==', day)));
  return s.docs.map((d) => d.data());
}
export async function getTenant(id) {
  const s = await getDoc(doc(db, 'tenants', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) {
  const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() {
  const s = await getDoc(doc(db, 'system', 'announcement'));
  return s.exists() ? s.data() : null;
}
/** Verificación pública de un documento médico (página /verificar/CODIGO) */
export async function getVerify(code) {
  const s = await getDoc(doc(db, 'verify', String(code).toUpperCase()));
  return s.exists() ? s.data() : null;
}
export { DEFAULT_SETTINGS };
