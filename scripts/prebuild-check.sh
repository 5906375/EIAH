#!/bin/bash
set -e
if [ "$(stat -c '%U' packages/core/dist 2>/dev/null || echo none)" = "root" ]; then
  echo "🚨 dist pertence ao root — corrigindo..."
  sudo chown -R $(whoami):$(whoami) packages/core/dist  
fi
