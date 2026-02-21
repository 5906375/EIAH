#!/usr/bin/env python3
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_PDF = os.path.join(BASE_DIR, "docs", "ROADMAP_UNIFICADO_v5_LIVRO.pdf")

# Page setup (A4 at ~200 DPI)
PAGE_W, PAGE_H = 1654, 2339
MARGIN = 120
CONTENT_W = PAGE_W - 2 * MARGIN

# Fonts
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT_SANS = os.path.join(FONT_DIR, "DejaVuSans.ttf")
FONT_SANS_BOLD = os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")
FONT_SERIF = os.path.join(FONT_DIR, "DejaVuSerif.ttf")
FONT_SERIF_BOLD = os.path.join(FONT_DIR, "DejaVuSerif-Bold.ttf")

TITLE = ImageFont.truetype(FONT_SANS_BOLD, 70)
H1 = ImageFont.truetype(FONT_SANS_BOLD, 46)
H2 = ImageFont.truetype(FONT_SANS_BOLD, 34)
H3 = ImageFont.truetype(FONT_SANS_BOLD, 28)
BODY = ImageFont.truetype(FONT_SERIF, 26)
BODY_BOLD = ImageFont.truetype(FONT_SERIF_BOLD, 26)
SMALL = ImageFont.truetype(FONT_SANS, 20)

COLORS = {
    "bg": (250, 252, 255),
    "ink": (18, 24, 38),
    "muted": (88, 97, 110),
    "blue": (30, 95, 153),
    "blue_dark": (12, 32, 58),
    "green": (20, 133, 92),
    "orange": (217, 119, 6),
    "gray": (148, 163, 184),
    "line": (203, 213, 225),
}

STATUS_COLORS = {
    "✅": COLORS["green"],
    "⚙️": COLORS["orange"],
    "🏗️": COLORS["gray"],
}

@dataclass
class Phase:
    code: str
    title: str
    status: str
    objective: str
    implemented: List[str]
    to_conclude: List[str]
    criteria: str


