import { clientPropertyStorageKey, readClientProperties, storefrontProperties as IMOVEIS } from './client-properties.mjs';
import { money as brl, quoteStay, stayDate, validStay } from './stay-visual.mjs';
import { findProperty, monthlyTotal } from './property-context.mjs';

/* ===== util ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("imob-visual:" + document.body.dataset.product + ":" + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("imob-visual:" + document.body.dataset.product + ":" + k, JSON.stringify(v)); } catch {} },
};
const PHOTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>';
const photoSlot = (label = "Foto do imóvel") => `<div class="photo-slot"><div>${PHOTO_SVG}${label}</div></div>`;
const priceLabel = (p) => p.finalidade === "venda" ? brl(p.preco) : `${brl(p.preco)} <small>/${p.unidadePreco || "mês"}</small>`;
/* ===== estado e filtros ===== */
const state = { mode: "venda", type: "", place: "", beds: 0, max: null, sort: "rel", onlyFav: false, keywords: [] };
let favorites = new Set(store.get("im_favs", []));
let compare = new Set();
let staySelection = null;
const stayForm = $("#stayForm");
stayForm.elements.arrival.min = stayDate();
stayForm.elements.departure.min = stayDate(1);

function submitStay(event) {
  event.preventDefault();
  const selection = Object.fromEntries(new FormData(stayForm));
  if (!validStay(selection)) {
    $("#stayMessage").textContent = "Escolha uma saída posterior à entrada, para uma estadia de até 30 noites.";
    return;
  }
  staySelection = selection;
  render();
  $("#stayMessage").textContent = "Consulta aplicada aos imóveis fictícios abaixo.";
}

stayForm.addEventListener("submit", submitStay);
stayForm.addEventListener("input", () => {
  if (staySelection) {
    staySelection = null;
    render();
  }
  $("#stayMessage").textContent = "";
});
$("#staySample").addEventListener("click", () => {
  stayForm.elements.arrival.value = stayDate(8);
  stayForm.elements.departure.value = stayDate(11);
  stayForm.elements.guests.value = "2";
  stayForm.requestSubmit();
});

function fillSelects() {
  const types = [...new Set(IMOVEIS.map((p) => p.tipo))].sort();
  $("#fType").innerHTML = '<option value="">Todos</option>' + types.map((t) => `<option>${esc(t)}</option>`).join("");
  const places = [...new Set(IMOVEIS.flatMap((p) => [p.cidade, `${p.bairro}, ${p.cidade}`]))].sort();
  $("#fCity").innerHTML = '<option value="">Todas</option>' + places.map((t) => `<option>${esc(t)}</option>`).join("");
}

function syncInputs() {
  $("#fMode").value = state.mode; $("#fType").value = state.type; $("#fCity").value = state.place;
  $("#fBeds").value = String(state.beds); $("#fMax").value = state.max ? state.max.toLocaleString("pt-BR") : ""; $("#fSort").value = state.sort;
  $$(".mode-tabs button").forEach((b) => { const on = b.dataset.mode === state.mode; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on); });
  $("#listTitle").textContent = { venda: "Imóveis à venda", locacao: "Imóveis para alugar", temporada: "Imóveis para temporada" }[state.mode];
  $("#onlyFav").setAttribute("aria-pressed", state.onlyFav); $("#onlyFav").textContent = state.onlyFav ? "♥ Favoritos" : "♡ Favoritos";
}

function requestedFeatures(property) {
  const details = norm([property.titulo, property.descricao, ...property.caracteristicas].join(" "));
  return state.keywords.filter(word => details.includes(word));
}

function matchNote(property) {
  const features = requestedFeatures(property);
  const reasons = [
    state.type && property.tipo,
    state.place && property.bairro + ", " + property.cidade,
    state.beds && property.quartos + " quarto(s)",
    state.max && "preço do anúncio dentro do limite",
    ...features
  ].filter(Boolean);
  return reasons.length ? '<p class="match-note">Atende a ' + esc(reasons.join(" · ")) + '</p>' : "";
}

