// Sano Doctor — Cobrar: consultas pendientes, servicios del consultorio e insumos
import { store } from '../store.js';
import { chargeSale, cartTotals, itemsTotal } from '../ops.js';
import { esc, usd, bs, num, toast, normalize, debounce, emptyState, qtyFmt, parseNum, round2, fmtAgo, promptDialog } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt, notifyLowStock } from '../shared.js';
import { openPay, showPaid } from '../pay.js';
import { pickPatient } from '../patient.js';
import { chargePending } from '../consult.js';

const SVC_ICON = (n) => /emergencia/i.test(n) ? 'alert' : /tele/i.test(n) ? 'phone' : /certific|constancia|informe/i.test(n) ? 'file' : /inyec|nebuliz|curas|sutura|procedim|retiro/i.test(n) ? 'syringe' : /electro|ecg/i.test(n) ? 'pulse' : /glic|glucem/i.test(n) ? 'droplet' : 'stethoscope';

export function mount(el) {
  let tab = 'servicios';
  let search = '';
  let cart = [];
  let patient = null;

  el.innerHTML = `<div class="pos">
    <div class="pos-main">
      <div class="pos-head">
        <div id="pos-pend"></div>
        <div class="row"><label class="search" style="flex:1">${icon('search')}<input id="pos-search" placeholder="Buscar servicio, medicina o código…" autocomplete="off"></label></div>
        <div class="chips" id="pos-tabs"></div>
      </div>
      <div class="pos-grid-wrap"><div class="pgrid" id="pos-grid"></div></div>
    </div>
    <div class="cart-backdrop" id="cart-bd"></div>
    <aside class="cart" id="cart">
      <div class="cart-head"><div class="between"><b style="font-size:16px">Cobro</b><button class="btn btn-ghost btn-sm" id="c-clear">${icon('trash')} Vaciar</button></div>
        <div class="cart-ctx"><button class="btn btn-secondary btn-sm" id="c-pt">${icon('user')} <span class="ellipsis" id="c-pt-l">Paciente particular</span></button></div></div>
      <div class="cart-list" id="c-list"></div>
      <div class="cart-foot">
        <div class="cart-grand"><span class="lbl">Total</span><div class="val"><b id="c-total">${usd(0)}</b><span id="c-totalbs">${bs(0)}</span></div></div>
        <button class="btn btn-success btn-xl btn-block" id="c-pay">${icon('check')} Cobrar</button>
      </div>
    </aside>
    <button class="cart-fab" id="cart-fab"><span><span class="cnt" id="fab-n">0</span>Ver cobro</span><b id="fab-t">${usd(0)}</b></button>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const sellable = () => store.products.filter((p) => p.active !== false && p.sellable !== false);

  function renderPending() {
    const list = store.pending;
    $('#pos-pend').innerHTML = list.length ? `<div class="pend-strip" data-tour="pending"><div class="between"><b class="small">${icon('file')} Consultas por cobrar (${list.length})</b></div>
      <div class="pend-list">${list.slice(0, 12).map((c) => `<button class="pend-item" data-pc="${c.id}"><span class="grow" style="min-width:0"><b class="ellipsis">${esc(c.patientName)}</b><small>${esc(c.number)} · ${fmtAgo(c.closedAt)}</small></span><b>${usd(round2(itemsTotal(c.charges) - (c.discount || 0)))}</b></button>`).join('')}</div></div>` : '';
    el.querySelectorAll('[data-pc]').forEach((b) => b.onclick = () => chargePending(store.pending.find((c) => c.id === b.dataset.pc)));
  }

  function renderTabs() {
    const cats = [...new Set(sellable().map((p) => p.category).filter(Boolean))];
    $('#pos-tabs').innerHTML = [['servicios', 'Servicios'], ['all', 'Todos los insumos'], ...cats.map((c) => [c, c])].map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-tab="${esc(k)}">${esc(l)}</button>`).join('');
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; renderTabs(); renderGrid(); });
  }

  function renderGrid() {
    const t = normalize(search);
    const svcs = store.settings.services.filter((s) => s.name && (!t || normalize(s.name).includes(t)));
    const prods = sellable().filter((p) => (tab === 'all' || tab === 'servicios' ? true : p.category === tab) && (!t || normalize(`${p.name} ${p.sku || ''} ${p.category} ${p.lot || ''}`).includes(t)));
    const showSvc = tab === 'servicios' || (t && tab === 'all');
    const showProd = tab !== 'servicios' || t;
    const inCart = (key) => cart.find((l) => l.key === key)?.qty || 0;
    const svcHTML = showSvc ? svcs.map((s) => `<button class="pcard" data-s="${esc(s.name)}">${inCart('s:' + s.name) ? `<span class="pcard-qty">${qtyFmt(inCart('s:' + s.name))}</span>` : ''}
      <div class="pcard-media" style="--pc:var(--brand-soft)"><span class="pcard-ic">${icon(SVC_ICON(s.name))}</span></div><div class="pcard-name">${esc(s.name)}</div>
      <div class="pcard-price"><b>${usd(s.price)}</b><span>${bs(s.price * store.rate)}</span></div></button>`).join('') : '';
    const prodHTML = showProd ? prods.map((p) => {
      const stock = Number(p.stock) || 0; const tracked = p.trackStock !== false;
      const out = tracked && stock - inCart('p:' + p.id) <= 0;
      return `<button class="pcard" data-p="${p.id}" ${out ? 'disabled' : ''}>
        ${inCart('p:' + p.id) ? `<span class="pcard-qty">${qtyFmt(inCart('p:' + p.id))}</span>` : ''}
        ${tracked ? `<span class="pcard-flag badge ${stock <= 0 ? 'badge-danger' : stock <= (p.minStock || 0) ? 'badge-warning' : 'badge-neutral'}">${stock <= 0 ? 'Agotado' : qtyFmt(stock)}</span>` : ''}
        <div class="pcard-media" style="--pc:${p.color || 'var(--surface-2)'}">${p.image ? `<img src="${p.image}" alt="">` : `<span class="pcard-ic">${icon(/inyect|vacun/i.test(p.category) ? 'syringe' : /suero/i.test(p.category) ? 'droplet' : /medic|muestra/i.test(p.category) ? 'pill' : 'box')}</span>`}</div>
        <div class="pcard-name">${esc(p.name)}</div>
        <div class="pcard-price"><b>${usd(p.price)}</b><span>${bs(p.price * store.rate)}</span></div>
      </button>`;
    }).join('') : '';
    $('#pos-grid').innerHTML = svcHTML + prodHTML || `<div style="grid-column:1/-1">${tab === 'servicios' ? emptyState('stethoscope', 'Sin servicios', 'Agrega tus servicios y precios en Configuración › Servicios.') : emptyState('box', 'Sin insumos para cobrar', 'Agrega medicinas e insumos en Inventario y marca “Se cobra al paciente”.')}</div>`;
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { const s = store.settings.services.find((x) => x.name === b.dataset.s); if (s) addLine({ key: 's:' + s.name, productId: null, name: s.name, price: Number(s.price) || 0, cost: 0 }); });
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { const p = store.product(b.dataset.p); if (p) addLine({ key: 'p:' + p.id, productId: p.id, name: p.name, price: Number(p.price) || 0, cost: Number(p.cost) || 0 }, p); });
  }

  function addLine(item, p = null, qty = 1) {
    const line = cart.find((l) => l.key === item.key);
    const have = (line?.qty || 0) + qty;
    if (p && p.trackStock !== false && have > (Number(p.stock) || 0)) { toast(`Solo quedan ${qtyFmt(p.stock || 0)} de ${p.name}`, 'warning'); return; }
    if (line) line.qty = have; else cart.push({ ...item, qty });
    renderCart(); renderGrid();
  }

  function renderCart() {
    const t = cartTotals(cart);
    $('#c-list').innerHTML = cart.length ? cart.map((l, i) => `<div class="cline">
      <div class="cline-name">${esc(l.name)}</div><div class="cline-total">${usd(l.price * l.qty)}</div>
      <div class="cline-meta"><button class="linkish" data-price="${i}">${usd(l.price)} c/u ${icon('edit')}</button></div>
      <div class="cline-actions"><div class="stepper"><button data-dec="${i}" aria-label="Menos">${icon('minus')}</button><span>${qtyFmt(l.qty)}</span><button data-inc="${i}" aria-label="Más">${icon('plus')}</button></div><button class="btn btn-ghost btn-icon btn-sm" data-del="${i}" aria-label="Quitar">${icon('trash')}</button></div>
    </div>`).join('') : `<div class="empty">${icon('cart')}<b>Nada por cobrar</b><span>Toca un servicio o insumo para agregarlo. Las consultas cerradas sin cobrar aparecen arriba.</span></div>`;
    $('#c-total').textContent = usd(t.total); $('#c-totalbs').textContent = bs(t.total * store.rate);
    $('#fab-n').textContent = cart.reduce((a, l) => a + l.qty, 0); $('#fab-t').textContent = usd(t.total);
    $('#c-pay').disabled = !cart.length;
    $('#c-pt-l').textContent = patient?.name || 'Paciente particular';
    el.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => { const l = cart[+b.dataset.inc]; addLine(l, l.productId ? store.product(l.productId) : null); });
    el.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const l = cart[+b.dataset.dec]; l.qty -= 1; if (l.qty <= 0) cart.splice(+b.dataset.dec, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { cart.splice(+b.dataset.del, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-price]').forEach((b) => b.onclick = async () => {
      const l = cart[+b.dataset.price];
      const v = await promptDialog({ title: 'Precio', label: `${l.name} ($)`, value: num(l.price), confirmText: 'Aplicar' });
      if (v != null && parseNum(v) >= 0) { l.price = round2(parseNum(v)); renderCart(); }
    });
  }

  async function pay() {
    if (!cart.length) return;
    const t = cartTotals(cart);
    await openPay({
      title: 'Cobrar', sub: esc(patient?.name || 'Paciente particular'), amount: t.total, baseTotal: t.total, discount: true, printLabel: 'Imprimir recibo',
      onConfirm: async (res) => {
        const out = await chargeSale({ lines: cart.map(({ key, ...l }) => l), patient, discount: res.discount, payments: res.payments, changeCurrency: res.changeCurrency });
        if (res.print) printReceipt(out.sale);
        notifyLowStock(out.low);
        showPaid(out.sale, { title: 'Cobro registrado', onPrint: () => printReceipt(out.sale) });
        cart = []; patient = null; closeCart(); renderCart(); renderGrid();
        return out;
      }
    });
  }

  const openCart = () => { $('#cart').classList.add('open'); $('#cart-bd').classList.add('open'); };
  const closeCart = () => { $('#cart').classList.remove('open'); $('#cart-bd').classList.remove('open'); };
  $('#cart-fab').onclick = openCart; $('#cart-bd').onclick = closeCart;
  $('#c-pay').onclick = pay;
  $('#c-pt').onclick = async () => { const p = await pickPatient({ title: '¿A quién se cobra?' }); if (p) { patient = p; renderCart(); } };
  $('#c-clear').onclick = () => { cart = []; patient = null; renderCart(); renderGrid(); };
  const sInp = $('#pos-search');
  sInp.oninput = debounce((e) => { search = e.target.value; renderGrid(); }, 100);
  sInp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const v = sInp.value.trim().toLowerCase(); if (!v) return;
    const exact = sellable().find((p) => (p.sku || '').toLowerCase() === v);
    if (exact) { addLine({ key: 'p:' + exact.id, productId: exact.id, name: exact.name, price: Number(exact.price) || 0, cost: Number(exact.cost) || 0 }, exact); sInp.value = ''; search = ''; renderGrid(); }
  };
  renderPending(); renderTabs(); renderGrid(); renderCart();
  return store.on('*', (evt) => {
    if (evt === 'products') { renderTabs(); renderGrid(); }
    if (evt === 'pending') renderPending();
    if (evt === 'rate' || evt === 'settings') { renderGrid(); renderCart(); }
  });
}
