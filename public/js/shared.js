// Sano Doctor — Componentes compartidos: tasa BCV, moneda, QR, WhatsApp al paciente e impresión de recibos
import { store, APPT_TYPES } from './store.js';
import { openModal, toast, num, esc, parseNum, fmtDateTime, fmtDate, setBusy, usd, bs, methodLabel, qtyFmt, printHTML, todayKey, dayKey, waLink, addDays } from './utils.js';
import { icon } from './icons.js';

export const APP_NAME = 'Sano Doctor';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa Sano Doctor para mi consultorio. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// TASA BCV
// ======================================================================
export async function fetchBcvRate() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = Number(j.promedio || j.precio || j.venta);
    if (!(v > 0)) throw new Error('Respuesta inválida');
    return { rate: v, date: j.fechaActualizacion || null };
  } finally { clearTimeout(t); }
}

export async function autoUpdateRate() {
  const s = store.settings;
  if (s.rateAuto === false) return false;
  if (s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey() && store.rate > 0) return false;
  try {
    const r = await fetchBcvRate();
    if (Math.abs(r.rate - store.rate) < 0.0001 && s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey()) return false;
    await store.setRate(Math.round(r.rate * 100) / 100, true);
    toast(`Tasa BCV del día actualizada: Bs ${num(r.rate)}`, 'info', 4000);
    return true;
  } catch (_) { return false; }
}

export function openRateModal() {
  const s = store.settings;
  const m = openModal({
    title: 'Tasa del día',
    sub: s.rateUpdatedAt ? `Última actualización: ${fmtDateTime(s.rateUpdatedAt)} · ${s.rateSource === 'bcv' ? 'automática BCV' : 'manual'}` : 'Configura la tasa para mostrar los precios en bolívares',
    size: 'sm',
    body: `
      <form class="stack" data-f>
        <div class="field">
          <label>Bolívares por 1 $</label>
          <input class="input input-lg" data-rate inputmode="decimal" value="${s.rate ? num(s.rate) : ''}" placeholder="0,00" autofocus>
        </div>
        <button type="button" class="btn btn-secondary btn-block" data-auto>${icon('refresh')} Consultar tasa oficial BCV</button>
        <label class="check"><input type="checkbox" data-autoflag ${s.rateAuto !== false ? 'checked' : ''}> <span>Actualizar automáticamente con la tasa BCV cada día</span></label>
        <div class="hint" data-hint>Puedes escribir cualquier tasa. Se aplica a los precios en Bs, la caja y los reportes.</div>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar tasa</button>`
  });
  const input = m.el.querySelector('[data-rate]');
  const hint = m.el.querySelector('[data-hint]');
  m.el.querySelector('[data-auto]').onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Consultando…');
    try {
      const r = await fetchBcvRate();
      input.value = num(r.rate);
      hint.textContent = `Tasa oficial BCV${r.date ? ' (' + fmtDateTime(r.date) + ')' : ''}. Pulsa “Guardar tasa” para aplicarla.`;
    } catch (_) {
      hint.textContent = 'No se pudo consultar la tasa automáticamente. Escríbela manualmente.';
    } finally { setBusy(btn, false); }
  };
  const save = async (e) => {
    e?.preventDefault();
    const v = parseNum(input.value);
    if (!(v > 0)) { toast('Ingresa una tasa válida', 'warning'); input.focus(); return; }
    await store.saveSettings({ rateAuto: m.el.querySelector('[data-autoflag]').checked });
    await store.setRate(v, false);
    toast(`Tasa actualizada: Bs ${num(v)} por $1`);
    m.close();
  };
  m.el.querySelector('[data-f]').onsubmit = save;
  m.el.querySelector('[data-save]').onclick = save;
}