PHASES: List[Phase] = [
    Phase(
        code="0",
        title="Infraestrutura Comum (Pré-Execução)",
        status="✅",
        objective=(
            "Garantir consistência entre serviços, bancos e filas antes de iniciar execuções agentic."
        ),
        implemented=[
            "Schema unificado: Run, RunEvent, GuardrailLedger, GuardrailAuditLedger, SclLedger",
            "Redis/BullMQ: runQueue, actionQueue, maintenanceQueue",
            "Multi-tenant/workspace configurado",
            "Custódia obrigatória via Vault (SIGNER_REQUIRED=true + SIGNER_PROVIDER=vault)",
            "Reconciliação hash↔TxID com auditoria recorrente",
            "Anti-duplicação do scheduler + limpeza de repeatables obsoletos",
            "Métricas do scheduler e lock skip (Prom/OTel)",
            "Dashboard de integridade SCL/Guardrail com dados reais",
        ],
        to_conclude=[
            "Integridade automatizada com observabilidade externa (SLOs de reconciliação)",
        ],
        criteria="Integridade automatizada com observabilidade externa (SLOs de reconciliação).",
    ),
    Phase(
        code="1",
        title="Fundação Operacional",
        status="✅",
        objective="Criar o encanamento agentic (autenticação, filas e workers assíncronos).",
        implemented=[
            "Gateway (auth Bearer + rate limit + rotas /runs,/actions,/maintenance)",
            "Core com workers run/action/maintenance",
            "RBAC multi-tenant/workspace",
            "VersionedActionRegistry (catálogo versionado)",
            "Observabilidade básica (RunEvent + métricas BullMQ)",
        ],
        to_conclude=["Base estável sem pendências."],
        criteria="Base estável sem pendências.",
    ),
    Phase(
        code="2",
        title="Cognição Inicial (ReAct + Intenção)",
        status="✅",
        objective="Habilitar o loop cognitivo ReAct com streaming, tool contracting e controle de confiança.",
        implemented=[
            "Loop perceive → plan → act funcional",
            "Persistência de eventos RunEvent e PlanStepRecord",
            "Publicação Redis / SSE (/runs/:id/stream com replay)",
            "Action Runner (MCP Server + adapter Core)",
            "Validação JSON Schema + execução sandboxed",
            "Logging estruturado (GuardrailAuditLedger)",
            "Trust Score como gate (Action Runner)",
        ],
        to_conclude=["Trust Score afeta autorização e execução (comprovado)."],
        criteria="Trust Score afeta autorização e execução.",
    ),
    Phase(
        code="3",
        title="Governança Cognitiva e Observabilidade",
        status="✅",
        objective="Instituir memória semântica, validação de intenção e observabilidade com confiança.",
        implemented=[
            "VectorMemory (pgvector)",
            "Endpoints /memory e /memory/search",
            "Intent Validator em modo enforce (bloqueio)",
            "Run Viewer com masking de PII (markdown + JSON/state)",
            "Trust Score Engine em uso (gates no run + action-runner)",
            "Anti-alucinação heurística (judge gate configurável)",
        ],
        to_conclude=[
            "Tornar judge gate policy bloqueante em fluxos críticos (quando aplicável)",
            "Dashboard dinâmico de Trust Score",
        ],
        criteria="Execuções cognitivamente governadas e rastreáveis.",
    ),
    Phase(
        code="4",
        title="Execução Crítica Imutável (SCL Off-Chain)",
        status="⚙️",
        objective="Garantir rastreabilidade imutável para ações críticas com assinatura obrigatória.",
        implemented=[
            "Ledger append-only (hash de intenção e parâmetros)",
            "Assinatura Vault/KMS obrigatória",
            "ActionRegistry com criticality",
            "Roteamento SCL para ações high/critical",
            "Apenas off-chain (sem TxID on-chain público)",
        ],
        to_conclude=[
            "Classificação crítica completa nas ações restantes",
            "Reconciliação Guardrail ↔ SCL com alertas automáticos",
            "Preparar camada Web3 para futura publicação on-chain",
        ],
        criteria="Ledger off-chain reconciliável + base pronta para migração on-chain.",
    ),
    Phase(
        code="5.0",
        title="Governança Avançada e Marketplace",
        status="⚙️",
        objective="Disponibilizar catálogo governado com delegação segura multi-tenant.",
        implemented=[
            "API /marketplace, /marketplace/:id, /subscribe",
            "Tabelas MarketplaceItem e DelegationPolicy",
            "enforceTenant.ts com checkDelegationPolicy()",
            "Log delegation.used no GuardrailLedger",
            "UI marketplace/self-service básica",
        ],
        to_conclude=[
            "Fluxo completo de assinatura/delegação no front (UX + validação)",
            "Auditoria avançada de delegação (policyHash + signatureHash visíveis no UI)",
        ],
        criteria="Marketplace ativo + delegações auditáveis multi-tenant.",
    ),
    Phase(
        code="5.1",
        title="Proof of Usage (PoU) + Trust Gate",
        status="⚙️",
        objective="Auditar uso e impor gates de confiança com evidências verificáveis.",
        implemented=[
            "Modelo PoU + migrações",
            "Serviço PoU (create/finalize/fail) + composite TxID",
            "Pipeline PoU no Action Runner + eventos PoU",
            "Trust Gate (snapshot + reason codes + métricas)",
        ],
        to_conclude=[
            "Endpoints de auditoria externa (ex.: /ledger/pou/:id)",
            "Hardening/UX operacional (runbook, validação externa, políticas de exposição)",
        ],
        criteria="PoU auditável end-to-end + Trust Gate estável e observável.",
    ),
    Phase(
        code="5.2",
        title="Policies Autoaplicáveis + Human Approval",
        status="🏗️",
        objective="Introduzir enforcement automático de policies com não-repúdio humano.",
        implemented=[],
        to_conclude=[
            "PolicyEngine.ts com enforcement no ActionRunner/Orchestrator",
            "Endpoint /runs/:id/approve para aprovação humana",
            "Run.approval_status + approvedBy",
            "Registro no GuardrailLedger/SCL (proof.finalized)",
            "Painel “Pendentes de Aprovação” no RunViewer",
        ],
        criteria="Policies vivas e autoexecutáveis + não-repúdio humano ativo.",
    ),
    Phase(
        code="5.3",
        title="DLT On-Chain + Auditoria Pública",
        status="🏗️",
        objective="Publicar provas e reputação em ledger on-chain com auditoria pública.",
        implemented=[],
        to_conclude=[
            "Integração Web3 (ethers.js) com TxID real on-chain",
            "Verificação pública (/ledger/:txId)",
            "Tokenização de reputação (TrustScoreToken)",
            "Policies on-chain autoexecutáveis",
        ],
        criteria="Auditoria pública e verificação de reputação on-chain.",
    ),
]

