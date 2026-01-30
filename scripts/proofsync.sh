#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# EIAH_BUILDER ↔ EIAH Agent  –  ProofSync (Governança Cognitiva)
# =============================================================================
# Objetivo:
#   - Sincronizar snapshots locais (logs/knowledge_base/*.json)
#     com a Base Global do Agente (via metadados e hashes).
#   - Nenhum segredo, token, ou conteúdo sensível é enviado.
#   - Apenas informações verificáveis e auditáveis são compartilhadas.
# =============================================================================
# Uso:
#   ./scripts/proofsync.sh
#   ./scripts/proofsync.sh --dry-run
# =============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KNOWLEDGE_BASE_DIR="$PROJECT_ROOT/logs/knowledge_base"
INDEX_FILE="$KNOWLEDGE_BASE_DIR/knowledge_base_index.json"
SYNC_OUT="$KNOWLEDGE_BASE_DIR/proofsync_report.json"
DRY_RUN=0

usage() {
  cat <<'TXT'
Usage: proofsync.sh [options]

Options:
  --dry-run     : Exibe o que seria enviado, mas não grava o relatório.
  -h, --help    : Exibe esta ajuda.

TXT
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ ! -d "$KNOWLEDGE_BASE_DIR" ]]; then
  echo "❌ Pasta de conhecimento local não encontrada: $KNOWLEDGE_BASE_DIR"
  exit 1
fi

if [[ ! -f "$INDEX_FILE" ]]; then
  echo "⚠️  Nenhum índice encontrado. Criando novo índice base..."
  echo '{"index_version":"1.0.0","snapshots":[],"active_snapshot":null}' > "$INDEX_FILE"
fi

TMP=$(mktemp)
echo "🔍 Coletando snapshots de $KNOWLEDGE_BASE_DIR ..."

# Cria uma estrutura temporária de provas
echo '{ "proofsync": [], "synced_at": "'$(date -Is)'", "system": {} }' > "$TMP"

# Adiciona contexto do sistema
jq --arg kernel "$(uname -a)" --arg os "$(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')" \
  '.system = { "kernel": $kernel, "os": $os }' "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP"

# Para cada snapshot JSON encontrado
for SNAP in "$KNOWLEDGE_BASE_DIR"/env_*_snapshot.json; do
  [[ -f "$SNAP" ]] || continue
  HASH=$(sha256sum "$SNAP" | awk '{print $1}')
  TS=$(jq -r '.timestamp // "unknown"' "$SNAP" 2>/dev/null || echo "unknown")
  PHASE=$(jq -r '.project.phase // "unknown"' "$SNAP" 2>/dev/null || echo "unknown")
  FILE=$(basename "$SNAP")

  echo "📄 Verificando $FILE"
  jq --arg file "$FILE" --arg hash "$HASH" --arg ts "$TS" --arg phase "$PHASE" \
     '.proofsync += [{"file": $file, "hash": $hash, "timestamp": $ts, "phase": $phase}]' \
     "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP"
done

# Marca o snapshot ativo (do índice local)
ACTIVE=$(jq -r '.active_snapshot // "none"' "$INDEX_FILE")
jq --arg active "$ACTIVE" '.active_snapshot = $active' "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP"

# Gera hash global de verificação
GLOBAL_HASH=$(jq -r '.proofsync[].hash' "$TMP" | sort | sha256sum | awk '{print $1}')
jq --arg global "$GLOBAL_HASH" '.global_hash = $global' "$TMP" > "${TMP}.tmp" && mv "${TMP}.tmp" "$TMP"

# Simulação ou gravação real
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "🧪 [Dry Run] Conteúdo do ProofSync:"
  jq '.' "$TMP"
else
  mv "$TMP" "$SYNC_OUT"
  echo "✅ ProofSync salvo em: $SYNC_OUT"
  echo "🔗 Global Hash: $GLOBAL_HASH"
fi

# Sinaliza que pode ser enviado à Base Global do EIAH (por você)
echo ""
echo "📤 Etapa seguinte:"
echo "  - Copie o conteúdo de $SYNC_OUT e envie ao agente EIAH (aqui)."
echo "  - Isso atualizará a âncora global com hashes verificados."
echo ""
echo "🧠 Princípio: A IA só pode agir se puder provar o que fez."
