import { DurableObject } from "cloudflare:workers";

/**
 * eiah-site: os arquivos de `public/` continuam servidos como assets estáticos (o Worker só roda
 * quando nenhum arquivo corresponde ao endereço). A única rota dinâmica é a votação ao vivo da
 * extensão /ia-na-pratica-juridica/:
 *   POST /api/votacao/salas                  cria uma sala (devolve código e chave do apresentador)
 *   GET  /api/votacao/salas/:codigo          pergunta ativa, situação e resultados
 *   POST /api/votacao/salas/:codigo/voto     { pergunta, opcao, eleitor }
 *   POST /api/votacao/salas/:codigo/controle { chave, perguntaAtiva?, aberta?, zerar? }
 * Votos são anônimos (o "eleitor" é um identificador aleatório do aparelho) e cada sala apaga
 * todos os dados 24 horas depois de criada.
 */

/** Número de opções de cada pergunta (a ordem e os textos ficam na página). */
const OPCOES_POR_PERGUNTA = [4, 4, 3, 3, 4];
const VALIDADE_SALA_MS = 24 * 60 * 60 * 1000;
const MAX_ELEITORES = 2000;
const CODIGO = /^[A-HJ-NP-Z2-9]{5}$/;
const ELEITOR = /^[a-z0-9]{16,64}$/;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

const aleatorio = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

const novoCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALFABETO[b % ALFABETO.length]).join("");