SUMMARY_TABLE = [
    ("0", "Infraestrutura comum", "Base estável + reconciliação", "✅", "—"),
    ("1", "Fundação operacional", "Execução assíncrona + RBAC", "✅", "—"),
    ("2", "Cognição inicial", "ReAct + SSE + MCP", "✅", "—"),
    ("3", "Governança cognitiva", "Intent + PII + Trust", "✅", "Judge policy + dashboard"),
    ("4", "Execução crítica", "SCL off-chain + assinaturas", "⚙️", "Tagging completo + reconciliação ativa"),
    ("5.0", "Marketplace + Delegação", "Catálogo governado", "⚙️", "UX completa + auditoria avançada"),
    ("5.1", "PoU + Trust Gate", "Imutabilidade + confiança", "⚙️", "Endpoints de auditoria + hardening/UX"),
    ("5.2", "Policies + Aprovação", "Governança viva", "🏗️", "PolicyEngine + approvals"),
    ("5.3", "DLT on-chain", "Auditoria pública", "🏗️", "Web3 + explorer interno"),
]

PRIORITIES = [
    "Completar tagging de criticality nas ações remanescentes",
    "Reconciliação Guardrail ↔ SCL com alertas ativos",
    "Trust Score dashboard e políticas de judge bloqueantes",
    "Fluxo completo de delegação no front",
    "Hardening PoU + Trust Gate (auditoria externa + UX)",
    "PolicyEngine + Human Approval",
    "Web3 on-chain + reputação/tokenização",
]


# Helpers

def new_page(bg: Tuple[int, int, int] | None = None) -> Image.Image:
    color = bg if bg else COLORS["bg"]
    return Image.new("RGB", (PAGE_W, PAGE_H), color)


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current: List[str] = []
    for word in words:
        current.append(word)
        w = draw.textlength(" ".join(current), font=font)
        if w > max_width:
            current.pop()
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def draw_paragraph(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, x: int, y: int, max_width: int, line_spacing: float = 1.35, fill=None) -> int:
    fill = fill if fill else COLORS["ink"]
    lines = wrap_text(text, font, max_width, draw)
    line_h = int(font.size * line_spacing)
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y


def draw_bullets(draw: ImageDraw.ImageDraw, items: List[str], font: ImageFont.FreeTypeFont, x: int, y: int, max_width: int, bullet_indent: int = 18) -> int:
    line_h = int(font.size * 1.35)
    for item in items:
        lines = wrap_text(item, font, max_width - bullet_indent, draw)
        draw.text((x, y), "•", font=font, fill=COLORS["ink"])
        offset = 0
        for line in lines:
            draw.text((x + bullet_indent, y + offset), line, font=font, fill=COLORS["ink"])
            offset += line_h
        y += max(line_h, offset)
    return y


