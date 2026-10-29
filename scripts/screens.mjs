// Genera las capturas del manifiesto (ventana de instalación de Chrome) desde la demo
// Uso: node screens.mjs [url=https://sano-doctor.web.app]  (con emuladores: http://127.0.0.1:5077/?emu=1)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'screens');
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
await p.evaluateOnNewDocument(() => {
  localStorage.setItem('sd_install_hide', '1'); localStorage.setItem('sd_theme', 'dark');
  const st = document.createElement('style'); st.textContent = '.toasts,.demo-banner,[data-install]{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
});
const URL_ = process.argv[2] || 'https://sano-doctor.web.app';
await p.goto(URL_, { waitUntil: 'networkidle2' });
await p.waitForSelector('#lg-demo'); await p.click('#lg-demo');
await p.waitForSelector('.sb-nav', { timeout: 60000 }); await sleep(5000);
const go = async (id, mobile) => { await p.evaluate((id, m) => document.querySelector(`${m ? '.bottom-nav' : '.sb-nav'} [data-nav="${id}"]`)?.click(), id, mobile); await sleep(1800); };
const shot = (f) => p.screenshot({ path: path.join(out, f) });
await p.evaluate(() => document.querySelector('.tour-tip [data-t="stop"]')?.click()); await sleep(800);
await go('inicio'); await shot('pc-inicio.png');
await go('agenda'); await shot('pc-agenda.png');
await go('inicio');
await p.evaluate(() => document.querySelector('[data-attend]')?.click());
await p.waitForSelector('.consult-modal .rp-head', { timeout: 20000 }); await sleep(1500);
await shot('pc-consulta.png');
await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(800);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await p.waitForSelector('.bottom-nav [data-nav="inicio"]', { timeout: 30000 }); await sleep(2500);
await go('inicio', true); await shot('movil-inicio.png');
await go('agenda', true); await shot('movil-agenda.png');
await go('pacientes', true);
await p.evaluate(() => document.querySelector('#pt-list [data-open]')?.click()); await sleep(2000);
await shot('movil-paciente.png');
await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(600);
// Terminar la demo (borra sus datos)
await p.setViewport({ width: 1280, height: 800 });
await p.waitForSelector('#demo-end', { timeout: 30000 }); await sleep(1500);
await p.evaluate(() => document.getElementById('demo-end').click());
await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
await p.waitForSelector('#login-form', { timeout: 60000 });
await b.close();
console.log('capturas listas');
