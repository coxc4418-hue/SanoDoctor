// Sano Doctor — Búsqueda global (Ctrl + K): pacientes, citas, consultas e insumos
import { store, APPT_TYPES, apptBadge } from '../store.js';
import { openModal, esc, usd, normalize, debounce, qtyFmt, fmtDate } from '../utils.js';
import { icon } from '../icons.js';
import { patientAvatar, patientSub } from '../patient.js';

export function openSearch() {
  if (document.querySelector('.search-modal')) return;
  const m = openModal({
    size: 'lg',
    body: `<div class="search search-big">${icon('search')}<input data-q placeholder="Paciente, cédula, teléfono, N° de historia (HC-0012) o consulta (C-00045)…" autofocus autocomplete="off"><kbd>Esc</kbd></div><div data-res class="sres"></div>`
  });
  m.el.querySelector('.modal').classList.add('search-modal');
  const input = m.el.querySelector('[data-q]');
  const res = m.el.querySelector('[data-res]');
  let token = 0;

  async function run() {
    const raw = input.value.trim();
    const t = normalize(raw);
    const digits = raw.replace(/\D/g, '');
    const my = ++token;
    if (!t) { res.innerHTML = hint(); bind(); return; }
    const pts = store.patients.filter((p) => normalize(`${p.name} ${p.number} ${p.email || ''}`).includes(t)
      || (digits.length >= 3 && (`${p.idDoc || ''}`.replace(/\D/g, '').includes(digits) || `${p.phone || ''}`.replace(/\D/g, '').includes(digits)))).slice(0, 8);
    const appts = store.appointments.filter((a) => a.date >= fmtKey() && normalize(`${a.patientName} ${a.reason || ''}`).includes(t)).slice(0, 5);
    const cons = [...store.openConsults, ...store.pending].filter((c) => normalize(`${c.number} ${c.patientName}`).includes(t)).slice(0, 5);
    const prods = store.products.filter((p) => normalize(`${p.name} ${p.sku || ''} ${p.lot || ''}`).includes(t)).slice(0, 5);
    draw(pts, appts, cons, prods);
    // Consultas ya cerradas: búsqueda exacta por número
    const up = raw.toUpperCase().replace(/\s/g, '');
    let num = null;
    if (/^C-?\d+$/.test(up)) num = 'C-' + up.replace(/\D/g, '').padStart(5, '0');
    else if (/^\d{1,5}$/.test(up)) num = 'C-' + up.padStart(5, '0');
    if (!num) return;
    let found = [];
    try { found = await store.listEq('consultations', 'number', num); } catch (_) {}
    if (my !== token) return;
    const extra = found.filter((c) => !cons.some((x) => x.id === c.id));
    if (extra.length) draw(pts, appts, [...extra, ...cons], prods);
  }
  const fmtKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function draw(pts, appts, cons, prods) {
    res.innerHTML = (pts.length || appts.length || cons.length || prods.length) ? `
      ${pts.length ? `<div class="section-title">Pacientes</div>${pts.map((p) => `<button class="sitem" data-pt="${p.id}">${patientAvatar(p)}<span class="grow"><b>${esc(p.name)}${p.active === false ? ' <span class="badge badge-neutral">Archivado</span>' : ''}</b><small>${esc(patientSub(p))}${p.phone ? ' · ' + esc(p.phone) : ''}</small></span>${(p.allergies || []).length ? `<span class="badge badge-danger">${icon('alert')}</span>` : ''}${icon('arrowRight')}</button>`).join('')}` : ''}
      ${appts.length ? `<div class="section-title">Próximas citas</div>${appts.map((a) => `<button class="sitem" data-ap="${a.id}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon('calendar')}</span><span class="grow"><b>${esc(a.patientName)}</b><small>${fmtDate(a.date)} ${esc(a.time)} · ${esc(APPT_TYPES[a.type]?.label || '')}</small></span>${apptBadge(a.status)}</button>`).join('')}` : ''}
      ${cons.length ? `<div class="section-title">Consultas</div>${cons.map((c) => `<button class="sitem" data-c="${c.id}"><span class="kpi-icon tone-violet" style="width:36px;height:36px">${icon('stethoscope')}</span><span class="grow"><b>${esc(c.number)} · ${esc(c.patientName)}</b><small>${fmtDate(c.startedAt)} · ${c.status === 'abierta' ? 'En curso' : c.billing === 'pendiente' ? 'Por cobrar' : (c.diagnoses?.[0]?.name ? esc(c.diagnoses[0].name) : 'Cerrada')}</small></span>${icon('arrowRight')}</button>`).join('')}` : ''}
      ${prods.length ? `<div class="section-title">Insumos y medicinas</div>${prods.map((p) => `<button class="sitem" data-p="${p.id}"><span class="kpi-icon tone-info" style="width:36px;height:36px">${icon('box')}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.category || '')} · existencia ${qtyFmt(p.stock || 0)} · ${usd(p.price)}</small></span>${icon('arrowRight')}</button>`).join('')}` : ''}`
      : `<div class="empty">${icon('search')}<b>Sin resultados</b><span>Para consultas cerradas escribe el número exacto (ej. C-00045).</span></div>`;
    bind();
  }

  function hint() {
    const ids = [...new Set(store.patients.filter((p) => p.lastVisitAt).sort((a, b) => b.lastVisitAt.localeCompare(a.lastVisitAt)).slice(0, 6).map((p) => p.id))];
    return ids.length ? `<div class="section-title">Atendidos recientemente</div>${ids.map((id) => { const p = store.patient(id); return `<button class="sitem" data-pt="${p.id}">${patientAvatar(p)}<span class="grow"><b>${esc(p.name)}</b><small>Última visita ${fmtDate(p.lastVisitAt)}${p.lastDiagnoses?.[0] ? ' · ' + esc(p.lastDiagnoses[0]) : ''}</small></span>${icon('arrowRight')}</button>`; }).join('')}`
      : `<div class="empty">${icon('search')}<b>Busca en todo el consultorio</b><span>Pacientes, citas, consultas e insumos.</span></div>`;
  }

  function bind() {
    res.querySelectorAll('[data-pt]').forEach((b) => b.onclick = async () => { m.close(); (await import('../patient.js')).openPatient(b.dataset.pt); });
    res.querySelectorAll('[data-ap]').forEach((b) => b.onclick = async () => { m.close(); (await import('./agenda.js')).openApptDetail(store.appointment(b.dataset.ap)); });
    res.querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => { m.close(); (await import('../consult.js')).openConsultation(b.dataset.c); });
    res.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { m.close(); (await import('../main.js')).navigate('inventario', { params: { q: store.product(b.dataset.p)?.name || '' } }); });
  }

  input.oninput = debounce(run, 140);
  input.onkeydown = (e) => { if (e.key === 'Enter') { const first = res.querySelector('.sitem'); if (first) first.click(); } };
  res.innerHTML = hint(); bind();
}