def draw_header(draw: ImageDraw.ImageDraw, title: str, subtitle: str | None = None, y: int = MARGIN) -> int:
    draw.text((MARGIN, y), title, font=H1, fill=COLORS["ink"])
    y += 60
    if subtitle:
        y = draw_paragraph(draw, subtitle, BODY, MARGIN, y, CONTENT_W, fill=COLORS["muted"])
        y += 10
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill=COLORS["line"], width=2)
    return y + 24


def draw_timeline(draw: ImageDraw.ImageDraw, y: int) -> int:
    x0 = MARGIN
    x1 = PAGE_W - MARGIN
    timeline_y = y + 40
    draw.line((x0, timeline_y, x1, timeline_y), fill=COLORS["line"], width=4)

    phases = ["0", "1", "2", "3", "4", "5.0", "5.1", "5.2", "5.3"]
    n = len(phases)
    step = (x1 - x0) / (n - 1)
    for i, code in enumerate(phases):
        phase = next(p for p in PHASES if p.code == code)
        cx = x0 + i * step
        color = STATUS_COLORS[phase.status]
        r = 18
        draw.ellipse((cx - r, timeline_y - r, cx + r, timeline_y + r), fill=color, outline=COLORS["ink"], width=2)
        label = f"Fase {code}"
        w = draw.textlength(label, font=SMALL)
        draw.text((cx - w / 2, timeline_y + 30), label, font=SMALL, fill=COLORS["ink"])
    return timeline_y + 80


def draw_table(draw: ImageDraw.ImageDraw, x: int, y: int, col_widths: List[int], rows: List[Tuple[str, ...]], header: Tuple[str, ...]) -> int:
    row_h = 46
    # Header
    cx = x
    for i, text in enumerate(header):
        draw.rectangle((cx, y, cx + col_widths[i], y + row_h), fill=(233, 240, 248), outline=COLORS["line"])
        draw.text((cx + 10, y + 10), text, font=SMALL, fill=COLORS["ink"])
        cx += col_widths[i]
    y += row_h
    for row in rows:
        cx = x
        for i, text in enumerate(row):
            draw.rectangle((cx, y, cx + col_widths[i], y + row_h), fill=(255, 255, 255), outline=COLORS["line"])
            draw.text((cx + 10, y + 10), text, font=SMALL, fill=COLORS["ink"])
            cx += col_widths[i]
        y += row_h
    return y


# Build pages
pages: List[Image.Image] = []

# Cover
cover = new_page(bg=COLORS["blue_dark"])
draw = ImageDraw.Draw(cover)
# Gradient overlay
for i in range(PAGE_H):
    ratio = i / PAGE_H
    r = int(11 + (22 - 11) * ratio)
    g = int(27 + (42 - 27) * ratio)
    b = int(43 + (67 - 43) * ratio)
    draw.line((0, i, PAGE_W, i), fill=(r, g, b))

# Decorative lines
for i in range(12):
    y = 300 + i * 140
    draw.line((0, y, PAGE_W, y + 120), fill=(22, 72, 116), width=3)

# Logo
logo_path = os.path.join(BASE_DIR, "Eiah_logo.png")
if os.path.exists(logo_path):
    logo = Image.open(logo_path).convert("RGBA")
    max_w = 420
    ratio = max_w / logo.width
    logo = logo.resize((int(logo.width * ratio), int(logo.height * ratio)))
    cover.paste(logo, (MARGIN, 160), logo)

# Titles
cover_title = "Roadmap Unificado v5"
cover_sub = "Gateway + Core + Governança Cognitiva + Execução Crítica + Marketplace"

draw.text((MARGIN, 520), cover_title, font=TITLE, fill=(255, 255, 255))
y = 620
for line in wrap_text(cover_sub, BODY_BOLD, CONTENT_W, draw):
    draw.text((MARGIN, y), line, font=BODY_BOLD, fill=(197, 221, 242))
    y += 40