function stayBreakdown(quote) {
  if (!quote) return "";
  return `<p class="stay-quote"><strong>${brl(quote.total)} no período</strong><br>${quote.nights} noite(s): ${brl(quote.lodging)} + limpeza: ${brl(quote.cleaning)}</p>`;
}

function filtered() {
  let list = IMOVEIS.filter((p) => p.finalidade === state.mode);
  if (state.type) list = list.filter((p) => p.tipo === state.type);
  if (state.place) list = list.filter((p) => p.cidade === state.place || `${p.bairro}, ${p.cidade}` === state.place);
  if (state.beds) list = list.filter((p) => p.quartos >= state.beds);
  if (state.max) list = list.filter((p) => (monthlyTotal(p) ?? p.preco) <= state.max || p.preco <= state.max);
  if (state.mode === "temporada" && staySelection) list = list.filter(p => quoteStay(p, staySelection));
  if (state.onlyFav) list = list.filter((p) => favorites.has(p.id));
  if (state.keywords.length) {
    list = list.map((p) => {
      return { p, score: requestedFeatures(p).length };
    }).sort((a, b) => b.score - a.score).map((x) => x.p);
  }
  if (state.sort === "asc") list = [...list].sort((a, b) => a.preco - b.preco);
  if (state.sort === "desc") list = [...list].sort((a, b) => b.preco - a.preco);
  if (state.sort === "area") list = [...list].sort((a, b) => b.area - a.area);
  if (state.sort === "rel" && !state.keywords.length) list = [...list].sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0));
  return list;
}

function specs(p) {
  return [
    p.area ? `${p.area} m²` : null,
    p.quartos ? `${p.quartos} quarto${p.quartos > 1 ? "s" : ""}${p.suites ? ` (${p.suites} suíte${p.suites > 1 ? "s" : ""})` : ""}` : null,
    p.banheiros ? `${p.banheiros} banh.` : null,
    p.vagas ? `${p.vagas} vaga${p.vagas > 1 ? "s" : ""}` : null,
  ].filter(Boolean).map((s) => `<span>${s}</span>`).join("");
}

function media(p, i = 0) {
  return p.fotos && p.fotos[i] ? `<img src="${esc(p.fotos[i])}" alt="${esc(p.titulo)}" loading="lazy">` : photoSlot();
}

function propertyChatLink(property) {
  const url = new URL(location.href);
  url.searchParams.set("imovel", property.id);
  url.searchParams.delete("objetivo");
  url.hash = "jornada";
  const href = url.pathname + url.search + url.hash;
  return `<a class="btn btn-ghost property-chat-link" href="${esc(href)}" data-property-chat="${esc(property.id)}" aria-label="Conversar sobre este imóvel: ${esc(property.titulo)}">Conversar sobre este imóvel</a>`;
}

