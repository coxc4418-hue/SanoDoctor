// Sano Doctor — Genera el video tutorial narrado (voz es-VE) grabando el sistema real.
// Requisitos: emuladores corriendo (o URL de producción), ffmpeg en el PATH y `pip install edge-tts`.
// Uso: node make-video.mjs [url=http://127.0.0.1:5077/?emu=1]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] || 'http://127.0.0.1:5077/?emu=1';
const WORK = path.join(here, 'work');
const OUT_DIR = path.join(here, '..', '..', 'public', 'tutorial');
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
const FFMPEG = execFileSync('where', ['ffmpeg']).toString().split(/\r?\n/)[0].trim();
const VOICE = 'es-VE-PaolaNeural';
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ======================================================================
// Guion: cada escena tiene la narración y las acciones que se graban
// ======================================================================
const SCENES = [
  { id: '01-intro', card: 'intro', text: 'Hola. Bienvenido a Sano Doctor, el sistema para consultorios de medicina general. En pocos minutos te muestro cómo llevar tus pacientes, tu agenda, tus consultas y tus cobros.' },
  { id: '02-login', text: 'Para empezar, entra con el usuario y la contraseña de tu consultorio. Si solo quieres probar, toca “Probar demo gratis”: tendrás treinta minutos con un consultorio de ejemplo, y el PIN de la demo es uno, dos, tres, cuatro.',
    act: async (v, dur) => { await v.hl('#login-form', 4200); await v.hl('#lg-demo', 4600); await v.move('#lg-demo'); await sleep(Math.max(0, dur * 1000 - 11800)); await v.point('#lg-demo'); }, after: 'demo' },
  { id: '03-inicio', text: 'Esta es tu pantalla de inicio. Arriba, los accesos rápidos: agendar una cita, atender sin cita o registrar un paciente. Luego ves las citas de hoy, quién está en la sala de espera, lo cobrado y lo que falta por cobrar. Y abajo, la agenda del día.',
    act: async (v) => { await v.hl('[data-tour="quick"]', 4200); await v.hl('[data-tour="kpis"]', 5200); await v.hl('[data-tour="waiting"]', 3800); await v.hl('[data-tour="today"]', 2600); } },
  { id: '04-cita', text: 'Para agendar una cita, toca “Nueva cita”. Busca al paciente por nombre, cédula o teléfono, elige el tipo de consulta, y el sistema te sugiere los horarios libres del médico. Al guardar, puedes enviarle la confirmación por WhatsApp.',
    act: async (v) => {
      await v.point('#d-new'); await sleep(900);
      await v.point('.modal-backdrop:last-child [data-search]'); await sleep(700);
      await v.page.keyboard.type('Santiago', { delay: 90 }); await sleep(700);
      await v.point('.modal-backdrop:last-child [data-p]'); await sleep(900);
      await v.point('.modal-backdrop:last-child [data-type="control"]'); await sleep(500);
      // Próximo día con horarios libres (a última hora ya no quedan para hoy)
      await v.page.evaluate(() => {
        const m = document.querySelector('.modal-backdrop:last-child'); const d = m.querySelector('[name="date"]'); const s = m.querySelector('[name="slot"]');
        for (let i = 1; i <= 7 && ![...s.options].some((o) => o.value); i++) {
          const t = new Date(Date.now() + i * 864e5); d.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; d.dispatchEvent(new Event('change'));
        }
      });
      await sleep(500);
      await v.hl('.modal-backdrop:last-child [name="slot"]', 1600);
      await v.page.evaluate(() => { const s = document.querySelector('.modal-backdrop:last-child [name="slot"]'); const o = [...s.options].filter((x) => x.value)[2] || [...s.options].find((x) => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } });
      await v.point('.modal-backdrop:last-child [name="reason"]'); await v.page.keyboard.type('Control de asma', { delay: 60 });
      await v.page.evaluate(() => { const w = document.querySelector('.modal-backdrop:last-child [name="wa"]'); if (w) w.checked = false; });
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(1200);
    } },
  { id: '05-atender', text: 'Cuando el paciente llega, aparece en la sala de espera en orden de llegada. Toca “Atender” y se abre la consulta, con sus alergias, sus enfermedades crónicas, los medicamentos que toma y su último diagnóstico siempre a la vista.',
    act: async (v) => { await v.hl('[data-tour="waiting"]', 3500); await v.point('[data-tour="waiting"] [data-attend]'); await sleep(2200); await v.hl('.consult-modal .rp-head', 5000); } },
  { id: '06-evaluacion', text: 'En la evaluación escribes el motivo de consulta y la enfermedad actual, y registras los signos vitales. El sistema calcula el índice de masa corporal y te alerta si la tensión está alta, si hay fiebre o si la saturación está baja. Para el examen físico tienes una plantilla normal que completas en segundos.',
    act: async (v) => {
      await v.point('.consult-modal [data-k="illness"]'); await v.page.keyboard.type('Refiere cefalea occipital desde hace 3 días. Cumple tratamiento.', { delay: 35 });
      for (const [k, val] of [['ta', '158/96'], ['fc', '84'], ['peso', '82'], ['talla', '170']]) { await v.point(`.consult-modal [data-v="${k}"]`); await v.page.evaluate((k) => document.querySelector(`.consult-modal [data-v="${k}"]`).select(), k); await v.page.keyboard.type(val, { delay: 90 }); }
      await sleep(600); await v.hl('.consult-modal [data-tour="vitals"]', 3500);
      await v.point('.consult-modal [data-tpl]'); await sleep(900);
    } },
  { id: '07-diagnostico', text: 'En Diagnóstico buscas en la clasificación CIE diez escribiendo el nombre o el código, por ejemplo hipertensión. Puedes agregar varios diagnósticos y escribir el plan de tratamiento.',
    act: async (v) => {
      await v.point('.consult-modal [data-tab="dx"]'); await sleep(700);
      await v.point('.consult-modal [data-cie]'); await v.page.keyboard.type('hipertension', { delay: 80 }); await sleep(900);
      await v.hl('.consult-modal [data-cie-res]', 2200);
      await v.point('.consult-modal [data-dx]'); await sleep(900);
      await v.point('.consult-modal [data-k="plan"]'); await v.page.keyboard.type('Ajuste de dosis. Dieta baja en sal. Control en 1 mes.', { delay: 35 });
    } },
  { id: '08-recipe', text: 'En el Récipe escribes el medicamento y eliges la presentación: la dosis, la frecuencia y la duración se llenan solas, y la cantidad se calcula. Si el paciente es alérgico a ese medicamento, el sistema te avisa antes de recetarlo. Tus medicamentos favoritos quedan a un toque.',
    act: async (v) => {
      await v.point('.consult-modal [data-tab="rx"]'); await sleep(700);
      await v.point('.consult-modal [data-med]'); await v.page.keyboard.type('losartan', { delay: 90 }); await sleep(900);
      await v.hl('.consult-modal [data-med-res]', 2000);
      await v.point('.consult-modal [data-addmed]'); await sleep(1200);
      await v.point('.consult-modal [data-med]'); await v.page.keyboard.type('amlodipino', { delay: 90 }); await sleep(900);
      await v.point('.consult-modal [data-addmed]'); await sleep(1200);
      await v.hl('.consult-modal .rx-n', 2500, (el) => el.closest('.card') || el);
    } },
  { id: '09-documentos', text: 'En Documentos imprimes, con tu firma y tu número de MPPS, el récipe con las indicaciones, la orden de exámenes, la constancia de reposo, la constancia de asistencia, el certificado de salud, el informe médico y la referencia. Cada documento lleva un código QR para verificar que es auténtico.',
    act: async (v) => {
      await v.point('.consult-modal [data-tab="docs"]'); await sleep(800);
      await v.hl('.consult-modal [data-tour="docs"]', 4500);
      await v.point('.consult-modal [data-doc="recipe"]'); await sleep(2500);
      await v.point('.consult-modal [data-doc="rest"]'); await sleep(2500);
    } },
  { id: '10-cierre', text: 'Para terminar, en Cierre y cobro ves los cargos de la consulta, y puedes sumar servicios o insumos usados, que se descuentan del inventario. Elige cuándo será el próximo control y se agenda solo. Cobras en dólares, bolívares, punto, pago móvil o Zelle, incluso combinados.',
    act: async (v) => {
      await v.point('.consult-modal [data-tab="close"]'); await sleep(800);
      await v.hl('.consult-modal [data-tour="charges"]', 3500);
      await v.point('.consult-modal [data-nvq="30"]'); await sleep(900);
      await v.hl('.consult-modal [data-tour="next"]', 2500);
      await v.point('.consult-modal [data-close-pay]'); await sleep(1300);
      await v.hl('.modal-backdrop:last-child .pay-methods', 3000);
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(2000);
      v.code = await v.page.evaluate(async () => { const { store } = await import('/js/store.js'); const l = await store.listBetween('consultations', 'startedAt', new Date(Date.now() - 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString()); return l.filter((c) => c.docs?.length).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''))[0]?.docs[0]?.code; });
    } },
  { id: '11-siguiente', text: 'La consulta queda cerrada y firmada. Desde aquí envías las indicaciones al paciente por WhatsApp, imprimes el recibo, y pasas directamente al siguiente paciente de la sala de espera.',
    act: async (v) => { await v.hl('.modal-backdrop:last-child .modal', 4500); await v.move('.modal-backdrop:last-child [data-next], .modal-backdrop:last-child [data-close]'); }, after: 'closeModal' },
  { id: '12-verificar', track: true, text: 'Y esto es lo que ve una farmacia, un laboratorio o una empresa al escanear el QR del documento: confirma que es auténtico, quién lo emitió y cuándo. Si anulas un documento, aparece como anulado.' },
  { id: '13-pacientes', text: 'En Pacientes tienes la historia clínica de cada uno: datos personales, antecedentes, alergias, todas sus consultas, la evolución de sus signos vitales en gráficas, sus citas, sus cobros y sus archivos, como resultados de laboratorio. Puedes filtrar por crónicos, alérgicos o cumpleañeros del mes.',
    act: async (v) => {
      await v.nav('pacientes'); await sleep(900);
      await v.hl('#pt-filters', 3000);
      await v.point('#pt-list [data-open]', 'Pedro Luis'); await sleep(1600);
      await v.hl('.modal-backdrop:last-child .rp-tabs', 2500);
      await v.point('.modal-backdrop:last-child [data-tab="signos"]'); await sleep(2500);
      await v.point('.modal-backdrop:last-child [data-tab="consultas"]'); await sleep(2200);
    }, after: 'closeModal' },
  { id: '14-agenda', text: 'En la Agenda ves el día con los horarios libres y los ocupados, o la semana completa. Confirmas citas, marcas quién llegó o quién no asistió, reprogramas, y le recuerdas por WhatsApp a los pacientes de mañana con un mensaje ya escrito.',
    act: async (v) => { await v.nav('agenda'); await sleep(1000); await v.hl('#ag-body', 4000); await v.point('#ag-mode [data-m="semana"]'); await sleep(2500); await v.point('#ag-mode [data-m="lista"]'); await sleep(2000); } },
  { id: '15-caja', text: 'En Cobrar están las consultas pendientes por cobrar y puedes vender servicios o insumos sin consulta. En Caja abres el turno con el fondo, registras los gastos y al cerrar el sistema te dice si sobra o falta, en dólares y en bolívares, con la tasa del día.',
    act: async (v) => { await v.nav('cobrar'); await sleep(1000); await v.hl('[data-tour="pending"]', 3500); await v.hl('#pos-grid', 2500); await v.nav('caja'); await sleep(1000); await v.hl('#k-body .kpis', 4000); await v.hl('#k-close', 2000); } },
  { id: '16-reportes', text: 'Los reportes están protegidos con tu PIN. Ves los ingresos, las consultas por médico, los diagnósticos más frecuentes, los medicamentos que más recetas, la asistencia a las citas y las edades de tus pacientes.',
    act: async (v) => {
      await v.navRaw('reportes'); await sleep(900);
      await v.point('.modal [data-pin]'); await v.page.keyboard.type('1234', { delay: 160 }); await sleep(300);
      await v.point('.modal [data-ok]'); await sleep(2200);
      await v.hl('.kpis', 4000);
      await v.page.evaluate(() => (document.querySelector('.main') || document.scrollingElement).scrollBy({ top: 600, behavior: 'smooth' })); await sleep(3500);
    } },
  { id: '17-instalar', card: 'phone', text: 'Sano Doctor se instala desde el navegador, en tu teléfono, tablet o computadora, sin descargar nada de una tienda. Tu asistente puede agendar desde la recepción mientras tú atiendes, todo conectado en tiempo real.' },
  { id: '18-ayuda', text: 'Si tienes dudas, en “Ayuda y recorridos” encuentras guías que te señalan cada parte de la pantalla, y este mismo video.',
    act: async (v) => { await v.nav('inicio'); await sleep(500); await v.point('#sb-help'); await sleep(1300); await v.hl('.modal .help-list', 3500); }, after: 'closeModal' },
  { id: '19-cierre', card: 'outro', text: '¿Listo para organizar tu consultorio? Escríbenos por WhatsApp al cero, cuatro, dos, dos, uno, nueve, cero, seis, cero, cuatro, cinco, y activa Sano Doctor hoy mismo. ¡Gracias por ver!' }
];

