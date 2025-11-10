--
-- PostgreSQL database dump
--

\restrict R21FNeLRlyFlIKCAQLneMq6JlVeHsicvpQzoOWq617OpN3a0GmhvNAP5Ch4TElG

-- Dumped from database version 16.10 (Debian 16.10-1.pgdg13+1)
-- Dumped by pg_dump version 16.10 (Debian 16.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'pending',
    'succeeded',
    'failed'
);


ALTER TYPE public."PaymentStatus" OWNER TO postgres;

--
-- Name: RunStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."RunStatus" AS ENUM (
    'success',
    'error',
    'blocked',
    'pending',
    'running'
);


ALTER TYPE public."RunStatus" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: agent_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_profiles (
    id text NOT NULL,
    agent text NOT NULL,
    name text NOT NULL,
    description text,
    model text NOT NULL,
    "systemPrompt" text NOT NULL,
    tools jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.agent_profiles OWNER TO postgres;

--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_tokens (
    id text NOT NULL,
    token text NOT NULL,
    tenant_id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text,
    description text,
    expires_at timestamp(3) without time zone,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.api_tokens OWNER TO postgres;

--
-- Name: payment_tx; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_tx (
    id text NOT NULL,
    "projectId" text NOT NULL,
    provider text NOT NULL,
    "externalId" text NOT NULL,
    "amountCents" integer NOT NULL,
    status public."PaymentStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.payment_tx OWNER TO postgres;

--
-- Name: plan_quotas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plan_quotas (
    "projectId" text NOT NULL,
    "softLimitCents" integer NOT NULL,
    "hardLimitCents" integer NOT NULL,
    "monthUsageCents" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.plan_quotas OWNER TO postgres;

--
-- Name: pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pricing (
    id text NOT NULL,
    agent text NOT NULL,
    "perRunCents" integer DEFAULT 0 NOT NULL,
    "perMBcents" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.pricing OWNER TO postgres;

--
-- Name: run_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.run_events (
    id text NOT NULL,
    run_id text NOT NULL,
    tenant_id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text,
    type text NOT NULL,
    payload jsonb,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.run_events OWNER TO postgres;

--
-- Name: runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.runs (
    id text NOT NULL,
    agent text NOT NULL,
    status public."RunStatus" NOT NULL,
    request jsonb NOT NULL,
    response jsonb,
    "costCents" integer DEFAULT 0 NOT NULL,
    "traceId" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3) without time zone,
    "errorCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    tenant_id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text
);


ALTER TABLE public.runs OWNER TO postgres;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- Name: uploaded_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.uploaded_documents (
    id text NOT NULL,
    tenant_id text NOT NULL,
    workspace_id text NOT NULL,
    agent_slug text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_key text NOT NULL,
    url text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.uploaded_documents OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    tenant_id text NOT NULL,
    email text NOT NULL,
    display_name text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id text NOT NULL,
    tenant_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
b34a4a96-2a47-4010-a8b1-1498c99328ec	db3a4868d0ca78abceac1d9181420ebe2dc055626364c40ddd764dbefc4835b0	2025-10-30 19:19:48.138956+00	20251020183558_init	\N	\N	2025-10-30 19:19:48.003405+00	1
ba9fb762-9c99-4442-84f0-9530cbc11090	953b01e7aa79ec555320ec95645749fadfdafd28697c03d91e42fac712afc66c	2025-10-30 19:19:48.175893+00	20251020212204_init	\N	\N	2025-10-30 19:19:48.142674+00	1
923d2c3e-8ef1-4253-9dfa-c33cebec2c13	862d11e3080057e6374ff78de3136ec59e4075f92d5ce2dd61551bba79c6223c	2025-10-30 19:19:50.105833+00	20251025_multi_tenant	\N	\N	2025-10-30 19:19:48.179858+00	1
d4a81acd-45a1-447d-af52-7d5435045919	70de3a25fb0454ba944b811232da3e2435d0d3d51d98d7cd2b61b72e03d140c3	2025-10-30 19:19:55.801849+00	20251030191955_add_uploaded_documents	\N	\N	2025-10-30 19:19:55.628847+00	1
\.


--
-- Data for Name: agent_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_profiles (id, agent, name, description, model, "systemPrompt", tools, "createdAt", "updatedAt") FROM stdin;
cmhdt6pe40004dzko0onkyzfa	flow-orchestrator	Flow Orchestrator	Coordena execuções DeFi multi-chain com guardrails.	gpt-4.1	Você é o Flow Orchestrator, especializado em orquestrar fluxos DeFi multi-chain com segurança e verificação de riscos.	[]	2025-10-30 19:19:51.82	2025-10-31 10:44:02.041
cmhdt6pe90005dzkofpai0nam	risk-analyzer	Risk Analyzer	Analisa riscos e compliance para fluxos financeiros.	gpt-4.1-mini	Você é o Risk Analyzer. Avalie riscos e gere relatórios objetivos com recomendações acionáveis.	[]	2025-10-30 19:19:51.825	2025-10-31 10:44:02.047
cmhdt6ped0006dzkobbo2kd1c	onchain-monitor	On-chain Monitor	Monitora eventos on-chain e notifica stakeholders.	gpt-4o-mini	Você é o On-chain Monitor. Monitore eventos on-chain e envie alertas resumidos e claros.	[{"auth": {"type": "bearer", "scopes": {"dev": ["onchain:alerts:write"], "prod": ["onchain:alerts:write"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_PROD_TOKEN"}}}, "name": "onchain.registerAlertRule", "audit": {"pii": [], "logRequest": true}, "method": "POST", "version": "1.0.0", "timeoutMs": 15000, "url_by_env": {"dev": "/api/runs", "prod": "https://api.eiah.local/api/runs"}, "description": "Configura regras de monitoramento on-chain e canais de alerta.", "inputSchema": {"type": "object", "required": ["agent", "prompt"], "properties": {"agent": {"type": "string", "const": "onchain-monitor"}, "prompt": {"type": "string", "minLength": 1}, "metadata": {"type": "object", "required": ["eventTypes", "addresses"], "properties": {"notes": {"type": "string"}, "channels": {"type": "array", "items": {"type": "string"}, "default": ["email"]}, "addresses": {"type": "array", "items": {"type": "string"}, "minItems": 1}, "threshold": {"type": "object", "required": ["value", "unit"], "properties": {"unit": {"type": "string"}, "value": {"type": "string"}}, "additionalProperties": false}, "eventTypes": {"type": "array", "items": {"type": "string"}, "minItems": 1}}, "additionalProperties": true}, "projectId": {"type": ["string", "null"]}}, "additionalProperties": false}, "retryPolicy": {"retries": 2, "backoffMs": 500}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["id", "status", "request", "response"], "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "request": {"type": "object"}, "response": {"type": "object"}, "createdAt": {"type": "string", "format": "date-time"}}}}}, "costEstimator": {"baseCents": 6, "perKBcents": 1}, "simulateFirst": true, "requires_confirmation": "true"}, {"auth": {"type": "bearer", "scopes": {"dev": ["onchain:alerts:read"], "prod": ["onchain:alerts:read"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_PROD_TOKEN"}}}, "name": "onchain.listAlerts", "audit": {"pii": [], "logRequest": false}, "method": "GET", "version": "1.0.0", "timeoutMs": 6000, "url_by_env": {"dev": "/api/runs", "prod": "https://api.eiah.local/api/runs"}, "description": "Lista alertas gerados pelo monitoramento on-chain.", "inputSchema": {"type": "object", "properties": {"to": {"type": "string", "format": "date-time"}, "from": {"type": "string", "format": "date-time"}, "page": {"type": "integer", "minimum": 1}, "size": {"type": "integer", "maximum": 200, "minimum": 1}, "agent": {"type": "string", "const": "onchain-monitor"}, "status": {"enum": ["success", "error", "blocked"], "type": "string"}, "projectId": {"type": "string"}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 200}, "outputSchema": {"type": "object", "required": ["items"], "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "response": {"type": "object"}, "createdAt": {"type": "string", "format": "date-time"}}}}, "total": {"type": "integer"}}}, "costEstimator": {"baseCents": 2}, "simulateFirst": false, "requires_confirmation": "false"}, {"auth": {"type": "bearer", "scopes": {"dev": ["onchain:alerts:read"], "prod": ["onchain:alerts:read"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_PROD_TOKEN"}}}, "name": "onchain.getAlertDetail", "audit": {"pii": [], "logRequest": false}, "method": "GET", "version": "1.0.0", "timeoutMs": 4000, "url_by_env": {"dev": "/api/runs/{id}", "prod": "https://api.eiah.local/api/runs/{id}"}, "description": "Recupera detalhes completos de um alerta específico.", "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "string", "minLength": 1}, "projectId": {"type": "string"}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 250}, "outputSchema": {"type": "object", "required": ["id", "status", "response"], "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "request": {"type": "object"}, "response": {"type": "object"}, "costCents": {"type": "integer"}, "createdAt": {"type": "string", "format": "date-time"}}}, "costEstimator": {"baseCents": 1}, "simulateFirst": false, "requires_confirmation": "false"}]	2025-10-30 19:19:51.83	2025-10-31 10:44:02.05
cmhdt6pes0007dzkoyqx6nww2	I_BC	I_BC GPS	Assistente comercial para inteligência de negócios.	gpt-4.1-mini	Você é o agente I_BC. Ajude equipes comerciais com análises de contas, ICP e estratégias de expansão.	[]	2025-10-30 19:19:51.845	2025-10-31 10:44:02.056
cmhdt6pew0008dzkojwf8199s	Diarias	Diarias GPS	Automatiza rotinas e relatórios operacionais diários.	gpt-4.1-mini	Você é o agente Diarias. Gera relatórios operacionais com foco em métricas principais e backlog de ações.	[]	2025-10-30 19:19:51.848	2025-10-31 10:44:02.058
cmhdt6pf00009dzkoi19a6up2	NFT_PY	NFT PY	Auxilia em estratégias e lançamentos de coleções NFT.	gpt-4.1	Você é o NFT_PY. Planeje campanhas NFT, forneça copy e orientações para comunidades Web3.	[]	2025-10-30 19:19:51.852	2025-10-31 10:44:02.061
cmhdt6pf3000adzkob6s8g9va	ImageNFTDiarias	Image NFT Diarias	Gera prompts criativos para NFTs com atualizações diárias.	gpt-4.1	Você é o ImageNFTDiarias. Crie prompts visuais para NFTs alinhados com tendências diárias e briefing fornecido.	[]	2025-10-30 19:19:51.856	2025-10-31 10:44:02.063
cmhdt6pf8000bdzkos8jk08yl	DeFi_1	DeFi One	Suporte a operações e simulações DeFi.	gpt-4.1	Você é o DeFi One. Auxilie em operações DeFi (lend/borrow, swaps, yield) com atenção à segurança.	[{"auth": {"type": "bearer", "scopes": {"dev": ["defi:simulate"], "prod": ["defi:simulate"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "DEFIDEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "DEFIPROD_TOKEN"}}}, "name": "defi.simulateTx", "audit": {"pii": [], "logRequest": true}, "method": "POST", "version": "1.0.0", "timeoutMs": 8000, "url_by_env": {"dev": "/api/defi1/simulate-mint", "prod": "https://api.eiah.local/api/defi1/simulate-mint"}, "description": "Simula a execução de uma transação DeFi antes do envio on-chain.", "inputSchema": {"type": "object", "required": ["chainId", "abiFragment", "args", "to"], "properties": {"to": {"type": "string", "minLength": 1}, "args": {"type": "array", "items": {}}, "chainId": {"type": "integer"}, "valueWei": {"type": ["string", "null"]}, "projectId": {"type": ["string", "null"]}, "abiFragment": {"type": "string", "minLength": 1}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 300}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["gasEstimate", "calldata"], "properties": {"calldata": {"type": "string"}, "gasEstimate": {"type": "string"}}}, "meta": {"type": "object", "properties": {"tookMs": {"type": "number"}, "traceId": {"type": "string"}}}}}, "costEstimator": {"baseCents": 5, "perKBcents": 1}, "simulateFirst": true, "requires_confirmation": "valueWei != null && valueWei != \\"0\\""}, {"auth": {"type": "bearer", "scopes": {"dev": ["defi:tx:send"], "prod": ["defi:tx:send"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "DEFIDEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "DEFIPROD_TOKEN"}}}, "name": "defi.broadcastTx", "audit": {"pii": [], "logRequest": true}, "method": "POST", "version": "1.0.0", "timeoutMs": 12000, "url_by_env": {"dev": "/api/defi1/mint", "prod": "https://api.eiah.local/api/defi1/mint"}, "description": "Assina e envia transação simulada para a rede selecionada.", "inputSchema": {"type": "object", "required": ["chainId", "to", "abiFragment", "args", "confirmationId"], "properties": {"to": {"type": "string", "minLength": 1}, "args": {"type": "array", "items": {}}, "chainId": {"type": "integer"}, "valueWei": {"type": ["string", "null"]}, "projectId": {"type": ["string", "null"]}, "abiFragment": {"type": "string", "minLength": 1}, "confirmationId": {"type": "string", "minLength": 1}}, "additionalProperties": false}, "retryPolicy": {"retries": 0, "backoffMs": 0}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["txHash"], "properties": {"txHash": {"type": "string"}, "explorerUrl": {"type": "string"}}}, "meta": {"type": "object", "properties": {"tookMs": {"type": "number"}, "traceId": {"type": "string"}}}}}, "costEstimator": {"baseCents": 12}, "simulateFirst": true, "requires_confirmation": "true"}, {"auth": {"type": "bearer", "scopes": {"dev": ["billing:estimate"], "prod": ["billing:estimate"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "EIAH_PROD_TOKEN"}}}, "name": "defi.estimateCost", "audit": {"pii": [], "logRequest": false}, "method": "POST", "version": "1.0.0", "timeoutMs": 4000, "url_by_env": {"dev": "/api/billing/estimate", "prod": "https://api.eiah.local/api/billing/estimate"}, "description": "Consulta estimativa de custo para um fluxo DeFi identificado.", "inputSchema": {"type": "object", "required": ["agent", "inputBytes", "projectId"], "properties": {"agent": {"type": "string", "const": "DeFi_1"}, "tools": {"type": "array", "items": {"type": "string"}}, "projectId": {"type": "string", "minLength": 1}, "inputBytes": {"type": "integer", "minimum": 0}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 150}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["estimateCents", "currency"], "properties": {"currency": {"type": "string"}, "estimateCents": {"type": "integer"}}}}}, "costEstimator": {"baseCents": 1}, "simulateFirst": false, "requires_confirmation": "false"}]	2025-10-30 19:19:51.86	2025-10-31 10:44:02.067
cmhdt6pfe000cdzkoc24q5c3x	Pitch	Pitch GPS	Constrói apresentações e narrativas comerciais.	gpt-4o-mini	Você é o Pitch. Monte apresentações convincentes com storytelling, bullet points e CTA claros.	[]	2025-10-30 19:19:51.866	2025-10-31 10:44:02.07
cmhdt6pfh000ddzko5sws1eqf	MKT	Marketing GPS	Planeja campanhas de marketing multicanal.	gpt-4.1-mini	Você é o MKT GPS. Planeje campanhas de marketing com canais, cronograma e métricas de sucesso.	[]	2025-10-30 19:19:51.869	2025-10-31 10:44:02.073
cmhdt6pfl000edzkord2xmbrj	J_360	Jurídico	Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação.	gpt-4o-mini	Você é o J_360. Agente especializado em contratos civis, imobiliários, tokenização, CVM e tributação.Analisa cláusulas, detecta riscos, insere jurisprudência e gera parecer técnico em linguagem acessível.	[{"auth": {"type": "bearer", "scopes": {"dev": ["law:contract:read"], "prod": ["law:contract:read"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_PROD_TOKEN"}}}, "name": "contract.parse", "audit": {"pii": [], "logRequest": true}, "method": "POST", "version": "1.1.0", "timeoutMs": 16000, "url_by_env": {"dev": "/api/runs", "prod": "https://api.eiah.local/api/runs"}, "description": "Analisa uploads ou URLs de contratos e extrai cláusulas relevantes com avaliação de risco.", "inputSchema": {"type": "object", "required": ["agent", "prompt", "metadata"], "properties": {"agent": {"type": "string", "const": "J_360"}, "prompt": {"type": "string", "minLength": 1}, "metadata": {"type": "object", "required": ["documentSource"], "properties": {"focusAreas": {"type": "array", "items": {"type": "string"}}, "riskThreshold": {"enum": ["baixo", "medio", "alto"], "type": "string", "default": "medio"}, "documentSource": {"type": "object", "required": ["type", "reference"], "properties": {"type": {"enum": ["upload", "url"], "type": "string"}, "reference": {"type": "string", "minLength": 1}}, "additionalProperties": false}}, "additionalProperties": false}, "projectId": {"type": ["string", "null"]}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 350}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["id", "status", "response"], "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "response": {"type": "object", "properties": {"risks": {"type": "array", "items": {"type": "object"}}, "clauses": {"type": "array", "items": {"type": "object"}}}}}}}}, "costEstimator": {"baseCents": 7, "perKBcents": 2}, "simulateFirst": true, "requires_confirmation": "false"}, {"auth": {"type": "bearer", "scopes": {"dev": ["law:knowledge:read"], "prod": ["law:knowledge:read"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_PROD_TOKEN"}}}, "name": "rag.searchLaw", "audit": {"pii": [], "logRequest": false}, "method": "POST", "version": "1.0.0", "timeoutMs": 8000, "url_by_env": {"dev": "/api/runs", "prod": "https://api.eiah.local/api/runs"}, "description": "Pesquisa jurisprudência e normas em coleções LGPD, CVM e tributário para embasar pareceres.", "inputSchema": {"type": "object", "required": ["agent", "prompt", "metadata"], "properties": {"agent": {"type": "string", "const": "J_360"}, "prompt": {"type": "string", "minLength": 1}, "metadata": {"type": "object", "required": ["collections"], "properties": {"filters": {"type": "object", "properties": {"yearTo": {"type": "integer", "minimum": 1900}, "yearFrom": {"type": "integer", "minimum": 1900}, "jurisdiction": {"type": "string"}}}, "maxResults": {"type": "integer", "default": 10, "maximum": 20, "minimum": 1}, "collections": {"type": "array", "items": {"enum": ["lgpd", "cvm", "tributario"], "type": "string"}, "minItems": 1}}, "additionalProperties": false}, "projectId": {"type": ["string", "null"]}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 250}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["id", "status", "response"], "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "response": {"type": "object", "properties": {"matches": {"type": "array", "items": {"type": "object"}}, "summary": {"type": "string"}}}}}}}, "costEstimator": {"baseCents": 4}, "simulateFirst": false, "requires_confirmation": "false"}, {"auth": {"type": "bearer", "scopes": {"dev": ["law:opinion:write"], "prod": ["law:opinion:write"]}, "tokens": {"dev": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_DEV_TOKEN"}, "prod": {"header": "Authorization", "prefix": "Bearer", "variable": "LAW_PROD_TOKEN"}}}, "name": "doc.generateOpinion", "audit": {"pii": ["recipients"], "logRequest": true}, "method": "POST", "version": "1.0.0", "timeoutMs": 20000, "url_by_env": {"dev": "/api/runs", "prod": "https://api.eiah.local/api/runs"}, "description": "Produz parecer ou minuta definitiva com base em insumos prévios e riscos identificados.", "inputSchema": {"type": "object", "required": ["agent", "prompt", "metadata"], "properties": {"agent": {"type": "string", "const": "J_360"}, "prompt": {"type": "string", "minLength": 1}, "metadata": {"type": "object", "required": ["deliverableType"], "properties": {"recipients": {"type": "array", "items": {"type": "object", "required": ["name", "email"], "properties": {"name": {"type": "string"}, "role": {"type": "string"}, "email": {"type": "string", "format": "email"}}}}, "references": {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}, "summary": {"type": "string"}}}}, "deliverableType": {"enum": ["parecer", "minuta", "memorando"], "type": "string"}, "approvalWindowHours": {"type": "integer", "maximum": 168, "minimum": 1}}}, "projectId": {"type": ["string", "null"]}}, "additionalProperties": false}, "retryPolicy": {"retries": 1, "backoffMs": 400}, "outputSchema": {"type": "object", "required": ["ok", "data"], "properties": {"ok": {"type": "boolean"}, "data": {"type": "object", "required": ["id", "status", "response"], "properties": {"id": {"type": "string"}, "status": {"type": "string"}, "response": {"type": "object", "properties": {"documentUrl": {"type": "string"}, "approvalStatus": {"type": "string"}}}}}}}, "costEstimator": {"baseCents": 11, "perKBcents": 3}, "simulateFirst": true, "requires_confirmation": "true"}]	2025-10-30 19:19:51.874	2025-10-31 10:44:02.077
cmhdt6pfr000fdzkovqms1697	EIAH	EIAH Core	Agente core da plataforma Mission Control.	gpt-4.1	Você é o EIAH Core, responsável por responder dúvidas sobre a plataforma e orquestrar agentes especializados.	[]	2025-10-30 19:19:51.879	2025-10-31 10:44:02.081
\.


--
-- Data for Name: api_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.api_tokens (id, token, tenant_id, workspace_id, user_id, description, expires_at, revoked, created_at, updated_at) FROM stdin;
cmhdt6pcp0003dzkowbnamfja	seed_1a24de0197bc8db6ac6d0d0038c47e40	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	Seed API token	\N	f	2025-10-30 19:19:51.77	2025-10-30 19:19:51.77
cmheq770q0003dzr01mm6r24l	seed_83c68ffbdb0e5602b9fca6ba23992963	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	Seed API token	\N	f	2025-10-31 10:44:01.994	2025-10-31 10:44:01.994
\.


--
-- Data for Name: payment_tx; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment_tx (id, "projectId", provider, "externalId", "amountCents", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: plan_quotas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plan_quotas ("projectId", "softLimitCents", "hardLimitCents", "monthUsageCents", "updatedAt", "createdAt") FROM stdin;
workspace-demo	50000	100000	482	2025-10-30 19:41:16.036	2025-10-30 19:19:51.883
\.


--
-- Data for Name: pricing; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pricing (id, agent, "perRunCents", "perMBcents", active, "createdAt") FROM stdin;
pricing-flow-orchestrator	flow-orchestrator	250	15	t	2025-10-30 19:19:51.776
pricing-risk-analyzer	risk-analyzer	180	8	t	2025-10-30 19:19:51.782
pricing-onchain-monitor	onchain-monitor	120	5	t	2025-10-30 19:19:51.785
pricing-i-bc	I_BC	150	5	t	2025-10-30 19:19:51.788
pricing-diarias	Diarias	200	10	t	2025-10-30 19:19:51.791
pricing-nft-py	NFT_PY	220	12	t	2025-10-30 19:19:51.794
pricing-image-nft-diarias	ImageNFTDiarias	260	15	t	2025-10-30 19:19:51.798
pricing-defi-1	DeFi_1	280	18	t	2025-10-30 19:19:51.802
pricing-pitch	Pitch	190	7	t	2025-10-30 19:19:51.805
pricing-mkt	MKT	210	9	t	2025-10-30 19:19:51.808
pricing-j360	J_360	230	11	t	2025-10-30 19:19:51.811
pricing-eiah	EIAH	170	6	t	2025-10-30 19:19:51.816
\.


--
-- Data for Name: run_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.run_events (id, run_id, tenant_id, workspace_id, user_id, type, payload, created_at) FROM stdin;
cmhdttofc000ddzt854wpg767	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.requested	{"agent": "J_360", "metadata": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "simulate", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}, "promptPreview": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de "}	2025-10-30 19:37:43.657
cmhdttoft000fdzt8ergqh0bo	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.enqueued	{"agent": "J_360", "estimateCostCents": 241}	2025-10-30 19:37:43.674
cmhdttog2000hdzt8z70bnahz	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.started	{"agent": "J_360", "promptPreview": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de "}	2025-10-30 19:37:43.682
cmhdttohj000jdzt8lvblj5mo	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.start	{"runId": "cmhdttoer000bdzt8aubmtlbo", "objective": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de incidentes / Compliance.\\nDores e desafios principais: ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?.\\nFerramentas/solucoes atuais: CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO.\\nDocumentos de suporte: trump.png (http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx), FinnancialSummit.pdf (http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn), MetaMask_Fox.svg.png (http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t), pitch.txt (http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15).\\nEventos recentes: COMPLIANCE PREVENÇÃO DE INCLIDENTES .\\nOportunidades identificadas: INOVAÇÃO DO MERCADO JURÍDICO.\\nRiscos e bloqueios: PENDENCIAS NA LEGISLAÇÃO ?.\\nAcoes planejadas: PARECER.\\nResponda com secoes: Resumo Executivo, Estagio Atual, Insights, Riscos, Oportunidades, Recomendacoes."}	2025-10-30 19:37:43.735
cmhdttohs000ldzt8xiwt181p	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.plan.generated	{"steps": [{"id": "cmhdttoer000bdzt8aubmtlbo-step-1", "description": "Executar agente J_360"}]}	2025-10-30 19:37:43.735
cmhdttohs000ndzt8r668gmh1	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.step.start	{"runId": "cmhdttoer000bdzt8aubmtlbo", "stepId": "cmhdttoer000bdzt8aubmtlbo-step-1"}	2025-10-30 19:37:43.736
cmhdttoi1000qdzt89utfkglo	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.step.started	{"stepId": "cmhdttoer000bdzt8aubmtlbo-step-1", "description": "Executar agente J_360"}	2025-10-30 19:37:43.736
cmhdttoi1000rdzt8rkxr9yrv	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.plan.created	{"runId": "cmhdttoer000bdzt8aubmtlbo", "steps": [{"id": "cmhdttoer000bdzt8aubmtlbo-step-1", "description": "Executar agente J_360"}]}	2025-10-30 19:37:43.735
cmhdttziz000vdzt8ad4re9sw	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.finish	{"runId": "cmhdttoer000bdzt8aubmtlbo"}	2025-10-30 19:37:58.044
cmhdttziz000wdzt80ek7xdou	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.step.completed	{"stepId": "cmhdttoer000bdzt8aubmtlbo-step-1", "traceId": "chatcmpl-CWSkp4AwX4gpKnQDO1AfkpqZA1Xhv", "outputPreview": "# Visão 360 - Jusall (Assistentes Virtuais)\\n\\n## Resumo Executivo\\nA empresa Jusall está na vanguarda da inovação jurídica, buscando integrar assistentes virtuais no mercado brasileiro. Contudo, enfrent"}	2025-10-30 19:37:58.044
cmhdttziz000xdzt8s01vka2u	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.step.completed	{"runId": "cmhdttoer000bdzt8aubmtlbo", "stepId": "cmhdttoer000bdzt8aubmtlbo-step-1"}	2025-10-30 19:37:58.044
cmhdttzjo000zdzt83svwtfxd	cmhdttoer000bdzt8aubmtlbo	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.completed	{"tools": ["contract.parse", "rag.searchLaw", "doc.generateOpinion"], "status": "success", "tookMs": 14357, "traceId": "chatcmpl-CWSkp4AwX4gpKnQDO1AfkpqZA1Xhv", "costCents": 241, "planSteps": 1}	2025-10-30 19:37:58.069
cmhdtxy170013dzt8hdkn9107	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.requested	{"agent": "J_360", "metadata": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "execute", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}, "promptPreview": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de "}	2025-10-30 19:41:02.728
cmhdtxy1e0015dzt83kmp03ui	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.enqueued	{"agent": "J_360", "estimateCostCents": 241}	2025-10-30 19:41:02.738
cmhdtxy1l0017dzt8qzutd7iq	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.started	{"agent": "J_360", "promptPreview": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de "}	2025-10-30 19:41:02.745
cmhdtxy1s001ddzt8n2vxnh2b	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.plan.generated	{"steps": [{"id": "cmhdtxy0w0011dzt8ukhmrxzm-step-1", "description": "Executar agente J_360"}]}	2025-10-30 19:41:02.752
cmhdtxy1r0019dzt8a8jaebao	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.start	{"runId": "cmhdtxy0w0011dzt8ukhmrxzm", "objective": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de incidentes / Compliance.\\nDores e desafios principais: ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?.\\nFerramentas/solucoes atuais: CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO.\\nDocumentos de suporte: trump.png (http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx), FinnancialSummit.pdf (http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn), MetaMask_Fox.svg.png (http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t), pitch.txt (http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15).\\nEventos recentes: COMPLIANCE PREVENÇÃO DE INCLIDENTES .\\nOportunidades identificadas: INOVAÇÃO DO MERCADO JURÍDICO.\\nRiscos e bloqueios: PENDENCIAS NA LEGISLAÇÃO ?.\\nAcoes planejadas: PARECER.\\nResponda com secoes: Resumo Executivo, Estagio Atual, Insights, Riscos, Oportunidades, Recomendacoes."}	2025-10-30 19:41:02.752
cmhdtxy1s001fdzt8sxqbsg37	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.plan.created	{"runId": "cmhdtxy0w0011dzt8ukhmrxzm", "steps": [{"id": "cmhdtxy0w0011dzt8ukhmrxzm-step-1", "description": "Executar agente J_360"}]}	2025-10-30 19:41:02.752
cmhdty8ai001ndzt81h6vfdui	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.finish	{"runId": "cmhdtxy0w0011dzt8ukhmrxzm"}	2025-10-30 19:41:16.027
cmhdtxy1s001edzt83d24gwy8	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.step.start	{"runId": "cmhdtxy0w0011dzt8ukhmrxzm", "stepId": "cmhdtxy0w0011dzt8ukhmrxzm-step-1"}	2025-10-30 19:41:02.752
cmhdty8ai001ldzt8wv18tucz	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.step.completed	{"stepId": "cmhdtxy0w0011dzt8ukhmrxzm-step-1", "traceId": "chatcmpl-CWSo3pwK8byAUck9772CFNiLXkhub", "outputPreview": "# Visão 360 - Jusall\\n\\n## Resumo Executivo\\nA Jusall, que atua com assistentes virtuais no setor jurídico, está em uma jornada de transformação no mercado brasileiro, onde a legalidade e o compliance sã"}	2025-10-30 19:41:16.027
cmhdty8ai001kdzt82mrvutez	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	orchestrator.step.completed	{"runId": "cmhdtxy0w0011dzt8ukhmrxzm", "stepId": "cmhdtxy0w0011dzt8ukhmrxzm-step-1"}	2025-10-30 19:41:16.027
cmhdty8b0001pdzt86nth2hog	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.completed	{"tools": ["contract.parse", "rag.searchLaw", "doc.generateOpinion"], "status": "success", "tookMs": 13275, "traceId": "chatcmpl-CWSo3pwK8byAUck9772CFNiLXkhub", "costCents": 241, "planSteps": 1}	2025-10-30 19:41:16.044
cmhdtxy1t001hdzt8p1oa0k2c	cmhdtxy0w0011dzt8ukhmrxzm	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo	run.step.started	{"stepId": "cmhdtxy0w0011dzt8ukhmrxzm-step-1", "description": "Executar agente J_360"}	2025-10-30 19:41:02.752
\.


--
-- Data for Name: runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.runs (id, agent, status, request, response, "costCents", "traceId", "startedAt", "finishedAt", "errorCode", "createdAt", "updatedAt", tenant_id, workspace_id, user_id) FROM stdin;
cmhdttoer000bdzt8aubmtlbo	J_360	success	{"prompt": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de incidentes / Compliance.\\nDores e desafios principais: ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?.\\nFerramentas/solucoes atuais: CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO.\\nDocumentos de suporte: trump.png (http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx), FinnancialSummit.pdf (http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn), MetaMask_Fox.svg.png (http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t), pitch.txt (http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15).\\nEventos recentes: COMPLIANCE PREVENÇÃO DE INCLIDENTES .\\nOportunidades identificadas: INOVAÇÃO DO MERCADO JURÍDICO.\\nRiscos e bloqueios: PENDENCIAS NA LEGISLAÇÃO ?.\\nAcoes planejadas: PARECER.\\nResponda com secoes: Resumo Executivo, Estagio Atual, Insights, Riscos, Oportunidades, Recomendacoes.", "metadata": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "simulate", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}}	{"raw": {"id": "chatcmpl-CWSkp4AwX4gpKnQDO1AfkpqZA1Xhv", "model": "gpt-4o-mini-2024-07-18", "usage": {"total_tokens": 904, "prompt_tokens": 386, "completion_tokens": 518, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0, "accepted_prediction_tokens": 0, "rejected_prediction_tokens": 0}}, "object": "chat.completion", "choices": [{"index": 0, "message": {"role": "assistant", "content": "# Visão 360 - Jusall (Assistentes Virtuais)\\n\\n## Resumo Executivo\\nA empresa Jusall está na vanguarda da inovação jurídica, buscando integrar assistentes virtuais no mercado brasileiro. Contudo, enfrenta desafios relacionados à legalidade e compliance. Neste documento, analisamos a jornada atual da empresa, identificamos riscos associados e apresentamos recomendações para os próximos passos. \\n\\n## Estágio Atual\\nA Jusall encontra-se nos estágios de Gestão de Incidentes e Compliance. Recentemente, a empresa participou de eventos focados na prevenção de incidentes, com ênfase em práticas de conformidade. As ferramentas usadas incluem consultas em legislação e análises de mercado.\\n\\n### Dores e Desafios\\n- A utilização de assistentes jurídicos funcionais no mercado brasileiro enfrenta incertezas regulatórias.\\n- Dúvidas sobre a integração de tecnologias avançadas dentro das normas jurídicos existentes.\\n\\n## Insights\\nA análise da legislação atual indica que há espaço para inovação no setor jurídico, desde que atendidas as exigências de compliance e regulamentação. Entretanto, a ausência de uma legislação específica para tecnologias de inteligência artificial no campo jurídico pode representar um obstáculo significativo. \\n\\n## Riscos\\n- **Pendências na Legislação**: A indefinição regulatória pode resultar em impedimentos ao uso de assistentes virtuais em atividades jurídicas.\\n- **Compliance**: O não atendimento às normas de compliance pode levar a incidentes legais e prejuízos financeiros.\\n\\n## Oportunidades\\n- **Inovação do Mercado Jurídico**: A Jusall está posicionada para liderar a inovação no setor, aproveitando a crescente aceitação de tecnologia nos serviços jurídicos, uma vez que a legislação avance para permitir esta integração.\\n  \\n## Recomendações\\n1. **Elaboração de Parecer Técnico**: Redigir um parecer detalhado sobre a viabilidade de assistentes virtuais no contexto jurídico brasileiro.\\n2. **Engajamento com Autoridades**: Propor diálogos com órgãos reguladores para explorar a criação de diretrizes que contemplem o uso de tecnologia no campo jurídico.\\n3. **Monitoramento Contínuo**: Estabelecer um processo de acompanhamento das mudanças legislativas e normativas relevantes que possam afetar a operação da Jusall.\\n4. **Educação e Capacitação**: Desenvolver programas de capacitação para a equipe sobre compliance e melhores práticas legislativas relacionadas à tecnologia.\\n\\nAo seguir estas recomendações, a Jusall poderá mitigar riscos e aproveitar as oportunidades emergentes no mercado jurídico brasileiro.", "refusal": null, "annotations": []}, "logprobs": null, "finish_reason": "stop"}], "created": 1761853063, "service_tier": "default", "system_fingerprint": "fp_560af6e559"}, "plan": [{"id": "cmhdttoer000bdzt8aubmtlbo-step-1", "params": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "simulate", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}, "result": "# Visão 360 - Jusall (Assistentes Virtuais)\\n\\n## Resumo Executivo\\nA empresa Jusall está na vanguarda da inovação jurídica, buscando integrar assistentes virtuais no mercado brasileiro. Contudo, enfrenta desafios relacionados à legalidade e compliance. Neste documento, analisamos a jornada atual da empresa, identificamos riscos associados e apresentamos recomendações para os próximos passos. \\n\\n## Estágio Atual\\nA Jusall encontra-se nos estágios de Gestão de Incidentes e Compliance. Recentemente, a empresa participou de eventos focados na prevenção de incidentes, com ênfase em práticas de conformidade. As ferramentas usadas incluem consultas em legislação e análises de mercado.\\n\\n### Dores e Desafios\\n- A utilização de assistentes jurídicos funcionais no mercado brasileiro enfrenta incertezas regulatórias.\\n- Dúvidas sobre a integração de tecnologias avançadas dentro das normas jurídicos existentes.\\n\\n## Insights\\nA análise da legislação atual indica que há espaço para inovação no setor jurídico, desde que atendidas as exigências de compliance e regulamentação. Entretanto, a ausência de uma legislação específica para tecnologias de inteligência artificial no campo jurídico pode representar um obstáculo significativo. \\n\\n## Riscos\\n- **Pendências na Legislação**: A indefinição regulatória pode resultar em impedimentos ao uso de assistentes virtuais em atividades jurídicas.\\n- **Compliance**: O não atendimento às normas de compliance pode levar a incidentes legais e prejuízos financeiros.\\n\\n## Oportunidades\\n- **Inovação do Mercado Jurídico**: A Jusall está posicionada para liderar a inovação no setor, aproveitando a crescente aceitação de tecnologia nos serviços jurídicos, uma vez que a legislação avance para permitir esta integração.\\n  \\n## Recomendações\\n1. **Elaboração de Parecer Técnico**: Redigir um parecer detalhado sobre a viabilidade de assistentes virtuais no contexto jurídico brasileiro.\\n2. **Engajamento com Autoridades**: Propor diálogos com órgãos reguladores para explorar a criação de diretrizes que contemplem o uso de tecnologia no campo jurídico.\\n3. **Monitoramento Contínuo**: Estabelecer um processo de acompanhamento das mudanças legislativas e normativas relevantes que possam afetar a operação da Jusall.\\n4. **Educação e Capacitação**: Desenvolver programas de capacitação para a equipe sobre compliance e melhores práticas legislativas relacionadas à tecnologia.\\n\\nAo seguir estas recomendações, a Jusall poderá mitigar riscos e aproveitar as oportunidades emergentes no mercado jurídico brasileiro.", "status": "completed", "description": "Executar agente J_360"}], "outputs": [{"data": "# Visão 360 - Jusall (Assistentes Virtuais)\\n\\n## Resumo Executivo\\nA empresa Jusall está na vanguarda da inovação jurídica, buscando integrar assistentes virtuais no mercado brasileiro. Contudo, enfrenta desafios relacionados à legalidade e compliance. Neste documento, analisamos a jornada atual da empresa, identificamos riscos associados e apresentamos recomendações para os próximos passos. \\n\\n## Estágio Atual\\nA Jusall encontra-se nos estágios de Gestão de Incidentes e Compliance. Recentemente, a empresa participou de eventos focados na prevenção de incidentes, com ênfase em práticas de conformidade. As ferramentas usadas incluem consultas em legislação e análises de mercado.\\n\\n### Dores e Desafios\\n- A utilização de assistentes jurídicos funcionais no mercado brasileiro enfrenta incertezas regulatórias.\\n- Dúvidas sobre a integração de tecnologias avançadas dentro das normas jurídicos existentes.\\n\\n## Insights\\nA análise da legislação atual indica que há espaço para inovação no setor jurídico, desde que atendidas as exigências de compliance e regulamentação. Entretanto, a ausência de uma legislação específica para tecnologias de inteligência artificial no campo jurídico pode representar um obstáculo significativo. \\n\\n## Riscos\\n- **Pendências na Legislação**: A indefinição regulatória pode resultar em impedimentos ao uso de assistentes virtuais em atividades jurídicas.\\n- **Compliance**: O não atendimento às normas de compliance pode levar a incidentes legais e prejuízos financeiros.\\n\\n## Oportunidades\\n- **Inovação do Mercado Jurídico**: A Jusall está posicionada para liderar a inovação no setor, aproveitando a crescente aceitação de tecnologia nos serviços jurídicos, uma vez que a legislação avance para permitir esta integração.\\n  \\n## Recomendações\\n1. **Elaboração de Parecer Técnico**: Redigir um parecer detalhado sobre a viabilidade de assistentes virtuais no contexto jurídico brasileiro.\\n2. **Engajamento com Autoridades**: Propor diálogos com órgãos reguladores para explorar a criação de diretrizes que contemplem o uso de tecnologia no campo jurídico.\\n3. **Monitoramento Contínuo**: Estabelecer um processo de acompanhamento das mudanças legislativas e normativas relevantes que possam afetar a operação da Jusall.\\n4. **Educação e Capacitação**: Desenvolver programas de capacitação para a equipe sobre compliance e melhores práticas legislativas relacionadas à tecnologia.\\n\\nAo seguir estas recomendações, a Jusall poderá mitigar riscos e aproveitar as oportunidades emergentes no mercado jurídico brasileiro.", "stepId": "cmhdttoer000bdzt8aubmtlbo-step-1"}], "outputText": "# Visão 360 - Jusall (Assistentes Virtuais)\\n\\n## Resumo Executivo\\nA empresa Jusall está na vanguarda da inovação jurídica, buscando integrar assistentes virtuais no mercado brasileiro. Contudo, enfrenta desafios relacionados à legalidade e compliance. Neste documento, analisamos a jornada atual da empresa, identificamos riscos associados e apresentamos recomendações para os próximos passos. \\n\\n## Estágio Atual\\nA Jusall encontra-se nos estágios de Gestão de Incidentes e Compliance. Recentemente, a empresa participou de eventos focados na prevenção de incidentes, com ênfase em práticas de conformidade. As ferramentas usadas incluem consultas em legislação e análises de mercado.\\n\\n### Dores e Desafios\\n- A utilização de assistentes jurídicos funcionais no mercado brasileiro enfrenta incertezas regulatórias.\\n- Dúvidas sobre a integração de tecnologias avançadas dentro das normas jurídicos existentes.\\n\\n## Insights\\nA análise da legislação atual indica que há espaço para inovação no setor jurídico, desde que atendidas as exigências de compliance e regulamentação. Entretanto, a ausência de uma legislação específica para tecnologias de inteligência artificial no campo jurídico pode representar um obstáculo significativo. \\n\\n## Riscos\\n- **Pendências na Legislação**: A indefinição regulatória pode resultar em impedimentos ao uso de assistentes virtuais em atividades jurídicas.\\n- **Compliance**: O não atendimento às normas de compliance pode levar a incidentes legais e prejuízos financeiros.\\n\\n## Oportunidades\\n- **Inovação do Mercado Jurídico**: A Jusall está posicionada para liderar a inovação no setor, aproveitando a crescente aceitação de tecnologia nos serviços jurídicos, uma vez que a legislação avance para permitir esta integração.\\n  \\n## Recomendações\\n1. **Elaboração de Parecer Técnico**: Redigir um parecer detalhado sobre a viabilidade de assistentes virtuais no contexto jurídico brasileiro.\\n2. **Engajamento com Autoridades**: Propor diálogos com órgãos reguladores para explorar a criação de diretrizes que contemplem o uso de tecnologia no campo jurídico.\\n3. **Monitoramento Contínuo**: Estabelecer um processo de acompanhamento das mudanças legislativas e normativas relevantes que possam afetar a operação da Jusall.\\n4. **Educação e Capacitação**: Desenvolver programas de capacitação para a equipe sobre compliance e melhores práticas legislativas relacionadas à tecnologia.\\n\\nAo seguir estas recomendações, a Jusall poderá mitigar riscos e aproveitar as oportunidades emergentes no mercado jurídico brasileiro."}	241	chatcmpl-CWSkp4AwX4gpKnQDO1AfkpqZA1Xhv	2025-10-30 19:37:43.676	2025-10-30 19:37:58.046	\N	2025-10-30 19:37:43.635	2025-10-30 19:37:58.063	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo
cmhdtxy0w0011dzt8ukhmrxzm	J_360	success	{"prompt": "Voce e o J_360.\\nMonte uma visao 360 organizada, destacando jornada atual, riscos e proximos passos recomendados.\\nCliente/Conta: Jusall (asistentes virtuais).\\nEstagios relevantes da jornada: Gestao de incidentes / Compliance.\\nDores e desafios principais: ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?.\\nFerramentas/solucoes atuais: CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO.\\nDocumentos de suporte: trump.png (http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx), FinnancialSummit.pdf (http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn), MetaMask_Fox.svg.png (http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t), pitch.txt (http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15).\\nEventos recentes: COMPLIANCE PREVENÇÃO DE INCLIDENTES .\\nOportunidades identificadas: INOVAÇÃO DO MERCADO JURÍDICO.\\nRiscos e bloqueios: PENDENCIAS NA LEGISLAÇÃO ?.\\nAcoes planejadas: PARECER.\\nResponda com secoes: Resumo Executivo, Estagio Atual, Insights, Riscos, Oportunidades, Recomendacoes.", "metadata": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "execute", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}}	{"raw": {"id": "chatcmpl-CWSo3pwK8byAUck9772CFNiLXkhub", "model": "gpt-4o-mini-2024-07-18", "usage": {"total_tokens": 960, "prompt_tokens": 386, "completion_tokens": 574, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0, "accepted_prediction_tokens": 0, "rejected_prediction_tokens": 0}}, "object": "chat.completion", "choices": [{"index": 0, "message": {"role": "assistant", "content": "# Visão 360 - Jusall\\n\\n## Resumo Executivo\\nA Jusall, que atua com assistentes virtuais no setor jurídico, está em uma jornada de transformação no mercado brasileiro, onde a legalidade e o compliance são cruciais. O foco atual está na gestão de incidentes e na adequação às normas regulatórias, uma vez que a utilização de assistentes jurídicos pode ser um ponto de atrito se não houver clareza na legislação. Esta análise busca identificar riscos, desafios e sugerir próximos passos para consolidar a presença da Jusall no mercado.\\n\\n## Estágio Atual\\nAtualmente, a Jusall está focada em:\\n- **Gestão de Incidentes**: Implementação de protocolos para lidar com possíveis não conformidades.\\n- **Compliance**: Avaliação contínua das normas legais e regulamentares que afetam o uso de assistentes virtuais.\\n\\n## Insights\\n- **Desafios Regulatórios**: Há incertezas sobre a legalidade do uso de assistentes jurídicos no Brasil, gerando necessidade de entendimento profundo das normas vigentes.\\n- **Consultas a Legislação**: Ferramentas atuais para consulta são eficazes, mas é fundamental interpretar a legislação com um olhar inovador e proativo.\\n\\n## Riscos\\n- **Pendências na Legislação**: A falta de clareza e possíveis lacunas nos regulamentos legais podem acarretar riscos de uso indevido de assistentes virtuais.\\n- **Responsabilidade Legal**: O uso incorreto desses assistentes pode levar a implicações éticas e legais, comprometendo a reputação da Jusall.\\n\\n## Oportunidades\\n- **Inovação no Mercado Jurídico**: A inserção de assistentes virtuais pode redefinir processos legais, aumentando a eficiência e reduzindo custos.\\n- **Posicionamento de Mercado**: Com uma estratégia de compliance sólida, a Jusall pode se estabelecer como uma pioneira na regulamentação e inovação, atraindo mais clientes.\\n\\n## Recomendações\\n1. **Desenvolvimento de um Parecer Técnico**: Produzir um documento que aborde especificamente as questões legais relacionadas ao uso de assistentes jurídicos, sugerindo ajustes de operação conforme regulamentações.\\n2. **Monitoramento Contínuo da Legislação**: Estabelecer uma rotina de acompanhamento das mudanças regulatórias que possam impactar a operação da Jusall.\\n3. **Fortalecimento de Compliance**: Incrementar práticas de compliance para mitigar riscos associados à implementação de novas tecnologias e serviços.\\n4. **Educação e Transparência**: Investir em materiais educativos para clientes, destacando a importância do uso ético e legal de assistentes jurídicos.\\n\\nEssa visão 360 permitirá que a Jusall navegue pelos desafios e capitalize as oportunidades no evolutivo mercado jurídico brasileiro.", "refusal": null, "annotations": []}, "logprobs": null, "finish_reason": "stop"}], "created": 1761853263, "service_tier": "default", "system_fingerprint": "fp_560af6e559"}, "plan": [{"id": "cmhdtxy0w0011dzt8ukhmrxzm-step-1", "params": {"form": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}, "mode": "execute", "domain": "journey_360", "documents": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}], "rawPayload": {"risks": "PENDENCIAS NA LEGISLAÇÃO ?", "segment": "asistentes virtuais", "nextSteps": "PARECER", "painPoints": "ASISTENTES JURÍDICOS FUNCIONAIS PODEM SER USADOS NO MERCADO BRASILIRO ?", "currentTools": "CONSULTA NA LEGISLAÇÃO E MERCADO BRASILEIRO", "customerName": "Jusall", "recentEvents": "COMPLIANCE PREVENÇÃO DE INCLIDENTES ", "journeyStages": ["Gestao de incidentes / Compliance"], "opportunities": "INOVAÇÃO DO MERCADO JURÍDICO", "supportingDocs": [{"id": "cmhdtlt5j0003dzt8o6uxjukx", "url": "http://localhost:8080/api/uploads/cmhdtlt5j0003dzt8o6uxjukx", "name": "trump.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:36.527Z", "sizeBytes": 219427}, {"id": "cmhdtlz360005dzt8o9ubmzkn", "url": "http://localhost:8080/api/uploads/cmhdtlz360005dzt8o9ubmzkn", "name": "FinnancialSummit.pdf", "mimeType": "application/pdf", "createdAt": "2025-10-30T19:31:44.226Z", "sizeBytes": 190671}, {"id": "cmhdtm2t30007dzt8wzz4k45t", "url": "http://localhost:8080/api/uploads/cmhdtm2t30007dzt8wzz4k45t", "name": "MetaMask_Fox.svg.png", "mimeType": "image/png", "createdAt": "2025-10-30T19:31:49.047Z", "sizeBytes": 133198}, {"id": "cmhdtm6zw0009dzt8r8suhv15", "url": "http://localhost:8080/api/uploads/cmhdtm6zw0009dzt8r8suhv15", "name": "pitch.txt", "mimeType": "text/plain", "createdAt": "2025-10-30T19:31:54.475Z", "sizeBytes": 6}]}}, "result": "# Visão 360 - Jusall\\n\\n## Resumo Executivo\\nA Jusall, que atua com assistentes virtuais no setor jurídico, está em uma jornada de transformação no mercado brasileiro, onde a legalidade e o compliance são cruciais. O foco atual está na gestão de incidentes e na adequação às normas regulatórias, uma vez que a utilização de assistentes jurídicos pode ser um ponto de atrito se não houver clareza na legislação. Esta análise busca identificar riscos, desafios e sugerir próximos passos para consolidar a presença da Jusall no mercado.\\n\\n## Estágio Atual\\nAtualmente, a Jusall está focada em:\\n- **Gestão de Incidentes**: Implementação de protocolos para lidar com possíveis não conformidades.\\n- **Compliance**: Avaliação contínua das normas legais e regulamentares que afetam o uso de assistentes virtuais.\\n\\n## Insights\\n- **Desafios Regulatórios**: Há incertezas sobre a legalidade do uso de assistentes jurídicos no Brasil, gerando necessidade de entendimento profundo das normas vigentes.\\n- **Consultas a Legislação**: Ferramentas atuais para consulta são eficazes, mas é fundamental interpretar a legislação com um olhar inovador e proativo.\\n\\n## Riscos\\n- **Pendências na Legislação**: A falta de clareza e possíveis lacunas nos regulamentos legais podem acarretar riscos de uso indevido de assistentes virtuais.\\n- **Responsabilidade Legal**: O uso incorreto desses assistentes pode levar a implicações éticas e legais, comprometendo a reputação da Jusall.\\n\\n## Oportunidades\\n- **Inovação no Mercado Jurídico**: A inserção de assistentes virtuais pode redefinir processos legais, aumentando a eficiência e reduzindo custos.\\n- **Posicionamento de Mercado**: Com uma estratégia de compliance sólida, a Jusall pode se estabelecer como uma pioneira na regulamentação e inovação, atraindo mais clientes.\\n\\n## Recomendações\\n1. **Desenvolvimento de um Parecer Técnico**: Produzir um documento que aborde especificamente as questões legais relacionadas ao uso de assistentes jurídicos, sugerindo ajustes de operação conforme regulamentações.\\n2. **Monitoramento Contínuo da Legislação**: Estabelecer uma rotina de acompanhamento das mudanças regulatórias que possam impactar a operação da Jusall.\\n3. **Fortalecimento de Compliance**: Incrementar práticas de compliance para mitigar riscos associados à implementação de novas tecnologias e serviços.\\n4. **Educação e Transparência**: Investir em materiais educativos para clientes, destacando a importância do uso ético e legal de assistentes jurídicos.\\n\\nEssa visão 360 permitirá que a Jusall navegue pelos desafios e capitalize as oportunidades no evolutivo mercado jurídico brasileiro.", "status": "completed", "description": "Executar agente J_360"}], "outputs": [{"data": "# Visão 360 - Jusall\\n\\n## Resumo Executivo\\nA Jusall, que atua com assistentes virtuais no setor jurídico, está em uma jornada de transformação no mercado brasileiro, onde a legalidade e o compliance são cruciais. O foco atual está na gestão de incidentes e na adequação às normas regulatórias, uma vez que a utilização de assistentes jurídicos pode ser um ponto de atrito se não houver clareza na legislação. Esta análise busca identificar riscos, desafios e sugerir próximos passos para consolidar a presença da Jusall no mercado.\\n\\n## Estágio Atual\\nAtualmente, a Jusall está focada em:\\n- **Gestão de Incidentes**: Implementação de protocolos para lidar com possíveis não conformidades.\\n- **Compliance**: Avaliação contínua das normas legais e regulamentares que afetam o uso de assistentes virtuais.\\n\\n## Insights\\n- **Desafios Regulatórios**: Há incertezas sobre a legalidade do uso de assistentes jurídicos no Brasil, gerando necessidade de entendimento profundo das normas vigentes.\\n- **Consultas a Legislação**: Ferramentas atuais para consulta são eficazes, mas é fundamental interpretar a legislação com um olhar inovador e proativo.\\n\\n## Riscos\\n- **Pendências na Legislação**: A falta de clareza e possíveis lacunas nos regulamentos legais podem acarretar riscos de uso indevido de assistentes virtuais.\\n- **Responsabilidade Legal**: O uso incorreto desses assistentes pode levar a implicações éticas e legais, comprometendo a reputação da Jusall.\\n\\n## Oportunidades\\n- **Inovação no Mercado Jurídico**: A inserção de assistentes virtuais pode redefinir processos legais, aumentando a eficiência e reduzindo custos.\\n- **Posicionamento de Mercado**: Com uma estratégia de compliance sólida, a Jusall pode se estabelecer como uma pioneira na regulamentação e inovação, atraindo mais clientes.\\n\\n## Recomendações\\n1. **Desenvolvimento de um Parecer Técnico**: Produzir um documento que aborde especificamente as questões legais relacionadas ao uso de assistentes jurídicos, sugerindo ajustes de operação conforme regulamentações.\\n2. **Monitoramento Contínuo da Legislação**: Estabelecer uma rotina de acompanhamento das mudanças regulatórias que possam impactar a operação da Jusall.\\n3. **Fortalecimento de Compliance**: Incrementar práticas de compliance para mitigar riscos associados à implementação de novas tecnologias e serviços.\\n4. **Educação e Transparência**: Investir em materiais educativos para clientes, destacando a importância do uso ético e legal de assistentes jurídicos.\\n\\nEssa visão 360 permitirá que a Jusall navegue pelos desafios e capitalize as oportunidades no evolutivo mercado jurídico brasileiro.", "stepId": "cmhdtxy0w0011dzt8ukhmrxzm-step-1"}], "outputText": "# Visão 360 - Jusall\\n\\n## Resumo Executivo\\nA Jusall, que atua com assistentes virtuais no setor jurídico, está em uma jornada de transformação no mercado brasileiro, onde a legalidade e o compliance são cruciais. O foco atual está na gestão de incidentes e na adequação às normas regulatórias, uma vez que a utilização de assistentes jurídicos pode ser um ponto de atrito se não houver clareza na legislação. Esta análise busca identificar riscos, desafios e sugerir próximos passos para consolidar a presença da Jusall no mercado.\\n\\n## Estágio Atual\\nAtualmente, a Jusall está focada em:\\n- **Gestão de Incidentes**: Implementação de protocolos para lidar com possíveis não conformidades.\\n- **Compliance**: Avaliação contínua das normas legais e regulamentares que afetam o uso de assistentes virtuais.\\n\\n## Insights\\n- **Desafios Regulatórios**: Há incertezas sobre a legalidade do uso de assistentes jurídicos no Brasil, gerando necessidade de entendimento profundo das normas vigentes.\\n- **Consultas a Legislação**: Ferramentas atuais para consulta são eficazes, mas é fundamental interpretar a legislação com um olhar inovador e proativo.\\n\\n## Riscos\\n- **Pendências na Legislação**: A falta de clareza e possíveis lacunas nos regulamentos legais podem acarretar riscos de uso indevido de assistentes virtuais.\\n- **Responsabilidade Legal**: O uso incorreto desses assistentes pode levar a implicações éticas e legais, comprometendo a reputação da Jusall.\\n\\n## Oportunidades\\n- **Inovação no Mercado Jurídico**: A inserção de assistentes virtuais pode redefinir processos legais, aumentando a eficiência e reduzindo custos.\\n- **Posicionamento de Mercado**: Com uma estratégia de compliance sólida, a Jusall pode se estabelecer como uma pioneira na regulamentação e inovação, atraindo mais clientes.\\n\\n## Recomendações\\n1. **Desenvolvimento de um Parecer Técnico**: Produzir um documento que aborde especificamente as questões legais relacionadas ao uso de assistentes jurídicos, sugerindo ajustes de operação conforme regulamentações.\\n2. **Monitoramento Contínuo da Legislação**: Estabelecer uma rotina de acompanhamento das mudanças regulatórias que possam impactar a operação da Jusall.\\n3. **Fortalecimento de Compliance**: Incrementar práticas de compliance para mitigar riscos associados à implementação de novas tecnologias e serviços.\\n4. **Educação e Transparência**: Investir em materiais educativos para clientes, destacando a importância do uso ético e legal de assistentes jurídicos.\\n\\nEssa visão 360 permitirá que a Jusall navegue pelos desafios e capitalize as oportunidades no evolutivo mercado jurídico brasileiro."}	241	chatcmpl-CWSo3pwK8byAUck9772CFNiLXkhub	2025-10-30 19:41:02.74	2025-10-30 19:41:16.028	\N	2025-10-30 19:41:02.719	2025-10-30 19:41:16.04	tenant-demo	workspace-demo	cmhdt6pck0001dzko8b4mb5xo
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, created_at, updated_at) FROM stdin;
legacy-tenant	Legacy Tenant	2025-10-30 19:19:48.186	2025-10-30 19:19:48.186
tenant-demo	Demo Tenant	2025-10-30 19:19:51.73	2025-10-31 10:44:01.977
\.


--
-- Data for Name: uploaded_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.uploaded_documents (id, tenant_id, workspace_id, agent_slug, file_name, mime_type, size_bytes, storage_key, url, created_at) FROM stdin;
cmhdtan5p0001dzt8ax563yne	tenant-demo	workspace-demo	j360	architecture-current.txt	text/plain	2479	8a3a5869-787f-480d-b6ca-5029686cb85d.txt	/api/uploads/cmhdtan5p0001dzt8ax563yne	2025-10-30 19:22:55.549
cmhdtlt5j0003dzt8o6uxjukx	tenant-demo	workspace-demo	j360	trump.png	image/png	219427	69abf67b-9404-4b0f-8660-6db5bf5f0609.png	/api/uploads/cmhdtlt5j0003dzt8o6uxjukx	2025-10-30 19:31:36.527
cmhdtlz360005dzt8o9ubmzkn	tenant-demo	workspace-demo	j360	FinnancialSummit.pdf	application/pdf	190671	31e26590-7825-47e8-aebc-6ab459479b01.pdf	/api/uploads/cmhdtlz360005dzt8o9ubmzkn	2025-10-30 19:31:44.226
cmhdtm2t30007dzt8wzz4k45t	tenant-demo	workspace-demo	j360	MetaMask_Fox.svg.png	image/png	133198	61428e08-a13d-42cc-8d3e-32d3ca535ad6.png	/api/uploads/cmhdtm2t30007dzt8wzz4k45t	2025-10-30 19:31:49.047
cmhdtm6zw0009dzt8r8suhv15	tenant-demo	workspace-demo	j360	pitch.txt	text/plain	6	ef02749e-f7b2-413a-8cb1-63510c26b9d3.txt	/api/uploads/cmhdtm6zw0009dzt8r8suhv15	2025-10-30 19:31:54.475
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, tenant_id, email, display_name, created_at, updated_at) FROM stdin;
cmhdt6pck0001dzko8b4mb5xo	tenant-demo	demo@eiah.ai	Demo User	2025-10-30 19:19:51.764	2025-10-31 10:44:01.99
\.


--
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workspaces (id, tenant_id, name, created_at, updated_at) FROM stdin;
legacy-workspace	legacy-tenant	Legacy Workspace	2025-10-30 19:19:48.186	2025-10-30 19:19:48.186
workspace-demo	tenant-demo	Demo Workspace	2025-10-30 19:19:51.758	2025-10-31 10:44:01.984
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: agent_profiles agent_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_profiles
    ADD CONSTRAINT agent_profiles_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_key UNIQUE (token);


--
-- Name: payment_tx payment_tx_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_tx
    ADD CONSTRAINT payment_tx_pkey PRIMARY KEY (id);


--
-- Name: plan_quotas plan_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plan_quotas
    ADD CONSTRAINT plan_quotas_pkey PRIMARY KEY ("projectId");


--
-- Name: pricing pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing
    ADD CONSTRAINT pricing_pkey PRIMARY KEY (id);


--
-- Name: run_events run_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_events
    ADD CONSTRAINT run_events_pkey PRIMARY KEY (id);


--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: uploaded_documents uploaded_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.uploaded_documents
    ADD CONSTRAINT uploaded_documents_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: agent_profiles_agent_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_profiles_agent_key ON public.agent_profiles USING btree (agent);


--
-- Name: api_tokens_tenant_id_workspace_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX api_tokens_tenant_id_workspace_id_idx ON public.api_tokens USING btree (tenant_id, workspace_id);


--
-- Name: api_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX api_tokens_user_id_idx ON public.api_tokens USING btree (user_id);


--
-- Name: payment_tx_projectId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "payment_tx_projectId_createdAt_idx" ON public.payment_tx USING btree ("projectId", "createdAt");


--
-- Name: pricing_agent_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pricing_agent_active_idx ON public.pricing USING btree (agent, active);


--
-- Name: run_events_run_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX run_events_run_id_created_at_idx ON public.run_events USING btree (run_id, created_at);


--
-- Name: run_events_tenant_id_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX run_events_tenant_id_workspace_id_created_at_idx ON public.run_events USING btree (tenant_id, workspace_id, created_at);


--
-- Name: runs_costCents_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "runs_costCents_idx" ON public.runs USING btree ("costCents");


--
-- Name: runs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX runs_status_idx ON public.runs USING btree (status);


--
-- Name: runs_tenant_id_workspace_id_agent_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "runs_tenant_id_workspace_id_agent_createdAt_idx" ON public.runs USING btree (tenant_id, workspace_id, agent, "createdAt");


--
-- Name: uploaded_documents_tenant_id_workspace_id_agent_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX uploaded_documents_tenant_id_workspace_id_agent_slug_idx ON public.uploaded_documents USING btree (tenant_id, workspace_id, agent_slug);


--
-- Name: users_tenant_id_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_tenant_id_email_idx ON public.users USING btree (tenant_id, email);


--
-- Name: workspaces_tenant_id_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspaces_tenant_id_name_idx ON public.workspaces USING btree (tenant_id, name);


--
-- Name: api_tokens api_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: api_tokens api_tokens_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: run_events run_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_events
    ADD CONSTRAINT run_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: run_events run_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_events
    ADD CONSTRAINT run_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: run_events run_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_events
    ADD CONSTRAINT run_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: run_events run_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.run_events
    ADD CONSTRAINT run_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: runs runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: runs runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: runs runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: uploaded_documents uploaded_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.uploaded_documents
    ADD CONSTRAINT uploaded_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: uploaded_documents uploaded_documents_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.uploaded_documents
    ADD CONSTRAINT uploaded_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workspaces workspaces_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict R21FNeLRlyFlIKCAQLneMq6JlVeHsicvpQzoOWq617OpN3a0GmhvNAP5Ch4TElG

