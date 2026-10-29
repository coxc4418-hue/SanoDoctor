// Sano Doctor — Crea las cuentas de las sedes y el administrador general.
// Uso:  node provision.mjs [cantidad=20] [--emu]
// Genera contraseñas y PIN aleatorios y los guarda en ../CREDENCIALES_SANO_DOCTOR.txt
// Es seguro re-ejecutarlo: conserva las cuentas y contraseñas ya creadas.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { webcrypto, randomInt } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const EMU = process.argv.includes('--emu');
const COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 20);
const OUT = path.join(here, '..', EMU ? 'CREDENCIALES_EMULADOR.txt' : 'CREDENCIALES_SANO_DOCTOR.txt');
const STATE = path.join(here, EMU ? '.accounts-emu.json' : '.accounts.json');
const DOMAIN = 'sanodoctor.app';
const APP_URL = 'https://sano-doctor.web.app';

const config = {
  apiKey: 'AIzaSyCiXIDPDZCwqN7IKrpaF_s5FR8SextKh1g',
  authDomain: 'sano-doctor.firebaseapp.com',
  projectId: 'sano-doctor',
  storageBucket: 'sano-doctor.firebasestorage.app',
  messagingSenderId: '905596512990',
  appId: '1:905596512990:web:2393b627495babc55cb04f'
};

// Configuración inicial de cada sede: la misma que usa la app (DEFAULT_SETTINGS en public/js/store.js)
const SERVICES = [
  { name: 'Consulta de primera vez', price: 30 }, { name: 'Consulta de control', price: 20 }, { name: 'Consulta de emergencia', price: 40 },
  { name: 'Teleconsulta', price: 15 }, { name: 'Certificado de salud', price: 10 }, { name: 'Cura / procedimiento menor', price: 15 },
  { name: 'Nebulización', price: 8 }, { name: 'Colocación de inyectable', price: 5 }, { name: 'Electrocardiograma', price: 15 },
  { name: 'Retiro de puntos', price: 10 }, { name: 'Glicemia capilar', price: 3 }, { name: 'Toma de tensión arterial', price: 2 }
];
const SETTINGS = {
  rif: '', phone: '', whatsapp: '', email: '', address: '', instagram: '', receiptFooter: 'Gracias por su confianza. ¡Que se mejore pronto!', receiptFormat: '80mm', rxFormat: 'media',
  rxNote: 'Récipe válido por 30 días. No se automedique. Ante cualquier reacción adversa suspenda el tratamiento y consulte.', docTitle: 'RECIBO',
  rate: 0, rateUpdatedAt: null, rateAuto: true, iva: 0, invoicePrefix: 'F',
  services: SERVICES,
  categories: ['Medicamentos', 'Inyectables', 'Material de curas', 'Material descartable', 'Sueros y soluciones', 'Vacunas', 'Muestras médicas', 'Otros'],
  doctors: [], favMeds: [],
  schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', slot: 30, breakStart: '', breakEnd: '', sat: false, satStart: '08:00', satEnd: '12:00' }
};
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const genPass = () => 'Sd-' + Array.from({ length: 9 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '!' + randomInt(10, 99);
const genPin = () => String(randomInt(1000, 9999));
const sha256 = async (t) => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(t))).toString('hex');

const saved = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const app = initializeApp(config, 'provision');
const auth = getAuth(app);
const db = initializeFirestore(app, {});
if (EMU) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9299', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8280);
}
async function ensureUser(email, password) {
  try { return (await createUserWithEmailAndPassword(auth, email, password)).user; }
  catch (e) { if (e.code === 'auth/email-already-in-use') return (await signInWithEmailAndPassword(auth, email, password)).user; throw e; }
}

// 1) Administrador general (crea los documentos de las sedes)
const admin = saved.admin || { code: 'admin', email: `admin@${DOMAIN}`, password: genPass() };
const au = await ensureUser(admin.email, admin.password);
admin.uid = au.uid; saved.admin = admin;
await signOut(auth);
console.log(`✔ administrador general (${au.uid})`);

