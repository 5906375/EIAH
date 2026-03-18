# Agent Response Examples

> Gerado automaticamente em `2026-03-16T10:54:59.426Z` a partir do registry canônico de agentes.

Os exemplos abaixo são contratos exemplificativos de operação e grounding, não transcripts reais de execução.

## AADV — AADV Self-Service

**Prompt exemplo**
> Preciso de ajuda com entrevista personas e sintetiza evidências finops/segurança em jsonl e resumo executivo pronto para auditoria..

**Resposta esperada**
- Modelo: `gpt-4o-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `fail_closed`
- Fallback: `human_review`
- Fontes primárias: finops.run-events, billing.ledger
- Proveniência: `required`
- Mascaramento: `required`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## DeFi_1 — DeFi One

**Prompt exemplo**
> Preciso de ajuda com suporte a operações e simulações defi..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `use_primary`
- Fallback: `approved_snapshot`
- Fontes primárias: defi.protocol-simulation
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## Diarias — Diarias GPS

**Prompt exemplo**
> Preciso de ajuda com automatiza rotinas e relatórios operacionais diários..

**Resposta esperada**
- Modelo: `gpt-4.1-mini`
- Uso de LLM: `format_only`
- Resolução de conflito: `use_primary`
- Fallback: `approved_snapshot`
- Fontes primárias: ops.daily-snapshot
- Proveniência: `recommended`
- Mascaramento: `none`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## EIAH — EIAH Core

**Prompt exemplo**
> Preciso de ajuda com agente core da plataforma mission control..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `human_review`
- Fallback: `human_review`
- Fontes primárias: agent.registry
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## fin-nexus — FinNexus

**Prompt exemplo**
> Preciso de ajuda com agente de inteligencia financeira para analises de mercado, noticias financeiras, consultas defi e suporte operacional a contas a pagar..

**Resposta esperada**
- Modelo: `gpt-4.1-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `fail_closed`
- Fallback: `block`
- Fontes primárias: finance.payables-registry, finance.bank-reconciliation-ledger
- Proveniência: `required`
- Mascaramento: `required`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## flow-orchestrator — Flow Orchestrator

**Prompt exemplo**
> Preciso de ajuda com coordena execuções defi multi-chain com guardrails..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `fail_closed`
- Fallback: `block`
- Fontes primárias: runs.state-machine, workflow.policy-registry
- Proveniência: `required`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## guardian — Guardian

**Prompt exemplo**
> Preciso de ajuda com registros probatórios com compliance lgpd e verificabilidade pública..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `disallowed_for_critical_execution`
- Resolução de conflito: `fail_closed`
- Fallback: `block`
- Fontes primárias: audit.receipt-bundles, audit.guardrail-logs
- Proveniência: `required`
- Mascaramento: `required`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## I_BC — I_BC GPS

**Prompt exemplo**
> Preciso de ajuda com assistente comercial para inteligência de negócios..

**Resposta esperada**
- Modelo: `gpt-4.1-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `human_review`
- Fallback: `human_review`
- Fontes primárias: crm.account-history
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## ImageNFTDiarias — Image NFT Diarias

**Prompt exemplo**
> Preciso de ajuda com gera prompts criativos para nfts com atualizações diárias..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `format_only`
- Resolução de conflito: `use_primary`
- Fallback: `human_review`
- Fontes primárias: creative.style-guides
- Proveniência: `recommended`
- Mascaramento: `none`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## j360 — Jurídico

**Prompt exemplo**
> Preciso de ajuda com agente especializado em contratos civis, imobiliários, tokenização, cvm e tributação..

**Resposta esperada**
- Modelo: `gpt-4o-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `fail_closed`
- Fallback: `human_review`
- Fontes primárias: legal.contract-library, legal.policy-registry
- Proveniência: `required`
- Mascaramento: `required`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## MKT — Marketing GPS

**Prompt exemplo**
> Preciso de ajuda com planeja campanhas de marketing multicanal..

**Resposta esperada**
- Modelo: `gpt-4.1-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `human_review`
- Fallback: `human_review`
- Fontes primárias: marketing.campaign-history
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## NFT_PY — NFT PY

**Prompt exemplo**
> Preciso de ajuda com auxilia em estratégias e lançamentos de coleções nft..

**Resposta esperada**
- Modelo: `gpt-4.1`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `human_review`
- Fallback: `human_review`
- Fontes primárias: web3.collection-briefs
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## onchain-monitor — On-chain Monitor

**Prompt exemplo**
> Preciso de ajuda com monitora eventos on-chain e notifica stakeholders..

**Resposta esperada**
- Modelo: `gpt-4o-mini`
- Uso de LLM: `format_only`
- Resolução de conflito: `fail_closed`
- Fallback: `block`
- Fontes primárias: chain.event-stream, chain.alert-registry
- Proveniência: `required`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## Pitch — Pitch 

**Prompt exemplo**
> Preciso de ajuda com constrói e critica pitches comerciais estratégicos, ancorados em produto, dor (slo/governança), prova e cta, com camada forte de raciocínio c-level (receita, risco, governança e escalabilidade)..

**Resposta esperada**
- Modelo: `gpt-4o`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `human_review`
- Fallback: `human_review`
- Fontes primárias: sales.positioning-briefs
- Proveniência: `recommended`
- Mascaramento: `conditional`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

## risk-analyzer — Risk Analyzer

**Prompt exemplo**
> Preciso de ajuda com analisa riscos e compliance para fluxos financeiros..

**Resposta esperada**
- Modelo: `gpt-4.1-mini`
- Uso de LLM: `grounded_reasoning`
- Resolução de conflito: `fail_closed`
- Fallback: `block`
- Fontes primárias: risk.policy-rules, risk.control-matrix
- Proveniência: `required`
- Mascaramento: `required`
- Próximo passo esperado: responder com base nas fontes acima e escalar se faltar grounding.