# Footer
footer = "Livro de documentação — 2026"
fw = draw.textlength(footer, font=SMALL)
draw.text((PAGE_W - MARGIN - fw, PAGE_H - 140), footer, font=SMALL, fill=(197, 221, 242))

pages.append(cover)

# Sumário
page = new_page()
draw = ImageDraw.Draw(page)
y = draw_header(draw, "Sumário")
contents = [
    "Visão geral e definição de done",
    "Fase 0 — Infraestrutura Comum",
    "Fase 1 — Fundação Operacional",
    "Fase 2 — Cognição Inicial",
    "Fase 3 — Governança Cognitiva",
    "Fase 4 — Execução Crítica (SCL Off-Chain)",
    "Fase 5.0 — Marketplace e Delegação",
    "Fase 5.1 — PoU + Trust Gate",
    "Fase 5.2 — Policies e Aprovação Humana",
    "Fase 5.3 — DLT On-Chain",
    "Mapeamento resumido e prioridades técnicas",
    "Estado atual e próximos passos",
]
for idx, item in enumerate(contents, 1):
    line = f"{idx}. {item}"
    y = draw_paragraph(draw, line, BODY, MARGIN, y, CONTENT_W)

pages.append(page)

# Overview
page = new_page()
draw = ImageDraw.Draw(page)
y = draw_header(draw, "Visão Geral", "Legenda de status e critérios de encerramento por fase.")

legend = [
    "✅ Implementado / Concluído",
    "⚙️ Parcial / Em progresso",
    "🏗️ Planejado / Não iniciado",
]

y = draw_bullets(draw, legend, BODY, MARGIN, y, CONTENT_W)

y += 10

done_text = (
    "DONE = merge no main + testes essenciais + evidências no repo + runbook "
    "(quando aplicável) + métricas/observabilidade mínimas + endpoints/documentos "
    "previstos pela fase."
)

y = draw_paragraph(draw, done_text, BODY, MARGIN, y + 10, CONTENT_W)

y += 20

draw.text((MARGIN, y), "Linha do tempo resumida", font=H3, fill=COLORS["ink"])
y += 10

y = draw_timeline(draw, y)

pages.append(page)

# Phase pages
for phase in PHASES:
    page = new_page()
    draw = ImageDraw.Draw(page)
    header = f"Fase {phase.code} — {phase.title}"
    subtitle = f"Status: {phase.status}"
    y = draw_header(draw, header, subtitle)

    draw.text((MARGIN, y), "Objetivo", font=H3, fill=COLORS["blue"])
    y = draw_paragraph(draw, phase.objective, BODY, MARGIN, y + 8, CONTENT_W)
    y += 12

    if phase.implemented:
        draw.text((MARGIN, y), "Entregáveis implementados", font=H3, fill=COLORS["blue"])
        y = draw_bullets(draw, phase.implemented, BODY, MARGIN, y + 8, CONTENT_W)
        y += 8

    draw.text((MARGIN, y), "Entregáveis para concluir", font=H3, fill=COLORS["blue"])
    y = draw_bullets(draw, phase.to_conclude if phase.to_conclude else ["Planejado nesta fase."], BODY, MARGIN, y + 8, CONTENT_W)
    y += 8

    draw.text((MARGIN, y), "Critério de encerramento", font=H3, fill=COLORS["blue"])
    y = draw_paragraph(draw, phase.criteria, BODY, MARGIN, y + 8, CONTENT_W)

    # Simple diagram block
    diagram_x = MARGIN
    diagram_y = PAGE_H - 520
    diagram_w = CONTENT_W
    diagram_h = 260
    draw.rounded_rectangle((diagram_x, diagram_y, diagram_x + diagram_w, diagram_y + diagram_h), radius=20, outline=COLORS["line"], width=2, fill=(245, 248, 252))
    draw.text((diagram_x + 20, diagram_y + 18), "Diagrama de fluxo (resumo)", font=H3, fill=COLORS["ink"])
    # Draw 3 boxes
    box_w = (diagram_w - 80) // 3
    box_h = 90
    bx = diagram_x + 20
    by = diagram_y + 90
    steps = ["Entrada", "Processo", "Evidência"]
    for i, step in enumerate(steps):
        draw.rounded_rectangle((bx, by, bx + box_w, by + box_h), radius=12, outline=COLORS["line"], width=2, fill=(255, 255, 255))
        tw = draw.textlength(step, font=SMALL)
        draw.text((bx + (box_w - tw) / 2, by + 28), step, font=SMALL, fill=COLORS["ink"])
        if i < 2:
            # arrow
            ax1 = bx + box_w + 10
            ax2 = bx + box_w + 40
            ay = by + box_h / 2
            draw.line((ax1, ay, ax2, ay), fill=COLORS["muted"], width=3)
            draw.polygon([(ax2, ay), (ax2 - 10, ay - 6), (ax2 - 10, ay + 6)], fill=COLORS["muted"])
        bx += box_w + 20

    pages.append(page)