function render() {
  syncInputs();
  $("#stayPanel").hidden = state.mode !== "temporada";
  const list = filtered();
  $("#count").textContent = `${list.length} imóve${list.length === 1 ? "l" : "is"} encontrado${list.length === 1 ? "" : "s"}`;
  if (!list.length) {
    const message = state.mode === "temporada" && staySelection
      ? "Nenhum imóvel de exemplo está disponível para essas datas, hóspedes e filtros."
      : "Nenhum imóvel de exemplo corresponde aos filtros.";
    $("#cards").innerHTML = `<p class="empty">${message}</p>`;
  } else {
    $("#cards").innerHTML = list.map((p) => {
      const total = monthlyTotal(p);
      const tag = { venda: '<span class="tag sale">Venda</span>', locacao: '<span class="tag rent">Locação</span>', temporada: '<span class="tag season">Temporada</span>' }[p.finalidade];
      return `<article class="card">
        <div class="media">${media(p)}
          <div class="tags">${tag}</div>
          <button class="fav ${favorites.has(p.id) ? "on" : ""}" data-fav="${p.id}" aria-label="${favorites.has(p.id) ? "Remover dos" : "Adicionar aos"} favoritos">${favorites.has(p.id) ? "♥" : "♡"}</button>
        </div>
        <div class="card-body">
          <span class="place">${esc(p.tipo)} · ${esc(p.bairro)}, ${esc(p.cidade)}</span>
          <h3 class="card-title">${esc(p.titulo)}</h3>
          <div class="specs">${specs(p)}</div>
          <div class="price">${priceLabel(p)}</div>
          ${total ? `<div class="monthly">Total mensal estimado: <b>${brl(total)}</b> (com condomínio e IPTU)</div>` : p.finalidade === "venda" && p.condominio ? `<div class="monthly">Condomínio ${brl(p.condominio)}/mês</div>` : ""}
          ${p.stay ? `<p class="field-help">Até ${p.stay.maxGuests} hóspedes</p>` : ""}
          ${staySelection ? stayBreakdown(quoteStay(p, staySelection)) : ""}
          ${matchNote(p)}
          <label class="compare-check"><input type="checkbox" data-compare="${p.id}" ${compare.has(p.id) ? "checked" : ""}> Comparar</label>
          <div class="card-actions">
            <button class="btn btn-primary" data-open="${p.id}">Ver detalhes</button>
            ${propertyChatLink(p)}
          </div>
        </div>
      </article>`;
    }).join("");
  }
  updateCompareBar();
}

/* ===== busca em linguagem natural (interpretação local, sem enviar dados) ===== */
const TYPE_WORDS = { apartamento:"Apartamento", apto:"Apartamento", casa:"Casa", kitnet:"Kitnet", quitinete:"Kitnet", studio:"Studio", estudio:"Studio", cobertura:"Cobertura", terreno:"Terreno", lote:"Terreno", sala:"Sala comercial" };
const STOP = new Set(["com","de","da","do","em","no","na","ate","e","um","uma","para","perto","quero","procuro","mil","reais","r$","quartos","quarto","alugar","comprar","aluguel","venda","temporada","mes","por","o","a","os","as"]);
function parseQuery(raw) {
  const q = norm(raw);
  const out = {};
  if (/\b(temporada|diaria|ferias)\b/.test(q)) out.mode = "temporada";
  else if (/\b(alugar|aluguel|locacao|locar)\b/.test(q)) out.mode = "locacao";
  else if (/\b(comprar|compra|venda|financiar)\b/.test(q)) out.mode = "venda";
  for (const [w, t] of Object.entries(TYPE_WORDS)) if (new RegExp(`\\b${w}s?\\b`).test(q)) { out.type = t; break; }
  const beds = q.match(/(\d+)\s*(quartos?|dorm|dormitorios?)/); if (beds) out.beds = Math.min(4, Number(beds[1]));
  const money = q.match(/ate\s*r?\$?\s*([\d.,]+)\s*(milhoes|milhao|mil|k)?/);
  if (money) {
    let v = Number(money[1].replace(/\./g, "").replace(",", "."));
    if (money[2] === "mil" || money[2] === "k") v *= 1000;
    if (money[2] && money[2].startsWith("milh")) v *= 1000000;
    if (v > 0) out.max = Math.round(v);
  }
  const places = [...new Set(IMOVEIS.flatMap((p) => [p.cidade, p.bairro]))];
  for (const place of places) if (q.includes(norm(place))) {
    const asCity = IMOVEIS.find((p) => p.cidade === place);
    out.place = asCity ? place : (() => { const p = IMOVEIS.find((x) => x.bairro === place); return `${p.bairro}, ${p.cidade}`; })();
    break;
  }
  // Sem "comprar/alugar" na frase, a faixa de valor indica a finalidade.
  if (!out.mode && out.max) out.mode = out.max >= 100000 ? "venda" : out.max <= 30000 && state.mode === "venda" ? "locacao" : undefined;
  out.keywords = q.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w) && !TYPE_WORDS[w] && !places.some((p) => norm(p).includes(w)));
  return out;
}

