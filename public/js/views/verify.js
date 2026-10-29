// Sano Doctor — Verificación pública de documentos médicos (/verificar/CODIGO)
import { getVerify } from '../store.js';
import { esc, fmtDate, fmtDateTime, waLink } from '../utils.js';
import { icon } from '../icons.js';

export function mount(root) {
  document.title = 'Verificar documento médico · Sano Doctor';
  const code = decodeURIComponent(location.pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function shell(inner) {
    root.innerHTML = `<div class="track-page"><div class="track-wrap">
      <a class="track-brand" href="/"><img src="/assets/logo.svg" alt=""><span>Sano Doctor</span></a>
      ${inner}
      <p class="track-foot">Verificación segura · Sano Doctor, gestión médica para consultorios.<br>Por privacidad solo se muestran las iniciales del paciente.</p>
    </div></div>`;
  }

  function form(msg = '') {
    shell(`<div class="track-card">
      <h1>Verificar un documento médico</h1>
      <p class="muted">Escribe el código que aparece en el récipe, reposo, constancia o informe, debajo del código QR.</p>
      <form class="stack mt-lg" id="vf-f"><input class="input input-lg center mono" id="vf-c" maxlength="10" placeholder="Ej.: K7P3QX9" value="${esc(code)}" style="letter-spacing:.2em;text-transform:uppercase" autocapitalize="characters"><button class="btn btn-primary btn-lg btn-block">${icon('shieldCheck')} Verificar</button></form>
      ${msg ? `<div class="pay-status due mt">${msg}</div>` : ''}
    </div>`);
    root.querySelector('#vf-f').onsubmit = (e) => { e.preventDefault(); const c = root.querySelector('#vf-c').value.trim().toUpperCase(); if (c) location.href = '/verificar/' + encodeURIComponent(c); };
  }

  async function load() {
    if (!code) { form(); return; }
    shell('<div class="track-card center"><div class="spinner"></div></div>');
    let d = null;
    try { d = await getVerify(code); } catch (e) { form('No se pudo verificar. Revisa tu conexión e inténtalo de nuevo.'); return; }
    if (!d) { form(`No existe ningún documento con el código <b>${esc(code)}</b>. Verifica que esté bien escrito; si es correcto, el documento <b>no es auténtico</b>.`); return; }
    const ok = d.valid !== false;
    const wa = d.clinic?.whatsapp ? waLink(d.clinic.whatsapp, `Hola, quiero confirmar el documento ${d.kindLabel} con código ${d.code}.`) : '';
    const doc = d.doctor || {};
    shell(`<div class="track-card">
      <div class="vf-hero ${ok ? 'ok' : 'bad'}"><span class="vf-ic">${icon(ok ? 'shieldCheck' : 'alert')}</span><div><b>${ok ? 'Documento auténtico' : 'Documento anulado'}</b><span>${ok ? 'Fue emitido por el consultorio a través de Sano Doctor.' : `El médico anuló este documento${d.revokedAt ? ' el ' + fmtDate(d.revokedAt) : ''}. No tiene validez.`}</span></div></div>
      ${d.demo ? '<div class="tr-note">Documento de demostración (consultorio de prueba).</div>' : ''}
      <div class="kv mt-lg">
        <div><span>Documento</span><b>${esc(d.kindLabel || d.kind)}</b></div>
        <div><span>Código</span><b class="mono">${esc(d.code)}</b></div>
        <div><span>Emitido</span><b>${fmtDateTime(d.issuedAt)}</b></div>
        ${d.number ? `<div><span>Consulta N°</span><b>${esc(d.number)}</b></div>` : ''}
        <div><span>Paciente</span><b>${esc(d.patient?.initials || '—')}${d.patient?.id ? ` · C.I. ${esc(d.patient.id)}` : ''}</b></div>
        ${d.summary ? `<div><span>Detalle</span><b>${esc(d.summary)}</b></div>` : ''}
      </div>
      <div class="section-title mt-lg">Médico tratante</div>
      <div class="vf-doc"><span class="tr-icon tone-brand">${icon('stethoscope')}</span><div><b>${esc(doc.name || '—')}</b>${doc.specialty ? `<div class="small muted">${esc(doc.specialty)}</div>` : ''}<div class="small muted">${[doc.mpps && 'MPPS ' + doc.mpps, doc.cmv && 'C.M. ' + doc.cmv].filter(Boolean).map(esc).join(' · ')}</div></div></div>
      <div class="tr-biz">
        <div><b>${esc(d.clinic?.name || '')}</b>${d.clinic?.address ? `<div class="small muted">${esc(d.clinic.address)}</div>` : ''}${d.clinic?.phone ? `<div class="small muted">Tel: ${esc(d.clinic.phone)}</div>` : ''}</div>
        ${wa ? `<a class="btn btn-whatsapp" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Contactar</a>` : ''}
      </div>
    </div>`);
  }
  load();
}
