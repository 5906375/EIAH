#!/bin/bash
# ======================================================
# EIAH_BUILDER - apply-prebuild-patch.sh
# Adiciona automaticamente o script "prebuild"
# em todos os package.json dos módulos e apps.
# ======================================================

set -e

ROOT_DIR="/home/jusall/projects/EIAH_BUILDER"
SCRIPT_PATH="bash ../../scripts/prebuild-check.sh"

echo "🔧 Iniciando inserção de prebuild nos pacotes EIAH_BUILDER..."
echo "------------------------------------------------------------"

# Lista de diretórios de pacotes
PACKAGES=(
  "apps/api"
  "apps/cli"
  "apps/workers/action-runner"
  "apps/workers/maintenance-worker"
  "apps/workers/run-worker"
  "packages/core"
  "packages/contracts"
  "packages/mcp-runner"
  "packages/providers"
  "packages/db"
)

for PKG in "${PACKAGES[@]}"; do
  PKG_JSON="$ROOT_DIR/$PKG/package.json"

  if [ ! -f "$PKG_JSON" ]; then
    echo "⚠️  package.json não encontrado em $PKG (pulando...)"
    continue
  fi

  # Verifica se já existe o campo prebuild
  if grep -q "\"prebuild\"" "$PKG_JSON"; then
    echo "✅ $PKG já possui prebuild configurado."
  else
    echo "🛠️  Inserindo prebuild em $PKG..."

    # Inserção segura usando jq (ou sed se jq não estiver disponível)
    if command -v jq >/dev/null 2>&1; then
      tmpfile=$(mktemp)
      jq ".scripts += {\"prebuild\": \"$SCRIPT_PATH\"}" "$PKG_JSON" > "$tmpfile" && mv "$tmpfile" "$PKG_JSON"
    else
      # fallback com sed simples (adiciona dentro de "scripts")
      sed -i '/"scripts": {/a \    "prebuild": "'"$SCRIPT_PATH"'",' "$PKG_JSON"
    fi
  fi
done

echo "------------------------------------------------------------"
echo "✅ Patch aplicado com sucesso em todos os pacotes."
echo "💡 Execute agora:  pnpm -r run build  (para testar todos)"
