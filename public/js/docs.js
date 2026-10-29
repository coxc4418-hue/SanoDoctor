// Sano Doctor — Documentos médicos imprimibles con QR de verificación
import { store, SEX, APPT_TYPES } from './store.js';
import { esc, fmtDate, fmtDateTime, fmtTime, printHTML, addDays, fromKey } from './utils.js';
import { issueDocument, verifyUrl } from './ops.js';
import { qrDataURL, PRINT_HEAD } from './shared.js';
import { ageText, bmi, VITALS } from './clinical.js';

// ======================================================================
// CANTIDAD DEL RÉCIPE: "1 tableta cada 8 horas por 7 días" → 21
// ======================================================================
const FRACTIONS = { '½': 0.5, '1/2': 0.5, '¼': 0.25, '1/4': 0.25, '¾': 0.75 };
export function rxQty(r) {
  const dose = String(r.dose || '').toLowerCase();
  const fr = String(r.frequency || '').toLowerCase();
  const du = String(r.duration || '').toLowerCase();
  if (!/(tableta|cápsula|capsula|comprimido|sobre|óvulo|ovulo|ampolla|parche|gragea|tab|cáps)/.test(dose + ' ' + String(r.presentation || '').toLowerCase())) return '';
  let units = null;
  for (const [k, v] of Object.entries(FRACTIONS)) if (dose.startsWith(k)) units = v;
  if (units == null) { const m = dose.match(/^(\d+(?:[.,]\d+)?)/); if (m) units = parseFloat(m[1].replace(',', '.')); }
  if (!units) return '';
  if (/dosis única|dosis unica/.test(fr)) return String(Math.ceil(units));
  let perDay = null;
  const h = fr.match(/cada\s+(\d+)\s*hora/); if (h) perDay = 24 / Number(h[1]);
  if (perDay == null && /(una vez al d|en la mañana|en la noche|en ayunas|al acostarse|diaria)/.test(fr)) perDay = 1;
  if (perDay == null && /(cada comida|con almuerzo y cena)/.test(fr)) perDay = /almuerzo y cena/.test(fr) ? 2 : 3;
  if (perDay == null && /semana/.test(fr)) perDay = 1 / 7;
  if (perDay == null) return '';
  let days = null;
  const d = du.match(/(\d+)\s*d[ií]a/); if (d) days = Number(d[1]);
  const w = du.match(/(\d+)\s*semana/); if (w) days = Number(w[1]) * 7;
  const mo = du.match(/(\d+)\s*mes/); if (mo) days = Number(mo[1]) * 30;
  if (!days) return '';
  return String(Math.ceil(units * perDay * days));
}

// ======================================================================
// ENCABEZADOS
// ======================================================================
const docOf = (c) => store.doctor(c?.doctorId) || store.mainDoctor || {};
const drName = (d) => d.name ? (/^(dr|dra)\.?\s/i.test(d.name) ? d.name : `${d.sex === 'F' ? 'Dra.' : 'Dr.'} ${d.name}`) : 'Médico tratante';

