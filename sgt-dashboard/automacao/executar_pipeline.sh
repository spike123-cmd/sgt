#!/usr/bin/env bash
# ==============================================================================
# Script disparador do Pipeline SGT CNI
# Localização: /var/www/sgt-dashboard/automacao/executar_pipeline.sh
# ==============================================================================

set -e

DIR_BASE="/var/www/sgt-dashboard/automacao"
DIR_LOGS="${DIR_BASE}/logs"

mkdir -p "${DIR_LOGS}" "${DIR_BASE}/downloads"

echo "======================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INICIANDO EXECUÇÃO DO PIPELINE SGT"
echo "======================================================================"

cd "${DIR_BASE}"

# Carregar variáveis de ambiente
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Executa robô de coleta e tratamento
node coletar_sgt.js

# Garantir permissões de leitura no dashboard
chmod 644 /var/www/sgt-dashboard/dados_sgt.json || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] PIPELINE FINALIZADO COM SUCESSO."
