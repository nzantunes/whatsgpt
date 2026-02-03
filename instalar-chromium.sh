#!/bin/bash
# Instala o Chromium para o WhatsGPT gerar o QR Code.
# Rode no terminal: ./instalar-chromium.sh
# (vai pedir sua senha de administrador)

set -e
echo "Instalando Chromium..."
sudo apt-get update -qq
sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
CHROMIUM=$(which chromium 2>/dev/null || which chromium-browser 2>/dev/null || true)
if [ -n "$CHROMIUM" ]; then
  echo "Chromium instalado em: $CHROMIUM"
  echo "Adicione no .env: CHROMIUM_PATH=$CHROMIUM"
else
  echo "Chromium instalado. Se o QR ainda não aparecer, defina CHROMIUM_PATH no .env com o caminho do executável."
fi
echo "Pronto. Reinicie o app (npm start) e abra a página QR Code."
