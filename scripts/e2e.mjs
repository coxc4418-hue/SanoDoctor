// Sano Doctor — Prueba de extremo a extremo contra los emuladores
// Requisitos: firebase emulators:start --only auth,firestore,hosting  y  node provision.mjs 3 --emu
// Uso: node e2e.mjs [url=http://127.0.0.1:5077] [carpeta-capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5077') + '/?emu=1';
const SHOTS = process.argv[3] || path.join(here, 'shots');
mkdirSync(SHOTS, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));

const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'OK ' : 'FALLA', name, extra]); console.log(cond ? '  ✔' : '  ✘', name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--window-size=1400,900'] });
const errors = [];

async function newPage(w = 1400, h = 900) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  // El selector de país aparece la primera vez: en las pruebas se elige Venezuela (dólares + tasa BCV)
  await page.evaluateOnNewDocument(() => { new MutationObserver(() => { const b = document.querySelector('.country-grid [data-c="VE"]'); const ok = b && [...document.querySelectorAll('.modal [data-ok]')].pop(); if (b && ok && !window.__ctry) { window.__ctry = 1; b.click(); setTimeout(() => { [...document.querySelectorAll('.modal [data-ok]')].pop()?.click(); setTimeout(() => { window.__ctry = 0; }, 1500); }, 150); } }).observe(document, { childList: true, subtree: true }); });
  await page.setViewport({ width: w, height: h });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|dolarapi|ERR_|Failed to load resource|net::|CORS/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.dismiss());
  // Evita que el diálogo de impresión bloquee la prueba
  await page.evaluateOnNewDocument(() => { window.print = () => {}; window.open = () => null; HTMLIFrameElement.prototype.focus = function () {}; });
  return { ctx, page };
}
const clickText = async (page, sel, text, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate((sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\s+/g, ' ').includes(text));
      if (el) { el.click(); return true; } return false;
    }, sel, text);
    if (ok) return true;
    await sleep(150);
  }
  throw new Error(`No encontré ${sel} con texto "${text}"`);
};
const waitText = (page, text, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
const store = (page, fn, arg) => page.evaluate(async (fnSrc, arg) => { const { store } = await import('/js/store.js'); return (0, eval)(fnSrc)(store, arg); }, fn.toString(), arg);
const fill = async (page, sel, value) => { await page.$eval(sel, (e) => { e.value = ''; }); await page.type(sel, String(value)); };
const nav = async (page, id) => { await page.evaluate((id) => { const b = document.querySelector(`.sb-nav [data-nav="${id}"]`); b.click(); }, id); await sleep(700); };

const ORIGIN = process.argv[2] || 'http://127.0.0.1:5077';
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
const top = '.modal-backdrop:last-child';
const closeModals = (page) => page.evaluate(async () => { const u = await import('/js/utils.js'); u.closeAllModals(); });
const typePin = async (page, pin) => {
  await page.waitForSelector(`${top} [data-pin]`, { timeout: 8000 });
  await page.type(`${top} [data-pin]`, pin);
  await page.click(`${top} [data-ok]`);
  await sleep(700);
};
const login = async (page, user, pass) => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', user);
  await page.type('#lg-pass', pass);
  await page.click('#lg-btn');
};
const consults = (page) => store(page, async (s) => (await s.listBetween('consultations', 'startedAt', new Date(Date.now() - 120 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString())).map((c) => ({ id: c.id, number: c.number, status: c.status, billing: c.billing, docs: c.docs || [], total: c.total, patientId: c.patientId, saleId: c.saleId })));
const readPublic = (page, code) => page.evaluate(async (c) => { const f = await import('/js/firebase.js'); try { const d = await f.getDoc(f.doc(f.db, 'verify', c)); return d.exists() ? d.data() : null; } catch (e) { return e.code; } }, code);
const payWith = async (page, method) => {
  await page.waitForSelector(`${top} [data-m="${method}"]`, { timeout: 10000 });
  await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:last-child [data-rm]').forEach((l) => l.click()); });
  await sleep(150);
  await page.click(`${top} [data-m="${method}"]`);
  await sleep(250);
  await page.click(`${top} [data-ok]`);
};
let demoUid = null; let demoCode = null;

try {
  // ==================================================================
  console.log('\n1) Pantalla de inicio de sesión');
  let { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  ok('Login visible', true);
  ok('Botón de demo', !!(await page.$('#lg-demo')));
  ok('Botón “Verificar un documento médico”', !!(await page.$('#lg-track')));
  const wa = await page.$eval('#lg-wa', (a) => a.href);
  ok('WhatsApp de contratación 584221906045', wa.includes('wa.me/584221906045'), wa.slice(0, 40));
  ok('Logo del sistema', await page.evaluate(() => [...document.images].some((i) => i.src.includes('/assets/logo.svg') && i.complete && i.naturalWidth > 0)));
  await shot(page, '01-login.png');

  // ==================================================================
  console.log('\n2) Demo de 30 minutos');
  await page.click('#lg-demo');
  await page.waitForSelector('.sb-nav', { timeout: 60000 });
  await waitText(page, 'Modo demo');
  await page.waitForSelector('.tour-tip', { timeout: 15000 });
  ok('Recorrido guiado se abre solo en la demo', true);
  await shot(page, '02-tour.png');
  await page.click('.tour-tip [data-t="stop"]');
  await sleep(3000);
  demoUid = await page.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  const d = await store(page, (s) => ({ pt: s.patients.length, docs: s.settings.doctors.length, today: s.todayAppts.length, wait: s.waiting.length, shift: !!s.openShift, pend: s.pending.length, prod: s.products.length, exp: s.expiringProducts.length, low: s.lowProducts.length, sales: s.recentSales.length, st: [...new Set(s.todayAppts.map((a) => a.status))] }));
  ok('Pacientes de ejemplo', d.pt >= 14, `${d.pt} pacientes`);
  ok('Dos médicos con su firma y MPPS', d.docs === 2);
  ok('Agenda de hoy en varios estados', d.today >= 8 && d.st.length >= 4, `${d.today} citas · ${d.st.join(', ')}`);
  ok('Sala de espera con pacientes', d.wait >= 2, `${d.wait}`);
  ok('Caja abierta y consulta por cobrar', d.shift && d.pend >= 1);
  ok('Insumos con alertas (bajos y por vencer)', d.prod >= 14 && d.exp >= 1 && d.low >= 1, `${d.prod} insumos · ${d.low} bajos · ${d.exp} por vencer`);
  ok('Cobros de la última semana', d.sales >= 6, `${d.sales} cobros`);
  await page.waitForSelector('[data-attend]');
  await shot(page, '03-inicio-demo.png');
  const dc = await consults(page);
  ok('Consultas cerradas de ejemplo', dc.filter((c) => c.status === 'cerrada').length >= 12, `${dc.length}`);
  demoCode = dc.flatMap((c) => c.docs).find((x) => x.code)?.code;
  ok('Documentos con código de verificación', !!demoCode, demoCode);
  // Agenda
  await nav(page, 'agenda');
  await page.waitForSelector('#ag-body [data-detail]');
  ok('Agenda del día con citas', (await page.$$('#ag-body [data-detail]')).length >= 6);
  await shot(page, '04-agenda.png');
  await page.click('#ag-mode [data-m="semana"]').catch(() => {});
  await sleep(700);
  await shot(page, '04b-agenda-semana.png');
  // Atender desde la sala de espera (demo)
  await nav(page, 'inicio');
  await page.waitForSelector('[data-attend]');
  await page.click('[data-attend]');
  await page.waitForSelector('.consult-modal .rp-head', { timeout: 15000 });
  ok('Consulta abierta desde la sala de espera', true);
  await shot(page, '05-consulta-demo.png');
  await page.evaluate(async () => { const u = await import('/js/utils.js'); const m = document.querySelector('.consult-modal'); }); // sin cambios
  await page.click('.consult-modal [data-tab="dx"]'); await sleep(400);
  await page.type('.consult-modal [data-cie]', 'faringitis'); await sleep(600);
  ok('Buscador CIE-10 encuentra diagnósticos', (await page.$$('.consult-modal [data-dx]')).length >= 1);
  await shot(page, '06-diagnostico.png');
  await page.keyboard.press('Escape'); await sleep(300);
  await closeModals(page); await sleep(500);
  // Pacientes y ficha
  await nav(page, 'pacientes');
  await page.waitForSelector('#pt-list [data-open]');
  ok('Lista de pacientes', (await page.$$('#pt-list [data-open]')).length >= 10);
  await shot(page, '07-pacientes.png');
  await page.click('#pt-list [data-open]');
  await page.waitForSelector('.modal [data-tab]', { timeout: 10000 });
  ok('Ficha del paciente abre', true);
  await shot(page, '08-ficha.png');
  await closeModals(page); await sleep(400);
  await nav(page, 'consultas'); await sleep(800);
  await shot(page, '09-consultas.png');
  // PIN de la demo
  await nav(page, 'reportes');
  await page.waitForSelector(`${top} [data-pin]`);
  ok('El PIN de la demo se muestra (1234)', await page.evaluate(() => document.querySelector('.modal-backdrop:last-child').innerText.includes('1234')));
  await page.type(`${top} [data-pin]`, '9999'); await page.click(`${top} [data-ok]`); await sleep(800);
  ok('PIN incorrecto rechazado', await page.evaluate(() => (document.querySelector('.modal-backdrop:last-child [data-err]')?.textContent || '').length > 3));
  await page.$eval(`${top} [data-pin]`, (e) => { e.value = ''; });
  await page.type(`${top} [data-pin]`, '1234'); await page.click(`${top} [data-ok]`);
  await sleep(3000);
  ok('Reportes con PIN 1234', await page.evaluate(() => !document.querySelector('.modal [data-pin]') && document.querySelector('.view-title')?.textContent.includes('Reportes')));
  await shot(page, '10-reportes-demo.png');
  // Página pública de verificación
  const pub = await newPage(390, 844);
  await pub.page.goto(`${ORIGIN}/verificar/${demoCode}?emu=1`, { waitUntil: 'domcontentloaded' });
  await pub.page.waitForSelector('.vf-hero', { timeout: 20000 });
  ok('Verificación pública del documento (sin sesión)', await pub.page.evaluate(() => document.body.innerText.includes('Documento auténtico')), demoCode);
  await shot(pub.page, '11-verificar.png');
  await pub.page.goto(`${ORIGIN}/verificar/ZZZZZZZ?emu=1`, { waitUntil: 'domcontentloaded' });
  await waitText(pub.page, 'no es auténtico', 20000);
  ok('Código falso: documento no auténtico', true);
  await pub.ctx.close();
  // Terminar la demo
  await page.click('#demo-end');
  await page.waitForSelector(`${top} [data-yes]`);
  await page.click(`${top} [data-yes]`);
  await page.waitForSelector('#login-form', { timeout: 40000 });
  ok('Demo terminada vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('\n3) Sede: médico, caja, paciente, cita, consulta completa y cobro');
  ({ ctx, page } = await newPage());
  await login(page, 'sede01', acc.sede01.password);
  await page.waitForSelector('.sb-nav', { timeout: 30000 });
  ok('Sede01 inicia sesión con su usuario', true);
  await sleep(1500);
  await closeModals(page);
  await store(page, (s) => s.setRate(40, false));
  // Médico y horario amplio (la prueba corre a cualquier hora)
  await store(page, (s) => s.saveSettings({
    doctors: [{ id: 'dprueba', name: 'Dra. Laura Prueba', sex: 'F', specialty: 'Medicina general', mpps: '123456', cmv: '7890', active: true }],
    schedule: { ...s.settings.schedule, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:30', breakStart: '', breakEnd: '', sat: true, satStart: '00:00', satEnd: '23:30' }
  }));
  await store(page, async (s) => {
    const b = s.batch(); const now = new Date().toISOString();
    b.set(s.newRef('products'), { name: 'Ibuprofeno Prueba 400 mg', category: 'Medicamentos', cost: 1, price: 2, stock: 10, minStock: 2, sellable: true, trackStock: true, active: true, sold: 0, lot: 'L-1', expiresAt: '2030-01-01', createdAt: now, updatedAt: now });
    await s.commit(b);
  });
  await sleep(800);
  ok('Tasa y médico configurados', (await store(page, (s) => s.rate === 40 && s.activeDoctors.length === 1)));
  // Abrir caja (UI)
  await nav(page, 'caja');
  await page.waitForSelector('#k-open');
  await page.type('#k-open [name="usd"]', '20');
  await page.type('#k-open [name="bs"]', '400');
  await page.click('#k-open button[type="submit"], #k-open .btn-primary');
  await sleep(1500);
  ok('Caja abierta desde la pantalla', !!(await store(page, (s) => s.openShift?.id)));
  // Paciente nuevo (UI)
  await nav(page, 'pacientes');
  await page.waitForSelector('#pt-new');
  await page.click('#pt-new');
  await page.waitForSelector(`${top} [name="name"]`);
  await page.type(`${top} [name="name"]`, 'María Prueba González');
  await page.type(`${top} [name="idNum"]`, '18456789');
  await page.$eval(`${top} [name="birthDate"]`, (e) => { e.value = '1988-04-12'; e.dispatchEvent(new Event('input')); });
  await page.click(`${top} [data-s="F"]`);
  await page.type(`${top} [name="phone"]`, '0414-5556677');
  await page.click(`${top} [data-t="ant"]`); await sleep(200);
  await page.click(`${top} [data-allergy] [data-chip="Penicilina"]`);
  await shot(page, '12-paciente-nuevo.png');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Paciente registrado', 10000);
  await sleep(1200);
  const pt = await store(page, (s) => s.patients.find((p) => p.name === 'María Prueba González'));
  ok('Paciente registrado con historia y alergia', !!pt?.number && pt.allergies.includes('Penicilina') && pt.idDoc === 'V-18456789', `${pt?.number} · ${pt?.idDoc}`);
  await shot(page, '13-ficha-nueva.png');
  await closeModals(page); await sleep(400);
  // Cita (UI)
  await nav(page, 'agenda');
  await page.waitForSelector('#ag-new');
  await page.click('#ag-new');
  await page.waitForSelector(`${top} [data-search]`);
  await page.click(`${top} [data-search]`);
  await page.waitForSelector(`${top} [data-q]`);
  await page.type(`${top} [data-q]`, 'maría prueba');
  await page.waitForSelector(`${top} [data-p="${pt.id}"]`);
  await page.click(`${top} [data-p="${pt.id}"]`);
  await sleep(500);
  const slot = await page.evaluate(() => { const s = document.querySelector('.modal-backdrop:last-child [name="slot"]'); const o = [...s.options].find((x) => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } return o?.value; });
  ok('Horarios libres sugeridos', !!slot, slot);
  await page.type(`${top} [name="reason"]`, 'Dolor de garganta y fiebre');
  await page.$eval(`${top} [name="wa"]`, (e) => { e.checked = false; });
  await shot(page, '14-nueva-cita.png');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Cita agendada', 10000);
  await sleep(900);
  let appt = await store(page, (s, id) => s.appointments.find((a) => a.patientId === id), pt.id);
  ok('Cita agendada', appt?.status === 'programada' && appt.time === slot && appt.doctorId === 'dprueba', `${appt?.date} ${appt?.time}`);
  // Llega el paciente (detalle de la cita)
  await closeModals(page);
  await page.waitForSelector(`#ag-body [data-detail="${appt.id}"]`);
  await page.click(`#ag-body [data-detail="${appt.id}"]`);
  await page.waitForSelector(`${top} [data-arrive]`);
  await page.click(`${top} [data-arrive]`);
  await sleep(1200);
  appt = await store(page, (s, id) => s.appointment(id), appt.id);
  ok('Paciente en sala de espera', appt.status === 'espera');
  await closeModals(page);
  // Atender desde Inicio
  await nav(page, 'inicio');
  await page.waitForSelector(`[data-attend="${appt.id}"]`);
  await page.click(`[data-attend="${appt.id}"]`);
  await page.waitForSelector('.consult-modal .rp-head', { timeout: 15000 });
  ok('Alerta de alergia visible en la consulta', await page.evaluate(() => document.querySelector('.consult-modal').innerText.includes('Penicilina')));
  // Evaluación
  await page.click('.consult-modal [data-k="reason"]', { clickCount: 3 });
  await page.type('.consult-modal [data-k="reason"]', ' desde hace 2 días');
  await page.type('.consult-modal [data-k="illness"]', 'Odinofagia, fiebre de 38,5 °C, sin tos.');
  for (const [k, v] of [['ta', '150/95'], ['fc', '96'], ['temp', '38,6'], ['sat', '97'], ['peso', '68'], ['talla', '165']]) await page.type(`.consult-modal [data-v="${k}"]`, v);
  await sleep(500);
  ok('Alertas de signos vitales (TA y fiebre)', await page.evaluate(() => document.querySelectorAll('.consult-modal .vital-alert').length >= 1));
  await page.type('.consult-modal [data-k="exam"]', 'Orofaringe hiperémica con exudado amigdalino.');
  await shot(page, '15-evaluacion.png');
  // Diagnóstico
  await page.click('.consult-modal [data-tab="dx"]'); await sleep(400);
  await page.type('.consult-modal [data-cie]', 'amigdalitis'); await sleep(600);
  await page.click('.consult-modal [data-dx]'); await sleep(500);
  // Récipe: conflicto con penicilina
  await page.click('.consult-modal [data-tab="rx"]'); await sleep(400);
  await page.type('.consult-modal [data-med]', 'amoxicilina'); await sleep(600);
  ok('Detecta medicamento contraindicado por alergia', (await page.$$('.consult-modal .med-opt.conflict')).length >= 1);
  await page.click('.consult-modal [data-addmed]');
  await page.waitForSelector(`${top} [data-no], ${top} [data-close]`, { timeout: 5000 });
  ok('Pide confirmación antes de recetar al alérgico', await page.evaluate(() => document.querySelector('.modal-backdrop:last-child').innerText.includes('alérgico')));
  await page.evaluate(() => { const b = document.querySelector('.modal-backdrop:last-child [data-no]') || document.querySelector('.modal-backdrop:last-child [data-close]'); b.click(); });
  await sleep(400);
  await page.$eval('.consult-modal [data-med]', (e) => { e.value = ''; });
  await page.type('.consult-modal [data-med]', 'azitromicina'); await sleep(600);
  await page.click('.consult-modal [data-addmed]'); await sleep(500);
  await page.$eval('.consult-modal [data-med]', (e) => { e.value = ''; });
  await page.type('.consult-modal [data-med]', 'acetaminofen'); await sleep(600);
  await page.click('.consult-modal [data-addmed]'); await sleep(600);
  await shot(page, '16-recipe.png');
  // Documentos: récipe y reposo
  await page.click('.consult-modal [data-tab="docs"]'); await sleep(500);
  await page.click('.consult-modal [data-doc="recipe"]'); await sleep(2500);
  await page.click('.consult-modal [data-doc="rest"]'); await sleep(2500);
  await shot(page, '17-documentos.png');
  // Cierre y cobro
  await page.click('.consult-modal [data-tab="close"]'); await sleep(500);
  const prodId = await store(page, (s) => s.products.find((p) => p.name.startsWith('Ibuprofeno Prueba')).id);
  await page.select('.consult-modal [data-add-prod]', prodId); await sleep(600);
  await page.click('.consult-modal [data-nvq="30"]'); await sleep(700);
  const nvTime = await page.evaluate(() => { const s = document.querySelector('.consult-modal [data-nv-time]'); return s?.value; });
  ok('Control sugerido en 30 días con hora libre', !!nvTime, nvTime);
  await shot(page, '18-cierre.png');
  const totalTxt = await page.$eval('.consult-modal [data-close-pay]', (b) => b.textContent);
  ok('Total: consulta primera vez $30 + insumo $2', totalTxt.includes('32'), totalTxt.trim());
  await page.click('.consult-modal [data-close-pay]');
  await payWith(page, 'pagomovil');
  await waitText(page, 'Consulta cerrada', 15000);
  await shot(page, '19-consulta-cerrada.png');
  await closeModals(page); await sleep(1200);
  let cs = await consults(page);
  const c1 = cs.find((c) => c.patientId === pt.id);
  ok('Consulta cerrada y cobrada', c1?.status === 'cerrada' && c1.billing === 'pagada' && !!c1.saleId, `${c1?.number} · ${c1?.billing}`);
  ok('Dos documentos verificables emitidos', c1?.docs.length === 2, c1?.docs.map((x) => x.kind).join(', '));
  const vdoc = await readPublic(page, c1.docs[0].code);
  ok('Documento público con datos del médico', vdoc?.valid === true && vdoc.doctor?.mpps === '123456' && vdoc.patient?.initials, vdoc?.kindLabel);
  const after = await store(page, (s, id) => ({ stock: s.products.find((p) => p.name.startsWith('Ibuprofeno Prueba')).stock, appt: s.appointments.filter((a) => a.patientId === id).map((a) => a.status), p: s.patient(id), shift: s.openShift }), pt.id);
  ok('Insumo descontado del inventario', after.stock === 9, `stock ${after.stock}`);
  ok('Cita atendida y control agendado', after.appt.includes('atendida') && after.appt.includes('programada'), after.appt.join(', '));
  ok('Paciente actualizado (visitas, último diagnóstico)', after.p.visits === 1 && (after.p.lastDiagnoses || []).length >= 1, `visitas ${after.p.visits}`);
  ok('Caja registra el cobro de $32', after.shift.salesCount === 1 && Math.abs(after.shift.salesTotal - 32) < 0.01, `${after.shift.salesCount} · $${after.shift.salesTotal}`);
  // Consulta sin cita que queda por cobrar
  await store(page, async (s) => {
    const ops = await import('/js/ops.js');
    const p = await ops.savePatient({ name: 'Pedro Pendiente', idDoc: 'V-9876543', sex: 'M', birthDate: '1970-01-01', phone: '0412-1112233', allergies: [], chronic: ['Hipertensión arterial'] });
    const c = await ops.startConsultation({ patient: p });
    await ops.closeConsultation({ ...c, reason: 'Control de tensión' }, {});
  });
  await sleep(1500);
  ok('Consulta por cobrar en la lista de pendientes', (await store(page, (s) => s.pending.length)) === 1);
  await nav(page, 'cobrar');
  await page.waitForSelector('#pos-pend [data-pc]');
  await shot(page, '20-cobrar.png');
  await page.click('#pos-pend [data-pc]');
  await payWith(page, 'efectivo_usd');
  await waitText(page, 'Consulta cobrada', 12000);
  await closeModals(page); await sleep(1000);
  ok('Consulta pendiente cobrada', (await store(page, (s) => s.pending.length)) === 0);
  // Cobro de un servicio + insumo
  await page.waitForSelector('#pos-grid .pcard');
  await clickText(page, '#pos-grid .pcard', 'Nebulización');
  await page.click('#pos-tabs [data-tab="all"]'); await sleep(300);
  await clickText(page, '#pos-grid .pcard', 'Ibuprofeno Prueba');
  await sleep(300);
  await page.click('#c-pay');
  await payWith(page, 'efectivo_usd');
  await sleep(2000);
  await closeModals(page);
  const sh = await store(page, (s) => ({ shift: s.openShift, stock: s.products.find((p) => p.name.startsWith('Ibuprofeno Prueba')).stock }));
  ok('Cobro de servicio + insumo', sh.stock === 8 && sh.shift.salesCount === 3, `ventas ${sh.shift.salesCount} · stock ${sh.stock}`);
  // Facturación: anular el último cobro
  await nav(page, 'facturas');
  await page.waitForSelector('[data-view]');
  await shot(page, '21-facturacion.png');
  const invId = await page.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('Nebulización') || tr.innerText.includes('Servicio')); return (row || document.querySelector('tbody tr'))?.querySelector('[data-view]')?.dataset.view; });
  await page.click(`[data-view="${invId}"]`);
  await page.waitForSelector(`${top} [data-void]`);
  await page.click(`${top} [data-void]`);
  await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [data-r]`);
  await page.type(`${top} [data-r]`, 'Prueba de anulación');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  await closeModals(page);
  const voided = await store(page, (s) => ({ stock: s.products.find((p) => p.name.startsWith('Ibuprofeno Prueba')).stock, n: s.openShift.salesCount, t: s.openShift.salesTotal }));
  ok('Anular devuelve el insumo al inventario', voided.stock === 9, `stock ${voided.stock} · caja $${voided.t}`);
  // Reportes, consultas e inventario
  await nav(page, 'reportes');
  await sleep(600);
  if (await page.$(`${top} [data-pin]`)) await typePin(page, acc.sede01.pin);
  await sleep(2500);
  ok('Reportes (PIN de la sede ya autorizado por 10 min)', await page.evaluate(() => document.querySelector('.view-title')?.textContent.includes('Reportes')));
  await shot(page, '22-reportes.png');
  await nav(page, 'consultas'); await sleep(1000);
  ok('Historial de consultas', await page.evaluate((n) => document.body.innerText.includes(n), c1.number));
  await nav(page, 'inventario'); await sleep(1000);
  await shot(page, '23-insumos.png');
  await nav(page, 'ajustes'); await sleep(800);
  await shot(page, '24-ajustes.png');
  // Seguridad
  const leak = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', other, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede01 NO puede leer datos de sede02', leak === 'permission-denied', leak);
  const leakPt = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.getDocs(f.collection(f.db, 'tenants', other, 'patients')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede01 NO puede leer pacientes de sede02', leakPt === 'permission-denied', leakPt);
  const selfPlan = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'tenants', me), { paidUntil: null, plan: 'Premium' }, { merge: true }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede01.uid);
  ok('Sede no puede cambiar su propio plan', selfPlan === 'permission-denied', selfPlan);
  const fakeDoc = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'verify', 'FAKE001'), { tenantId: other, valid: true }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('No se puede emitir documento a nombre de otra sede', fakeDoc === 'permission-denied', fakeDoc);
  const listV = await page.evaluate(async () => { const f = await import('/js/firebase.js'); try { await f.getDocs(f.collection(f.db, 'verify')); return 'listado'; } catch (e) { return e.code; } });
  ok('Nadie puede listar los documentos', listV === 'permission-denied', listV);
  // Cierre de caja
  await nav(page, 'caja');
  await page.waitForSelector('#k-close');
  await page.click('#k-close');
  await sleep(600);
  if (await page.$(`${top} [data-pin]`)) await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [name="usd"]`);
  await page.type(`${top} [name="usd"]`, '40');
  await page.type(`${top} [name="bs"]`, '1680');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  ok('Cierre de caja', !(await store(page, (s) => s.openShift)));
  await closeModals(page);
  // Móvil
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  let maxOver = 0;
  for (const v of ['inicio', 'agenda', 'pacientes', 'cobrar', 'consultas', 'caja', 'inventario', 'ajustes']) {
    await page.evaluate((v) => { location.hash = '#/' + v; }, v); await sleep(1100);
    if (v === 'inicio') await shot(page, '25-movil-inicio.png');
    if (v === 'agenda') await shot(page, '26-movil-agenda.png');
    maxOver = Math.max(maxOver, await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  }
  ok('Móvil sin desborde horizontal', maxOver <= 1, `${maxOver}px`);
  await ctx.close();

  // ==================================================================
  console.log('\n4) Panel del administrador');
  ({ ctx, page } = await newPage());
  await login(page, 'admin', acc.admin.password);
  await waitText(page, 'Panel de administración de sedes', 20000);
  await page.waitForSelector('[data-enter]');
  await sleep(1500);
  await shot(page, '27-admin.png');
  ok('Admin ve las sedes', (await page.$$('[data-enter]')).length >= 3);
  await page.click(`[data-tog="${acc.sede02.uid}"]`);
  await page.waitForSelector(`${top} [data-ok]`);
  await page.click(`${top} [data-ok]`);
  await sleep(900);
  ok('Sede02 congelada', await page.evaluate(() => document.body.innerText.includes('Congelada')));
  await page.click('#a-new');
  await page.waitForSelector(`${top} [name="name"]`);
  await page.type(`${top} [name="name"]`, 'Consultorio Prueba');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Sede creada', 20000);
  const newPass = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Contraseña')).querySelector('b').textContent);
  const newUser = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Usuario')).querySelector('b').textContent);
  ok('Nueva sede creada desde el panel', !!newPass, newUser);
  await page.keyboard.press('Escape');
  await page.waitForSelector(`[data-enter="${acc.sede01.uid}"]`, { timeout: 20000 });
  await sleep(500);
  await page.click(`[data-enter="${acc.sede01.uid}"]`);
  await waitText(page, 'Modo administrador', 20000);
  await sleep(1500);
  ok('Admin entra a la sede01', (await store(page, (s) => s.patients.length)) === 2);
  const demoGone = await page.evaluate(async (uid) => { const f = await import('/js/firebase.js'); return (await f.getDoc(f.doc(f.db, 'tenants', uid))).exists(); }, demoUid);
  ok('La demo se borró al terminar', demoGone === false);
  const demoPts = await page.evaluate(async (uid) => { const f = await import('/js/firebase.js'); return (await f.getDocs(f.collection(f.db, 'tenants', uid, 'patients'))).size; }, demoUid);
  ok('Pacientes de la demo borrados', demoPts === 0, `${demoPts}`);
  await ctx.close();

  // ==================================================================
  console.log('\n5) Sede congelada y sede nueva');
  ({ ctx, page } = await newPage());
  await login(page, 'sede02', acc.sede02.password);
  await waitText(page, 'Cuenta congelada', 20000);
  ok('Sede congelada ve el bloqueo con WhatsApp', await page.evaluate(() => !!document.querySelector('a[href*="584221906045"]')));
  const frozenRead = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', me, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede congelada no puede leer datos (reglas)', frozenRead === 'permission-denied', frozenRead);
  const demoDoc = await readPublic(page, demoCode);
  ok('Documentos de la demo borrados', demoDoc === null, String(demoDoc));
  await page.click('#blk-out');
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', newUser);
  await page.type('#lg-pass', newPass);
  await page.click('#lg-btn');
  await page.waitForSelector('.sb-nav', { timeout: 20000 });
  ok('Sede nueva inicia sesión', await page.evaluate(() => document.body.innerText.includes('Consultorio Prueba')));
  await ctx.close();
} catch (e) {
  console.error('\nERROR EN LA PRUEBA:', e.message);
  results.push(['FALLA', 'Excepción', e.message]);
  try {
    const pgs = (await Promise.all(browser.browserContexts().map((c) => c.pages()))).flat();
    const pg = pgs.at(-1);
    await pg.screenshot({ path: path.join(SHOTS, 'zz-error.png') });
    console.error(await pg.evaluate(() => document.querySelector('.modal-backdrop:last-child')?.innerText.slice(0, 500)));
  } catch { /* sin captura */ }
} finally {
  await browser.close();
}
console.log('\nErrores de la página:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'ninguno');
const fails = results.filter((r) => r[0] !== 'OK ');
console.log(`\nRESULTADO: ${results.length - fails.length}/${results.length} OK`);
process.exit(fails.length || errors.length ? 1 : 0);