function applyQuery(raw) {
  const r = parseQuery(raw);
  if (r.mode) state.mode = r.mode;
  state.type = r.type || ""; state.beds = r.beds || 0; state.max = r.max || null; state.place = r.place || ""; state.keywords = r.keywords; state.onlyFav = false;
  const bits = [
    { venda: "comprar", locacao: "alugar", temporada: "temporada" }[state.mode],
    state.type && state.type.toLowerCase(),
    state.beds && `${state.beds}+ quartos`,
    state.place && `em ${state.place}`,
    state.max && `até ${brl(state.max)}`,
    state.keywords.length && `priorizando: ${state.keywords.join(", ")}`,
  ].filter(Boolean);
  const box = $("#aiUnderstood");
  box.innerHTML = `<b>Entendi:</b> ${esc(bits.join(" · "))}. <a href="#imoveis">Ver resultados</a>`;
  box.classList.add("show");
  render();
}

/* ===== comparar ===== */
function updateCompareBar() {
  $("#compareBar").classList.toggle("show", compare.size > 0);
  $("#compareOpen").disabled = compare.size < 2;
  $("#compareCount").textContent = `${compare.size} de 3 selecionado${compare.size > 1 ? "s" : ""}`;
}
function openCompare() {
  if (compare.size < 2) return;
  const items = IMOVEIS.filter((p) => compare.has(p.id));
  const row = (label, fn) => `<tr><th>${label}</th>${items.map((p) => `<td>${fn(p)}</td>`).join("")}</tr>`;
  $("#modalBox").innerHTML = `<button class="modal-close" id="modalClose" aria-label="Fechar">✕</button>
    <div class="table-scroll"><h2 id="modalTitle" style="margin:0 0 14px;color:var(--navy)">Comparar imóveis</h2>
    <table class="compare-table">
      ${row("Imóvel", (p) => `<b>${esc(p.titulo)}</b><br><span class="place">${esc(p.bairro)}, ${esc(p.cidade)}</span>`)}
      ${row("Finalidade", (p) => ({ venda: "Venda", locacao: "Locação", temporada: "Temporada" }[p.finalidade]))}
      ${row("Valor", (p) => priceLabel(p))}
      ${row("Total mensal", (p) => monthlyTotal(p) ? brl(monthlyTotal(p)) : p.condominio ? `Cond. ${brl(p.condominio)}` : "—")}
      ${row("Área", (p) => p.area ? `${p.area} m²` : "—")}
      ${row("Valor por m²", (p) => p.area && p.finalidade === "venda" ? brl(Math.round(p.preco / p.area)) : "—")}
      ${row("Quartos / suítes", (p) => `${p.quartos} / ${p.suites}`)}
      ${row("Vagas", (p) => p.vagas)}

      ${row("", (p) => `<button class="btn btn-primary" data-open="${p.id}">Ver detalhes</button>`)}
    </table></div>`;
  showModal();
}