// ======================================================================
// Voz
// ======================================================================
function tts(scene) {
  const h = createHash('md5').update(VOICE + scene.text).digest('hex').slice(0, 10);
  const mp3 = path.join(WORK, `${scene.id}-${h}.mp3`), srt = path.join(WORK, `${scene.id}-${h}.srt`);
  if (!existsSync(mp3)) execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+3%', '--text', scene.text, '--write-media', mp3, '--write-subtitles', srt]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString());
  return { mp3, srt, dur };
}

// ======================================================================
// Ayudas visuales: cursor animado, clic y resaltado
// ======================================================================
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById('vcur')) return;
    const st = document.createElement('style');
    st.textContent = `#vcur{position:fixed;left:640px;top:360px;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.2,.8,.2,1),top .7s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
      .vrip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #22d3ee;z-index:2147483646;pointer-events:none;animation:vrip .6s ease-out forwards}
      @keyframes vrip{to{transform:scale(3.6);opacity:0}}
      .vhl{position:fixed;z-index:2147483645;pointer-events:none;border-radius:14px;border:3px solid #22d3ee;box-shadow:0 0 0 4px rgba(34,211,238,.25),0 0 28px 6px rgba(34,211,238,.45);transition:opacity .3s;animation:vhl 1.4s ease-in-out infinite}
      @keyframes vhl{50%{box-shadow:0 0 0 7px rgba(34,211,238,.18),0 0 34px 10px rgba(34,211,238,.3)}}
      .toasts{top:auto!important;bottom:18px!important}`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = 'vcur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-3 1.4-3.6-7.6L4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
};

