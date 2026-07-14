#!/usr/bin/env bash
# Sincroniza a base local de CCTs: baixa novos extratos do Mediador (pipeline
# Sindicatos), carrega no SQLite e implanta no gateway.
#
# Uso:   ./cct_sync.sh /caminho/para/Sindicatos [db_saida]
# Cron:  0 3 * * 1  /caminho/agent-sempe/scripts/cct_sync.sh /caminho/Sindicatos
#
# Requisitos (uma vez): python3 -m pip install playwright beautifulsoup4 lxml
#                       python3 -m playwright install chromium
set -euo pipefail

SINDICATOS_DIR="${1:?informe o caminho da pasta Sindicatos}"
DB_OUT="${2:-$(dirname "$0")/../.cct-sync/ccts.db}"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="${CCT_CONTAINER:-nanobot-gateway}"

mkdir -p "$(dirname "$DB_OUT")"

echo "[1/3] baixando extratos novos do Mediador (categoria downloader)..."
if python3 -c "import playwright, bs4" 2>/dev/null; then
    (cd "$SINDICATOS_DIR" && python3 mediador_categoria_downloader.py) \
        || echo "aviso: downloader falhou (Mediador instável?) — seguindo com o que há em disco"
else
    echo "aviso: playwright/bs4 não instalados no host — pulando download, carregando o que há em disco"
fi

echo "[2/3] carregando .doc na base SQLite..."
python3 "$SCRIPTS_DIR/cct_load_docs.py" "$DB_OUT" \
    "$SINDICATOS_DIR"/ccts_db "$SINDICATOS_DIR"/ccts "$SINDICATOS_DIR"/ccts_categoria \
    "$SINDICATOS_DIR"/ccts_confederacao "$SINDICATOS_DIR"/ccts_filiacao

echo "[3/3] implantando no gateway ($CONTAINER)..."
docker cp "$DB_OUT" "$CONTAINER":/root/.nanobot/ccts.db
echo "sync concluído: $(date -Iseconds)"