/* ===== eventos ===== */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-property-chat],[data-open],[data-fav],[data-mode],[data-example],#modalClose,#compareOpen,#compareClear,#onlyFav,#clearFilters,#menuToggle");
  if (e.target === $("#modal")) return closeModal();
  if (!t) return;
  if (t.dataset.propertyChat) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const property = findProperty(t.dataset.propertyChat);
    if (!property) return;
    e.preventDefault();
    const stay = staySelection && quoteStay(property, staySelection) ? { ...staySelection } : null;
    const detail = { propertyId: property.id, stay, trigger: dialog.open ? modalTrigger : t };
    const start = () => document.dispatchEvent(new CustomEvent("imob:start", { detail }));
    if (dialog.open) {
      dialog.addEventListener("close", start, { once: true });
      closeModal();
    } else {
      start();
    }
    return;
  }
  if (t.dataset.open) { e.preventDefault(); return openDetail(t.dataset.open); }
  if (t.dataset.fav) {
    favorites.has(t.dataset.fav) ? favorites.delete(t.dataset.fav) : favorites.add(t.dataset.fav);
    store.set("im_favs", [...favorites]);
    render();
    document.querySelector(`[data-fav="${t.dataset.fav}"]`)?.focus();
    return;
  }
  if (t.dataset.example) { $("#aiInput").value = t.dataset.example; return applyQuery(t.dataset.example); }
  if (t.dataset.mode) {
    state.mode = t.dataset.mode; state.type = ""; state.place = ""; state.keywords = []; render();
    return;
  }
  if (t.id === "modalClose") return closeModal();
  if (t.id === "compareOpen") return openCompare();
  if (t.id === "compareClear") { compare.clear(); return render(); }
  if (t.id === "onlyFav") { state.onlyFav = !state.onlyFav; return render(); }
  if (t.id === "clearFilters") { stayForm.reset(); staySelection = null; $("#stayMessage").textContent = ""; Object.assign(state, { type: "", place: "", beds: 0, max: null, sort: "rel", onlyFav: false, keywords: [] }); $("#aiUnderstood").classList.remove("show"); return render(); }
  if (t.id === "menuToggle") { const open = $("#nav").classList.toggle("open"); t.setAttribute("aria-expanded", open); }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-compare]");
  if (c) {
    if (c.checked && compare.size >= 3) { c.checked = false; alert("Compare até 3 imóveis por vez."); return; }
    c.checked ? compare.add(c.dataset.compare) : compare.delete(c.dataset.compare); return updateCompareBar();
  }
  if (e.target.id === "fMode") state.mode = e.target.value;
  if (e.target.id === "fType") state.type = e.target.value;
  if (e.target.id === "fCity") state.place = e.target.value;
  if (e.target.id === "fBeds") state.beds = Number(e.target.value);
  if (e.target.id === "fSort") state.sort = e.target.value;
  if (["fMode", "fType", "fCity", "fBeds", "fSort"].includes(e.target.id)) render();
});
$("#fMax").addEventListener("change", (e) => { const v = Number(e.target.value.replace(/\D/g, "")); state.max = v || null; render(); });
$("#aiForm").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#aiInput").value.trim(); if (v) { applyQuery(v); location.hash = "#imoveis"; } });
const dialog = $("#modal");
let modalTrigger;

function showModal() {
  if (!dialog.open) {
    modalTrigger = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }
  $("#modalClose").focus();
}

function closeModal() {
  dialog.close();
}

dialog.addEventListener("close", () => {
  document.body.style.overflow = "";
  modalTrigger?.focus();
});

function openDetail(id) {
  const property = findProperty(id);
  if (!property) return;
  const total = monthlyTotal(property);
  const quote = staySelection && quoteStay(property, staySelection);
  $("#modalBox").innerHTML = `
    <button class="modal-close" id="modalClose" type="button" aria-label="Fechar">✕</button>
    <div class="property-detail-image">${media(property)}</div>
    <div class="property-detail">
      <p class="place">${esc(property.bairro)}, ${esc(property.cidade)} · Imóvel fictício</p>
      <h2 id="modalTitle">${esc(property.titulo)}</h2>
      <div class="specs">${specs(property)}</div>
      <p class="price">${priceLabel(property)}</p>
      ${total ? `<p>Total mensal estimado com condomínio e IPTU: <strong>${brl(total)}</strong></p>` : ""}
      ${stayBreakdown(quote)}
      <p>${esc(property.descricao)}</p>
      ${propertyChatLink(property)}
    </div>`;
  showModal();
}

$("#nav").addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  $("#nav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || dialog.open || !$("#nav").classList.contains("open")) return;
  $("#nav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
  $("#menuToggle").focus();
});

fillSelects();
render();

if (document.body.dataset.product === 'ia-cliente') {
  const refresh = () => {
    IMOVEIS.splice(0, IMOVEIS.length, ...readClientProperties());
    fillSelects();
    render();
  };
  addEventListener('pageshow', event => {
    if (event.persisted) refresh();
  });
  addEventListener('storage', event => {
    if (event.key === clientPropertyStorageKey || event.key === null) refresh();
  });
}