function helpers(page) {
  const rectOf = async (sel, text = null, pick = null) => {
    const r = await page.evaluate((sel, text, pickSrc) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      let el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
      if (!el) return null;
      if (pickSrc) el = (0, eval)(pickSrc)(el) || el;
      const b0 = el.getBoundingClientRect();
      if (b0.top < 0 || b0.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      else el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, sel, text, pick ? pick.toString() : null);
    if (!r) console.warn('   (no encontré', sel, text || '', ')');
    return r;
  };
  const moveXY = async (x, y) => { await page.evaluate((x, y) => { const c = document.getElementById('vcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, x, y); await sleep(760); };
  const v = {
    page,
    async move(sel, text) { const r = await rectOf(sel, text); if (r) await moveXY(r.x + r.w / 2, r.y + r.h / 2); return r; },
    async point(sel, text) {
      const r = await v.move(sel, text);
      if (!r) return;
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      await page.evaluate((x, y) => { const d = document.createElement('div'); d.className = 'vrip'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, x, y);
      // Si algo cambió de lugar mientras se movía el cursor, se pulsa el elemento directamente
      const hit = await page.evaluate((sel, text, x, y) => {
        const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
        const el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
        if (!el) return 'sin elemento';
        const at = document.elementFromPoint(x, y);
        if (at && (at === el || el.contains(at))) return 'ok';
        el.click();
        return 'directo: ' + (at ? at.tagName + '.' + at.className : 'nada');
      }, sel, text || null, x, y);
      if (hit === 'ok') await page.mouse.click(x, y);
      else console.warn('   clic', sel, '→', hit);
      await sleep(250);
    },
    pointText(sel, text) { return v.point(sel, text); },
    async pointRow(rowSel, text, btnSel) {
      const r = await rectOf(rowSel, text, (el) => el.querySelector('[data-ed]'));
      if (!r) return;
      await moveXY(r.x + r.w / 2, r.y + r.h / 2);
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    },
    async hl(sel, ms = 2500, pick = null, text = null) {
      const r = await rectOf(sel, text, pick);
      if (!r) { await sleep(ms); return; }
      await page.evaluate((r) => { const d = document.createElement('div'); d.className = 'vhl'; d.id = 'vhl-cur'; Object.assign(d.style, { left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.w + 12 + 'px', height: r.h + 12 + 'px' }); document.body.appendChild(d); }, r);
      await sleep(ms);
      await page.evaluate(() => document.querySelectorAll('.vhl').forEach((d) => d.remove()));
    },
    hlText(sel, text, ms) { return v.hl(sel, ms, null, text); },
    hlRow(sel, text, ms) { return v.hl(sel, ms, null, text); },
    async scrollModalTo(sel) { await page.evaluate((sel) => document.querySelector('.modal ' + sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sel); await sleep(700); },
    async nav(id) { await v.point(`.sb-nav [data-nav="${id}"]`); await sleep(500); },
    async navRaw(id) { await v.point(`.sb-nav [data-nav="${id}"]`); }
  };
  return v;
}

// ======================================================================
// Tarjetas (portada, instalación en teléfono, cierre)
// ======================================================================
const logo = readFileSync(path.join(here, '..', '..', 'public', 'assets', 'logo.svg'), 'utf8');
const CARD_CSS = `body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
  background:radial-gradient(900px 500px at -10% -20%,#0d9488 0%,transparent 55%),radial-gradient(800px 500px at 110% 120%,#2563eb 0%,transparent 55%),linear-gradient(150deg,#041514,#062a2a 50%,#04110f)}
  .c{height:100%;display:flex;align-items:center;justify-content:center;gap:60px;text-align:left}
  .logo svg{width:150px;height:150px;border-radius:40px;box-shadow:0 30px 60px -20px rgba(0,0,0,.7);animation:pop .9s cubic-bezier(.2,.8,.2,1)}
  h1{font-size:64px;margin:0;letter-spacing:-2px;animation:up .9s .15s both} h1 em{font-style:normal;background:linear-gradient(90deg,#5eead4,#93c5fd);-webkit-background-clip:text;color:transparent}
  p{font-size:26px;margin:14px 0 0;opacity:.82;animation:up .9s .35s both} .tag{display:inline-block;margin-top:26px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);font-size:20px;animation:up .9s .55s both}
  @keyframes pop{from{transform:scale(.6);opacity:0}} @keyframes up{from{transform:translateY(22px);opacity:0}}`;
function cardHTML(kind) {
  if (kind === 'intro') return `<style>${CARD_CSS}</style><div class="c"><div class="logo">${logo}</div><div><h1>Sano <em>Doctor</em></h1><p>Tutorial: cómo usar el sistema en tu consultorio</p><span class="tag">Pacientes · Agenda · Consulta · Récipe · Documentos con QR · Cobros en $ y Bs</span></div></div>`;
  if (kind === 'outro') return `<style>${CARD_CSS} .wa{display:inline-flex;align-items:center;gap:14px;margin-top:28px;padding:18px 28px;border-radius:18px;background:#16a34a;font-size:34px;font-weight:700;animation:up .9s .45s both;box-shadow:0 20px 40px -16px rgba(22,163,74,.8)}</style>
    <div class="c"><div class="logo">${logo}</div><div><h1>¿Listo para <em>tu consultorio?</em></h1><p>Instálalo desde sano-doctor.web.app</p><div class="wa">WhatsApp +58 422-190 6045</div></div></div>`;
  return `<style>${CARD_CSS} .phone{width:330px;height:640px;border-radius:46px;background:#000;padding:12px;box-shadow:0 40px 80px -24px rgba(0,0,0,.85),0 0 0 2px #333;animation:pop .9s cubic-bezier(.2,.8,.2,1)}
    .phone{position:relative;width:302px;height:648px;padding:12px;overflow:hidden} .phone img{position:absolute;left:12px;top:12px;width:302px;height:648px;object-fit:cover;object-position:top;border-radius:36px}
    .phone .s2{opacity:0;animation:fadein .8s 7s forwards} @keyframes fadein{to{opacity:1}}
    .steps{max-width:520px} .steps h1{font-size:50px} .st{display:flex;gap:16px;align-items:center;margin-top:22px;font-size:24px;animation:up .8s both} .st b{width:44px;height:44px;border-radius:14px;background:#0d9488;display:grid;place-items:center;flex:none}</style>
    <div class="c"><div class="phone"><img src="${PHONE[0]}"><img class="s2" src="${PHONE[1]}"></div><div class="steps"><h1>Instálalo <em>desde la web</em></h1>
    <div class="st" style="animation-delay:.4s"><b>1</b>Abre sano-doctor.web.app en Chrome</div>
    <div class="st" style="animation-delay:1.6s"><b>2</b>Toca “Instalar app”</div>
    <div class="st" style="animation-delay:2.8s"><b>3</b>Listo: el ícono queda en tu pantalla</div>
    <div class="st" style="animation-delay:4s"><b>✓</b>Teléfono, tablet o computadora, conectados</div></div></div>`;
}

// ======================================================================
// Grabación
// ======================================================================
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'] });
const app = await browser.newPage();
await app.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await app.evaluateOnNewDocument(OVERLAY);
await app.evaluateOnNewDocument(() => { window.print = () => {}; try { localStorage.setItem('sd_installed', '1'); localStorage.setItem('sd_theme', 'dark'); } catch (_) {} });
const v = helpers(app);

// Capturas del teléfono (Android) para la escena de instalación
const PHONE = [];
{
  const ctx = await browser.createBrowserContext();
  const m = await ctx.newPage();
  await m.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36');
  await m.setViewport({ width: 390, height: 836, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(APP, { waitUntil: 'networkidle0' });
  await m.waitForSelector('.install-card'); await sleep(900);
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(300);
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await m.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await m.evaluate(() => document.querySelector('.install-card [data-install]').click());
  await m.waitForSelector('.modal'); await sleep(700);
  await m.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await ctx.close();
}
await app.goto(APP, { waitUntil: 'networkidle0' });
await app.waitForSelector('#login-form');
await sleep(1200);

const parts = [];
for (const sc of SCENES.filter((s) => !process.env.UNTIL || s.id <= process.env.UNTIL)) {
  const voice = tts(sc);
  console.log(`● ${sc.id} (${voice.dur.toFixed(1)} s)`);
  const webm = path.join(WORK, `${sc.id}.webm`);
  let page = app, cardPage = null;
  if (sc.card) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await cardPage.setContent(cardHTML(sc.card), { waitUntil: 'load' });
    page = cardPage;
  }
  if (sc.track) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const u = new URL(APP);
    await cardPage.goto(`${u.origin}/verificar/${v.code}${u.search}`, { waitUntil: 'domcontentloaded' });
    await cardPage.waitForSelector('.vf-hero', { timeout: 30000 }).catch(() => {});
    await cardPage.addStyleTag({ content: '.vf-ic{animation:vfpulse 1.4s ease-in-out infinite}@keyframes vfpulse{50%{box-shadow:0 0 0 10px var(--brand-soft)}}' });
    await cardPage.evaluate(() => { setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 6500); });
    await sleep(800);
    page = cardPage;
  }
  await page.bringToFront();
  await sleep(300);
  const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG });
  const t0 = Date.now();
  if (sc.act) { try { await sc.act(v, voice.dur); } catch (e) { console.warn('   acción:', e.message); } }
  const left = voice.dur * 1000 + 700 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await rec.stop();
  const total = Math.max(voice.dur + 0.7, (Date.now() - t0) / 1000);
  parts.push({ webm, ...voice, total });
  if (cardPage) await cardPage.close();
  // Acciones fuera de cámara
  if (sc.after === 'demo') {
    await app.waitForSelector('.sb-nav', { timeout: 90000 });
    await app.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => {});
    await app.evaluate(async () => (await import('/js/tour.js')).stopTour());
    await sleep(6000);
    await app.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  }
  if (sc.after === 'closeModal') { await app.keyboard.press('Escape'); await sleep(400); await app.keyboard.press('Escape'); await sleep(300); }
}
await browser.close();

// ======================================================================
// Montaje con ffmpeg: video + voz + subtítulos por escena, luego unión
// ======================================================================
const subStyle = "FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const list = [];
for (const p of parts) {
  const mp4 = p.webm.replace('.webm', '.mp4');
  const srtName = path.basename(p.srt);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p.webm, '-i', p.mp3,
    '-filter_complex', `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x060a14,tpad=stop_mode=clone:stop_duration=5,subtitles=${srtName}:force_style='${subStyle}',setsar=1[v];[1:a]adelay=250|250,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', p.total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', mp4], { cwd: WORK });
  list.push(`file '${mp4.replace(/\\/g, '/')}'`);
}
const listFile = path.join(WORK, 'lista.txt');
writeFileSync(listFile, list.join('\n'));
const final = path.join(OUT_DIR, 'sano-doctor-tutorial.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final]);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', parts[0].webm.replace('.webm', '.mp4'), '-frames:v', '1', '-q:v', '3', path.join(OUT_DIR, 'portada.jpg')]);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
console.log(`\n✔ Video listo: ${final} (${(dur / 60).toFixed(1)} min)`);
