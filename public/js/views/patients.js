// Sano Doctor — Lista de pacientes
import { store, SEX } from '../store.js';
import { savePatient, findByIdDoc } from '../ops.js';
import { esc, emptyState, fmtDate, fmtAgo, normalize, todayKey, download, toCSV, parseCSV, toast, openModal, setBusy } from '../utils.js';
import { icon } from '../icons.js';
import { ageOf, ageText } from '../clinical.js';
import { openPatient, openPatientForm, patientAvatar, isBirthday, waMenu } from '../patient.js';
import { requirePin } from '../auth.js';

const FILTERS = [
  ['all', 'Todos'], ['upcoming', 'Con cita próxima'], ['chronic', 'Crónicos'], ['allergy', 'Con alergias'],
  ['overdue', 'Control vencido'], ['month', 'Cumpleañeros del mes'], ['new', 'Nuevos (30 días)'], ['archived', 'Archivados']
];
let state = { q: '', filter: 'all', sort: 'name', limit: 60 };

export function mount(el) {
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Pacientes</h1><p class="view-sub" id="pt-sub"></p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="pt-export">${icon('download')}<span class="hide-sm"> Exportar</span></button><button class="btn btn-secondary" id="pt-import">${icon('upload')}<span class="hide-sm"> Importar</span></button><button class="btn btn-primary" id="pt-new">${icon('userPlus')} Nuevo paciente</button></div></div>
    <div class="card card-flush">
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input id="pt-q" placeholder="Nombre, cédula, teléfono o N° de historia…" value="${esc(state.q)}" autocomplete="off"></label>
        <select class="select select-sm" id="pt-sort" style="width:auto"><option value="name">A → Z</option><option value="recent">Última visita</option><option value="visits">Más consultas</option><option value="created">Más recientes</option></select>
      </div>
      <div class="chips" id="pt-filters" style="padding:0 14px 12px">${FILTERS.map(([k, l]) => `<button class="chip" data-f="${k}">${l}</button>`).join('')}</div>
      <div id="pt-list"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  $('#pt-sort').value = state.sort;

  function filtered() {
    const today = todayKey();
    const month = today.slice(5, 7);
    const upcoming = new Set(store.appointments.filter((a) => a.date >= today && ['programada', 'confirmada', 'espera'].includes(a.status)).map((a) => a.patientId));
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const qq = normalize(state.q);
    const digits = state.q.replace(/\D/g, '');
    let list = store.patients.filter((p) => (state.filter === 'archived' ? p.active === false : p.active !== false));
    if (state.filter === 'upcoming') list = list.filter((p) => upcoming.has(p.id));
    if (state.filter === 'chronic') list = list.filter((p) => p.chronic?.length);
    if (state.filter === 'allergy') list = list.filter((p) => p.allergies?.length);
    if (state.filter === 'overdue') list = list.filter((p) => p.nextVisitAt && p.nextVisitAt < today && !upcoming.has(p.id));
    if (state.filter === 'month') list = list.filter((p) => p.birthDate?.slice(5, 7) === month).sort((a, b) => a.birthDate.slice(8).localeCompare(b.birthDate.slice(8)));
    if (state.filter === 'new') list = list.filter((p) => (p.createdAt || '') >= since);
    if (qq) {
      list = list.filter((p) => normalize(`${p.name} ${p.number} ${p.email || ''}`).includes(qq)
        || (digits.length >= 3 && (`${p.idDoc || ''}`.replace(/\D/g, '').includes(digits) || `${p.phone || ''}${p.phone2 || ''}`.replace(/\D/g, '').includes(digits))));
    }
    const S = {
      name: (a, b) => (a.name || '').localeCompare(b.name || '', 'es'),
      recent: (a, b) => (b.lastVisitAt || '').localeCompare(a.lastVisitAt || ''),
      visits: (a, b) => (b.visits || 0) - (a.visits || 0),
      created: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
    };
    if (state.filter !== 'month') list = [...list].sort(S[state.sort]);
    return list;
  }

  function render() {
    el.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === state.filter));
    const list = filtered();
    const act = store.activePatients.length;
    $('#pt-sub').textContent = `${act} paciente(s) activos${state.q || state.filter !== 'all' ? ` · ${list.length} en la búsqueda` : ''}`;
    if (!list.length) {
      $('#pt-list').innerHTML = `<div style="padding:20px">${store.patients.length ? emptyState('search', 'Sin resultados', 'Prueba con otro nombre, cédula o filtro.') : emptyState('users', 'Aún no hay pacientes', 'Registra a tu primer paciente o impórtalos desde Excel (CSV).')}</div>`;
      return;
    }
    const shown = list.slice(0, state.limit);
    $('#pt-list').innerHTML = `<div class="table-wrap"><table class="table rt"><thead><tr><th>Paciente</th><th class="hide-sm">Edad / sexo</th><th class="hide-sm">Teléfono</th><th>Última visita</th><th class="hide-sm">Antecedentes</th><th class="r"></th></tr></thead><tbody>
      ${shown.map((p) => `<tr class="click" data-open="${p.id}">
        <td><div class="row" style="gap:10px;min-width:0">${patientAvatar(p)}<div style="min-width:0"><b class="ellipsis">${esc(p.name)}</b>${isBirthday(p) ? ' 🎂' : ''}<div class="t-sub">${esc(p.number || '')}${p.idDoc ? ' · C.I. ' + esc(p.idDoc) : ''}</div></div></div></td>
        <td class="hide-sm nowrap">${p.birthDate ? esc(ageText(p.birthDate)) : '—'}${p.sex ? ` · ${SEX[p.sex]?.[0] || ''}` : ''}</td>
        <td class="hide-sm nowrap">${esc(p.phone || '—')}</td>
        <td class="nowrap">${p.lastVisitAt ? `${fmtDate(p.lastVisitAt)}<div class="t-sub">${p.visits || 0} consulta(s)</div>` : '<span class="faint">Sin consultas</span>'}${p.nextVisitAt ? `<div class="t-sub ${p.nextVisitAt < todayKey() ? 'text-danger' : ''}">Control ${fmtDate(p.nextVisitAt)}</div>` : ''}</td>
        <td class="hide-sm">${(p.allergies || []).length ? `<span class="badge badge-danger">${icon('alert')} ${esc(p.allergies.slice(0, 2).join(', '))}</span> ` : ''}${(p.chronic || []).slice(0, 2).map((c) => `<span class="badge badge-neutral">${esc(c)}</span>`).join(' ')}</td>
        <td class="r nowrap">${p.phone ? `<button class="btn btn-ghost btn-icon btn-sm" data-wa="${p.id}" title="WhatsApp">${icon('whatsapp')}</button>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-appt="${p.id}" title="Agendar cita">${icon('calendar')}</button></td>
      </tr>`).join('')}
    </tbody></table></div>
    ${list.length > state.limit ? `<div class="center" style="padding:14px"><button class="btn btn-secondary" id="pt-more">Mostrar más (${list.length - state.limit})</button></div>` : ''}`;
    el.querySelectorAll('[data-open]').forEach((r) => r.onclick = (e) => { if (e.target.closest('button')) return; openPatient(r.dataset.open); });
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waMenu(store.patient(b.dataset.wa)));
    el.querySelectorAll('[data-appt]').forEach((b) => b.onclick = async () => { const { openApptForm } = await import('./agenda.js'); openApptForm({ patient: store.patient(b.dataset.appt) }); });
    const more = $('#pt-more'); if (more) more.onclick = () => { state.limit += 100; render(); };
  }

  let t;
  $('#pt-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; state.limit = 60; render(); }, 150); };
  $('#pt-sort').onchange = (e) => { state.sort = e.target.value; render(); };
  el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { state.filter = b.dataset.f; state.limit = 60; render(); });
  $('#pt-new').onclick = async () => { const p = await openPatientForm({ prefill: guessPrefill(state.q) }); if (p) openPatient(p.id); };
  $('#pt-export').onclick = async () => {
    if (!(await requirePin('Exportar pacientes'))) return;
    const rows = [['Historia', 'Nombre', 'Cédula', 'Nacimiento', 'Edad', 'Sexo', 'Teléfono', 'Correo', 'Dirección', 'Tipo de sangre', 'Alergias', 'Enfermedades crónicas', 'Consultas', 'Última visita', 'Próximo control']];
    filtered().forEach((p) => rows.push([p.number, p.name, p.idDoc, p.birthDate, ageOf(p.birthDate) ?? '', SEX[p.sex] || '', p.phone, p.email, p.address, p.bloodType, (p.allergies || []).join(', '), (p.chronic || []).join(', '), p.visits || 0, p.lastVisitAt ? fmtDate(p.lastVisitAt) : '', p.nextVisitAt ? fmtDate(p.nextVisitAt) : '']));
    download(`pacientes-${todayKey()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  $('#pt-import').onclick = openImport;
  render();
  setTimeout(() => $('#pt-q')?.focus(), 30);
  return store.on('*', (evt) => { if (evt === 'patients' || evt === 'appointments') render(); });
}

