// Sano Doctor — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a Sano Doctor! 👋', text: 'Te mostramos en un minuto cómo funciona tu consultorio aquí. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetir este recorrido desde el menú › Ayuda.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Agenda, pacientes, consultas, cobros, facturación, caja, insumos, reportes y configuración. Los números de colores son avisos: pacientes esperando, cobros pendientes e insumos por acabarse o vencer.' },
      { route: 'inicio', sel: ['#sb-search', '.sb-search', '#tb-search'], title: 'Búsqueda rápida', text: 'Encuentra a cualquier paciente por nombre, cédula, teléfono o número de historia, y cualquier consulta por su número. En la computadora: Ctrl + K.' },
      { route: 'inicio', sel: ['[data-tour="quick"]'], title: 'Accesos rápidos', text: 'Agenda una cita, atiende una consulta sin cita, registra un paciente nuevo o abre la caja con un toque.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Tu día de un vistazo', text: 'Citas de hoy, pacientes en sala de espera, lo cobrado en $ y Bs, y las consultas que quedaron por cobrar.' },
      { route: 'inicio', sel: ['[data-tour="waiting"]'], title: 'Sala de espera', text: 'Cuando el paciente llega, márcalo como “Llegó” en la agenda: aparece aquí en orden de llegada con su tiempo de espera. Toca “Atender” para abrir la consulta.' },
      { route: 'agenda', sel: ['.day-grid', '#ag-body'], title: 'Agenda del día', text: 'Tus turnos según el horario de atención. Toca un espacio “Libre” para agendar, o una cita para confirmarla, reprogramarla, marcar inasistencia o enviar un recordatorio por WhatsApp.' },
      { route: 'agenda', sel: ['#ag-mode'], title: 'Día, semana y próximas', text: 'Cambia a la vista semanal o a la lista de próximas citas, donde ves cuáles faltan por confirmar.' },
      { route: 'pacientes', sel: ['#pt-list'], title: 'Pacientes', text: 'Cada paciente tiene su historia clínica: antecedentes, alergias, enfermedades crónicas, consultas, signos vitales con gráficas, citas, archivos y pagos.' },
      { route: 'pacientes', sel: ['#pt-filters'], title: 'Filtros inteligentes', text: 'Pacientes con cita próxima, crónicos, con alergias, con control vencido o cumpleañeros del mes para escribirles por WhatsApp.' },
      { route: 'cobrar', sel: ['#pos-grid'], title: 'Cobrar', text: 'Las consultas por cobrar aparecen arriba. También cobras servicios (nebulización, curas, certificados…) e insumos; se descuentan del inventario.' },
      { route: 'cobrar', sel: ['#c-pay', '#cart-fab'], title: 'Cobro en $ y Bs', text: 'Varias formas de pago a la vez (efectivo $, efectivo Bs, punto, pago móvil, Zelle…) con el vuelto en la moneda que elijas.' },
      { route: 'caja', sel: ['#k-body'], title: 'Caja', text: 'Abre la caja con el fondo, registra gastos y al cerrar cuenta el dinero: el sistema te dice si sobra o falta, en $ y en Bs.' },
      { route: 'caja', sel: ['.sb-nav [data-nav="reportes"]'], title: 'Reportes', text: 'Consultas, pacientes nuevos, diagnósticos y medicamentos más frecuentes, inasistencia, edades e ingresos. Protegidos con el PIN (en la demo: 1234).' },
      { route: 'caja', sel: ['.sb-foot [data-install]', '.topbar [data-install]'], title: 'Instala la app', text: 'Instala Sano Doctor en el teléfono, la tablet o la computadora desde el navegador: queda con su ícono, abre en su propia ventana y todo se sincroniza.' },
      { route: 'inicio', title: '¡Listo para atender! 🎉', text: 'Prueba ahora: en la sala de espera toca “Atender”, registra los signos vitales, busca un diagnóstico, arma el récipe con el vademécum e imprímelo con su código QR. Más recorridos en el menú › Ayuda.', final: true }
    ]
  },
  consulta: {
    name: 'Atender una consulta', desc: 'Evaluación, diagnóstico, récipe y documentos', icon: 'stethoscope',
    steps: [
      { route: 'agenda', sel: ['[data-attend]', '.wait-card'], title: 'Llamar al paciente', text: 'Desde la sala de espera (o la agenda) toca “Atender”. Se abre la consulta con los antecedentes, alergias y últimos signos del paciente a la vista.' },
      { route: 'agenda', title: '1. Evaluación', text: 'Motivo, enfermedad actual, signos vitales (el IMC y la clasificación de la tensión se calculan solos y te alerta si algo está fuera de rango) y examen físico con plantilla.' },
      { route: 'agenda', title: '2. Diagnóstico', text: 'Busca por nombre o código CIE-10 (ej.: “hipertensión” o “I10”). Marca el principal, presuntivo o definitivo, y escribe el plan.' },
      { route: 'agenda', title: '3. Récipe', text: 'Busca en el vademécum: dosis, frecuencia y duración se completan solos y la cantidad a comprar se calcula. Si el paciente es alérgico (ej.: penicilina), el sistema te avisa antes de indicarlo.' },
      { route: 'agenda', title: '4. Exámenes y referencia', text: 'Marca laboratorios por grupos o con paquetes (chequeo general, diabetes, prenatal…), estudios de imagen y referencia a especialista.' },
      { route: 'agenda', title: '5. Documentos con QR', text: 'Imprime récipe e indicaciones, orden de exámenes, reposo, constancia de asistencia, certificado de salud, informe y referencia. Cada documento lleva un código QR para verificar que es auténtico.' },
      { route: 'agenda', title: '6. Cierre y cobro', text: 'Agenda el próximo control con los horarios libres, agrega insumos usados y cobra en el momento, déjalo por cobrar o márcalo sin cargo. La consulta queda firmada; luego solo se le agregan notas.' }
    ]
  },
  agenda: {
    name: 'Agenda y citas', desc: 'Agendar, confirmar, sala de espera y recordatorios', icon: 'calendar',
    steps: [
      { route: 'agenda', sel: ['#ag-new'], title: 'Nueva cita', text: 'Busca al paciente o regístralo en el momento, elige el tipo de cita (primera vez, control, emergencia, telemedicina…) y un horario libre. Avisa si se cruza con otra cita.' },
      { route: 'agenda', sel: ['[data-tour="appt"]', '.day-grid'], title: 'Estados de la cita', text: 'Programada → confirmada → en espera → en consulta → atendida. También “no asistió” y “cancelada”, para medir la inasistencia.' },
      { route: 'agenda', sel: ['[data-remind]', '#ag-mode'], title: 'Recordatorios', text: 'Con un toque envías por WhatsApp un recordatorio con la fecha, hora y dirección del consultorio, y le pides confirmar.' },
      { route: 'inicio', sel: ['[data-tour="remind"]', '[data-tour="today"]'], title: 'Citas de mañana', text: 'En el inicio ves las citas de mañana sin confirmar para enviar los recordatorios del día.' },
      { route: 'ajustes', sel: ['[data-s="agenda"]'], title: 'Horario de atención', text: 'Configura los días, horas, el descanso y la duración de cada turno. Los horarios libres se calculan solos.' }
    ]
  },
  pacientes: {
    name: 'Pacientes e historia clínica', desc: 'Registro, antecedentes, archivos y mensajes', icon: 'users',
    steps: [
      { route: 'pacientes', sel: ['#pt-new'], title: 'Nuevo paciente', text: 'Datos personales, antecedentes (personales, quirúrgicos, familiares, gineco-obstétricos), alergias, enfermedades crónicas, medicación actual, hábitos y contacto de emergencia. Avisa si la cédula ya existe.' },
      { route: 'pacientes', sel: ['#pt-q'], title: 'Buscar', text: 'Por nombre, cédula, teléfono o número de historia.' },
      { route: 'pacientes', sel: ['#pt-list tr[data-open]', '#pt-list'], title: 'Ficha del paciente', text: 'Resumen con alertas de alergias, todas sus consultas, la evolución de tensión, peso y glicemia en gráficas, citas, archivos (resultados, imágenes, PDF) y pagos. Imprime la historia clínica completa.' },
      { route: 'pacientes', sel: ['#pt-import', '#pt-export'], title: 'Importar y exportar', text: 'Trae tus pacientes desde Excel (CSV) o expórtalos cuando quieras.' }
    ]
  },
  caja: {
    name: 'Caja y cobros', desc: 'Abrir, gastos y cierre con arqueo', icon: 'wallet',
    steps: [
      { route: 'caja', sel: ['#k-body .kpis', '#k-open'], title: 'Turno de caja', text: 'Muestra lo cobrado en el turno (consultas, servicios e insumos) y el efectivo esperado en dólares y en bolívares.' },
      { route: 'caja', sel: ['#k-out'], title: 'Gastos', text: 'Registra lo que sale de la caja: compra de insumos, servicios, alquiler, personal… Así el cierre cuadra.' },
      { route: 'caja', sel: ['#k-close'], title: 'Cerrar caja', text: 'Cuenta el efectivo y escríbelo: el sistema calcula si sobra o falta y te da un reporte de cierre para imprimir.' }
    ]
  }
};

let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sd_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-doctor-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar Sano Doctor, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
