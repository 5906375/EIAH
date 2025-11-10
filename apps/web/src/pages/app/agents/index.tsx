import React, { useMemo, useState } from "react";
import AgentSelect from "../../../components/agents/AgentSelect";

const personaCopy: Record<string, string> = {
  defi_1: "Especialista em simulacoes e estrategias de liquidez DeFi.",
  j_360: "Assistente juridico 360 para contratos tokenizados.",
  guardian: "Middleware de evidencias com LGPD-first, hash verificavel e auditoria on-chain.",
};

const AgentsPage: React.FC = () => {
  const [agentId, setAgentId] = useState<string>();
  const isJ360 = agentId?.toLowerCase() === "j_360";
  const isGuardian = agentId?.toLowerCase() === "guardian";

  const description = useMemo(() => {
    if (!agentId) {
      return "Selecione um agente para visualizar posicionamento, especialidade e escopos aprovados.";
    }
    const key = agentId.toLowerCase();
    return personaCopy[key] ?? "Integracao cadastrada sem descricao personalizada ainda.";
  }, [agentId]);

  return (
    <>
      <div className="glass-panel grid gap-8 p-8 lg:grid-cols-[0.6fr,0.4fr]">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Catalogo</p>
            <h2 className="text-3xl font-display font-semibold text-foreground">Agentes conectados</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Configure intencoes, limites e credenciais; visualize rapidamente o pitch de cada modulo e seus diferenciais.
            </p>
          </div>
          <AgentSelect value={agentId} onChange={setAgentId} />
          <div className="glass-subtle p-6">
            <h3 className="text-sm font-semibold text-foreground">Resumo</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{description}</p>
            {agentId && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="pill">ID: {agentId}</span>
                <span className="pill">Scopes configurados</span>
                <span className="pill">Ultima atualizacao ha 2h</span>
              </div>
            )}
          </div>
        </div>
        <aside className="glass-subtle flex flex-col justify-between gap-6 p-6 text-sm text-muted-foreground">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Checklist de onboard</h4>
            <ul className="mt-3 space-y-2">
              <li>- Definir intencao primaria</li>
              <li>- Configurar url_by_env e tokens</li>
              <li>- Publicar schemas (input/output)</li>
              <li>- Ativar guardrails e confirmacao</li>
            </ul>
          </div>
          <p>
            Use o Agent Builder para registrar Actions com{" "}
            <code className="rounded bg-black/40 px-1">requires_confirmation</code> nas operacoes criticas e monitore os KPIs
            na aba Billing.
          </p>
        </aside>
      </div>
      {isJ360 && (
        <section className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-surface/80 p-8 text-sm text-muted-foreground shadow-lg shadow-black/20">
          <header className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Guia do Usuario</p>
                <h3 className="mt-2 text-2xl font-display font-semibold text-foreground">
                  Guia do Usuario - Agente Juridico (J_360)
                </h3>
              </div>
              <img src="assets/logo_projeto.png" alt="Logo do Projeto" width={140} className="shrink-0 rounded-lg" />
            </div>
            <p className="max-w-3xl">
              Bem-vindo(a)! Este guia explica como usar o Agente Juridico (J_360) no Mission Control para analisar contratos,
              pesquisar fundamentos legais e gerar minutas/pareceres com seguranca, guardrails e auditoria.
            </p>
          </header>
          <div className="grid gap-3">
            <details className="glass-subtle rounded-2xl p-5" open>
              <summary className="cursor-pointer text-sm font-semibold text-foreground">1) Visao geral</summary>
              <p className="mt-3">
                O <strong>J_360</strong> e especializado em direito civil/imobiliario, tokenizacao/CVM e tributario:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Le contratos (PDF, DOCX ou link) e destaca riscos e clausulas sensiveis.</li>
                <li>Pesquisa lei, jurisprudencia e doutrina em colecoes RAG internas (LGPD, CVM, tributario etc.).</li>
                <li>Gera minutas e pareceres (ODT/PDF/Markdown) com confirmacao humana obrigatoria antes de qualquer envio.</li>
              </ul>
              <p className="mt-3 font-semibold text-accent">
                Importante: o J_360 auxilia, mas a decisao final permanece humana. Guardrail requires_confirmation protege as acoes sensiveis.
              </p>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">2) O que foi configurado</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Descricao do agente preenchida com escopo, diferenciais e pitch.</li>
                <li>
                  Ferramentas com contrato completo:
                  <ul className="mt-2 list-[circle] space-y-1 pl-5">
                    <li>
                      <code>contract.parse</code> - extrai clausulas, obrigacoes, prazos, multas e riscos (upload/URL).
                    </li>
                    <li>
                      <code>rag.searchLaw</code> - pesquisa colecoes LGPD/CVM/tributario e retorna trechos com citacoes.
                    </li>
                    <li>
                      <code>doc.generateOpinion</code> - gera parecer/minuta com confirmacao humana antes de qualquer efeito externo.
                    </li>
                  </ul>
                </li>
                <li>Guardrails ativos: simulateFirst true por padrao; requires_confirmation true em operacoes de risco.</li>
                <li>Scopes minimos por ferramenta (ex.: law:contract:read, law:opinion:write).</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">2.1) Colecoes RAG ativas</summary>
              <p className="mt-3">Colecoes disponiveis (podem ser ativadas por projeto/ambiente):</p>
              <ul className="mt-3 space-y-3">
                <li>
                  <strong>LGPD (Lei 13.709/2018)</strong> - principios, bases legais, direitos do titular, ANPD.
                  <div className="text-xs">Status: ativa • Ultima indexacao: {"{{PREENCHER_DATA}}"} • Responsavel: {"{{OWNER}}"}</div>
                </li>
                <li>
                  <strong>CVM (Resolucoes 88/160/233 e correlatas)</strong> - tokenizacao, ofertas publicas, valores mobiliarios.
                  <div className="text-xs">Status: ativa • Ultima indexacao: {"{{PREENCHER_DATA}}"} • Responsavel: {"{{OWNER}}"}</div>
                </li>
                <li>
                  <strong>Tributario (CTN + ISS/IPTU/ITBI + normas locais)</strong> - incidencia, fatos geradores, isencoes.
                  <div className="text-xs">Status: opcional • Ultima indexacao: {"{{PREENCHER_DATA}}"} </div>
                </li>
                <li>
                  <strong>Consumidor (CDC) e Civil/Imobiliario</strong> - vicio oculto, clausulas abusivas, locacao, compra e venda.
                  <div className="text-xs">Status: ativa • Ultima indexacao: {"{{PREENCHER_DATA}}"} </div>
                </li>
              </ul>
              <p className="mt-3 text-xs">
                Dica: ao usar <code>rag.searchLaw</code>, informe jurisdicao (ex.: BR) e dominio (civil, consumidor, cvm) para mais precisao.
              </p>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">3) Como usar no Mission Control</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Abra Catalogo {"->"} Agentes conectados e selecione "Juridico - R$ 2,30/run (ID: J_360)".</li>
                <li>Envie o insumo: upload/URL de contrato ou pergunta juridica detalhada.</li>
                <li>Clique em <strong>Simular primeiro</strong> (estima custo/tempo, valida schema e scopes).</li>
                <li>Revise o preview; se estiver ok, confirme no modal humano para executar.</li>
                <li>Monitore Runs recentes e a aba Billing para custos, limites e execucoes bloqueadas.</li>
              </ol>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">4) Fluxos rapidos</summary>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="font-semibold text-foreground">A) Analisar contrato (detectar riscos)</p>
                  <p>Use <code>contract.parse</code> -&gt; <code>rag.searchLaw</code> para montar resumo de riscos e sugestoes.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">B) Pesquisar fundamento legal (RAG)</p>
                  <p>Acione <code>rag.searchLaw</code> com palavra-chave, jurisdicao e dominio para receber citacoes.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">C) Gerar parecer/minuta</p>
                  <p>Execute <code>doc.generateOpinion</code> com contexto, referencias e pedido. Guardrail exige confirmacao.</p>
                </div>
              </div>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">5) Guardrails e confirmacao</summary>
              <p className="mt-3">
                Politicas aplicadas: simulateFirst true (sempre simular antes de efeitos externos); requires_confirmation true em envio
                externo, efeito juridico imediato ou risco/custo alto; timeouts, retries e circuit breaker para evitar loops; PII mascarada nos logs.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-foreground">
{`Usuario -> Simular -> Preview ok? -> (Sim) -> Modal de Confirmacao -> Executa -> Log & Billing
                             \\-> (Nao) Ajustar inputs -> Simular de novo`}
              </pre>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">6) Escopos, credenciais e ambientes</summary>
              <p className="mt-3">Cada tool requer scopes minimos e tokens por ambiente (dev/stg/prod):</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                  <thead className="text-left text-foreground">
                    <tr>
                      <th className="border-b border-white/10 pb-2 pr-6">Tool</th>
                      <th className="border-b border-white/10 pb-2 pr-6">Scopes minimos</th>
                      <th className="border-b border-white/10 pb-2">Efeito sensivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pr-6 text-foreground">contract.parse</td>
                      <td className="pr-6">
                        <code>law:contract:read</code>
                      </td>
                      <td>Nao</td>
                    </tr>
                    <tr>
                      <td className="pr-6 text-foreground">rag.searchLaw</td>
                      <td className="pr-6">
                        <code>law:rag:read</code>
                      </td>
                      <td>Nao</td>
                    </tr>
                    <tr>
                      <td className="pr-6 text-foreground">doc.generateOpinion</td>
                      <td className="pr-6">
                        <code>law:opinion:write</code> (adicione <code>email:send</code> / <code>esign:request</code> se aplicavel)
                      </td>
                      <td className="font-semibold text-accent">Sim</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs">
                Falta de scope causa erro de autorizacao; solicite habilitacao ao administrador do projeto/ambiente.
              </p>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">7) Entradas e saidas (resumo)</summary>
              <div className="mt-3 space-y-4">
                <div>
                  <p className="font-semibold text-foreground">contract.parse</p>
                  <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-foreground">
{`Entrada:
{
  "source": { "type": "upload|url", "value": "..." },
  "matter": "locacao_residencial|compra_venda|prestacao_servicos|...",
  "notes": "pontos de atencao (opcional)"
}

Saida:
{
  "clauses": [{"title":"Multa rescisoria","risk":"alto","excerpt":"..."}],
  "deadlines": [{"type":"prazo de denuncia","date":"2025-11-30"}],
  "duties": ["responsabilidade por vicios","garantia"],
  "risks": ["assimetria de penalidades","confissao de divida"],
  "recommendations": ["incluir clausula de mediacao","rever multa"]
}`}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold text-foreground">rag.searchLaw</p>
                  <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-foreground">
{`Entrada:
{ "query": "vicio oculto em imovel usado", "domains": ["civil","consumidor"], "jurisdiction": "BR" }

Saida:
{ "hits": [{"source":"CDC art. 18","snippet":"...","relevance":0.92,"ref":"..."}] }`}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold text-foreground">doc.generateOpinion</p>
                  <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-foreground">
{`Entrada:
{
  "title": "Parecer sobre vicio oculto",
  "facts": "resumo dos fatos relevantes",
  "references": [{"type":"law","ref":"CDC art. 18"}],
  "audience": "cliente leigo",
  "length": "2_pages"
}

Saida: documento estruturado com Introducao -> Analise -> Fundamentos -> Conclusao -> Proximos passos.`}
                  </pre>
                </div>
              </div>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">8) Privacidade, logs e auditoria</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>PII mascarada (CPF, RG, e-mail, telefone, enderecos, dados sensiveis).</li>
                <li>Trilha de auditoria por run: entrada/saida resumida, custo estimado/real, traceId, usuario, horario.</li>
                <li>Retencao conforme politica interna do projeto.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">9) Custos e cotas</summary>
              <p className="mt-3">
                Formula: custo = perRun + (perMB x tamanho_do_payload_em_MB). Para o J_360: perRun = R$ 2,30 e perMB = R$ 0,11.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-foreground">
{`Exemplo (contrato 350 KB ~ 0,34 MB):
2,30 + (0,11 x 0,34) = 2,30 + 0,0374 ~= R$ 2,34`}
              </pre>
              <p className="text-xs">Soft limit gera aviso; hard limit bloqueia execucoes ate renovacao ou aumento de cota.</p>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">10) KPIs e Billing</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Runs simuladas vs confirmadas (eficiencia dos guardrails).</li>
                <li>Custo evitado (simulacoes que nao viraram execucao).</li>
                <li>Custo por caso/cliente (use metadados nas requisicoes).</li>
                <li>Consumo vs cotas por periodo, agente e ambiente.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">11) Erros comuns e solucoes</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Escopo ausente/negado - solicite habilitacao (ex.: law:opinion:write).</li>
                <li>Schema invalido - revise campos obrigatorios conforme exemplos.</li>
                <li>Arquivo nao suportado/ilegivel - envie PDF/DOCX textual ou realize OCR antes.</li>
                <li>Pendente de confirmacao - abra o modal humano e confirme.</li>
                <li>Quota excedida (hard limit) - aguarde renovacao ou solicite aumento.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">12) Boas praticas</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Simule sempre antes de executar algo externo.</li>
                <li>Contextualize fatos, objetivo e publico (tecnico/leigo).</li>
                <li>Peca citacoes de lei/artigo/inciso quando relevante.</li>
                <li>Garanta revisao humana antes de enviar a terceiros.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">13) FAQ</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>O J_360 substitui advogado? Nao. Ele acelera leitura/pesquisa, mas a decisao e humana.</li>
                <li>Posso usar minha base de leis? Sim, publique colecoes RAG internas e reindexe.</li>
                <li>Como ajustar o tom do parecer? Informe publico/alvo ou use presets no formulario.</li>
                <li>Consigo exportar ODT/PDF? Sim, via opcoes do resultado de <code>doc.generateOpinion</code>.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">14) Roadmap (sugestoes)</summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Integracao com e-signature (<code>esign.requestSignature</code>) com confirmacao obrigatoria.</li>
                <li>Templates de minuta padrao por tipo contratual.</li>
                <li>Painel de clausulas proibidas/sensiveis com alerta automatico.</li>
                <li>Metrica de tempo poupado por caso.</li>
              </ul>
            </details>
            <details className="glass-subtle rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">15) Modelos de minuta padrao</summary>
              <p className="mt-3">
                Use os templates abaixo para acelerar a redacao. Substitua os tokens e sempre simule, revise e confirme antes de enviar.
              </p>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">15.1) Contrato de locacao residencial</p>
                  <p>
                    Tokens obrigatorios: <code>{"{{LOCADOR_NOME}}"}</code>, <code>{"{{LOCATARIO_NOME}}"}</code>,{" "}
                    <code>{"{{IMOVEL_ENDERECO}}"}</code>, <code>{"{{AREA}}"}</code>, <code>{"{{ALUGUEL_MENSAL}}"}</code>,{" "}
                    <code>{"{{DATA_INICIO}}"}</code>, <code>{"{{PRAZO_MESES}}"}</code>, <code>{"{{GARANTIA_TIPO}}"}</code>,{" "}
                    <code>{"{{MULTA_PERCENTUAL}}"}</code>, <code>{"{{INDICE_REAJUSTE}}"}</code>, <code>{"{{FORO_COMARCA}}"}</code>.
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs">
                    <li>Partes e qualificacao.</li>
                    <li>Objeto e destinacao (uso residencial, proibicao de sublocacao).</li>
                    <li>Prazo e renovacao.</li>
                    <li>Aluguel, reajuste pelo {"{{INDICE_REAJUSTE}}"}, encargos e IPTU.</li>
                    <li>Garantia locaticia {"{{GARANTIA_TIPO}}"} e condicoes.</li>
                    <li>Vistoria inicial, conservacao e obras.</li>
                    <li>Regras de uso e acesso do locador.</li>
                    <li>Rescisao e multa de {"{{MULTA_PERCENTUAL}}"}%.</li>
                    <li>Devolucao, vistoria final e entrega das chaves.</li>
                    <li>Foro: {"{{FORO_COMARCA}}"}</li>
                  </ol>
                  <p className="text-xs">
                    Clausulas sensiveis: multa desproporcional, transferencia indevida de riscos, retencao indevida de caucao.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">15.2) Compra e venda de imovel</p>
                  <p>
                    Tokens obrigatorios: <code>{"{{VENDEDOR_NOME}}"}</code>, <code>{"{{COMPRADOR_NOME}}"}</code>,{" "}
                    <code>{"{{IMOVEL_MATRICULA}}"}</code>, <code>{"{{IMOVEL_ENDERECO}}"}</code>, <code>{"{{PRECO}}"}</code>,{" "}
                    <code>{"{{SINAL}}"}</code>, <code>{"{{PARCELAS}}"}</code>, <code>{"{{VENCIMENTO}}"}</code>,{" "}
                    <code>{"{{CONDICAO_FINANCIAMENTO}}"}</code>, <code>{"{{PRAZO_ESCRITURA}}"}</code>,{" "}
                    <code>{"{{IMPOSTOS_DESPESAS}}"}</code>, <code>{"{{FORO_COMARCA}}"}</code>.
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs">
                    <li>Partes e objeto (imovel, matricula {"{{IMOVEL_MATRICULA}}" }).</li>
                    <li>Titularidade, onus e gravames.</li>
                    <li>Preco, sinal {"{{SINAL}}"}, parcelas {"{{PARCELAS}}"} / {"{{VENCIMENTO}}"} e condicoes suspensivas {"{{CONDICAO_FINANCIAMENTO}}"}.</li>
                    <li>Documentos, prazos para escritura {"{{PRAZO_ESCRITURA}}"} e registro.</li>
                    <li>Tributos e despesas {"{{IMPOSTOS_DESPESAS}}"}, corretagem (se houver).</li>
                    <li>Posse, riscos, imissao e conservacao.</li>
                    <li>Penalidades, inadimplemento e resolucao.</li>
                    <li>Foro: {"{{FORO_COMARCA}}"}</li>
                  </ol>
                  <p className="text-xs">
                    Clausulas sensiveis: venda a non domino, ausencia de certidoes, prazos inexequiveis para escritura/registro, condicao suspensiva mal definida.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">15.3) Prestacao de servicos</p>
                  <p>
                    Tokens obrigatorios: <code>{"{{CONTRATANTE}}"}</code>, <code>{"{{CONTRATADO}}"}</code>, <code>{"{{ESCOPO}}"}</code>,{" "}
                    <code>{"{{ENTREGAVEIS}}"}</code>, <code>{"{{PRAZO}}"}</code>, <code>{"{{VALOR}}"}</code>, <code>{"{{FORMA_PAGAMENTO}}"}</code>,{" "}
                    <code>{"{{SLA}}"}</code>, <code>{"{{MULTA_ATRASO}}"}</code>, <code>{"{{CONFIDENCIALIDADE}}"}</code>, <code>{"{{PI_DIREITOS}}"}</code>,{" "}
                    <code>{"{{RESCISAO_PRAZO}}"}</code>, <code>{"{{FORO}}"}</code>.
                  </p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs">
                    <li>Objeto e escopo {"{{ESCOPO}}"} com entregaveis {"{{ENTREGAVEIS}}"}</li>
                    <li>Prazo total {"{{PRAZO}}"} e marcos.</li>
                    <li>Preco {"{{VALOR}}"}, forma de pagamento {"{{FORMA_PAGAMENTO}}"} e reajustes.</li>
                    <li>Obrigacoes, subcontratacao e alocacao de equipe.</li>
                    <li>SLA {"{{SLA}}"} e penalidades {"{{MULTA_ATRASO}}"}</li>
                    <li>Confidencialidade {"{{CONFIDENCIALIDADE}}"} e protecao de dados.</li>
                    <li>Direitos de PI {"{{PI_DIREITOS}}"} e licencas.</li>
                    <li>Garantias, limitacao de responsabilidade e forca maior.</li>
                    <li>Rescisao {"{{RESCISAO_PRAZO}}"}, efeitos e transicao.</li>
                    <li>Compliance e foro {"{{FORO}}"}</li>
                  </ol>
                  <p className="text-xs">
                    Clausulas sensiveis: cessao ampla de PI sem remuneracao, confidencialidade fraca, SLA irrealista, responsabilidade ilimitada.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Como usar os templates</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs">
                    <li>Duplique o bloco desejado e preencha os tokens {"{{...}}"}. </li>
                    <li>Rode <strong>Simular primeiro</strong> com <code>doc.generateOpinion</code> ou <code>contract.parse</code> (caso inclua rascunho).</li>
                    <li>Peca ao J_360 para sinalizar clausulas sensiveis e sugerir melhorias.</li>
                    <li>Ao enviar/assinar, o fluxo exige confirmacao humana (<code>requires_confirmation</code>).</li>
                  </ol>
                  <p className="text-xs">Aviso: templates sao bases genericas; revise com advogado antes de uso vinculante.</p>
                </div>
              </div>
            </details>
          </div>
          <footer className="pt-4 text-xs text-muted-foreground">
            Pronto! Operacionalize o J_360 com confirmacao humana, rastreabilidade e custos sob controle. Consulte runs recentes
            para auditoria completa de entradas e saidas.
          </footer>
        </section>
      )}
      {isGuardian && (
        <section className="mt-8 space-y-4 rounded-3xl border border-accent/30 bg-surface/80 p-8 text-sm text-muted-foreground shadow-lg shadow-accent/20">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Playbook</p>
            <h3 className="text-2xl font-display font-semibold text-foreground">Guardian — Evidências com verificação pública</h3>
            <p>
              Use o Guardian como camada determinística de compliance: ele só responde em JSON {`{schema_version, action, status, data, errors?}`} e bloqueia qualquer PII antes da ancoragem.
            </p>
          </header>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Roteiros principais</h4>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                <li>• <strong>POST /provas/processuais</strong>: consolida hash SHA-256, cadeia de custódia e fila Merkle com verify_url imediato.</li>
                <li>• <strong>POST /runs/&lt;id&gt;/receipt</strong>: emite recibo assinado, prepara downloads (badge HTML, PDF) e expõe audit.chain_id.</li>
                <li>• <strong>POST /privacy/erasure</strong>: confirma apagamento irrevogável mantendo apenas hash residual para auditoria.</li>
                <li>• <strong>POST /nft/mint</strong>: gera certificado hash_only em L2 com alerta automático quando houver risco de PII.</li>
              </ul>
            </div>
            <div className="glass-subtle rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-foreground">Diretrizes críticas</h4>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                <li>• Sempre ecoar <code>trace_id</code> e <code>idempotency_key</code> em <code>data</code>.</li>
                <li>• Fornecer <code>verify_url</code> válido; se indisponível, usar <code>about:blank</code> com justificativa.</li>
                <li>• Telemetria FinOps obrigatória: <code>{`{l2, unit_cost_usd, batch_size, route}`}</code> com fallback quando custo &gt; US$0,01/1k eventos.</li>
                <li>• status de âncora deve respeitar {`{queued, anchoring, confirmed, reorged}`} com <code>audit.confirmations ≥ 12</code>.</li>
              </ul>
            </div>
          </div>
          <footer className="text-xs text-muted-foreground">
            Checklist rápido: sanitize PII, informe MIME/bytes válidos, configure consenso multi-L2 e publique download_mode adequado (links ou inline).
          </footer>
        </section>
      )}
    </>
  );
};

export default AgentsPage;
