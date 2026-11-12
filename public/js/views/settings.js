// Sano Doctor — Configuración del consultorio
import { store, updateTenant, DEFAULT_RX_NOTE, DAYS } from '../store.js';
import { requirePin, changePassword, authErrorMessage, session } from '../auth.js';
import { esc, num, toast, parseNum, setBusy, toggleTheme, download, nowISO, round2, openModal, shortId, compressImage, confirmDialog, emptyState, bs, loc } from '../utils.js';
import { icon } from '../icons.js';
import { openRateModal, salesWa, SALES_PHONE_FMT } from '../shared.js';
import { isStandalone, bindInstallButtons } from '../install.js';
import { SPECIALTIES } from '../clinical.js';

const SECTIONS = { consultorio: 'Consultorio', medicos: 'Médicos', agenda: 'Horario de agenda', servicios: 'Servicios y precios', documentos: 'Documentos', seguridad: 'Seguridad', apps: 'Instalar y respaldo' };
const WEEK = [1, 2, 3, 4, 5, 0];

export function mount(el, { params = {} }) {
  let sec = SECTIONS[params.sec] ? params.sec : (store.activeDoctors.length ? 'consultorio' : 'medicos');
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Personaliza Sano Doctor para tu consultorio.</p></div></div>
    <div class="tabs">${Object.entries(SECTIONS).map(([k, v]) => `<button data-s="${k}">${v}</button>`).join('')}</div>
    <div id="s-body" style="max-width:900px"></div>`;
  const $ = (q) => el.querySelector(q);
  const s = () => store.settings;

  function render() {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#s-body');
    if (sec === 'consultorio') {
      body.innerHTML = `<form class="card stack" id="f-biz">
        <div class="form-grid">
          <div class="field full"><label>Nombre del consultorio o centro médico</label><input class="input" name="businessName" value="${esc(s().businessName || store.tenant?.name || '')}" placeholder="Ej.: Consultorio Médico Dra. Pérez"></div>
          <div class="field"><label>RIF</label><input class="input" name="rif" value="${esc(s().rif)}" placeholder="J-12345678-9 / V-12345678-0"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s().phone)}" placeholder="0414-1234567"></div>
          <div class="field"><label>WhatsApp del consultorio</label><input class="input" name="whatsapp" value="${esc(s().whatsapp || '')}" placeholder="0414-1234567"><span class="hint">Aparece en la verificación de documentos para que el paciente te escriba.</span></div>
          <div class="field"><label>Correo</label><input class="input" name="email" type="email" value="${esc(s().email || '')}"></div>
          <div class="field"><label>Instagram</label><input class="input" name="instagram" value="${esc(s().instagram)}" placeholder="@tuconsultorio"></div>
          <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s().address)}" placeholder="Centro Médico, piso, consultorio, ciudad"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div>
      </form>
      <div class="card mt-lg between row-wrap bs-only"><div><div class="bold">Tasa del día: ${bs(store.rate)} por $1</div><div class="small muted">${s().rateAuto !== false ? 'Se actualiza automáticamente con la tasa oficial BCV cada día.' : 'Tasa manual.'}</div></div><button class="btn btn-secondary" id="s-rate">${icon('refresh')} Cambiar tasa</button></div>
      <div class="card mt-lg between row-wrap"><div><div class="bold">Tema de la aplicación</div><div class="small muted">Claro u oscuro, según tu preferencia.</div></div><button class="btn btn-secondary" id="s-theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')} Cambiar tema</button></div>`;
      $('#f-biz').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        const patch = {}; for (const k of ['businessName', 'rif', 'phone', 'whatsapp', 'email', 'address', 'instagram']) patch[k] = F[k].value.trim();
        await store.saveSettings(patch);
        if (patch.businessName && patch.businessName !== store.tenant?.name && !store.isDemo) updateTenant(store.tenantId, { name: patch.businessName, updatedAt: nowISO() }).catch(() => {});
        toast('Datos del consultorio guardados');
      };
      $('#s-rate').onclick = openRateModal;
      $('#s-theme').onclick = (e) => { const n = toggleTheme(); e.currentTarget.innerHTML = `${icon(n === 'dark' ? 'sun' : 'moon')} Cambiar tema`; };
    }

    if (sec === 'medicos') {
      const list = s().doctors || [];
      body.innerHTML = `<div class="card stack">
        <div class="between row-wrap"><div><div class="card-title">${icon('stethoscope')} Médicos del consultorio</div><p class="small muted" style="margin:4px 0 0">Sus datos (MPPS, Colegio de Médicos y firma) se imprimen en récipes, reposos, constancias e informes.</p></div><button class="btn btn-primary" id="d-add">${icon('plus')} Agregar médico</button></div>
        ${list.length ? `<div class="list">${list.map((d) => `<div class="list-item" style="${d.active === false ? 'opacity:.55' : ''}"><span class="kpi-icon tone-brand">${icon('stethoscope')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(d.name)}</b><div class="t-sub">${esc(d.specialty || 'Medicina general')}${d.mpps ? ' · MPPS ' + esc(d.mpps) : ''}${d.cmv ? ' · C.M. ' + esc(d.cmv) : ''}${d.active === false ? ' · inactivo' : ''}</div></div>${d.signature ? '<span class="badge badge-success hide-sm">Firma</span>' : '<span class="badge badge-warning hide-sm">Sin firma</span>'}<button class="btn btn-secondary btn-sm" data-ed="${d.id}">${icon('edit')} Editar</button></div>`).join('')}</div>`
          : emptyState('stethoscope', 'Agrega al médico', 'Registra tu nombre, especialidad, MPPS y firma para que salgan en los documentos.')}
      </div>`;
      $('#d-add').onclick = () => doctorForm();
      body.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => doctorForm(list.find((d) => d.id === b.dataset.ed)));
    }

    if (sec === 'agenda') {
      const sch = s().schedule;
      body.innerHTML = `<form class="card stack" id="f-sch">
        <div class="card-title">${icon('calendar')} Horario de atención</div>
        <div class="field"><label>Días de consulta</label><div class="chips">${WEEK.map((d) => `<label class="chip ${sch.days.includes(d) ? 'on' : ''}"><input type="checkbox" name="d${d}" ${sch.days.includes(d) ? 'checked' : ''} hidden>${DAYS[d]}</label>`).join('')}</div></div>
        <div class="form-grid">
          <div class="field"><label>Desde</label><input class="input" type="time" name="start" value="${esc(sch.start)}"></div>
          <div class="field"><label>Hasta</label><input class="input" type="time" name="end" value="${esc(sch.end)}"></div>
          <div class="field"><label>Descanso desde (opcional)</label><input class="input" type="time" name="breakStart" value="${esc(sch.breakStart || '')}"></div>
          <div class="field"><label>Descanso hasta</label><input class="input" type="time" name="breakEnd" value="${esc(sch.breakEnd || '')}"></div>
          <div class="field"><label>Duración de cada turno</label><select class="select" name="slot">${[10, 15, 20, 30, 40, 45, 60].map((m) => `<option value="${m}" ${Number(sch.slot) === m ? 'selected' : ''}>${m} minutos</option>`).join('')}</select></div>
        </div>
        <label class="check box box-white"><span class="switch"><input type="checkbox" name="sat" ${sch.sat ? 'checked' : ''}><span></span></span><span><b>Atiende los sábados</b><br><small class="muted">Con su propio horario.</small></span></label>
        <div class="form-grid" data-satf ${sch.sat ? '' : 'hidden'}>
          <div class="field"><label>Sábado desde</label><input class="input" type="time" name="satStart" value="${esc(sch.satStart || '08:00')}"></div>
          <div class="field"><label>Sábado hasta</label><input class="input" type="time" name="satEnd" value="${esc(sch.satEnd || '12:00')}"></div>
        </div>
        <div class="error-msg" data-err></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar horario</button></div>
      </form>`;
      const F = $('#f-sch').elements;
      body.querySelectorAll('.chip input').forEach((c) => c.onchange = () => c.closest('.chip').classList.toggle('on', c.checked));
      F.sat.onchange = () => { body.querySelector('[data-satf]').hidden = !F.sat.checked; };
      $('#f-sch').onsubmit = async (e) => {
        e.preventDefault();
        const err = body.querySelector('[data-err]'); err.textContent = '';
        const days = WEEK.filter((d) => F['d' + d].checked);
        if (!days.length && !F.sat.checked) { err.textContent = 'Elige al menos un día de consulta.'; return; }
        if (F.start.value >= F.end.value) { err.textContent = 'La hora de cierre debe ser posterior a la de inicio.'; return; }
        if ((F.breakStart.value || F.breakEnd.value) && !(F.breakStart.value && F.breakEnd.value && F.breakStart.value < F.breakEnd.value)) { err.textContent = 'Revisa el horario del descanso.'; return; }
        if (F.sat.checked && F.satStart.value >= F.satEnd.value) { err.textContent = 'Revisa el horario del sábado.'; return; }
        await store.saveSettings({ schedule: { days, start: F.start.value, end: F.end.value, slot: Number(F.slot.value), breakStart: F.breakStart.value || '', breakEnd: F.breakEnd.value || '', sat: F.sat.checked, satStart: F.satStart.value, satEnd: F.satEnd.value } });
        toast('Horario guardado');
      };
    }

    if (sec === 'servicios') {
      const svcs = s().services || [];
      body.innerHTML = `<div class="stack">
        <div class="card stack"><div class="card-title">${icon('dollar')} Servicios y precios</div><p class="small muted" style="margin:0">La consulta se carga automáticamente según el tipo de cita (primera vez, control, emergencia…). Los demás servicios se agregan en la consulta o desde “Cobrar”. El precio se puede ajustar en cada cobro.</p>
          <div class="stack-sm" id="svc-list">${svcs.map((x, i) => `<div class="row"><input class="input" data-sn="${i}" value="${esc(x.name)}"><div class="input-group" style="width:130px;flex:none"><span class="prefix">${esc(loc().sym)}</span><input class="input" data-sp="${i}" inputmode="decimal" value="${num(x.price)}"></div><button class="btn btn-ghost btn-icon" data-srm="${i}" aria-label="Quitar">${icon('trash')}</button></div>`).join('')}</div>
          <div class="row row-wrap"><button class="btn btn-secondary" id="svc-add">${icon('plus')} Agregar servicio</button><span class="grow"></span><button class="btn btn-primary" id="svc-save">${icon('check')} Guardar servicios</button></div></div>
        ${listEditor('categories', 'Categorías de insumos y medicinas', 'Ej.: Antibióticos', s().categories || [])}
      </div>`;
      const read = () => svcs.map((x, i) => ({ name: body.querySelector(`[data-sn="${i}"]`).value.trim(), price: round2(parseNum(body.querySelector(`[data-sp="${i}"]`).value)) }));
      body.querySelectorAll('[data-srm]').forEach((b) => b.onclick = () => { const l = read(); l.splice(+b.dataset.srm, 1); store.settings.services = l; render(); });
      $('#svc-add').onclick = () => { store.settings.services = [...read(), { name: 'Nuevo servicio', price: 0 }]; render(); const ins = body.querySelectorAll('[data-sn]'); ins[ins.length - 1].select(); };
      $('#svc-save').onclick = async () => { const l = read().filter((x) => x.name); await store.saveSettings({ services: l }); toast('Servicios guardados'); render(); };
      bindList('categories');
    }

    if (sec === 'documentos') {
      body.innerHTML = `<form class="card stack" id="f-docs">
        <div class="form-grid">
          <div class="field"><label>Formato del récipe</label><select class="select" name="rxFormat">${[['media', 'Media carta doble (récipe | indicaciones)'], ['carta', 'Hoja carta completa']].map(([v, l]) => `<option value="${v}" ${s().rxFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Título del recibo de cobro</label><input class="input" name="docTitle" value="${esc(s().docTitle || 'RECIBO')}"><span class="hint">Ej.: RECIBO, NOTA DE COBRO, FACTURA.</span></div>
          <div class="field"><label>Formato del recibo</label><select class="select" name="receiptFormat">${[['80mm', 'Ticket 80 mm'], ['58mm', 'Ticket 58 mm'], ['carta', 'Hoja carta']].map(([v, l]) => `<option value="${v}" ${s().receiptFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>IVA incluido en los precios (%)</label><input class="input" name="iva" inputmode="decimal" value="${num(s().iva || 0, 0)}"><span class="hint">Solo se muestra desglosado. 0 para no mostrarlo.</span></div>
          <div class="field full"><label>Nota al pie del récipe</label><textarea class="textarea" name="rxNote" style="min-height:80px">${esc(s().rxNote || DEFAULT_RX_NOTE)}</textarea></div>
          <div class="field full"><label>Mensaje al pie del recibo</label><input class="input" name="receiptFooter" value="${esc(s().receiptFooter)}" placeholder="Ej.: Gracias por su confianza. ¡Que se mejore pronto!"></div>
        </div>
        <div class="box small">${icon('qr')} Cada récipe, orden de exámenes, reposo, constancia, certificado e informe lleva un <b>código QR</b> con el que cualquiera puede comprobar en línea que es auténtico. Puedes anular un documento desde la consulta.</div>
        <div class="row row-wrap" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" id="d-reset">Restaurar nota sugerida</button><button class="btn btn-primary">${icon('check')} Guardar</button></div>
      </form>`;
      $('#d-reset').onclick = () => { $('#f-docs').elements.rxNote.value = DEFAULT_RX_NOTE; };
      $('#f-docs').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ rxFormat: F.rxFormat.value, docTitle: F.docTitle.value.trim().toUpperCase() || 'RECIBO', receiptFormat: F.receiptFormat.value, iva: parseNum(F.iva.value), rxNote: F.rxNote.value.trim(), receiptFooter: F.receiptFooter.value.trim() });
        toast('Documentos guardados');
      };
    }

    if (sec === 'seguridad') {
      body.innerHTML = `<div class="grid-2">
        <form class="card stack" id="f-pin"><div class="card-title">${icon('lock')} PIN de administrador</div><p class="small muted" style="margin:0">Protege reportes, anulaciones, exoneraciones, exportar pacientes, mermas, gastos y cierre de caja.</p>
          <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <div class="field"><label>Repetir PIN</label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <button class="btn btn-primary">${icon('check')} Cambiar PIN</button></form>
        ${session.user?.isAnonymous ? `<div class="card stack"><div class="card-title">${icon('shield')} Contraseña</div><p class="muted" style="margin:0">En la demo no hay contraseña. Contrata Sano Doctor para tener tu propia cuenta.</p><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>`
          : `<form class="card stack" id="f-pass"><div class="card-title">${icon('shield')} Contraseña de acceso</div>
          <div class="field"><label>Contraseña actual</label><input class="input" name="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña (mínimo 8)</label><input class="input" name="next" type="password" autocomplete="new-password"></div>
          <div class="error-msg" data-err></div>
          <button class="btn btn-primary">${icon('check')} Cambiar contraseña</button></form>`}
      </div>
      <div class="box small mt-lg">${icon('shieldCheck')} La información clínica de tus pacientes solo es visible con tu usuario. Cada sede tiene sus datos completamente aislados.</div>`;
      $('#f-pin').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        if (store.isDemo) { toast('En la demo el PIN siempre es 1234.', 'info'); return; }
        if (!/^\d{4,12}$/.test(F.pin.value)) { toast('El PIN debe tener de 4 a 12 dígitos', 'warning'); return; }
        if (F.pin.value !== F.pin2.value) { toast('Los PIN no coinciden', 'warning'); return; }
        if (store.hasPin() && !(await requirePin('Cambiar el PIN'))) return;
        await store.setPin(F.pin.value); e.target.reset(); toast('PIN actualizado');
      };
      const fp = $('#f-pass');
      if (fp) fp.onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const err = fp.querySelector('[data-err]'); err.textContent = '';
        if (F.next.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
        const btn = fp.querySelector('button'); setBusy(btn, true);
        try { await changePassword(F.cur.value, F.next.value); e.target.reset(); toast('Contraseña actualizada'); }
        catch (ex) { err.textContent = authErrorMessage(ex); }
        setBusy(btn, false);
      };
    }

    if (sec === 'apps') {
      body.innerHTML = `<div class="grid-2">
        <div class="card stack"><div class="card-title">${icon('install')} Instalar la app</div>
          <p class="small muted" style="margin:0">Instala Sano Doctor desde el navegador en el teléfono, tablet o computadora del consultorio (médico y recepción). Es el mismo sistema, conectado en tiempo real, con su propio ícono y ventana.</p>
          ${isStandalone() ? `<div class="pay-status ok"><span>${icon('check')} Estás usando la app instalada</span><span></span></div>` : `<button class="btn btn-primary btn-lg" data-install>${icon('install')} Instalar en este equipo</button>`}
          <div class="list">
            <div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>Android</b><div class="t-sub">Chrome › menú ⋮ › Instalar app</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('laptop')}</span><div class="grow"><b>Computadora</b><div class="t-sub">Chrome o Edge › ícono de instalar en la barra de direcciones</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>iPhone / iPad</b><div class="t-sub">Safari › Compartir › Agregar a inicio</div></div></div>
          </div></div>
        <div class="card stack"><div class="card-title">${icon('download')} Respaldo de datos</div>
          <p class="small muted" style="margin:0">Descarga una copia de tus pacientes, citas, consultas, cobros, insumos y configuración (archivo JSON). Protegido con PIN.</p>
          <button class="btn btn-secondary" id="s-backup">${icon('download')} Descargar respaldo completo</button>
          <div class="divider"></div>
          <div class="card-title">${icon('whatsapp')} Soporte</div>
          <p class="small muted" style="margin:0">¿Dudas o sugerencias? Escríbenos.</p>
          <a class="btn btn-whatsapp" href="${salesWa('Hola, necesito soporte con Sano Doctor.')}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>
      </div>`;
      bindInstallButtons(body);
      $('#s-backup').onclick = async (e) => {
        const btn = e.currentTarget;
        if (!(await requirePin('Descargar el respaldo'))) return;
        setBusy(btn, true, 'Preparando…');
        try {
          const { getDocs } = await import('../firebase.js');
          const all = async (n) => (await getDocs(store.col(n))).docs.map((d) => ({ id: d.id, ...d.data() }));
          const [consultations, appointments, sales] = await Promise.all([all('consultations'), all('appointments'), all('sales')]);
          const data = { app: 'Sano Doctor', exportedAt: nowISO(), business: store.businessName, settings: { ...store.settings, doctors: store.settings.doctors.map(({ signature, ...d }) => d) }, patients: store.patients, appointments, consultations, sales, products: store.products };
          download(`respaldo-${(store.businessName || 'sano').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
          toast('Respaldo descargado');
        } catch (ex) { toast('No se pudo generar el respaldo: ' + ex.message, 'danger'); }
        setBusy(btn, false);
      };
    }
  }

  // ---------- Médicos ----------
  function doctorForm(d = null) {
    const isNew = !d;
    const doc = { id: shortId(8), name: '', sex: 'M', specialty: 'Medicina general', university: '', idDoc: '', mpps: '', cmv: '', phone: '', signature: '', active: true, ...(d || {}) };
    let signature = doc.signature || '';
    const m = openModal({
      title: isNew ? 'Agregar médico' : 'Editar médico', size: 'lg',
      body: `<form class="form-grid" data-f autocomplete="off">
        <div class="field full"><label>Nombre completo *</label><input class="input" name="name" value="${esc(doc.name)}" placeholder="Ej.: María Fernanda Pérez" autofocus><span class="hint">Se imprime como “Dr.” o “Dra.” según el sexo.</span></div>
        <div class="field"><label>Sexo</label><select class="select" name="sex"><option value="F" ${doc.sex === 'F' ? 'selected' : ''}>Femenino (Dra.)</option><option value="M" ${doc.sex !== 'F' ? 'selected' : ''}>Masculino (Dr.)</option></select></div>
        <div class="field"><label>Especialidad</label><input class="input" name="specialty" list="sp-list" value="${esc(doc.specialty)}"><datalist id="sp-list"><option>Medicina general</option><option>Médico cirujano</option><option>Medicina familiar</option><option>Medicina interna</option>${SPECIALTIES.map((x) => `<option>${esc(x)}</option>`).join('')}</datalist></div>
        <div class="field"><label>Cédula</label><input class="input" name="idDoc" value="${esc(doc.idDoc)}" placeholder="V-12345678"></div>
        <div class="field"><label>MPPS</label><input class="input" name="mpps" value="${esc(doc.mpps)}" placeholder="N° de registro"></div>
        <div class="field"><label>Colegio de Médicos (C.M.)</label><input class="input" name="cmv" value="${esc(doc.cmv)}" placeholder="N° de colegiatura"></div>
        <div class="field"><label>Universidad (opcional)</label><input class="input" name="university" value="${esc(doc.university)}" placeholder="Ej.: UCV"></div>
        <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(doc.phone)}"></div>
        <div class="field full"><label>Firma (imagen)</label>
          <div class="sig-box"></div>
          <div class="row row-wrap" style="gap:6px"><label class="btn btn-secondary btn-sm">${icon('image')} Subir firma<input type="file" accept="image/*" data-file hidden></label><button type="button" class="btn btn-ghost btn-sm" data-draw>${icon('edit')} Dibujar firma</button><button type="button" class="btn btn-ghost btn-sm" data-nosig>${icon('trash')} Quitar</button></div></div>
        ${isNew ? '' : `<label class="check box box-white full"><span class="switch"><input type="checkbox" name="active" ${doc.active !== false ? 'checked' : ''}><span></span></span><span><b>Activo</b><br><small class="muted">Los médicos inactivos no aparecen en la agenda.</small></span></label>`}
        <div class="error-msg full" data-err></div>
      </form>`,
      footer: `${isNew ? '' : `<button class="btn btn-danger-soft" data-del style="margin-right:auto">${icon('trash')} Eliminar</button>`}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    const q = (x) => m.el.querySelector(x);
    const F = q('[data-f]').elements;
    const showSig = () => { q('.sig-box').innerHTML = signature ? `<img src="${signature}" alt="Firma">` : '<span class="faint small">Sin firma. Toma una foto de tu firma (y sello) sobre papel blanco, o dibújala.</span>'; q('[data-nosig]').hidden = !signature; };
    showSig();
    q('[data-file]').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { signature = await compressImage(f, 520, 0.85); showSig(); } catch (_) { toast('No se pudo leer la imagen', 'danger'); } };
    q('[data-draw]').onclick = async () => { m.el.style.visibility = 'hidden'; const sg = await drawSignature(); m.el.style.visibility = ''; if (sg) { signature = sg; showSig(); } };
    q('[data-nosig]').onclick = () => { signature = ''; showSig(); };
    const save = async (e) => {
      e?.preventDefault();
      const name = F.name.value.trim().replace(/^(dr|dra)\.?\s+/i, '');
      if (name.length < 3) { q('[data-err]').textContent = 'Escribe el nombre del médico.'; return; }
      const data = { ...doc, name, sex: F.sex.value, specialty: F.specialty.value.trim(), idDoc: F.idDoc.value.trim().toUpperCase(), mpps: F.mpps.value.trim(), cmv: F.cmv.value.trim(), university: F.university.value.trim(), phone: F.phone.value.trim(), signature, active: F.active ? F.active.checked : true };
      const list = [...(s().doctors || [])];
      const i = list.findIndex((x) => x.id === doc.id);
      if (i >= 0) list[i] = data; else list.push(data);
      setBusy(q('[data-ok]'), true);
      await store.saveSettings({ doctors: list });
      m.close(); toast(isNew ? 'Médico agregado' : 'Médico actualizado'); render();
    };
    q('[data-f]').onsubmit = save; q('[data-ok]').onclick = save;
    const del = q('[data-del]');
    if (del) del.onclick = async () => {
      if (!(await requirePin('Eliminar un médico'))) return;
      if (!(await confirmDialog({ title: 'Eliminar médico', message: `¿Eliminar a <b>${esc(doc.name)}</b>? Sus consultas anteriores se conservan. Si solo dejará de atender, mejor márcalo como inactivo.`, confirmText: 'Eliminar', danger: true }))) return;
      await store.saveSettings({ doctors: (s().doctors || []).filter((x) => x.id !== doc.id) });
      m.close(); toast('Médico eliminado', 'warning'); render();
    };
  }

  function listEditor(key, title, ph, items) {
    return `<div class="card stack" data-list="${key}"><div class="card-title">${title}</div>
      <div class="tagrow" data-items>${items.map((v, i) => `<span class="tag">${esc(v)} <button class="tag-x" data-rm="${i}" aria-label="Quitar">${icon('x')}</button></span>`).join('') || '<span class="small faint">Vacío</span>'}</div>
      <div class="row"><input class="input" data-new placeholder="${esc(ph)}"><button class="btn btn-secondary" data-add aria-label="Agregar">${icon('plus')}</button></div></div>`;
  }
  function bindList(key) {
    const box = el.querySelector(`[data-list="${key}"]`);
    const cur = () => [...(s()[key] || [])];
    const save = async (list) => { await store.saveSettings({ [key]: list }); render(); };
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const list = cur(); list.splice(+b.dataset.rm, 1); save(list); });
    const add = () => { const v = box.querySelector('[data-new]').value.trim(); if (!v) return; if (cur().includes(v)) { toast('Ya existe', 'warning'); return; } save([...cur(), v]); };
    box.querySelector('[data-add]').onclick = add;
    box.querySelector('[data-new]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  }

  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sec = b.dataset.s; render(); });
  render();
  return store.on('*', (evt) => { if (evt === 'rate' && sec === 'consultorio') render(); });
}

/** Lienzo para dibujar la firma con el dedo o el mouse. Devuelve un PNG (dataURL) o null. */
function drawSignature() {
  return new Promise((resolve) => {
    let out = null;
    const m = openModal({
      title: 'Dibujar firma', sub: 'Firma con el dedo o el mouse dentro del recuadro.', size: 'md',
      body: '<canvas class="sig-canvas" width="900" height="300"></canvas>',
      footer: '<button class="btn btn-ghost" data-clear style="margin-right:auto">Borrar</button><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Usar firma</button>',
      onClose: () => resolve(out)
    });
    const cv = m.el.querySelector('canvas'); const ctx = cv.getContext('2d');
    const clear = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); };
    clear();
    ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2a6b';
    let drawing = false; let drawn = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.onpointerdown = (e) => { drawing = true; drawn = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    cv.onpointermove = (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
    cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
    m.el.querySelector('[data-clear]').onclick = () => { clear(); drawn = false; };
    m.el.querySelector('[data-ok]').onclick = () => { if (!drawn) { toast('Dibuja la firma primero', 'warning'); return; } out = cv.toDataURL('image/png'); m.close(); };
  });
}