/** Si lo buscado parece cédula o teléfono, lo usa para el formulario nuevo */
function guessPrefill(q = '') {
  const s = q.trim();
  if (!s) return {};
  const d = s.replace(/\D/g, '');
  if (/^[VEJP]?-?\d{6,9}$/i.test(s.replace(/[.\s]/g, ''))) return { idDoc: s.replace(/[.\s]/g, '').toUpperCase() };
  if (d.length >= 10 && d.length === s.replace(/[\s+()-]/g, '').length) return { phone: s };
  return /\d/.test(s) ? {} : { name: s.replace(/\b\w/g, (c) => c.toUpperCase()) };
}

// ======================================================================
// IMPORTAR CSV
// ======================================================================
function openImport() {
  const m = openModal({
    title: 'Importar pacientes', sub: 'Desde Excel: guarda la hoja como CSV. La primera fila debe tener los títulos.', size: 'md',
    body: `<div class="stack">
      <p class="small muted" style="margin:0">Columnas reconocidas: <b>Nombre</b> (obligatoria), Cédula, Teléfono, Correo, Nacimiento (AAAA-MM-DD o DD/MM/AAAA), Sexo (F/M), Dirección, Sangre, Alergias, Crónicas. Los pacientes con una cédula ya registrada se omiten.</p>
      <input type="file" class="input" accept=".csv,text/csv" data-file>
      <div data-prev></div><div class="error-msg" data-err></div></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('upload')} Importar</button>`
  });
  const q = (s) => m.el.querySelector(s);
  let rows = [];
  const col = (h, ...names) => h.findIndex((x) => names.some((n) => normalize(x).includes(n)));
  const toDate = (v) => {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const mm = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    return mm ? `${mm[3]}-${mm[2].padStart(2, '0')}-${mm[1].padStart(2, '0')}` : '';
  };
  q('[data-file]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const data = parseCSV(await f.text()).filter((r) => r.some((c) => String(c).trim()));
    const h = data[0] || [];
    const ix = { name: col(h, 'nombre', 'paciente'), idDoc: col(h, 'cedula', 'ci', 'documento'), phone: col(h, 'telefono', 'celular', 'movil'), email: col(h, 'correo', 'email'), birth: col(h, 'nacimiento', 'fecha'), sex: col(h, 'sexo', 'genero'), address: col(h, 'direccion'), blood: col(h, 'sangre'), allergies: col(h, 'alergia'), chronic: col(h, 'cronic', 'antecedente') };
    if (ix.name < 0) { q('[data-err]').textContent = 'No se encontró la columna “Nombre”.'; return; }
    const split = (v) => String(v || '').split(/[,;/]/).map((x) => x.trim()).filter(Boolean);
    rows = data.slice(1).map((r) => ({
      name: String(r[ix.name] || '').trim(), idDoc: ix.idDoc >= 0 ? String(r[ix.idDoc] || '').trim().toUpperCase() : '', phone: ix.phone >= 0 ? String(r[ix.phone] || '').trim() : '',
      email: ix.email >= 0 ? String(r[ix.email] || '').trim() : '', birthDate: ix.birth >= 0 ? toDate(r[ix.birth]) : '',
      sex: ix.sex >= 0 ? (/^f/i.test(r[ix.sex]) ? 'F' : /^m/i.test(r[ix.sex]) ? 'M' : '') : '', address: ix.address >= 0 ? String(r[ix.address] || '').trim() : '',
      bloodType: ix.blood >= 0 ? String(r[ix.blood] || '').trim().toUpperCase() : '', allergies: ix.allergies >= 0 ? split(r[ix.allergies]) : [], chronic: ix.chronic >= 0 ? split(r[ix.chronic]) : []
    })).filter((r) => r.name.length >= 3);
    const dups = rows.filter((r) => r.idDoc && findByIdDoc(r.idDoc)).length;
    q('[data-prev]').innerHTML = `<div class="vital-alert ${rows.length ? '' : 'warning'}">${icon('users')} ${rows.length} paciente(s) en el archivo${dups ? ` · ${dups} ya registrados (se omiten)` : ''}.</div>`;
    q('[data-ok]').disabled = !(rows.length - dups);
  };
  q('[data-ok]').onclick = async (e) => {
    const btn = e.currentTarget; setBusy(btn, true, 'Importando…');
    let n = 0, skip = 0;
    const seen = new Set();
    for (const r of rows) {
      const key = r.idDoc.replace(/\W/g, '');
      if ((r.idDoc && findByIdDoc(r.idDoc)) || (key && seen.has(key))) { skip++; continue; }
      if (key) seen.add(key);
      try { await savePatient(r); n++; } catch (_) { skip++; }
    }
    m.close();
    toast(`${n} paciente(s) importados${skip ? ` · ${skip} omitidos` : ''}`);
  };
}