async function sha256(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function lerCorpo(request) {
  const tamanho = Number(request.headers.get("content-length") ?? "0");
  if (tamanho > 2048) return null;
  try {
    const texto = await request.text();
    return texto.length > 2048 ? null : JSON.parse(texto || "{}");
  } catch {
    return null;
  }
}

export class SalaVotacao extends DurableObject {
  async criar(chaveHash) {
    if (await this.ctx.storage.get("estado")) return false;
    const agora = Date.now();
    await this.ctx.storage.put("estado", { criadaEm: agora, chaveHash, perguntaAtiva: 0, aberta: true, eleitores: 0 });
    await this.ctx.storage.setAlarm(agora + VALIDADE_SALA_MS);
    return true;
  }

  async resumo() {
    const estado = await this.ctx.storage.get("estado");
    if (!estado || Date.now() - estado.criadaEm > VALIDADE_SALA_MS) return null;
    const resultados = [];
    for (let p = 0; p < OPCOES_POR_PERGUNTA.length; p++) {
      resultados.push((await this.ctx.storage.get(`c:${p}`)) ?? new Array(OPCOES_POR_PERGUNTA[p]).fill(0));
    }
    return { perguntaAtiva: estado.perguntaAtiva, aberta: estado.aberta, resultados, expiraEm: estado.criadaEm + VALIDADE_SALA_MS };
  }

  async votar(pergunta, opcao, eleitor) {
    const estado = await this.ctx.storage.get("estado");
    if (!estado || Date.now() - estado.criadaEm > VALIDADE_SALA_MS) return { ok: false, erro: "SALA_INEXISTENTE" };
    if (!estado.aberta || pergunta !== estado.perguntaAtiva) return { ok: false, erro: "VOTACAO_FECHADA" };
    const chaveVoto = `v:${pergunta}:${eleitor}`;
    const anterior = await this.ctx.storage.get(chaveVoto);
    if (anterior === undefined) {
      const conhecido = await this.ctx.storage.get(`e:${eleitor}`);
      if (!conhecido) {
        if (estado.eleitores >= MAX_ELEITORES) return { ok: false, erro: "SALA_CHEIA" };
        estado.eleitores += 1;
        await this.ctx.storage.put({ [`e:${eleitor}`]: true, estado });
      }
    }
    const contagem = (await this.ctx.storage.get(`c:${pergunta}`)) ?? new Array(OPCOES_POR_PERGUNTA[pergunta]).fill(0);
    if (anterior !== undefined) contagem[anterior] = Math.max(0, contagem[anterior] - 1);
    contagem[opcao] += 1;
    await this.ctx.storage.put({ [chaveVoto]: opcao, [`c:${pergunta}`]: contagem });
    return { ok: true };
  }

  async controlar(chave, mudancas) {
    const estado = await this.ctx.storage.get("estado");
    if (!estado || Date.now() - estado.criadaEm > VALIDADE_SALA_MS) return { ok: false, erro: "SALA_INEXISTENTE" };
    if ((await sha256(String(chave ?? ""))) !== estado.chaveHash) return { ok: false, erro: "CHAVE_INVALIDA" };
    if (Number.isInteger(mudancas.perguntaAtiva) && mudancas.perguntaAtiva >= 0 && mudancas.perguntaAtiva < OPCOES_POR_PERGUNTA.length) {
      estado.perguntaAtiva = mudancas.perguntaAtiva;
    }
    if (typeof mudancas.aberta === "boolean") estado.aberta = mudancas.aberta;
    await this.ctx.storage.put("estado", estado);
    if (mudancas.zerar === true) {
      const p = estado.perguntaAtiva;
      const votos = await this.ctx.storage.list({ prefix: `v:${p}:` });
      await this.ctx.storage.delete([...votos.keys(), `c:${p}`]);
    }
    return { ok: true };
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

async function votacao(request, env, partes) {
  // partes: ["salas"] | ["salas", codigo] | ["salas", codigo, "voto" | "controle"]
  if (partes[0] !== "salas") return json({ erro: "NAO_ENCONTRADO" }, 404);

  if (partes.length === 1) {
    if (request.method !== "POST") return json({ erro: "METODO" }, 405);
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = novoCodigo();
      const chave = aleatorio(24);
      const sala = env.SALAS.get(env.SALAS.idFromName(codigo));
      if (await sala.criar(await sha256(chave))) return json({ codigo, chave }, 201);
    }
    return json({ erro: "TENTE_DE_NOVO" }, 503);
  }

  const codigo = String(partes[1] ?? "").toUpperCase();
  if (!CODIGO.test(codigo)) return json({ erro: "SALA_INEXISTENTE" }, 404);
  const sala = env.SALAS.get(env.SALAS.idFromName(codigo));

  if (partes.length === 2) {
    if (request.method !== "GET") return json({ erro: "METODO" }, 405);
    const resumo = await sala.resumo();
    return resumo ? json(resumo) : json({ erro: "SALA_INEXISTENTE" }, 404);
  }

  if (request.method !== "POST") return json({ erro: "METODO" }, 405);
  const corpo = await lerCorpo(request);
  if (!corpo) return json({ erro: "DADOS_INVALIDOS" }, 400);

  if (partes[2] === "voto") {
    const { pergunta, opcao, eleitor } = corpo;
    const valido =
      Number.isInteger(pergunta) && pergunta >= 0 && pergunta < OPCOES_POR_PERGUNTA.length &&
      Number.isInteger(opcao) && opcao >= 0 && opcao < OPCOES_POR_PERGUNTA[pergunta] &&
      typeof eleitor === "string" && ELEITOR.test(eleitor);
    if (!valido) return json({ erro: "DADOS_INVALIDOS" }, 400);
    const r = await sala.votar(pergunta, opcao, eleitor);
    return r.ok ? json({ ok: true }) : json({ erro: r.erro }, r.erro === "SALA_INEXISTENTE" ? 404 : 409);
  }

  if (partes[2] === "controle") {
    const r = await sala.controlar(corpo.chave, { perguntaAtiva: corpo.perguntaAtiva, aberta: corpo.aberta, zerar: corpo.zerar });
    if (r.ok) return json({ ok: true });
    return json({ erro: r.erro }, r.erro === "CHAVE_INVALIDA" ? 403 : 404);
  }

  return json({ erro: "NAO_ENCONTRADO" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/votacao/")) {
      const partes = url.pathname.slice("/api/votacao/".length).split("/").filter(Boolean);
      return votacao(request, env, partes);
    }
    // Qualquer outro endereço: comportamento de site estático, como antes.
    return env.ASSETS.fetch(request);
  },
};
