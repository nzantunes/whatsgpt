#!/bin/bash
# Inicia o WhatsGPT após limpar portas e sessão do WhatsApp (evita "browser is already running")
cd "$(dirname "$0")"

echo "Limpando portas 3000 e 3001..."
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

echo "Encerrando navegador da sessão anterior..."
pkill -f "session-user-" 2>/dev/null || true
pkill -f "session-whatsgpt" 2>/dev/null || true

AUTH_DIR="data/wwebjs_auth"
if [ -d "$AUTH_DIR" ]; then
  echo "Removendo locks das sessões..."
  for session_dir in "$AUTH_DIR"/session-*; do
    [ -d "$session_dir" ] || continue
    rm -f "$session_dir/SingletonLock" "$session_dir/SingletonSocket" "$session_dir/SingletonCookie" 2>/dev/null || true
  done
fi

sleep 1
echo "Iniciando WhatsGPT..."
exec npm start