// 2) Cuentas de las sedes
const accounts = [];
for (let i = 1; i <= COUNT; i++) {
  const code = 'sede' + String(i).padStart(2, '0');
  const email = `${code}@${DOMAIN}`;
  const acc = saved[code] || { code, email, password: genPass(), pin: genPin(), name: `Sede ${String(i).padStart(2, '0')}` };
  const user = await ensureUser(email, acc.password);
  acc.uid = user.uid;
  await signOut(auth);
  saved[code] = acc; accounts.push(acc);
}
writeFileSync(STATE, JSON.stringify(saved, null, 2));

// 3) Documentos de las sedes (como administrador)
await signInWithEmailAndPassword(auth, admin.email, admin.password);
for (const acc of accounts) {
  const tRef = doc(db, 'tenants', acc.uid);
  if ((await getDoc(tRef)).exists()) { console.log(`• ${acc.code} ya existía`); continue; }
  const now = new Date().toISOString();
  await setDoc(tRef, { name: acc.name, code: acc.code, ownerUid: acc.uid, ownerEmail: acc.email, active: true, createdAt: now, createdBy: 'provision', plan: 'Básico', paidUntil: null, ownerName: '', ownerPhone: '', notes: '' });
  await setDoc(doc(db, 'tenants', acc.uid, 'config', 'settings'), { ...SETTINGS, businessName: acc.name });
  await setDoc(doc(db, 'tenants', acc.uid, 'config', 'security'), { pinHash: await sha256(`${acc.uid}:${acc.pin}`), updatedAt: now });
  await setDoc(doc(db, 'usernames', acc.code), { email: acc.email, uid: acc.uid, createdAt: now });
  console.log(`✔ ${acc.code} creada (${acc.uid})`);
}
await setDoc(doc(db, 'usernames', 'admin'), { email: admin.email, uid: admin.uid, createdAt: new Date().toISOString() });
await signOut(auth);

const lines = [
  'SANO DOCTOR — CREDENCIALES DE ACCESO' + (EMU ? ' (EMULADOR DE PRUEBAS)' : ''),
  `Generado: ${new Date().toLocaleString('es-VE')}`,
  `Aplicación: ${APP_URL}`,
  '',
  'Inicia sesión escribiendo el USUARIO (ej. sede01) o el correo completo.',
  'El PIN protege reportes, anulaciones, exoneraciones, exportación de pacientes, mermas, gastos y cierre de caja.',
  'Al entrar por primera vez: Configuración > Médicos (nombre, MPPS, firma) y Configuración > Horario de agenda.',
  'Cada sede puede cambiar su contraseña y su PIN en Configuración > Seguridad.',
  'GUARDA ESTE ARCHIVO EN UN LUGAR SEGURO. NO LO COMPARTAS.',
  '',
  'ADMINISTRADOR GENERAL (panel de todas las sedes)',
  `  Usuario: admin    Correo: ${admin.email}    Contraseña: ${admin.password}`,
  '',
  'SEDES',
  '  Usuario   Contraseña          PIN    Correo',
  ...accounts.map((a) => `  ${a.code.padEnd(9)} ${a.password.padEnd(19)} ${a.pin}   ${a.email}`),
  '',
  'Demo: botón "Probar demo gratis" en la pantalla de inicio (30 min, sin registro, PIN 1234).',
  `Verificación de documentos: ${APP_URL}/verificar/CODIGO (cada récipe, reposo o constancia lleva su código y QR).`,
  'Ventas / soporte por WhatsApp: +58 422-190 6045'
];
writeFileSync(OUT, lines.join('\r\n'), 'utf8');
console.log(`\nCredenciales guardadas en ${OUT}`);
await deleteApp(app);
process.exit(0);