// ======================================================================
// MONEDA
// ======================================================================
export function moneyPair(usdVal, rate = store.rate) {
  return `<b class="num">${usd(usdVal)}</b><span class="small text-bs num" style="display:block">${bs(usdVal * rate)}</span>`;
}
export const toBs = (v) => bs((Number(v) || 0) * store.rate);

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
/** Imagen (data URL) con el código QR del texto */
export async function qrDataURL(text, cell = 4) {
  try {
    const q = await loadQR();
    const qr = q(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL PACIENTE
// ======================================================================
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function apptWhen(a) {
  const d = new Date(a.date + 'T12:00');
  const rel = a.date === todayKey() ? 'hoy' : a.date === dayKey(addDays(new Date(), 1)) ? 'mañana' : `el ${DAY_NAMES[d.getDay()]} ${fmtDate(a.date)}`;
  const [h, m] = a.time.split(':').map(Number);
  const hh = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  return `${rel} a las ${hh}`;
}

export function patientMessage(kind, { patient = {}, appt = null, consult = null, extra = '' } = {}) {
  const name = String(patient.name || appt?.patientName || consult?.patientName || '').split(' ')[0];
  const biz = store.businessName;
  const doc = appt?.doctor || consult?.doctor || store.mainDoctor?.name || '';
  const addr = store.settings.address ? `\n📍 ${store.settings.address}` : '';
  const h = `Hola ${name} 👋, te escribimos de *${biz}*.`;
  const T = {
    agendada: () => `${h}\n\nTu cita quedó agendada para *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.\nMotivo: ${APPT_TYPES[appt.type]?.label || 'Consulta'}${appt.reason ? ' · ' + appt.reason : ''}.${addr}\n\nSi no puedes asistir, avísanos para reprogramarla. ¡Te esperamos!`,
    recordatorio: () => `${h}\n\n📅 Te recordamos tu cita *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.${addr}\n\nPor favor responde *SÍ* para confirmar o escríbenos si necesitas cambiarla. Llega 10 minutos antes y trae tus exámenes y medicamentos actuales.`,
    reprogramada: () => `${h}\n\nTu cita fue reprogramada para *${apptWhen(appt)}*${doc ? ` con ${doc}` : ''}.${addr}\n\n¿Te queda bien? Responde *SÍ* para confirmar.`,
    no_asistio: () => `${h}\n\nTe esperábamos ${apptWhen(appt).replace(/^el /, 'el ')} y no pudiste asistir. ¿Quieres que te agendemos una nueva cita? Responde este mensaje y te damos los horarios disponibles.`,
    cancelada: () => `${h}\n\nTu cita de ${apptWhen(appt)} fue cancelada. Cuando quieras, escríbenos para agendar una nueva.`,
    control: () => `${h}\n\nYa es momento de tu *control médico*${patient.lastDiagnoses?.length ? ` (${patient.lastDiagnoses[0]})` : ''}. ¿Te agendamos una cita? Responde con el día que te quede mejor.`,
    cumple: () => `🎉 ¡Feliz cumpleaños, ${name}! 🎂\n\nDe parte de todo el equipo de *${biz}* te deseamos un año lleno de salud y bienestar. ¡Cuídate mucho!`,
    indicaciones: () => `${h}\n\nEstas son tus indicaciones de la consulta ${consult?.number || ''}:\n\n${(consult?.rx || []).map((r, i) => `${i + 1}. *${r.name}* ${r.presentation || ''}: ${[r.dose, r.frequency, r.duration && `por ${r.duration}`].filter(Boolean).join(', ')}${r.note ? ` (${r.note})` : ''}`).join('\n') || '—'}${consult?.indications ? `\n\n${consult.indications}` : ''}${consult?.nextVisit?.date ? `\n\n📅 Control: ${fmtDate(consult.nextVisit.date)} a las ${consult.nextVisit.time}` : ''}\n\nCualquier duda, escríbenos. ¡Que te mejores!`,
    cobro: () => `${h}\n\nTe recordamos que tienes un saldo pendiente de *$${num(extra)}* (Bs ${num(Number(extra) * store.rate)}) por tu consulta ${consult?.number || ''}. ¡Gracias!`,
    libre: () => `${h}\n\n${extra || ''}`
  };
  return (T[kind] || T.libre)();
}
export function waPatient(kind, ctx = {}) {
  const phone = ctx.patient?.phone || ctx.appt?.patientPhone || ctx.consult?.patientPhone || '';
  const text = patientMessage(kind, ctx);
  window.open(phone ? waLink(phone, text) : 'https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN: recibos y documentos genéricos
// ======================================================================
export const PRINT_HEAD = '<meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style>';
function ticketCSS(fmt) {
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  return `@page { margin: ${fmt === 'carta' ? '12mm' : '2mm'}; }
    body { font-family: ${fmt === 'carta' ? 'Arial, Helvetica, sans-serif' : "'Courier New', monospace"}; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; }
    .big { font-size: 1.25em; font-weight: bold; } .sm { font-size: .85em; }`;
}
function headerHTML() {
  const s = store.settings;
  return `<div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">RIF: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}`;
}

/** Recibo de cobro (ticket o carta) */
export function receiptHTML(sale) {
  const s = store.settings;
  const rate = sale.rate || store.rate;
  const ivaPct = Number(s.iva) || 0;
  const ivaBs = ivaPct > 0 ? (sale.total - sale.total / (1 + ivaPct / 100)) * rate : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td colspan="2">${esc(methodLabel(p.method))}</td><td class="r">${p.currency === 'BS' ? 'Bs ' + num(p.amount) : '$' + num(p.amount)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(sale.number)}</title><style>${ticketCSS(s.receiptFormat)}</style></head><body>
    ${headerHTML()}
    <div class="hr"></div>
    <div class="c big">${esc(s.docTitle || 'RECIBO')}</div>
    <div class="c b">N° ${esc(sale.number)}</div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Paciente: ${esc(sale.patientName || 'Particular')}</div>
    ${sale.patientIdDoc ? `<div>C.I.: ${esc(sale.patientIdDoc)}</div>` : ''}
    ${sale.consultationNumber ? `<div>Consulta: ${esc(sale.consultationNumber)}${sale.doctor ? ' · ' + esc(sale.doctor) : ''}</div>` : ''}
    ${sale.status === 'voided' ? '<div class="c b">*** DOCUMENTO ANULADO ***</div>' : ''}
    <div class="hr"></div>
    <table>${(sale.items || []).map((it) => `<tr><td colspan="2" style="padding-top:3px">${qtyFmt(it.qty)} x ${esc(it.name)}</td><td class="r">$${num(it.total ?? it.price * it.qty)}</td></tr>`).join('')}</table>
    <div class="hr"></div>
    <table>
      <tr><td colspan="2">Subtotal</td><td class="r">$${num(sale.subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td colspan="2">Descuento</td><td class="r">-$${num(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td colspan="2">TOTAL $</td><td class="r">$${num(sale.total)}</td></tr>
      <tr class="big"><td colspan="2">TOTAL Bs</td><td class="r">${num(sale.total * rate)}</td></tr>
      <tr><td colspan="3" class="sm">Tasa: Bs ${num(rate)} por $</td></tr>
      ${ivaBs > 0.009 ? `<tr><td colspan="2">IVA ${num(ivaPct, 0)}% incluido</td><td class="r">Bs ${num(ivaBs)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${sale.changeCurrency === 'BS' ? 'Bs ' + num(sale.changeUSD * rate) : '$' + num(sale.changeUSD)}</div>` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por su confianza!')}</div>
    <div class="c sm" style="margin-top:4px">Sano Doctor</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

/** Documento imprimible genérico (reportes, cierres, listas) */
export function printDoc(title, inner) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #0d9488; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">Sano Doctor — Gestión médica para tu consultorio</p>
  </body></html>`);
}

export function notifyLowStock(list) {
  if (!list?.length) return;
  const names = list.slice(0, 3).map((i) => `${i.name} (${qtyFmt(i.stock)})`).join(', ');
  toast(`Insumos por agotarse: ${names}${list.length > 3 ? ` y ${list.length - 3} más` : ''}`, 'warning', 6000);
}

export { usd, bs };