function doctorHead(d, compact = false) {
  const s = store.settings;
  return `<div class="dh">
    <div class="dh-l">
      <div class="dh-n">${esc(drName(d))}</div>
      <div class="dh-s">${esc(d.specialty || 'Médico cirujano')}${d.university ? ' · ' + esc(d.university) : ''}</div>
      <div class="dh-r">${[d.idDoc && 'C.I. ' + esc(d.idDoc), d.mpps && 'MPPS ' + esc(d.mpps), d.cmv && 'C.M. ' + esc(d.cmv)].filter(Boolean).join(' · ')}</div>
    </div>
    ${compact ? '' : `<div class="dh-c"><b>${esc(store.businessName)}</b>${s.rif ? `<span>RIF ${esc(s.rif)}</span>` : ''}${s.address ? `<span>${esc(s.address)}</span>` : ''}<span>${[s.phone && 'Tel. ' + esc(s.phone), s.email && esc(s.email)].filter(Boolean).join(' · ')}</span></div>`}
  </div>`;
}
function patientLine(c, extra = '') {
  return `<div class="pl"><div><span>Paciente:</span> <b>${esc(c.patientName)}</b></div><div><span>C.I.:</span> ${esc(c.patientIdDoc || '—')}</div><div><span>Edad:</span> ${esc(ageText(c.patientBirth) || (c.age != null ? c.age + ' años' : '—'))}</div><div><span>Fecha:</span> ${fmtDate(c.closedAt || c.startedAt || new Date().toISOString())}</div>${extra}</div>`;
}
function signBlock(d, qr, code) {
  return `<div class="sg">
    ${qr ? `<div class="qr"><img src="${qr}"><div>Verifique este documento<br><b>${esc(code)}</b></div></div>` : '<div></div>'}
    <div class="sg-l">${d.signature ? `<img src="${d.signature}" class="sig">` : '<div style="height:46px"></div>'}<div class="sg-line">${esc(drName(d))}</div><div class="sg-sub">${[d.mpps && 'MPPS ' + esc(d.mpps), d.cmv && 'C.M. ' + esc(d.cmv)].filter(Boolean).join(' · ') || 'Firma y sello'}</div></div>
  </div>`;
}
const BASE_CSS = `
  * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #10212a; margin: 0; font-size: 12.5px; }
  .dh { display: flex; justify-content: space-between; gap: 18px; border-bottom: 3px solid #0d9488; padding-bottom: 8px; }
  .dh-n { font-size: 18px; font-weight: 800; color: #0f3d4a; } .dh-s { font-weight: 700; color: #0d9488; font-size: 12px; } .dh-r { font-size: 11px; color: #4a5d66; margin-top: 2px; }
  .dh-c { text-align: right; display: flex; flex-direction: column; font-size: 10.5px; color: #4a5d66; } .dh-c b { color: #0f3d4a; font-size: 12px; }
  .pl { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 7px 0; border-bottom: 1px solid #d5e3e6; font-size: 11.5px; } .pl span { color: #5a6d75; }
  h1 { font-size: 16px; text-align: center; letter-spacing: .14em; color: #0f3d4a; margin: 16px 0 10px; }
  h3 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #0d9488; margin: 12px 0 4px; border-bottom: 1px solid #d5e3e6; padding-bottom: 2px; }
  .txt { line-height: 1.6; text-align: justify; font-size: 13px; } .pre { white-space: pre-wrap; }
  .sg { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 18px; }
  .sg-l { text-align: center; min-width: 210px; } .sig { max-height: 62px; max-width: 200px; display: block; margin: 0 auto -6px; }
  .sg-line { border-top: 1px solid #000; padding-top: 3px; font-weight: 700; font-size: 11.5px; } .sg-sub { font-size: 10px; color: #4a5d66; }
  .qr { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #4a5d66; line-height: 1.3; } .qr img { width: 70px; height: 70px; }
  .foot { font-size: 9px; color: #6b7d85; text-align: center; margin-top: 10px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 11.5px; } table.t th { background: #0d9488; color: #fff; text-align: left; padding: 4px 6px; } table.t td { padding: 4px 6px; border-bottom: 1px solid #e1ecee; vertical-align: top; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; font-size: 12px; } .grid span { color: #5a6d75; }
  .chips span { display: inline-block; border: 1px solid #c9dade; border-radius: 99px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
  .alert { border: 1.5px solid #dc2626; color: #b91c1c; border-radius: 6px; padding: 4px 8px; font-weight: 700; font-size: 11.5px; margin-top: 6px; }`;

