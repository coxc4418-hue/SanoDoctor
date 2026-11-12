// Sano Doctor — Modo demo (sesión anónima de 30 minutos) con un centro médico de ejemplo
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS, APPT_TYPES } from './store.js';
import { fmtSeq, itemsTotal, itemsCost, cashFlowOf, methodNet, genCode } from './ops.js';
import { fetchBcvRate } from './shared.js';
import { round2, nowISO, todayKey, dayKey, addDays, shortId, sha256 } from './utils.js';
import { ageOf } from './clinical.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
export const DATA_COLLECTIONS = ['patients', 'appointments', 'consultations', 'files', 'products', 'sales', 'cash_shifts', 'cash_movements', 'inventory_logs', 'config'];
const BIZ = 'Centro Médico Salud Plena (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const DOCTORS = [
  { id: 'dsalazar', name: 'Andreína Salazar', sex: 'F', specialty: 'Medicina general', university: 'UCV', idDoc: 'V-15.432.876', mpps: '98.765', cmv: '23.451', phone: '0414-5550101', signature: '', active: true },
  { id: 'dmendez', name: 'Ricardo Méndez', sex: 'M', specialty: 'Medicina interna', university: 'LUZ', idDoc: 'V-12.345.987', mpps: '76.543', cmv: '18.902', phone: '0424-5550202', signature: '', active: true }
];

