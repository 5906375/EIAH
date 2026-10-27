"use strict";
/* BACKUP-A painel local — todo texto vindo do servidor entra no DOM via textContent (nunca por HTML interpretado). */
const S = { token: null, ov: null, lastOk: 0, lastTry: 0, err: null, view: "overview", hist: { q: "", profile: "", state: "", from: "", to: "", sort: "desc", page: 1, page_size: 10 }, histData: null, histErr: null, drawer: null, drawerData: null, drawerErr: null, modal: null, busy: false };
const NA = "não disponível";

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "disabled" || k === "hidden") e[k] = !!v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c === null || c === undefined || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const na = (t) => el("span", { class: "na", text: t || NA });
const pill = (t, k) => el("span", { class: "pill " + (k || ""), text: t });
function T(t) {
  if (!t) return na();
  return el("span", { class: "t", title: "original: " + (t.original || "") },
    el("b", { text: t.brt }), " (America/Sao_Paulo)", el("span", { class: "u", text: t.utc + " (UTC)" }));
}
function copyBtn(text) {
  return el("button", { class: "btn cp", type: "button", title: "copiar", onclick: async (ev) => {
    const b = ev.currentTarget; try { await navigator.clipboard.writeText(text); b.textContent = "copiado"; } catch (e) {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand("copy"); b.textContent = "copiado"; } catch (e2) { b.textContent = "falhou"; } ta.remove(); }
    setTimeout(() => (b.textContent = "copiar"), 1500); } }, "copiar");
}
const withCopy = (text, cls) => el("span", {}, el("span", { class: cls || "mono", text: text }), copyBtn(text));
function stateKind(s) { return s === "UPLOADED_VERIFIED" ? "ok" : (s === "CAPTURED" || s === "UPLOADING" ? "warn" : (s === "FAILED" || s === "DESCONHECIDO" ? "bad" : "")); }
const kv = (rows) => el("dl", { class: "kv" }, rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", {}, v)]));
const card = (title, ...kids) => el("div", { class: "card" }, el("h3", { text: title }), ...kids);

async function getSession() {
  const r = await fetch("/api/session", { cache: "no-store" }); const j = await r.json(); S.token = j.token; return j;
}
async function api(path, body, retry = true) {
  if (!S.token) await getSession();
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-BA-Token": S.token }, body: JSON.stringify(body || {}), cache: "no-store" });
  let j = {}; try { j = await r.json(); } catch (e) { /* corpo vazio */ }
  if (r.status === 403 && retry) { await getSession(); return api(path, body, false); }
  return { status: r.status, body: j };
}
async function getJ(path) {
  const r = await fetch(path, { cache: "no-store" }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j;
}

/* ------------------------------------------------------------ visão geral */
function renderOverview(ov) {
  const root = document.getElementById("view-overview"); root.replaceChildren();
  if (!ov) { root.append(card("Dados", na("não disponível — nenhuma consulta bem-sucedida ainda"))); return; }
  const q = ov.queue, st = ov.source_status || {};
  const lc = ov.last_capture;
  const g = el("div", { class: "grid" });
  g.append(card("Última captura", lc ? el("div", {}, withCopy(lc.run), el("div", {}, pill(lc.state, stateKind(lc.state)), " ", pill(lc.profile)), kv([
    ["Início (id do run)", T(lc.created)], ["Conclusão", T(lc.finished)],
    ["Resultado", lc.counters ? `capturados=${lc.counters.captured} · falhas=${lc.counters.failed} · ignorados=${lc.counters.skipped} · inconsistentes=${lc.counters.inconsistent}` : na()]]),
    el("div", { class: "note small", text: lc.state === "CAPTURED" ? "CAPTURED = existe só localmente. NÃO está no S3 até o upload manual ser verificado." : "Estado do run mostrado como registrado em STATE." })) : na()));
  const lu = ov.last_upload;
  g.append(card("Último upload verificado", lu ? el("div", {}, withCopy(lu.run), el("div", { class: "small" }, "objeto ", lu.object, " · modo ", lu.mode || NA), kv([["Verificado em", T(lu.verified)]]),
    el("div", { class: "note small", text: "Upload verificado = integridade do ciphertext no S3. NÃO prova que o conteúdo possa ser recuperado." })) : el("div", { class: "mut", text: "nenhum upload verificado encontrado nas fontes locais" })));
  const ip = ov.in_progress, job = ip && ip.job;
  const busyBits = [];
  if (ip) { if ((ip.services_running || []).length) busyBits.push("serviço(s) de captura: " + ip.services_running.join(", ")); if ((ip.capturing_runs || []).length) busyBits.push("run(s) em CAPTURING: " + ip.capturing_runs.join(", ")); if (ip.capture_processes === null || ip.upload_processes === null) busyBits.push(null); else { if (ip.capture_processes.length) busyBits.push("processo de captura ativo"); if (ip.upload_processes.length) busyBits.push("processo de upload/conciliação ativo"); } }
  const jobRunning = job && (job.status === "running" || job.status === "running_untracked");
  g.append(card("Em andamento", ip ? (busyBits.length === 0 && !jobRunning ? el("div", {}, pill("nada em andamento", "ok")) : el("div", {}, busyBits.map((b) => el("div", {}, b === null ? na("consulta de processos indisponível") : b)),
    jobRunning ? el("div", {}, pill("upload do dashboard em execução", "warn"), " ", el("button", { class: "btn", onclick: () => openJob() }, "Acompanhar")) : null)) : na(),
    job && !jobRunning ? el("div", { class: "small mut" }, "último job do dashboard: ", job.kind, " · ", job.status, job.result ? " · " + job.result.verdict : "", " ", el("button", { class: "btn", onclick: () => openJob() }, "ver")) : null));
  if (q) {
    const cls = q.pct >= 100 ? "b" : (q.pct >= 80 ? "w" : "");
    g.append(card("Fila pendente de envio", el("div", { class: "big", text: `${q.queue_mb} MB de ${q.limit_mb} MB (${q.pct}%)` }), el("div", { class: "bar" }, el("i", { class: cls, style: `width:${Math.min(100, q.pct)}%` })),
      el("div", { class: "small mut", text: `aguardando upload (CAPTURED/UPLOADING): ${q.pending_mb} MB · outros runs não verificados (DRYRUN/NOOP/FAILED…): ${q.other_mb} MB — a regra do limite soma tudo que não é UPLOADED_VERIFIED` }),
      el("div", { class: "note small", text: `Ao atingir ${q.limit_mb} MB a captura é RECUSADA com código 77 (também se o arquivo local verificado atingir ${q.archive_limit_mb} MB ou o espaço livre ficar abaixo do piso de ${ov.config.BA_MIN_FREE_MB} MB). Acompanhe o crescimento.` })));
    g.append(card("Verificado mantido localmente", el("div", { class: "big", text: `${q.archive_mb} MB de ${q.archive_limit_mb} MB` }), el("div", { class: "small mut", text: "cópias locais de runs UPLOADED_VERIFIED; nada é apagado automaticamente (sem prune-local)." })));
  } else g.append(card("Fila pendente de envio", na()));
  const d = ov.disk || {};
  g.append(card("Espaço livre", kv([
    ["Sistema de arquivos da fila (WSL)", d.queue_fs ? el("span", {}, el("b", { text: d.queue_fs.free_mb + " MB livres" }), ` em ${d.queue_fs.mount} (${d.queue_fs.filesystem}, ${d.queue_fs.used_pct} usado)`) : na()],
    ["C: (" + (ov.config.BA_SPACE_PATH || "") + ")", d.c_drive ? el("span", {}, el("b", { text: d.c_drive.free_mb + " MB livres" }), ` (${d.c_drive.filesystem}, ${d.c_drive.used_pct} usado) · piso ${ov.config.BA_MIN_FREE_MB} MB`) : na()]])));
  const cs = ov.counts || {};
  g.append(card(`Runs por estado (total ${ov.total_runs})`, Object.keys(cs).length ? el("div", {}, Object.entries(cs).sort().map(([k, v]) => el("div", {}, pill(k, stateKind(k)), " ", String(v)))) : na("nenhum run"),
    el("div", { class: "small mut", text: "CAPTURED ≠ UPLOADED_VERIFIED. DRYRUN/NOOP não contêm backup novo." })));
  const al = ov.alerts, blockers = [];
  if (q && q.pct >= 100) blockers.push("fila no limite: captura será recusada (código 77)");
  if (q && q.archive_mb >= q.archive_limit_mb) blockers.push("arquivo local verificado no limite");
  if (d.c_drive && d.c_drive.free_mb < Number(ov.config.BA_MIN_FREE_MB)) blockers.push("C: abaixo do piso");
  if (ov.systemd) { for (const k of ["daily", "weekly"]) { const t = ov.systemd.timers[k]; if (!t) blockers.push("timer " + k + ": " + NA); else if (!/^active/.test(t.active) || t.enabled !== "enabled") blockers.push("timer " + k + " não está enabled/active"); } }
  g.append(card("Alertas e bloqueios", al ? (al.active.length ? el("div", {}, al.active.map((a) => el("div", {}, pill(a.name, "bad"), " ", a.text))) : el("div", {}, pill("nenhum alerta ativo", "ok"))) : na(),
    al && al.recent.length ? el("pre", { text: al.recent.join("\n") }) : null,
    blockers.length ? el("div", {}, blockers.map((b) => el("div", {}, pill("bloqueio", "bad"), " ", b))) : el("div", { class: "small mut", text: "nenhum bloqueio detectado nas fontes consultadas" })));
  const ck = ov.clock;
  g.append(card("Relógio (sincronização externa)", ck && ck.available ? el("div", {}, pill(ck.status, ck.status === "NÃO COMPROVADA" ? "warn" : "ok"), kv([["fuso", ck.timezone], ["NTP / NTPSynchronized", `${ck.ntp} / ${ck.ntp_synchronized}`]]), el("div", { class: "note small", text: ck.note })) : na()));
  const sc = el("div", {}, Object.entries(st).map(([k, v]) => el("div", {}, v.ok ? pill(k, "ok") : pill(k, "bad"), " ", v.ok ? "" : (v.error || NA))));
  g.append(card("Fontes consultadas", sc, ov.sources.map((s) => el("div", { class: "small mut", text: `${s.name}: ${s.count} run(s) em ${s.path}${s.error ? " — ERRO: " + s.error : ""}` }))));
  root.append(g);
}

/* ------------------------------------------------------------ agenda */
function renderAgenda(ov) {
  const root = document.getElementById("view-agenda"); root.replaceChildren();
  if (!ov || !ov.systemd) { root.append(card("Agenda (systemd)", na())); return; }
  const sd = ov.systemd, g = el("div", { class: "grid" });
  root.append(el("div", { class: "note", text: "Decisão STORAGE-02B.11-DEC-20261017-01: captura diária todos os dias às 08h; captura semanal às sextas-feiras às 18h; fuso America/Sao_Paulo; Persistent=false; upload exclusivamente manual. Esta tela mostra o que o systemd reporta agora." }));
  for (const [k, title] of [["daily", "Captura diária (esperado: todos os dias 08h)"], ["weekly", "Captura semanal (esperado: sextas 18h)"]]) {
    const t = sd.timers[k], s = sd.services[k];
    g.append(card(title, t ? kv([
      ["Timer", el("span", {}, pill(t.enabled || NA, t.enabled === "enabled" ? "ok" : "bad"), " ", pill(t.active, /^active/.test(t.active) ? "ok" : "bad"))],
      ["Calendário configurado (AGENDADO)", el("span", { class: "mono", text: t.calendar || NA })],
      ["Persistent", el("span", {}, t.persistent === "no" ? pill("no — horário perdido não é recuperado", "ok") : pill(String(t.persistent), "warn"))],
      ["Último disparo (real)", t.last_trigger ? T(t.last_trigger) : (t.last_trigger_original ? na() : el("span", { class: "mut", text: "nunca disparou desde que o timer foi carregado" }))],
      ["Próxima execução (AGENDADA)", T(t.next)]]) : na(),
    s ? (s.start || s.running ? kv([["Serviço", s.running ? pill("EM EXECUÇÃO", "warn") : pill(s.active)], ["Início real", T(s.start)], ["Término real", s.running ? el("span", { class: "mut", text: "em andamento" }) : T(s.end)], ["Resultado / código", `${s.result || NA} / ${s.exit_code === null ? NA : s.exit_code}`]]) : kv([["Serviço", pill(s.active)], ["Execuções", el("span", { class: "mut", text: "nenhuma execução registrada pelo systemd (o registro zera se o gerenciador de usuário reiniciar)" })]])) : na()));
  }
  g.append(card("Ambiente", kv([["Linger", sd.linger === null ? na() : el("span", {}, pill(sd.linger, sd.linger === "yes" ? "ok" : "warn"), sd.linger === "no" ? " o gerenciador systemd do usuário pode parar sem sessão aberta" : "")],
    ["Momento da consulta", T(ov.queried)], ["Fuso", "America/Sao_Paulo = Brasília"]]),
    el("div", { class: "small mut", text: "AGENDADO = horário do calendário · DISPARO = quando o timer acionou · INÍCIO/TÉRMINO REAIS = execução do serviço · CONSULTA = momento desta tela." })));
  root.append(g);
  if (sd.errors.length) root.append(el("div", { class: "note", text: "Erros de consulta: " + sd.errors.join("; ") }));
}

/* ------------------------------------------------------------ histórico */
function renderHistory() {
  const root = document.getElementById("view-history"); root.replaceChildren();
  const h = S.hist, d = S.histData;
  const inp = (label, key, type, opts) => el("label", {}, label, type === "select" ? el("select", { onchange: (e) => { h[key] = e.target.value; h.page = 1; loadHistory(); } }, opts.map(([v, t]) => el("option", { value: v, text: t, selected: h[key] === v ? "selected" : null })))
    : el("input", { type, value: h[key], placeholder: opts || "", onchange: (e) => { h[key] = e.target.value; h.page = 1; loadHistory(); } }));
  root.append(el("div", { class: "filters" },
    inp("Buscar identificador", "q", "search", "ex.: 7c3750"), inp("Perfil", "profile", "select", [["", "todos"], ["daily", "diário"], ["weekly", "semanal"], ["manual", "manual (G3)"]]),
    inp("Estado", "state", "select", [["", "todos"], ["CAPTURED", "CAPTURED"], ["UPLOADED_VERIFIED", "UPLOADED_VERIFIED"], ["UPLOADING", "UPLOADING"], ["DRYRUN", "DRYRUN"], ["NOOP", "NOOP"], ["FAILED", "FAILED"], ["MANUAL", "MANUAL (G3)"]]),
    inp("De (Brasília)", "from", "date"), inp("Até (Brasília)", "to", "date"), inp("Ordem por data", "sort", "select", [["desc", "mais recentes primeiro"], ["asc", "mais antigos primeiro"]]),
    inp("Por página", "page_size", "select", [["10", "10"], ["25", "25"], ["50", "50"]]), el("button", { class: "btn", onclick: () => { Object.assign(S.hist, { q: "", profile: "", state: "", from: "", to: "", page: 1 }); loadHistory(); } }, "Limpar")));
  if (S.histErr) root.append(el("div", { class: "note" }, "Histórico ", na("não disponível: " + S.histErr)));
  if (!d) { root.append(el("div", { class: "mut", text: "carregando…" })); return; }
  root.append(el("div", { class: "small mut", text: `${d.total} registro(s) de ${d.total_unfiltered} · fontes consultadas: ` + d.sources.map((s) => `${s.name} (${s.count}${s.error ? ", ERRO: " + s.error : ""})`).join("; ") + ` · consulta ${d.queried ? d.queried.brt : NA}` }));
  if (d.read_errors.length) root.append(el("div", { class: "note", text: "Falhas de leitura: " + d.read_errors.join("; ") }));
  root.append(el("div", { class: "note small", text: d.note }));
  const tb = el("table", {}, el("thead", {}, el("tr", {}, ["Criado", "Run", "Perfil", "Captura", "Upload", "MB", "Obs."].map((x) => el("th", { text: x })))), el("tbody", {}, d.items.map((r) => el("tr", { class: "click", tabindex: "0", onclick: () => openDrawer(r.id), onkeydown: (e) => { if (e.key === "Enter") openDrawer(r.id); } },
    el("td", {}, r.created ? el("span", {}, r.created.brt, el("br"), el("span", { class: "mut small", text: r.created.utc })) : na()),
    el("td", {}, el("span", { class: "mono", text: r.id }), el("br"), pill(r.state, stateKind(r.state))), el("td", { text: r.profile }), el("td", { text: r.capture_state }), el("td", { text: r.upload_state }), el("td", { text: r.mb === null ? NA : String(r.mb) }),
    el("td", {}, r.incomplete.length ? pill("incompleto: " + r.incomplete.join(", "), "warn") : null, r.read_errors.length ? pill("falha de leitura", "bad") : null, r.ambiguous ? pill("ambíguo", "bad") : null, r.conflict ? pill("conflito", "bad") : null)))));
  root.append(el("div", { class: "scroll" }, tb));
  root.append(el("div", { class: "filters" }, el("button", { class: "btn", disabled: h.page <= 1, onclick: () => { h.page--; loadHistory(); } }, "← anterior"), `página ${d.page} de ${d.pages}`, el("button", { class: "btn", disabled: d.page >= d.pages, onclick: () => { h.page++; loadHistory(); } }, "próxima →")));
}
async function loadHistory() {
  const p = new URLSearchParams(); for (const [k, v] of Object.entries(S.hist)) if (v !== "" && v !== null) p.set(k, v);
  try { S.histData = await getJ("/api/runs?" + p.toString()); S.histErr = null; } catch (e) { S.histErr = e.message; }
  renderHistory();
}

/* ------------------------------------------------------------ detalhes do run */
async function openDrawer(id) { S.drawer = id; S.drawerData = null; S.drawerErr = null; S.drawerKey = null; renderDrawer(); await refreshDrawer(); }
async function refreshDrawer() {
  if (!S.drawer) return;
  const prev = S.drawerKey;
  try { S.drawerData = await getJ("/api/run/" + encodeURIComponent(S.drawer)); S.drawerErr = null; } catch (e) { S.drawerErr = e.message; }
  const key = S.drawerData ? JSON.stringify(Object.assign({}, S.drawerData, { queried: null })) + (S.drawerErr || "") : "err:" + S.drawerErr;
  if (key !== prev) { S.drawerKey = key; renderDrawer(); }
}
function renderDrawer() {
  const dr = document.getElementById("drawer");
  if (!S.drawer) { dr.hidden = true; dr.replaceChildren(); return; }
  dr.hidden = false; dr.replaceChildren();
  const d = S.drawerData;
  dr.append(el("div", { class: "filters" }, el("button", { class: "btn", onclick: () => { S.drawer = null; renderDrawer(); } }, "✕ Fechar"), el("b", { text: S.drawer })));
  if (S.drawerErr) dr.append(el("div", { class: "note" }, "Detalhes ", na("não disponível: " + S.drawerErr)));
  if (!d) { dr.append(el("div", { class: "mut", text: "carregando…" })); return; }
  dr.append(kv([["Identificador", withCopy(d.id)], ["Perfil", d.profile + (d.source === "manual" ? " (captura manual G3)" : "")], ["Criado (id do run, UTC)", T(d.created)], ["Captura concluída", T(d.finished)],
    ["Estado do arquivo STATE", pill(d.state, stateKind(d.state))], ["CAPTURA", d.capture_state], ["UPLOAD (separado)", pill(d.upload_state, d.upload_state.startsWith("verificado") ? "ok" : (/AMB|CONFL/.test(d.upload_state) ? "bad" : "warn"))], ["Consulta", T(d.queried)]]));
  if (d.incomplete.length || d.read_errors.length) dr.append(el("div", { class: "note" }, "Registro incompleto/falhas de leitura: ", [...d.incomplete, ...d.read_errors].join("; ")));
  dr.append(el("h3", { text: "Contadores da captura" }));
  if (d.counters) dr.append(kv([["capturados", String(d.counters.captured)], ["falhas", String(d.counters.failed)], ["ignorados", String(d.counters.skipped)], ["inconsistentes", String(d.counters.inconsistent)], ["objetos com recibo", String(d.counters.objects_with_receipt)],
    ["sem objeto neste run", d.missing_expected.length ? d.missing_expected.join(", ") : "nenhum"]]), el("div", { class: "note small", text: d.counters_note + (d.counters.manifest_not_counted ? " Neste run: o manifesto BA-07 existe além dos capturados." : "") }));
  else dr.append(na("run.json ausente — contadores " + NA));
  if (d.rejected_files.length) dr.append(el("div", { class: "note", text: "Objetos rejeitados (fonte mudou durante a captura): " + d.rejected_files.join(", ") }));
  if (d.superseded_ids.length) dr.append(el("div", { class: "note", text: "Objetos aposentados (não enviados, preservados em superseded/): " + d.superseded_ids.join(", ") }));
  dr.append(el("h3", { text: "Localização" }), kv([
    ["Pasta dos backups (WSL)", d.objects_dir ? withCopy(d.objects_dir) : na()], ["Pasta dos backups (Explorador do Windows)", d.objects_dir_windows ? withCopy(d.objects_dir_windows) : na()],
    ["Pasta do run (WSL)", withCopy(d.dir)], ["Recibos (não são backup)", withCopy(d.receipts_path)], ["Log da captura", d.log_path ? withCopy(d.log_path) : na()]]));
  dr.append(el("h3", { text: "Arquivos de backup (.age) — hashes são os registrados nos recibos, não recalculados" }));
  for (const o of d.objects) {
    dr.append(el("div", { class: "card", style: "margin-bottom:10px" }, el("h3", { text: o.id }), kv([
      ["Arquivo .age (WSL)", o.present ? withCopy(o.path) : na("arquivo ausente" + (o.local_copy ? " — " + o.local_copy : ""))],
      ["Explorador do Windows", o.windows_path ? withCopy(o.windows_path) : na()],
      ["Bytes", el("span", {}, o.size === null ? NA : String(o.size), " ", o.size_matches === null ? "" : (o.size_matches ? pill("confere com o recibo", "ok") : pill("DIVERGE do recibo", "bad")))],
      ["SHA-256 do ciphertext (recibo)", o.age_sha256 ? withCopy(o.age_sha256) : na()],
      ["Chave S3", o.upload ? withCopy(o.upload.key || NA) : el("span", { class: "mut", text: "sem registro de upload (" + (Object.entries(o.state_flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "sem marcas em state/") + ")" })],
      ["VersionId", o.upload ? withCopy(o.upload.version_id || NA) : na()],
      ["Verificação", o.upload ? `modo: ${o.upload.mode || NA} · bytes ${o.upload.bytes}` : na()],
      ["PUT", o.upload ? T(o.upload.put) : na()], ["Verificado", o.upload ? T(o.upload.verified) : na()]])));
  }
  dr.append(el("h3", { text: "Descriptografia / recuperação" }), el("div", { class: "note small", text: d.upload_note }),
    el("ul", {}, d.recovery.map((r) => el("li", {}, el("b", { text: r.object + ": " }), r.status, r.scope ? el("div", { class: "small mut", text: "escopo: " + r.scope }) : null, r.evidence ? el("div", { class: "small mut" }, "evidência: ", withCopy(r.evidence, "mono small")) : null))));
  dr.append(el("h3", { text: "Evidências vinculadas (busca textual pelo identificador)" }),
    d.evidence.files.length ? el("ul", {}, d.evidence.files.map((f) => el("li", {}, withCopy(f, "mono small")))) : el("div", { class: "mut", text: "nenhuma evidência encontrada que cite este run (nem sempre significa que não exista; busca limitada a " + d.evidence.scanned + " arquivos)" }),
    el("div", { class: "note small", text: "Aparecer aqui NÃO equivale a estar indexado: a indexação exige entrada em docs/EVIDENCE_INDEX.md e o gate pnpm check:evidence-index." }));
  dr.append(el("h3", { text: "Log da captura (últimos bytes, texto escapado)" }), el("pre", { text: d.log_tail === null ? NA : d.log_tail }));
  if (d.source === "queue" && (d.state === "CAPTURED" || d.state === "UPLOADING")) dr.append(el("div", { class: "filters" }, el("button", { class: "btn pri", onclick: () => openUpload(d.id) }, "Enviar este run ao S3")));
  else if (d.source === "queue") dr.append(el("div", { class: "small mut", text: "Envio indisponível: estado " + d.state + " (somente CAPTURED/UPLOADING podem ser enviados)." }));
}

/* ------------------------------------------------------------ depende de você */
function renderTodo(ov) {
  const root = document.getElementById("view-todo"); root.replaceChildren();
  if (!ov) { root.append(card("Pendências", na())); return; }
  const s = ov.session || {}, L = el("ol", { class: "todo" });
  L.append(el("li", {}, el("b", { text: "Runs aguardando upload: " }), ov.waiting_upload.length ? el("span", {}, ov.waiting_upload.map((r) => el("div", {}, withCopy(r), " ", el("button", { class: "btn", onclick: () => openDrawer(r) }, "abrir")))) : "nenhum"));
  L.append(el("li", {}, el("b", { text: "Sessão AWS: " }), s.verified ? el("span", {}, pill(s.all_ok ? "todas válidas" : "PROBLEMA", s.all_ok ? "ok" : "bad"), pill(s.fresh ? "verificação recente" : "verificação ANTIGA", s.fresh ? "ok" : "warn"), el("div", { class: "small" }, "verificada em ", T(s.checked), `há ${Math.round(s.age_s / 60)} min — foto daquele momento, não garante o estado atual`),
    kv(Object.entries(s.profiles).map(([k, v]) => [k + " (" + v.profile + ")", el("span", {}, pill(v.status, v.ok ? "ok" : "bad"), " ", v.identity || v.detail || "")]))) : pill("NÃO VERIFICADA nesta execução do dashboard", "warn"),
    el("div", {}, el("button", { class: "btn", id: "btn-sess", onclick: verifySession }, "Verificar sessão AWS"), " ", el("span", { class: "small mut", text: "(ação explícita: chama sts get-caller-identity nos perfis operador, Writer e Restore)" }))));
  L.append(el("li", {}, el("b", { text: "Login AWS (humano, no terminal): " }), el("div", { class: "small mut", text: "execute no seu terminal WSL; o dashboard nunca recebe senha, MFA, token ou URL de login:" }), el("pre", { text: ov.login_command }), copyBtn(ov.login_command)));
  const rec = []; for (const r of ov.run_summaries) if (r.upload_state.startsWith("verificado")) rec.push(r.id);
  L.append(el("li", {}, el("b", { text: "Descriptografia / recuperação pendentes: " }), rec.length ? `${rec.length} run(s) com upload verificado; a recuperação só é comprovada por evidência específica por objeto (abra o run para ver). Hoje: apenas o BA-07 da captura manual G3 tem evidência (declaração do owner).` : "nenhum run enviado", el("div", { class: "small mut", text: "Procedimento (fora do dashboard): baixar com a role Restore, conferir SHA-256, decifrar com uma das 2 identidades age em ambiente de confiança e registrar a evidência." })));
  const q = ov.queue;
  L.append(el("li", {}, el("b", { text: "Limite da fila: " }), q ? `${q.queue_mb} MB de ${q.limit_mb} MB (${q.pct}%). Ao atingir o limite a captura é RECUSADA com código 77.` : na(), " Ao chegar perto, faça o upload manual dos runs pendentes."));
  const wk = ov.systemd && ov.systemd.timers.weekly;
  L.append(el("li", {}, el("b", { text: "Captura semanal: " }), wk ? (wk.last_trigger ? "já disparou" : "primeiro disparo ainda pendente — próxima execução ") : na(), wk && !wk.last_trigger ? T(wk.next) : null));
  L.append(el("li", {}, el("b", { text: "Linger: " }), ov.systemd && ov.systemd.linger !== null ? ov.systemd.linger : na(), " — com 'no', o gerenciador do usuário pode parar sem sessão aberta (decisão do owner habilitar)."));
  L.append(el("li", {}, el("b", { text: "Relógio: " }), ov.clock && ov.clock.available ? ov.clock.status : na(), " — sincronização externa não comprovada enquanto o Windows Time estiver parado/sem evidência atual."));
  root.append(el("div", { class: "card" }, el("h3", { text: "Depende de você" }), L));
}
async function verifySession() {
  const b = document.getElementById("btn-sess"); if (b) b.disabled = true;
  const r = await api("/api/aws/session", {}); if (r.status === 200 && S.ov) S.ov.session = r.body; if (S.modal) renderModal(); renderAll(); if (b) b.disabled = false;
}

/* ------------------------------------------------------------ upload controlado */
function modalShell(...kids) { const m = document.getElementById("modal"); m.hidden = false; m.replaceChildren(el("div", { role: "dialog", "aria-modal": "true" }, ...kids)); }
function closeModal() { S.modal = null; const m = document.getElementById("modal"); m.hidden = true; m.replaceChildren(); }
function openUpload(rid) { S.modal = { type: "upload", rid, step: "intro", plan: null, err: null, remote: false, busy: false }; renderModal(); }
function openJob() { S.modal = { type: "job", job: S.ov && S.ov.in_progress ? S.ov.in_progress.job : null }; renderModal(); pollJob(); }
function renderModal() {
  const m = S.modal; if (!m) return closeModal();
  if (m.type === "job") return renderJobModal();
  const close = el("button", { class: "btn", onclick: closeModal }, "Fechar");
  if (m.step === "intro") {
    modalShell(el("h2", { text: "Enviar run ao S3 — preparar plano" }), el("p", {}, "Run: ", withCopy(m.rid)),
      el("div", { class: "note small", text: "Reutiliza o uploader existente (backup-a.sh upload --run … --full-verify). Escrita condicional --if-none-match '*', verificação por download completo pela role Restore. Nada é enviado nesta etapa. Preparar o plano segura o lock do BACKUP-A por ~1 s: evite 08:00 diário e sexta 18:00." }),
      el("label", {}, el("input", { type: "checkbox", checked: m.remote ? "checked" : null, onchange: (e) => (m.remote = e.target.checked) }), " Conferir no S3 (HeadObject, role Restore) se as chaves de destino ainda não existem — usa AWS e exige sessão válida"),
      m.err ? el("div", { class: "note", text: m.err }) : null, el("div", { class: "filters" }, el("button", { class: "btn pri", disabled: m.busy, onclick: preparePlan }, m.busy ? "preparando…" : "Preparar plano"), close));
    return;
  }
  if (m.step === "plan") {
    const p = m.plan, sess = S.ov && S.ov.session, sessOk = sess && sess.verified && sess.fresh, rcx = p.remote_check;
    const blocked = rcx && rcx.done && rcx.objects.some((o) => /JÁ EXISTE/.test(o.status));
    const phrase = p.confirm_phrase, inp = el("input", { type: "text", id: "ph", placeholder: phrase, style: "width:100%", autocomplete: "off", oninput: (e) => { document.getElementById("go").disabled = !(e.target.value === phrase && sessOk && !blocked && !m.busy); } });
    modalShell(el("h2", { text: "Revise o plano de envio" }), kv([["Run", withCopy(p.run)], ["Estado", pill(p.state, stateKind(p.state))], ["Bucket / região", `${p.bucket} / ${p.region}`], ["Pendentes", `${p.pending.length} objeto(s), ${p.pending_bytes} bytes`],
      ["Escrita", "PutObject condicional (--if-none-match '*', SHA-256), tentativa única, sem repetição cega"], ["Verificação", "download completo pela role Restore: SHA-256 do ciphertext, tamanho e VersionId (UPLOADED_VERIFIED só após todos)"], ["Hash do plano", withCopy(p.plan_hash)], ["Preparado em", T(p.prepared)]]),
      el("div", { class: "scroll" }, el("table", {}, el("thead", {}, el("tr", {}, ["Objeto", "Estado", "Bytes", "Chave de destino", "SHA-256"].map((x) => el("th", { text: x })))),
        el("tbody", {}, p.objects.map((o) => el("tr", {}, el("td", { text: o.id }), el("td", { text: o.st }), el("td", { text: String(o.bytes) }), el("td", {}, withCopy(o.key)), el("td", {}, withCopy(o.sha))))))),
      rcx ? el("div", { class: "note" }, rcx.done ? ["Conferência remota: ", rcx.objects.map((o) => el("div", { text: o.id + ": " + o.status }))] : "Conferência remota não realizada: " + rcx.reason) : el("div", { class: "note small", text: "Conferência remota das chaves não solicitada (nenhuma chamada AWS até agora)." }),
      el("div", { class: "note" }, "Sessão AWS: ", sessOk ? pill("verificada recentemente e válida", "ok") : pill("não verificada/expirada — use 'Verificar sessão AWS' (e faça o login humano se necessário)", "bad"), " ", el("button", { class: "btn", onclick: verifySession }, "Verificar sessão AWS")),
      m.err ? el("div", { class: "note", text: m.err }) : null,
      el("p", {}, "Para confirmar, digite exatamente: ", withCopy(phrase)), inp,
      el("div", { class: "filters" }, el("button", { class: "btn danger", id: "go", disabled: true, onclick: executeUpload }, "Confirmar e enviar este run"), el("button", { class: "btn", onclick: () => { m.step = "intro"; m.plan = null; renderModal(); } }, "Voltar / novo plano"), close));
    return;
  }
}
async function preparePlan() {
  const m = S.modal; m.busy = true; m.err = null; renderModal();
  const r = await api("/api/upload/plan", { run_id: m.rid, remote_check: !!m.remote });
  m.busy = false;
  if (r.status === 200) { m.plan = r.body; m.step = "plan"; if (r.body.session && S.ov) S.ov.session = r.body.session; } else m.err = r.body.error || ("HTTP " + r.status);
  renderModal();
}
async function executeUpload() {
  const m = S.modal, btn = document.getElementById("go"); if (btn) btn.disabled = true; m.busy = true;
  const r = await api("/api/upload/execute", { run_id: m.rid, plan_id: m.plan.plan_id, plan_hash: m.plan.plan_hash, confirm: document.getElementById("ph").value });
  m.busy = false;
  if (r.status === 202) { S.modal = { type: "job", job: r.body.job }; renderModal(); pollJob(); return; }
  m.err = (r.body.error || ("HTTP " + r.status)) + (r.body.needs_new_review ? " — prepare um novo plano e revise novamente." : ""); renderModal();
}
let jobTimer = null;
async function pollJob() {
  clearTimeout(jobTimer);
  if (!S.modal || S.modal.type !== "job") return;
  try { const j = await getJ("/api/job"); S.modal.job = j.job; S.modal.jerr = null; } catch (e) { S.modal.jerr = e.message; }
  renderModal();
  const st = S.modal && S.modal.job && S.modal.job.status;
  if (S.modal && (st === "running" || st === "running_untracked" || S.modal.jerr)) jobTimer = setTimeout(pollJob, 2000); else tick(true);
}
function renderJobModal() {
  const m = S.modal, j = m.job;
  const kids = [el("h2", { text: "Acompanhamento do upload" })];
  if (!j) kids.push(el("div", { class: "mut", text: "nenhum job registrado" }));
  else {
    const run = j.status === "running" || j.status === "running_untracked";
    kids.push(kv([["Job", j.id], ["Tipo / run", `${j.kind} / ${j.run || "todos os runs na fila (somente leitura no S3)"}`], ["Estado", pill(j.status, run ? "warn" : (j.status === "finished" ? "ok" : "bad"))], ["Início", T(j.started)], ["Término", T(j.ended)], ["Código de saída", j.exit_code === null ? NA : String(j.exit_code)]]));
    if (j.note) kids.push(el("div", { class: "note", text: j.note }));
    if (j.status === "indeterminate" || j.status === "running_untracked") kids.push(el("div", { class: "note", text: "Estado INDETERMINADO até reconciliar os recibos do run (abra o run e confira uploaded.tsv / state)." }));
    if (j.result) {
      kids.push(el("div", { class: "note" }, el("b", { text: j.result.verdict }), el("div", { class: "small", text: `saída ${j.result.exit_code} (${j.result.exit_meaning})` })));
      if (/AMBÍGUO/.test(j.result.verdict)) kids.push(el("div", {}, el("button", { class: "btn", onclick: reconcile }, "Conciliar recibos (somente leitura no S3)")));
      if (j.result.evidence_hint) kids.push(el("div", { class: "note small" }, "Registro em evidência (procedimento): crie pasta em ops/evidence/latest/, copie uploaded.tsv, receipts.tsv, api/*.json e o log, gere MANIFEST.sha256, adicione a entrada em docs/EVIDENCE_INDEX.md e rode pnpm check:evidence-index. Estar neste painel NÃO equivale a estar indexado. Recibos: ", withCopy(j.result.evidence_hint.receipts, "mono small")));
    }
    kids.push(el("h3", { text: "Saída do uploader (últimos bytes)" }), el("pre", { text: j.log_tail === null ? NA : j.log_tail }));
  }
  if (m.jerr) kids.push(el("div", { class: "note" }, "Consulta do job ", na(m.jerr)));
  kids.push(el("div", { class: "filters" }, el("button", { class: "btn", onclick: () => { closeModal(); if (S.drawer) refreshDrawer(); } }, "Fechar (o envio continua no servidor)")));
  modalShell(...kids);
}
async function reconcile() {
  const r = await api("/api/upload/reconcile", { confirm: "CONCILIAR" });
  if (r.status === 202) { S.modal = { type: "job", job: r.body.job }; renderModal(); pollJob(); } else { S.modal.jerr = r.body.error || ("HTTP " + r.status); renderModal(); }
}

/* ------------------------------------------------------------ laço de atualização */
function renderAll() {
  renderOverview(S.ov); renderAgenda(S.ov); renderTodo(S.ov);
  if (S.view === "history") renderHistory();
  renderFresh();
}
function renderFresh() {
  const f = document.getElementById("fresh"); const now = Date.now();
  const age = S.lastOk ? Math.round((now - S.lastOk) / 1000) : null;
  const stale = age === null || age > 15;
  f.className = "fresh" + (stale ? " stale" : "");
  const q = S.ov && S.ov.queried ? S.ov.queried.brt + " / " + S.ov.queried.utc : NA;
  const tryAge = S.lastTry ? Math.round((now - S.lastTry) / 1000) : null;
  f.textContent = (tryAge !== null ? "última tentativa de consulta há " + tryAge + " s · " : "") + "última atualização bem-sucedida: " + (age === null ? NA : "há " + age + " s") + (stale ? " — DADOS DESATUALIZADOS" : "") + (S.err ? " · erro: " + S.err : "") + " · dados do servidor consultados em " + q;
}
async function tick(force) {
  if (S.busy && !force) return; if (S.busy) return;
  S.busy = true; S.lastTry = Date.now();
  try { S.ov = await getJ("/api/overview"); S.lastOk = Date.now(); S.err = null; } catch (e) { S.err = e.message; }
  try { if (S.view === "history") await loadHistory(); if (S.drawer) await refreshDrawer(); } catch (e) { /* já tratado nas funções */ }
  renderAll(); S.busy = false;
}
function loop() { tick().finally(() => setTimeout(loop, 5000)); }
document.getElementById("nav").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return; S.view = b.dataset.view;
  for (const x of document.querySelectorAll("#nav button")) x.classList.toggle("on", x === b);
  for (const v of ["overview", "agenda", "history", "todo"]) document.getElementById("view-" + v).hidden = v !== S.view;
  if (S.view === "history") loadHistory();
});
function applyHash() {
  const h = decodeURIComponent((location.hash || "").slice(1)); const m = h.match(/^run=([A-Za-z0-9\-]{10,80})$/);
  if (m) { openDrawer(m[1]); return; }
  const b = document.querySelector('#nav button[data-view="' + h + '"]'); if (b) b.click();
}
window.addEventListener("hashchange", applyHash);
setInterval(renderFresh, 1000);
getSession().then(() => { applyHash(); loop(); }).catch(() => { S.err = "sessão local indisponível"; loop(); });