function page(title, body, { landscape = false, margin = '10mm' } = {}) {
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>${esc(title)}</title><style>@page { size: letter ${landscape ? 'landscape' : 'portrait'}; margin: ${margin}; }${BASE_CSS}</style></head><body>${body}</body></html>`);
}
async function codeAndQr(c, kind, summary) {
  const code = await issueDocument(c, kind, summary);
  return { code, qr: await qrDataURL(verifyUrl(code), 3) };
}

// ======================================================================
// RÉCIPE E INDICACIONES
// ======================================================================
export async function printRecipe(c) {
  const d = docOf(c);
  const rx = (c.rx || []).filter((r) => r.name);
  if (!rx.length) throw new Error('El récipe está vacío.');
  const { code, qr } = await codeAndQr(c, 'recipe', `${rx.length} medicamento(s): ${rx.map((r) => r.name).join(', ')}`.slice(0, 200));
  const note = store.settings.rxNote || '';
  const rxList = rx.map((r, i) => `<div class="rx"><b>${i + 1}.</b> <b>${esc(r.name)}</b> ${esc(r.presentation || '')}${r.qty || rxQty(r) ? ` <span class="q">#${esc(r.qty || rxQty(r))}</span>` : ''}</div>`).join('');
  const indList = rx.map((r, i) => `<div class="rx"><b>${i + 1}. ${esc(r.name)}</b><div>${esc([r.dose, r.frequency, r.duration && `por ${r.duration}`].filter(Boolean).join(', '))}${r.route && r.route !== 'Oral' ? ` · vía ${esc(r.route.toLowerCase())}` : ''}${r.note ? `. ${esc(r.note)}` : ''}</div></div>`).join('');
  const extra = c.indications ? `<div class="ind pre">${esc(c.indications)}</div>` : '';
  const next = c.nextVisit?.date ? `<div class="nv">Próximo control: <b>${fmtDate(c.nextVisit.date)}${c.nextVisit.time ? ' · ' + esc(c.nextVisit.time) : ''}</b></div>` : '';
  const allergy = c.allergies?.length ? `<div class="alert">Alérgico(a) a: ${esc(c.allergies.join(', '))}</div>` : '';
  const halfCSS = `.half { display: flex; flex-direction: column; } .rxh { font-size: 26px; font-weight: 800; color: #0d9488; font-family: Georgia, serif; margin: 10px 0 4px; }
    .rx { margin: 7px 0; line-height: 1.45; font-size: 13px; } .q { font-weight: 800; color: #0f3d4a; } .ind { margin-top: 8px; font-size: 12.5px; line-height: 1.5; } .nv { margin-top: 10px; font-size: 12px; }
    .grow { flex: 1; } .note { font-size: 9.5px; color: #4a5d66; border-top: 1px dashed #b6c9ce; padding-top: 4px; margin-top: 8px; }`;
  const half = (title, list, after = '') => `<div class="half">${doctorHead(d, true)}${patientLine(c)}${allergy}<div class="rxh">${title}</div><div class="grow">${list}${after}</div>${signBlock(d, qr, code)}<div class="note">${esc(note)} · ${esc(store.businessName)}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div></div>`;
  if ((store.settings.rxFormat || 'media') === 'media') {
    printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Récipe ${esc(c.number)}</title><style>@page { size: letter landscape; margin: 8mm; }${BASE_CSS}${halfCSS}
      .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 0; height: 190mm; } .sheet > .half { padding: 0 9mm; } .sheet > .half + .half { border-left: 1px dashed #8aa4ab; }</style></head><body>
      <div class="sheet">${half('Rp/', rxList)}${half('Indicaciones', indList, extra + next)}</div></body></html>`);
  } else {
    printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Récipe ${esc(c.number)}</title><style>@page { size: letter portrait; margin: 10mm; }${BASE_CSS}${halfCSS}
      .half { min-height: 125mm; } .half + .half { border-top: 1px dashed #8aa4ab; margin-top: 8mm; padding-top: 6mm; }</style></head><body>
      ${half('Rp/', rxList)}${half('Indicaciones', indList, extra + next)}</body></html>`);
  }
  return code;
}

// ======================================================================
// ORDEN DE EXÁMENES
// ======================================================================
export async function printLabOrder(c) {
  const d = docOf(c);
  const labs = c.labs || []; const img = c.imaging || [];
  if (!labs.length && !img.length) throw new Error('No hay exámenes indicados.');
  const { code, qr } = await codeAndQr(c, 'labs', `${labs.length} de laboratorio, ${img.length} de imagen`);
  const dx = (c.diagnoses || []).map((x) => `${x.code} ${x.name}`).join('; ');
  page(`Orden de exámenes ${c.number}`, `${doctorHead(d)}${patientLine(c)}
    <h1>ORDEN DE EXÁMENES</h1>
    ${labs.length ? `<h3>Laboratorio</h3><div class="grid">${labs.map((l) => `<div>☐ ${esc(l)}</div>`).join('')}</div>` : ''}
    ${img.length ? `<h3>Estudios de imagen y especiales</h3><div class="grid">${img.map((l) => `<div>☐ ${esc(l)}</div>`).join('')}</div>` : ''}
    ${dx ? `<h3>Diagnóstico presuntivo</h3><div>${esc(dx)}</div>` : ''}
    ${c.labNote ? `<h3>Indicaciones</h3><div class="pre">${esc(c.labNote)}</div>` : ''}
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Doctor</div>`);
  return code;
}

// ======================================================================
// REPOSO, CONSTANCIAS Y CERTIFICADO
// ======================================================================
export async function printRest(c, { days, from, includeDx = true }) {
  const d = docOf(c);
  const n = Math.max(1, Number(days) || 1);
  const start = from || new Date().toISOString().slice(0, 10);
  const end = addDays(fromKey(start), n - 1).toISOString().slice(0, 10);
  const { code, qr } = await codeAndQr(c, 'rest', `Reposo médico de ${n} día(s), del ${fmtDate(start)} al ${fmtDate(end)}`);
  const dx = (c.diagnoses || []).map((x) => `${x.name} (${x.code})`).join(', ');
  page(`Reposo ${c.number}`, `${doctorHead(d)}
    <h1>CONSTANCIA DE REPOSO MÉDICO</h1>
    <p class="txt">Quien suscribe, <b>${esc(drName(d))}</b>${d.mpps ? `, MPPS ${esc(d.mpps)}` : ''}${d.cmv ? `, C.M. ${esc(d.cmv)}` : ''}, hace constar que el(la) paciente <b>${esc(c.patientName)}</b>, titular de la cédula de identidad <b>${esc(c.patientIdDoc || '—')}</b>, de ${esc(ageText(c.patientBirth) || '—')} de edad, fue evaluado(a) en consulta médica el día ${fmtDate(c.startedAt)}${includeDx && dx ? `, con diagnóstico de <b>${esc(dx)}</b>` : ''}, por lo cual amerita <b>REPOSO MÉDICO por ${n} (${numWords(n)}) día(s)</b>, desde el <b>${fmtDate(start)}</b> hasta el <b>${fmtDate(end)}</b>, ambos inclusive, debiendo reintegrarse a sus actividades el día <b>${fmtDate(addDays(fromKey(end), 1).toISOString().slice(0, 10))}</b>, salvo nueva evaluación.</p>
    <p class="txt">Constancia que se expide a petición de la parte interesada en ${esc(cityOf())}, a los ${expDate()}.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)}${store.settings.address ? ' · ' + esc(store.settings.address) : ''}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div>`);
  return code;
}

export async function printAttendance(c, { companion = '' } = {}) {
  const d = docOf(c);
  const { code, qr } = await codeAndQr(c, 'attendance', `Asistencia a consulta el ${fmtDate(c.startedAt)} de ${fmtTime(c.startedAt)} a ${fmtTime(c.closedAt || new Date().toISOString())}`);
  page(`Constancia ${c.number}`, `${doctorHead(d)}
    <h1>CONSTANCIA DE ASISTENCIA</h1>
    <p class="txt">Quien suscribe, <b>${esc(drName(d))}</b>, hace constar que el(la) ciudadano(a) <b>${esc(c.patientName)}</b>, cédula de identidad <b>${esc(c.patientIdDoc || '—')}</b>, asistió a consulta médica en <b>${esc(store.businessName)}</b> el día <b>${fmtDate(c.startedAt)}</b>, desde las <b>${fmtTime(c.startedAt)}</b> hasta las <b>${fmtTime(c.closedAt || new Date().toISOString())}</b>${companion ? `, acompañado(a) por <b>${esc(companion)}</b>` : ''}.</p>
    <p class="txt">Constancia que se expide a petición de la parte interesada en ${esc(cityOf())}, a los ${expDate()}.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Doctor</div>`);
  return code;
}

export async function printHealth(c, { purpose = 'fines laborales' } = {}) {
  const d = docOf(c);
  const v = c.vitals || {};
  const b = bmi(v);
  const { code, qr } = await codeAndQr(c, 'health', `Certificado de salud para ${purpose}`);
  page(`Certificado ${c.number}`, `${doctorHead(d)}
    <h1>CERTIFICADO DE SALUD</h1>
    <p class="txt">Quien suscribe, <b>${esc(drName(d))}</b>${d.mpps ? `, MPPS ${esc(d.mpps)}` : ''}, certifica haber examinado el día ${fmtDate(c.startedAt)} al(la) ciudadano(a) <b>${esc(c.patientName)}</b>, cédula de identidad <b>${esc(c.patientIdDoc || '—')}</b>, de ${esc(ageText(c.patientBirth) || '—')} de edad, encontrándolo(a) en <b>BUENAS CONDICIONES DE SALUD</b> al momento del examen, sin evidencia clínica de enfermedad infectocontagiosa, por lo que se considera <b>APTO(A)</b> para ${esc(purpose)}.</p>
    <h3>Examen</h3><div class="grid">${[['TA', v.ta && v.ta + ' mmHg'], ['FC', v.fc && v.fc + ' lpm'], ['Temperatura', v.temp && v.temp + ' °C'], ['Peso', v.peso && v.peso + ' kg'], ['Talla', v.talla && v.talla + ' cm'], ['IMC', b && `${b.value} (${b.label})`]].filter(([, x]) => x).map(([k, x]) => `<div><span>${k}:</span> ${esc(x)}</div>`).join('') || '<div>—</div>'}</div>
    ${c.patientBlood ? `<p>Grupo sanguíneo: <b>${esc(c.patientBlood)}</b></p>` : ''}
    <p class="txt">Certificado que se expide a petición de la parte interesada en ${esc(cityOf())}, a los ${expDate()}. Válido por seis (6) meses.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Sano Doctor</div>`);
  return code;
}

// ======================================================================
// INFORME MÉDICO Y REFERENCIA
// ======================================================================
function vitalsLine(v = {}) {
  const b = bmi(v);
  const parts = VITALS.filter(([k]) => String(v[k] || '').trim()).map(([k, l, u]) => `${l}: ${esc(v[k])} ${u}`);
  if (b) parts.push(`IMC: ${b.value} (${b.label})`);
  return parts.join(' · ') || 'No registrados';
}
export async function printReport(c, patient = null) {
  const d = docOf(c);
  const p = patient || store.patient(c.patientId) || {};
  const { code, qr } = await codeAndQr(c, 'report', `Informe médico de la consulta ${c.number}`);
  const sec = (t, v) => v ? `<h3>${t}</h3><div class="pre txt" style="font-size:12.5px">${esc(v)}</div>` : '';
  page(`Informe ${c.number}`, `${doctorHead(d)}${patientLine(c, `<div><span>Sexo:</span> ${esc(SEX[c.patientSex] || '—')}</div><div><span>HC:</span> ${esc(c.patientNumber || '—')}</div>`)}
    <h1>INFORME MÉDICO</h1>
    ${sec('Motivo de consulta', c.reason)}${sec('Enfermedad actual', c.illness)}
    ${p.chronic?.length || p.personalHistory || p.surgicalHistory || p.allergies?.length ? `<h3>Antecedentes</h3><div class="txt" style="font-size:12.5px">${[p.chronic?.length && 'Patológicos: ' + esc(p.chronic.join(', ')), p.personalHistory && esc(p.personalHistory), p.surgicalHistory && 'Quirúrgicos: ' + esc(p.surgicalHistory), p.allergies?.length && '<b>Alergias: ' + esc(p.allergies.join(', ')) + '</b>', p.currentMeds && 'Medicación habitual: ' + esc(p.currentMeds)].filter(Boolean).join('<br>')}</div>` : ''}
    <h3>Signos vitales</h3><div style="font-size:12px">${vitalsLine(c.vitals)}</div>
    ${sec('Examen físico', c.exam)}
    ${c.diagnoses?.length ? `<h3>Impresión diagnóstica</h3><div>${c.diagnoses.map((x, i) => `${i + 1}. ${esc(x.name)} <span style="color:#5a6d75">(CIE-10 ${esc(x.code)})</span>${x.note ? ' — ' + esc(x.note) : ''}`).join('<br>')}</div>` : ''}
    ${c.rx?.length ? `<h3>Tratamiento indicado</h3><div>${c.rx.map((r) => `• ${esc(r.name)} ${esc(r.presentation || '')}: ${esc([r.dose, r.frequency, r.duration && 'por ' + r.duration].filter(Boolean).join(', '))}`).join('<br>')}</div>` : ''}
    ${sec('Plan', c.plan)}
    ${c.labs?.length || c.imaging?.length ? `<h3>Exámenes solicitados</h3><div>${esc([...(c.labs || []), ...(c.imaging || [])].join(', '))}</div>` : ''}
    ${c.nextVisit?.date ? `<p>Próximo control: <b>${fmtDate(c.nextVisit.date)}</b></p>` : ''}
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)} · Informe generado con Sano Doctor</div>`);
  return code;
}

export async function printReferral(c) {
  const d = docOf(c);
  const r = c.referral || {};
  if (!r.to) throw new Error('Indica la especialidad o el médico al que refieres.');
  const { code, qr } = await codeAndQr(c, 'referral', `Referencia a ${r.to}`);
  page(`Referencia ${c.number}`, `${doctorHead(d)}${patientLine(c)}
    <h1>REFERENCIA MÉDICA</h1>
    <p class="txt">Estimado(a) colega de <b>${esc(r.to)}</b>${r.doctor ? ` (${esc(r.doctor)})` : ''}:</p>
    <p class="txt">Por medio de la presente le refiero al(la) paciente <b>${esc(c.patientName)}</b>, de ${esc(ageText(c.patientBirth) || '—')} de edad, ${r.priority === 'urgente' ? '<b>con carácter URGENTE</b>, ' : ''}para su evaluación y conducta${r.reason ? ` por: <b>${esc(r.reason)}</b>` : ''}.</p>
    ${c.reason ? `<h3>Motivo de consulta</h3><div class="pre">${esc(c.reason)}${c.illness ? '\n' + esc(c.illness) : ''}</div>` : ''}
    <h3>Signos vitales</h3><div style="font-size:12px">${vitalsLine(c.vitals)}</div>
    ${c.diagnoses?.length ? `<h3>Impresión diagnóstica</h3><div>${c.diagnoses.map((x) => `${esc(x.name)} (${esc(x.code)})`).join('<br>')}</div>` : ''}
    ${c.rx?.length ? `<h3>Tratamiento actual</h3><div>${c.rx.map((x) => `• ${esc(x.name)} ${esc(x.presentation || '')}`).join('<br>')}</div>` : ''}
    ${c.allergies?.length ? `<div class="alert">Alergias: ${esc(c.allergies.join(', '))}</div>` : ''}
    <p class="txt">Agradeciendo de antemano su atención y quedando a la espera de su contrarreferencia.</p>
    ${signBlock(d, qr, code)}<div class="foot">${esc(store.businessName)}${store.settings.phone ? ' · Tel. ' + esc(store.settings.phone) : ''}</div>`);
  return code;
}

// ======================================================================
// HISTORIA CLÍNICA COMPLETA
// ======================================================================
export function printHistory(p, consults = []) {
  const d = store.mainDoctor || {};
  const list = consults.filter((c) => c.status === 'cerrada');
  page(`Historia ${p.number || ''} ${p.name}`, `${doctorHead(d)}
    <h1>HISTORIA CLÍNICA</h1>
    <div class="grid">
      <div><span>Paciente:</span> <b>${esc(p.name)}</b></div><div><span>N° historia:</span> ${esc(p.number || '—')}</div>
      <div><span>C.I.:</span> ${esc(p.idDoc || '—')}</div><div><span>Nacimiento:</span> ${p.birthDate ? fmtDate(p.birthDate) + ' (' + esc(ageText(p.birthDate)) + ')' : '—'}</div>
      <div><span>Sexo:</span> ${esc(SEX[p.sex] || '—')}</div><div><span>Grupo sanguíneo:</span> ${esc(p.bloodType || '—')}</div>
      <div><span>Teléfono:</span> ${esc(p.phone || '—')}</div><div><span>Ocupación:</span> ${esc(p.occupation || '—')}</div>
      <div><span>Dirección:</span> ${esc(p.address || '—')}</div><div><span>Seguro:</span> ${esc(p.insurance || '—')}${p.insuranceNumber ? ' · ' + esc(p.insuranceNumber) : ''}</div>
      <div><span>Contacto de emergencia:</span> ${esc(p.emergencyName || '—')} ${esc(p.emergencyPhone || '')}</div><div><span>Paciente desde:</span> ${fmtDate(p.createdAt)}</div>
    </div>
    ${p.allergies?.length ? `<div class="alert">ALERGIAS: ${esc(p.allergies.join(', '))}${p.allergyNote ? ' — ' + esc(p.allergyNote) : ''}</div>` : ''}
    <h3>Antecedentes</h3>
    <div class="grid" style="grid-template-columns:1fr">
      <div><span>Patológicos:</span> ${esc((p.chronic || []).join(', ') || 'Niega')}${p.personalHistory ? '. ' + esc(p.personalHistory) : ''}</div>
      <div><span>Quirúrgicos:</span> ${esc(p.surgicalHistory || 'Niega')}</div>
      <div><span>Familiares:</span> ${esc(p.familyHistory || 'No refiere')}</div>
      <div><span>Medicación habitual:</span> ${esc(p.currentMeds || 'Ninguna')}</div>
      <div><span>Hábitos:</span> ${esc(habitsText(p.habits) || 'No refiere')}</div>
      ${p.sex === 'F' && p.gynecoHistory ? `<div><span>Gineco-obstétricos:</span> ${esc(p.gynecoHistory)}</div>` : ''}
      ${p.vaccines ? `<div><span>Inmunizaciones:</span> ${esc(p.vaccines)}</div>` : ''}
    </div>
    <h3>Consultas (${list.length})</h3>
    ${list.length ? `<table class="t"><thead><tr><th style="width:90px">Fecha</th><th>Motivo / diagnóstico</th><th>Tratamiento</th></tr></thead><tbody>${list.map((c) => `<tr><td>${fmtDate(c.startedAt)}<div style="color:#5a6d75;font-size:10px">${esc(c.number)} · ${esc(APPT_TYPES[c.type]?.label || '')}</div></td><td><b>${esc(c.reason || '')}</b>${c.diagnoses?.length ? '<br>' + c.diagnoses.map((x) => esc(`${x.code} ${x.name}`)).join('<br>') : ''}<div style="color:#5a6d75;font-size:10.5px">${vitalsLine(c.vitals)}</div></td><td>${(c.rx || []).map((r) => esc(`${r.name} ${r.presentation || ''}`)).join('<br>') || '—'}${c.plan ? `<div style="font-size:10.5px">${esc(c.plan)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p>Sin consultas registradas.</p>'}
    <div class="foot">Documento confidencial · ${esc(store.businessName)} · Generado ${fmtDateTime(new Date().toISOString())} con Sano Doctor</div>`);
}

export function habitsText(h = {}) {
  if (!h || typeof h !== 'object') return '';
  return [h.tabaco && `Tabaco: ${h.tabaco}`, h.alcohol && `Alcohol: ${h.alcohol}`, h.ejercicio && `Actividad física: ${h.ejercicio}`, h.drogas && `Otras sustancias: ${h.drogas}`, h.dieta && `Alimentación: ${h.dieta}`, h.sueno && `Sueño: ${h.sueno}`].filter(Boolean).join(' · ');
}
function cityOf() { const a = store.settings.address || ''; const parts = a.split(',').map((x) => x.trim()).filter(Boolean); return parts[parts.length - 1] || 'Venezuela'; }
/** «29 días del mes de octubre de 2026» (fórmula de constancias y certificados) */
function expDate(d = new Date()) { const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; const n = d.getDate(); return `${n} ${n === 1 ? 'día' : 'días'} del mes de ${M[d.getMonth()]} de ${d.getFullYear()}`; }
function numWords(n) {
  const w = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'];
  return w[n] || String(n);
}