const yearsAgo = (y, m = 3, d = 12) => { const t = new Date(); return `${t.getFullYear() - y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const birthdayToday = (y) => { const t = new Date(); return `${t.getFullYear() - y}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

// Pacientes con antecedentes realistas
const PATIENTS = [
  { k: 'maria', name: 'María José González', idDoc: 'V-18456789', birthDate: yearsAgo(38, 5, 14), sex: 'F', phone: '0414-1234567', email: 'mariajg@correo.com', address: 'Urb. El Paraíso, Caracas', occupation: 'Docente', bloodType: 'O+', allergies: ['Penicilina'], chronic: ['Migraña'], currentMeds: 'Naproxeno en crisis', habits: { tabaco: 'No fuma', alcohol: 'Ocasional / social', ejercicio: '2-3 veces por semana' } },
  { k: 'jose', name: 'José Antonio Rodríguez', idDoc: 'V-9876543', birthDate: yearsAgo(62, 9, 2), sex: 'M', phone: '0424-7654321', address: 'La Candelaria, Caracas', occupation: 'Comerciante', bloodType: 'A+', allergies: [], chronic: ['Hipertensión arterial', 'Diabetes tipo 2'], currentMeds: 'Losartán 50 mg c/12 h · Metformina 850 mg c/12 h', familyHistory: 'Padre con IAM a los 60 años.', habits: { tabaco: 'Ex fumador', alcohol: 'Ocasional / social', ejercicio: 'Sedentario', dieta: 'Alta en carbohidratos' } },
  { k: 'carmen', name: 'Carmen Elena Pérez', idDoc: 'V-15998120', birthDate: yearsAgo(45, 1, 23), sex: 'F', phone: '0412-5551234', address: 'Chacao, Caracas', occupation: 'Contadora', bloodType: 'B+', allergies: ['Sulfas'], chronic: ['Hipotiroidismo'], currentMeds: 'Levotiroxina 75 mcg en ayunas', habits: { tabaco: 'No fuma', ejercicio: 'Ocasional' } },
  { k: 'luis', name: 'Luis Alberto Hernández', idDoc: 'V-24556001', birthDate: yearsAgo(29, 11, 8), sex: 'M', phone: '0416-3332211', address: 'Los Teques, Miranda', occupation: 'Ingeniero', bloodType: 'O+', allergies: [], chronic: ['Asma'], currentMeds: 'Salbutamol inhalador a demanda', habits: { tabaco: 'No fuma', ejercicio: 'Diario' } },
  { k: 'ana', name: 'Ana Gabriela Martínez', idDoc: 'V-22345678', birthDate: birthdayToday(34), sex: 'F', phone: '0426-8889900', address: 'Baruta, Miranda', occupation: 'Abogada', bloodType: 'A-', allergies: ['AINES'], chronic: [], gynecoHistory: 'G2 P2 · FUM hace 3 semanas · ciclos regulares', habits: { tabaco: 'No fuma', alcohol: 'Ocasional / social' } },
  { k: 'pedro', name: 'Pedro Luis Castillo', idDoc: 'V-7777456', birthDate: yearsAgo(71, 7, 30), sex: 'M', phone: '0414-2223344', address: 'El Valle, Caracas', occupation: 'Jubilado', bloodType: 'O-', allergies: [], chronic: ['Hipertensión arterial', 'Dislipidemia', 'Cardiopatía'], currentMeds: 'Amlodipino 10 mg · Atorvastatina 20 mg · ASA 81 mg', surgicalHistory: 'Colecistectomía (2010)', habits: { tabaco: 'Ex fumador', ejercicio: 'Ocasional' } },
  { k: 'daniela', name: 'Daniela Suárez', idDoc: 'V-27001552', birthDate: yearsAgo(24, 4, 17), sex: 'F', phone: '0424-1112233', address: 'Petare, Miranda', occupation: 'Estudiante', bloodType: 'O+', allergies: [], chronic: ['Gastritis'], habits: { tabaco: 'No fuma', alcohol: 'Fines de semana' } },
  { k: 'santiago', name: 'Santiago Rivas (niño)', idDoc: '', birthDate: yearsAgo(7, 6, 5), sex: 'M', phone: '0414-9876543', address: 'Altamira, Caracas', occupation: 'Escolar', bloodType: 'A+', allergies: ['Huevo'], chronic: [], emergencyName: 'Laura Rivas (madre)', emergencyPhone: '0414-9876543', vaccines: 'Esquema completo según edad' },
  { k: 'rosa', name: 'Rosa Margarita Lugo', idDoc: 'V-5123456', birthDate: yearsAgo(78, 2, 11), sex: 'F', phone: '0212-5551122', address: 'San Bernardino, Caracas', occupation: 'Ama de casa', bloodType: 'B+', allergies: ['Dipirona'], chronic: ['Diabetes tipo 2', 'Artritis', 'Enfermedad renal crónica'], currentMeds: 'Insulina NPH 20 UI AM · Paracetamol a demanda', habits: { ejercicio: 'Sedentario' } },
  { k: 'miguel', name: 'Miguel Ángel Torres', idDoc: 'V-19887766', birthDate: yearsAgo(41, 10, 3), sex: 'M', phone: '0412-4445566', address: 'Guarenas, Miranda', occupation: 'Chofer', bloodType: 'O+', allergies: [], chronic: ['Obesidad'], habits: { tabaco: 'Fuma a diario', alcohol: 'Frecuente', ejercicio: 'Sedentario' } },
  { k: 'valentina', name: 'Valentina Ortega', idDoc: 'V-30112233', birthDate: yearsAgo(19, 8, 21), sex: 'F', phone: '0416-7778899', address: 'La Urbina, Caracas', occupation: 'Estudiante', bloodType: 'AB+', allergies: [], chronic: ['Ansiedad'] },
  { k: 'jorge', name: 'Jorge Luis Blanco', idDoc: 'V-14223344', birthDate: yearsAgo(52, 12, 1), sex: 'M', phone: '0414-6667788', address: 'Catia, Caracas', occupation: 'Mecánico', bloodType: 'A+', allergies: ['Penicilina', 'Látex'], chronic: ['Hipertensión arterial'], currentMeds: 'Enalapril 10 mg c/12 h', habits: { tabaco: 'Fuma ocasionalmente' } },
  { k: 'isabel', name: 'Isabel Cristina Mora', idDoc: 'V-20998877', birthDate: yearsAgo(33, 3, 9), sex: 'F', phone: '0424-3334455', address: 'Los Palos Grandes, Caracas', occupation: 'Diseñadora', bloodType: 'O+', allergies: [], chronic: [] },
  { k: 'andres', name: 'Andrés Felipe Gil', idDoc: 'V-26554433', birthDate: yearsAgo(27, 9, 16), sex: 'M', phone: '0426-2221100', address: 'El Cafetal, Caracas', occupation: 'Programador', bloodType: 'B-', allergies: [], chronic: [] }
];

// [nombre, categoría, presentación, costo, precio, existencia, mínimo, se cobra, lote, días para vencer]
const PRODUCTS = [
  ['Diclofenac sódico 75 mg/3 ml ampolla', 'Inyectables', 'Ampolla 3 ml', 0.6, 3, 24, 6, true, 'DC2307', 400],
  ['Dexametasona 8 mg/2 ml ampolla', 'Inyectables', 'Ampolla 2 ml', 0.7, 3, 4, 6, true, 'DX1188', 45],
  ['Complejo B ampolla', 'Inyectables', 'Ampolla 3 ml', 0.5, 2.5, 18, 5, true, 'CB4410', 300],
  ['Ceftriaxona 1 g ampolla', 'Inyectables', 'Vial 1 g', 1.8, 6, 6, 4, true, 'CF0921', 210],
  ['Salbutamol solución para nebulizar', 'Medicamentos', 'Frasco 20 ml', 2.5, 0, 3, 2, false, 'SB7731', 25],
  ['Solución fisiológica 0,9 % 500 ml', 'Sueros y soluciones', 'Bolsa 500 ml', 1.2, 4, 10, 4, true, 'SF5502', 500],
  ['Gasas estériles 10x10', 'Material de curas', 'Sobre x 10', 0.4, 1.5, 40, 15, true, '', 0],
  ['Yelco N° 22', 'Material descartable', 'Unidad', 0.3, 1.5, 3, 10, true, '', 0],
  ['Jeringa 5 ml', 'Material descartable', 'Unidad', 0.1, 0.5, 120, 40, true, '', 0],
  ['Guantes de látex talla M', 'Material descartable', 'Caja x 100', 6, 0, 2, 1, false, '', 0],
  ['Sutura nylon 3-0', 'Material de curas', 'Sobre', 1.1, 4, 8, 4, true, 'NY3301', 700],
  ['Tiras de glicemia', 'Material descartable', 'Caja x 50', 9, 0, 1, 1, false, 'TG2210', 20],
  ['Vacuna antitetánica (toxoide)', 'Vacunas', 'Ampolla 0,5 ml', 2.2, 8, 5, 3, true, 'VT0034', -5],
  ['Acetaminofén 500 mg (muestra médica)', 'Muestras médicas', 'Caja x 10 tab.', 0, 0, 30, 5, false, 'AC9921', 380]
];

export async function createDemoTenant(uid) {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + DEMO_MINUTES * 60 * 1000);
  let rate = 0;
  try { rate = (await Promise.race([fetchBcvRate(), new Promise((_, r) => setTimeout(() => r(new Error('t')), 3500))])).rate; } catch (_) { rate = 0; }
  if (!(rate > 0)) rate = 40;
  rate = round2(rate);

  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();

  const ref = (name, id) => doc(db, 'tenants', uid, name, id || doc(collection(db, 'tenants', uid, name)).id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: 'J-00000000-0', phone: '0212-555-0000', whatsapp: '0414-0000000', email: 'demo@sanodoctor.app',
    address: 'Torre Médica Plena, piso 3, consultorio 3-B, Caracas', instagram: '@sanodoctor',
    receiptFooter: '¡Gracias por probar Sano Doctor! Que se mejore pronto.', rate, rateUpdatedAt: nowISO(), rateSource: 'bcv', doctors: DOCTORS,
    schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30, breakStart: '12:00', breakEnd: '13:00', sat: true, satStart: '08:00', satEnd: '12:00' },
    favMeds: ['Acetaminofén', 'Ibuprofeno', 'Loratadina', 'Omeprazol']
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}