# Summary + priorities
page = new_page()
draw = ImageDraw.Draw(page)
y = draw_header(draw, "Mapeamento Resumido")

col_widths = [120, 300, 370, 100, 540]
header = ("Fase", "Foco Central", "Entregável", "Status", "Próximas Ações")
rows = SUMMARY_TABLE

y = draw_table(draw, MARGIN, y, col_widths, rows, header)

y += 20
draw.text((MARGIN, y), "Prioridades técnicas (ordem sugerida)", font=H3, fill=COLORS["blue"])
y = draw_bullets(draw, PRIORITIES, BODY, MARGIN, y + 8, CONTENT_W)

pages.append(page)

# Estado atual
page = new_page()
draw = ImageDraw.Draw(page)
y = draw_header(draw, "Estado Atual (Q1/2026)")

estado = [
    "Infra e cognição maduras; governança ativa.",
    "Execução imutável off-chain com reconciliação e Vault obrigatório.",
    "Próximo salto: auditoria pública e policies autoexecutáveis.",
]

y = draw_bullets(draw, estado, BODY, MARGIN, y, CONTENT_W)

# Add visual block
block_y = y + 40
block_h = 320
block = (MARGIN, block_y, PAGE_W - MARGIN, block_y + block_h)
draw.rounded_rectangle(block, radius=20, outline=COLORS["line"], width=2, fill=(245, 248, 252))

draw.text((MARGIN + 20, block_y + 20), "Checklist de próximos passos", font=H3, fill=COLORS["ink"])

checklist = [
    "Ativar judge gate bloqueante em fluxos críticos",
    "Completar reconciliação automática Guardrail ↔ SCL",
    "Implementar UX completa de delegação",
    "Expor endpoints PoU para auditoria externa",
    "Preparar integração Web3 para fase 5.3",
]

cy = block_y + 70
for item in checklist:
    draw.text((MARGIN + 26, cy), "☐", font=BODY, fill=COLORS["muted"])
    cy = draw_paragraph(draw, item, BODY, MARGIN + 60, cy, CONTENT_W - 60)

# Footer note
note = "Documento gerado automaticamente a partir do ROADMAP_UNIFICADO_REVISADO_v5.md"
fw = draw.textlength(note, font=SMALL)
draw.text((PAGE_W - MARGIN - fw, PAGE_H - 120), note, font=SMALL, fill=COLORS["muted"])

pages.append(page)

# Save PDF
os.makedirs(os.path.dirname(OUTPUT_PDF), exist_ok=True)
pages[0].save(OUTPUT_PDF, "PDF", resolution=200, save_all=True, append_images=pages[1:])

print(f"PDF gerado em: {OUTPUT_PDF}")
