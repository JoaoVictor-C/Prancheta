#!/usr/bin/env bash
# Prepara um container novo da nuvem para renderizar figuras da Prancheta.
#
#   source experiments/estudos/matrizes/setup-nuvem.sh
#
# Containers novos chegam sem node_modules, e o Playwright fixado no projeto
# procura uma revisão do Chromium headless que pode não ser a pré-instalada em
# /opt/pw-browsers. O script instala as dependências e cria, fora do
# repositório, um diretório de navegadores em que a revisão esperada aponta
# para o binário instalado. Nenhum arquivo do projeto é alterado.

ROOT="$(git rev-parse --show-toplevel)"
[ -d "$ROOT/node_modules/playwright-core" ] || (cd "$ROOT" && npm ci --no-audit --no-fund)
python3 -c "import numpy" 2>/dev/null || python3 -m pip install -q numpy  # laboratório das aulas

REV="$(node -e "const b=require('$ROOT/node_modules/playwright-core/browsers.json').browsers;console.log(b.find(x=>x.name==='chromium-headless-shell').revision)")"
SHELL_BIN="$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)"
PW="${TMPDIR:-/tmp}/prancheta-pw"

if [ -x "/opt/pw-browsers/chromium_headless_shell-$REV/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
  export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
elif [ -n "$SHELL_BIN" ]; then
  mkdir -p "$PW/chromium_headless_shell-$REV/chrome-headless-shell-linux64"
  for d in /opt/pw-browsers/*; do [ -e "$PW/$(basename "$d")" ] || ln -s "$d" "$PW/$(basename "$d")"; done
  ln -sfn "$SHELL_BIN" "$PW/chromium_headless_shell-$REV/chrome-headless-shell-linux64/chrome-headless-shell"
  touch "$PW/chromium_headless_shell-$REV/INSTALLATION_COMPLETE"
  export PLAYWRIGHT_BROWSERS_PATH="$PW"
else
  echo "nenhum Chromium headless em /opt/pw-browsers; rode: npx playwright install chromium" >&2
fi
echo "PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