const at = (daysAgo, h, m = 0) => { const d = addDays(new Date(), -daysAgo); d.setHours(h, m, 0, 0); return d; };
const hm = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const initialsOf = (n) => String(n || '').trim().split(/\s+/).map((w) => (w[0] ? w[0].toUpperCase() + '.' : '')).join(' ');

/** Historias, citas en todos los estados, cobros, insumos y caja para que la demo se vea con vida. */
export async function seedDemoActivity() {
  const rate = store.rate || 40;
  const svc = (name) => { const s = store.settings.services.find((x) => x.name === name); return { id: shortId(6), productId: null, name, qty: 1, price: Number(s?.price) || 0, cost: 0 }; };

  // 1) Pacientes e insumos
  const b0 = store.batch(); const now = nowISO();
  PATIENTS.forEach(({ k, ...p }, i) => {
    const seq = store.nextSeq(b0, 'hc');
    b0.set(store.ref('patients', 'demo_' + k), {
      phone2: '', email: '', city: '', civilStatus: '', personalHistory: '', surgicalHistory: '', familyHistory: '', currentMeds: '', gynecoHistory: '', vaccines: '', insurance: '', insuranceNumber: '', emergencyName: '', emergencyPhone: '', referredBy: '', notes: '', allergyNote: '', habits: {},
      ...p, number: fmtSeq('HC', seq, 4), seq, active: true, visits: 0, totalSpent: 0, lastVisitAt: null,
      createdAt: at(60 - i * 3, 9).toISOString(), updatedAt: now, by: 'demo'
    });
  });
  PRODUCTS.forEach(([name, category, compatible, cost, price, stock, minStock, sellable, lot, expDays]) => b0.set(store.newRef('products'), {
    name, category, compatible, sku: '', cost, price, stock, minStock, supplier: 'Droguería Nacional C.A.', sellable, trackStock: true, active: true, sold: 0,
    lot, expiresAt: expDays ? dayKey(addDays(new Date(), expDays)) : '', createdAt: now, updatedAt: now
  }));
  await store.commit(b0);
  await waitFor(() => store.patients.length >= PATIENTS.length && store.products.length >= PRODUCTS.length);

  const P = (k) => store.patient('demo_' + k) || { id: 'demo_' + k, ...PATIENTS.find((x) => x.k === k) };
  const prod = (n, qty = 1) => { const p = store.products.find((x) => x.name.startsWith(n)); return p ? { id: shortId(6), productId: p.id, name: p.name, qty, price: p.price, cost: p.cost } : null; };

  // 2) Consultas anteriores (cerradas) con su cita y su cobro
  //    [paciente, díasAtrás, hora, tipo, médico, motivo, enfermedad actual, signos, dx, rx, labs, pago, cargos extra, indicaciones]
  const V = (ta, fc, temp, sat, peso, talla, extra = {}) => ({ ta, fc: String(fc), fr: '16', temp: String(temp), sat: String(sat), peso: String(peso), talla: String(talla), glucemia: '', cintura: '', ...extra });
  const RX = (name, presentation, dose, frequency, duration, route = 'Oral', note = '') => ({ id: shortId(6), name, presentation, dose, frequency, duration, route, family: '', qty: '', note });
  const history = [
    ['jose', 27, 9, 'control', 'dmendez', 'Control de tensión y glicemia', 'Paciente refiere cefalea ocasional. Cumple tratamiento.', V('150/95', 82, 36.6, 97, 92, 172, { glucemia: '168' }), [['I10', 'Hipertensión esencial (primaria)'], ['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones']], [RX('Losartán potásico', 'Tabletas 50 mg', '1 tableta', 'cada 12 horas', 'Continuo'), RX('Metformina', 'Tabletas 850 mg', '1 tableta', 'con almuerzo y cena', 'Continuo')], ['Hemoglobina glicosilada (HbA1c)', 'Perfil lipídico', 'Creatinina'], 'pagomovil', [], 'Dieta hiposódica (baja en sal).\nControl de tensión arterial en casa y anotar valores.'],
    ['maria', 24, 10, 'primera', 'dsalazar', 'Dolor de cabeza intenso', 'Cefalea hemicraneal pulsátil de 2 días, con fotofobia. Sin fiebre.', V('118/76', 74, 36.8, 99, 61, 163), [['G43.9', 'Migraña, no especificada']], [RX('Naproxeno sódico', 'Tabletas 550 mg', '1 tableta', 'cada 12 horas', '5 días', 'Oral', 'Tomar con comida'), RX('Metoclopramida', 'Tabletas 10 mg', '1 tableta', 'cada 8 horas', '3 días')], [], 'zelle', [], 'Reposo relativo en ambiente oscuro.\nEvitar automedicarse.'],
    ['luis', 20, 15, 'emergencia', 'dsalazar', 'Dificultad para respirar', 'Crisis de asma leve tras exposición a polvo. Sibilantes espiratorios.', V('124/80', 104, 36.9, 93, 75, 178), [['J45.9', 'Asma, no especificada']], [RX('Salbutamol', 'Inhalador 100 mcg', '2 inhalaciones', 'cada 6 horas', '7 días', 'Inhalada'), RX('Prednisona', 'Tabletas 20 mg', '2 tabletas', 'una vez al día', '5 días')], [], 'efectivo_usd', [svc('Nebulización')], 'Evitar exposición a polvo y humo.\nAcudir a emergencia si presenta dificultad para respirar.'],
    ['pedro', 17, 11, 'control', 'dmendez', 'Control cardiovascular', 'Asintomático. Trae laboratorio: LDL 128 mg/dl.', V('138/84', 68, 36.5, 96, 80, 168), [['I10', 'Hipertensión esencial (primaria)'], ['E78.5', 'Hiperlipidemia, no especificada']], [RX('Atorvastatina', 'Tabletas 40 mg', '1 tableta', 'en la noche', 'Continuo'), RX('Amlodipino', 'Tabletas 10 mg', '1 tableta', 'una vez al día', 'Continuo')], ['Electrocardiograma'], 'transferencia', [svc('Electrocardiograma')], 'Caminar 30 minutos diarios.'],
    ['daniela', 13, 16, 'primera', 'dsalazar', 'Ardor en la boca del estómago', 'Epigastralgia urente de 2 semanas, empeora en ayunas.', V('110/70', 72, 36.7, 99, 55, 160), [['K29.7', 'Gastritis, no especificada']], [RX('Omeprazol', 'Cápsulas 20 mg', '1 cápsula', 'en ayunas', '30 días'), RX('Sucralfato', 'Suspensión 1 g/5 ml', '10 ml', 'cada 8 horas', '14 días')], ['Helicobacter pylori'], 'pagomovil', [], 'Dieta blanda, fraccionada, sin grasas ni irritantes.'],
    ['rosa', 10, 9, 'control', 'dmendez', 'Control de diabetes', 'Glicemias en casa entre 140 y 190 mg/dl. Dolor en rodillas.', V('132/78', 76, 36.4, 95, 68, 152, { glucemia: '182' }), [['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones'], ['M17.9', 'Gonartrosis, no especificada']], [RX('Acetaminofén', 'Tabletas 500 mg', '1 tableta', 'cada 8 horas', '7 días')], ['Hemoglobina glicosilada (HbA1c)', 'Creatinina', 'Microalbuminuria'], 'efectivo_bs', [svc('Glicemia capilar')], 'Control de glicemia en ayunas y anotar valores.'],
    ['santiago', 6, 10, 'primera', 'dsalazar', 'Fiebre y dolor de garganta', 'Fiebre de 38,5 °C desde ayer, odinofagia. Amígdalas hipertróficas con exudado.', V('', 112, 38.4, 98, 24, 122), [['J03.9', 'Amigdalitis aguda, no especificada']], [RX('Amoxicilina', 'Suspensión 250 mg/5 ml', '7,5 ml', 'cada 8 horas', '10 días'), RX('Acetaminofén', 'Jarabe 160 mg/5 ml', '7,5 ml', 'cada 6 horas', '3 días', 'Oral', 'Si hay fiebre')], [], 'pagomovil', [], 'Abundantes líquidos.\nAcudir a emergencia si presenta fiebre persistente.'],
    ['jorge', 5, 15, 'control', 'dmendez', 'Control de tensión arterial', 'Refiere olvidar dosis nocturna.', V('146/92', 80, 36.6, 97, 88, 175), [['I10', 'Hipertensión esencial (primaria)']], [RX('Enalapril', 'Tabletas 10 mg', '1 tableta', 'cada 12 horas', 'Continuo')], ['Perfil lipídico', 'Glicemia en ayunas'], 'zelle', [], 'Dieta hiposódica (baja en sal).'],
    ['miguel', 4, 11, 'primera', 'dsalazar', 'Chequeo general', 'Desea evaluación por sobrepeso. Fumador de 10 cigarrillos/día.', V('134/86', 84, 36.7, 96, 104, 174, { cintura: '108' }), [['E66.9', 'Obesidad, no especificada'], ['Z72.0', 'Uso de tabaco']], [], ['Hematología completa', 'Glicemia en ayunas', 'Perfil lipídico', 'TGO (AST)', 'TGP (ALT)', 'Uroanálisis'], 'punto', [], 'Dieta balanceada con reducción de harinas.\nTraer resultados de exámenes al próximo control.'],
    ['valentina', 3, 16, 'telemedicina', 'dsalazar', 'Insomnio y nerviosismo', 'Época de exámenes, dificultad para conciliar el sueño.', V('', '', '', '', 58, 165), [['F41.9', 'Trastorno de ansiedad, no especificado']], [], [], 'pagomovil', [], 'Higiene del sueño. Evitar cafeína en la tarde.'],
    ['carmen', 2, 10, 'control', 'dsalazar', 'Control de tiroides', 'Trae TSH 2,1 mUI/L. Asintomática.', V('120/78', 70, 36.5, 99, 66, 158), [['E03.9', 'Hipotiroidismo, no especificado']], [RX('Levotiroxina', 'Tabletas 75 mcg', '1 tableta', 'en ayunas', 'Continuo')], [], 'efectivo_usd', [], ''],
    ['isabel', 1, 9, 'certificado', 'dsalazar', 'Certificado de salud para trabajo', 'Asintomática, sin antecedentes.', V('112/72', 68, 36.5, 99, 59, 167), [['Z02.7', 'Expedición de certificado médico']], [], [], 'pagomovil', [], ''],
    ['andres', 1, 15, 'procedimiento', 'dmendez', 'Herida en mano izquierda', 'Herida cortante de 3 cm en palma izquierda con vidrio, hace 2 horas.', V('122/80', 88, 36.6, 99, 72, 180), [['S61.9', 'Herida de muñeca y mano, no especificada']], [RX('Cefadroxilo', 'Cápsulas 500 mg', '1 cápsula', 'cada 12 horas', '7 días'), RX('Ibuprofeno', 'Tabletas 400 mg', '1 tableta', 'cada 8 horas', '5 días', 'Oral', 'Con comida')], [], 'efectivo_usd', [prod('Sutura nylon'), prod('Gasas estériles', 2), prod('Vacuna antitetánica')].filter(Boolean), 'Mantener la herida limpia y seca.\nRetiro de puntos en 10 días.']
  ];
  // Hoy: consultas ya atendidas en la mañana
  const today = [
    ['maria', 0, 8, 'control', 'dsalazar', 'Control de migraña', 'Mejoría de las crisis, 1 episodio en el mes.', V('116/74', 72, 36.6, 99, 60, 163), [['G43.9', 'Migraña, no especificada']], [RX('Propranolol', 'Tabletas 40 mg', '1/2 tableta', 'cada 12 horas', '30 días')], [], 'pagomovil', [], 'Llevar diario de crisis.'],
    ['jose', 0, 8, 'control', 'dmendez', 'Resultados de laboratorio', 'HbA1c 7,8 %. Glicemia en ayunas 150 mg/dl.', V('142/88', 78, 36.5, 97, 91, 172, { glucemia: '150' }), [['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones'], ['I10', 'Hipertensión esencial (primaria)']], [RX('Metformina', 'Tabletas 1000 mg', '1 tableta', 'con almuerzo y cena', 'Continuo'), RX('Losartán potásico', 'Tabletas 50 mg', '1 tableta', 'cada 12 horas', 'Continuo')], [], null, [], 'Dieta para diabéticos. Caminar 30 minutos diarios.']
  ];

  const b = store.batch();
  const shiftRef = store.newRef('cash_shifts');
  const shift = { status: 'open', openedAt: at(0, 7, 45).toISOString(), openedBy: 'demo', dayKey: todayKey(), number: 'T-0001', openingUSD: 20, openingBs: round2(rate * 10), rateAtOpen: rate, inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, expensesUSD: 0, byMethod: {}, note: 'Turno de demostración' };
  b.set(store.ref('config', 'counters'), { shift: 1 }, { merge: true });
  const ptAgg = {};
  let docsLeft = 3;

  const addConsult = ([pk, daysAgo, hour, type, docId, reason, illness, vitals, dx, rx, labs, method, extra, ind], idx) => {
    const p = P(pk); const d = DOCTORS.find((x) => x.id === docId);
    const minute = (idx * 13) % 50;
    const start = at(daysAgo, hour, minute); const end = new Date(start.getTime() + (16 + (idx % 4) * 4) * 60000);
    const date = dayKey(start);
    const aRef = store.newRef('appointments'); const cRef = store.newRef('consultations');
    const seq = store.nextSeq(b, 'con'); const number = fmtSeq('C', seq);
    const charges = [svc(APPT_TYPES[type].service), ...extra.map((x) => ({ ...x, id: shortId(6) }))];
    const total = itemsTotal(charges); const cost = itemsCost(charges);
    const billing = method ? 'pagada' : 'pendiente';
    const c = {
      number, seq, status: 'cerrada', billing, startedAt: start.toISOString(), updatedAt: end.toISOString(), closedAt: end.toISOString(), closedBy: 'demo', dayKey: date,
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', patientNumber: p.number || '', patientSex: p.sex || '', patientBirth: p.birthDate || '', patientBlood: p.bloodType || '',
      age: ageOf(p.birthDate), allergies: p.allergies || [], chronic: p.chronic || [], appointmentId: aRef.id, type, doctorId: d.id, doctor: d.name,
      reason, illness, vitals, exam: 'Paciente en buenas condiciones generales, consciente, orientado, hidratado. Cardiopulmonar sin alteraciones. Abdomen blando, depresible, no doloroso.', systems: '',
      diagnoses: dx.map(([code, name], i) => ({ code, name, type: i === 0 ? 'Definitivo' : 'Presuntivo', note: '' })), plan: '', rx, indications: ind, labs, imaging: [], labNote: '', referral: null, rest: null,
      nextVisit: null, docs: [], addenda: [], charges, total, cost, discount: 0, stockApplied: true, by: 'demo'
    };
    if (method) {
      const inv = store.nextSeq(b, 'inv'); const sRef = store.newRef('sales');
      const cur = ['efectivo_usd', 'zelle'].includes(method) ? 'USD' : 'BS';
      const payments = [{ method, currency: cur, amount: cur === 'BS' ? round2(total * rate) : total, usd: total }];
      const flow = cashFlowOf(payments, 0, 'BS', rate);
      const sale = {
        number: fmtSeq('F', inv, 6), seq: inv, kind: 'consulta', date: end.toISOString(), dayKey: date, items: charges.map((x) => ({ ...x, total: round2(x.price * x.qty) })), subtotal: total, discount: 0, total, cost, totalBs: round2(total * rate),
        rate, payments, paidUSD: total, changeUSD: 0, changeCurrency: 'BS', method, received: total, shiftId: daysAgo === 0 ? shiftRef.id : null, cashFlow: flow,
        patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', consultationId: cRef.id, consultationNumber: number, doctorId: d.id, doctor: d.name, diagnosis: dx[0]?.[1] || '', status: 'completed', by: 'demo'
      };
      b.set(sRef, sale);
      Object.assign(c, { saleId: sRef.id, saleNumber: sale.number, paidAt: end.toISOString() });
      if (daysAgo === 0) {
        shift.inUSD += flow.inUSD; shift.inBs += flow.inBs; shift.salesCount += 1; shift.salesTotal = round2(shift.salesTotal + total);
        Object.entries(methodNet(sale)).forEach(([k, v]) => { shift.byMethod[k] = round2((shift.byMethod[k] || 0) + v); });
      }
    }
    // Documentos verificables en las consultas más recientes
    if (rx.length && daysAgo <= 6 && docsLeft > 0) {
      docsLeft--;
      const code = genCode(7);
      b.set(store.verifyRef(code), {
        tenantId: store.tenantId, code, kind: 'recipe', kindLabel: 'Récipe e indicaciones', issuedAt: end.toISOString(), number,
        clinic: { name: BIZ, phone: '0212-555-0000', whatsapp: '0414-0000000', address: 'Torre Médica Plena, piso 3' },
        doctor: { name: d.name, specialty: d.specialty, mpps: d.mpps, cmv: d.cmv }, patient: { initials: initialsOf(p.name), id: p.idDoc ? p.idDoc.slice(0, 4) + '•••' + p.idDoc.slice(-3) : '' },
        summary: rx.map((r) => r.name).join(', ').slice(0, 240), valid: true, demo: true
      });
      c.docs.push({ kind: 'recipe', code, at: end.toISOString(), summary: rx.map((r) => r.name).join(', ').slice(0, 240) });
    }
    b.set(cRef, c);
    b.set(aRef, {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', date, time: hm(hour, minute), minutes: APPT_TYPES[type].minutes, type, reason,
      doctorId: d.id, doctor: d.name, notes: '', status: 'atendida', createdAt: at(daysAgo + 3, 10).toISOString(), updatedAt: end.toISOString(), by: 'demo', consultationId: cRef.id, reminded: true,
      arrivedAt: new Date(start.getTime() - 10 * 60000).toISOString(), startedAt: start.toISOString(), finishedAt: end.toISOString(),
      history: [{ at: at(daysAgo + 3, 10).toISOString(), note: 'Cita agendada', by: 'demo' }, { at: start.toISOString(), note: `En consulta · ${number}`, by: 'demo' }, { at: end.toISOString(), note: `Atendida · ${number}`, by: 'demo' }]
    });
    const g = (ptAgg[p.id] ||= { visits: 0, spent: 0, last: null, lastId: null, dx: [], vitals: {} });
    g.visits++; if (method) g.spent += total;
    if (!g.last || end.toISOString() > g.last) { g.last = end.toISOString(); g.lastId = cRef.id; g.dx = dx.map((x) => x[1]).slice(0, 3); g.vitals = { ...Object.fromEntries(Object.entries(vitals).filter(([, v]) => String(v || '').trim())), at: end.toISOString() }; }
  };
  [...history, ...today].forEach(addConsult);

  // 3) Agenda de hoy en todos los estados, inasistencias pasadas y citas futuras
  const mk = (pk, daysFromToday, h, m, type, docId, reason, status, extra = {}) => {
    const p = P(pk); const d = DOCTORS.find((x) => x.id === docId);
    const date = dayKey(addDays(new Date(), daysFromToday));
    const created = at(Math.max(1, 3 - daysFromToday), 11).toISOString();
    const hist = [{ at: created, note: 'Cita agendada', by: 'demo' }];
    if (status === 'confirmada') hist.push({ at: nowISO(), note: 'Confirmada por el paciente', by: 'demo' });
    if (status === 'espera') hist.push({ at: extra.arrivedAt, note: 'Llegó al consultorio', by: 'demo' });
    if (status === 'no_asistio') hist.push({ at: nowISO(), note: 'No asistió', by: 'demo' });
    if (status === 'cancelada') hist.push({ at: nowISO(), note: 'Cancelada: Solicitud del paciente', by: 'demo' });
    b.set(store.newRef('appointments'), {
      patientId: p.id, patientName: p.name, patientPhone: p.phone || '', patientIdDoc: p.idDoc || '', date, time: hm(h, m), minutes: APPT_TYPES[type].minutes, type, reason,
      doctorId: d.id, doctor: d.name, notes: '', status, createdAt: created, updatedAt: nowISO(), by: 'demo', consultationId: null, reminded: status === 'confirmada', history: hist, ...extra
    });
  };
  const nowD = new Date();
  const arrived = (min) => new Date(Date.now() - min * 60000).toISOString();
  const H = nowD.getHours();
  // Las citas de hoy se ubican alrededor de la hora actual para que la demo siempre se vea viva
  const base = Math.min(Math.max(H, 9), 15);
  mk('pedro', 0, base, 0, 'control', 'dmendez', 'Control de tensión arterial', 'espera', { arrivedAt: arrived(18) });
  mk('ana', 0, base, 30, 'primera', 'dsalazar', 'Dolor lumbar', 'espera', { arrivedAt: arrived(6) });
  mk('luis', 0, base + 1, 0, 'control', 'dsalazar', 'Control de asma', 'confirmada');
  mk('rosa', 0, base + 1, 30, 'control', 'dmendez', 'Resultados de laboratorio', 'confirmada');
  mk('miguel', 0, Math.min(base + 2, 16), 0, 'control', 'dsalazar', 'Resultados de exámenes', 'programada');
  mk('valentina', 0, Math.min(base + 2, 16), 30, 'telemedicina', 'dsalazar', 'Seguimiento de ansiedad', 'programada');
  mk('isabel', 0, 8, 30, 'control', 'dsalazar', 'Revisión de exámenes', 'no_asistio');
  mk('daniela', 0, 9, 30, 'control', 'dsalazar', 'Control de gastritis', 'cancelada', { cancelReason: 'Solicitud del paciente' });
  mk('carmen', -9, 9, 0, 'control', 'dsalazar', 'Control', 'no_asistio');
  mk('jorge', -16, 10, 0, 'control', 'dmendez', 'Control de tensión', 'no_asistio');
  // Mañana (sin confirmar: aparecen para enviar recordatorio) y próximos días
  mk('jose', 1, 9, 0, 'control', 'dmendez', 'Control de glicemia', 'programada');
  mk('santiago', 1, 10, 0, 'control', 'dsalazar', 'Control post amigdalitis', 'programada');
  mk('andres', 1, 11, 0, 'procedimiento', 'dmendez', 'Retiro de puntos', 'programada');
  mk('carmen', 1, 15, 0, 'control', 'dsalazar', 'Control de tiroides', 'confirmada');
  mk('maria', 3, 10, 30, 'control', 'dsalazar', 'Control de migraña', 'programada');
  mk('pedro', 7, 9, 30, 'control', 'dmendez', 'Control cardiovascular', 'programada');
  mk('rosa', 14, 9, 0, 'control', 'dmendez', 'Control de diabetes', 'programada');

  // 4) Caja abierta de hoy con los cobros de la mañana
  shift.inUSD = round2(shift.inUSD); shift.inBs = round2(shift.inBs);
  b.set(shiftRef, shift);
  // Gasto pequeño de ejemplo
  b.set(store.newRef('cash_movements'), { shiftId: shiftRef.id, date: at(0, 8, 10).toISOString(), dayKey: todayKey(), type: 'expense', direction: 'out', currency: 'USD', amount: 3, rate, flow: { inUSD: 0, inBs: 0, outUSD: 3, outBs: 0 }, concept: 'Agua potable para la sala de espera', category: 'Mantenimiento y limpieza', by: 'demo' });
  shift.outUSD = 3; shift.expensesUSD = 3;
  b.set(shiftRef, shift);

  // 5) Pacientes: visitas, última consulta y próximo control
  for (const [id, g] of Object.entries(ptAgg)) {
    b.set(store.ref('patients', id), { visits: g.visits, totalSpent: round2(g.spent), lastVisitAt: g.last, lastConsultId: g.lastId, lastDiagnoses: g.dx, lastVitals: g.vitals, updatedAt: nowISO() }, { merge: true });
  }
  b.set(store.ref('patients', 'demo_isabel'), { nextVisitAt: dayKey(addDays(new Date(), -1)) }, { merge: true });
  await store.commit(b);
}

/** Borra todos los datos de una sede (y sus documentos públicos de verificación). */
export async function purgeTenant(tenantId, onlyDemo = true) {
  try {
    const cons = await getDocs(collection(db, 'tenants', tenantId, 'consultations'));
    const codes = cons.docs.flatMap((d) => (d.data().docs || []).map((x) => x.code)).filter(Boolean);
    for (let i = 0; i < codes.length; i += 80) {
      const b = writeBatch(db);
      codes.slice(i, i + 80).forEach((c) => b.delete(doc(db, 'verify', c)));
      await b.commit().catch((e) => console.warn('[purge] verificación', e?.code || e));
    }
  } catch (e) { console.warn('[purge] verificación', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 80) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId) {
  await purgeTenant(tenantId, true);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
