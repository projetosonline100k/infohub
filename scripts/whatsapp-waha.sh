#!/bin/bash
# (Re)cria o container do WAHA (WhatsApp no Mac, motor GOWS, imagem ARM).
# A chave da API e o segredo do webhook vêm de ~/.infopro-hub/whatsapp/config.json.
# A sessão (login do WhatsApp) fica em ~/.infopro-hub/whatsapp/sessoes e
# sobrevive a recriar o container.
#
# Histórico completo: o WhatsApp só manda o histórico inteiro quando o
# aparelho é CONECTADO pedindo isso (REQUIRE_FULL_SYNC). Mudar estes valores
# só vale depois de desconectar e escanear o QR de novo.
set -e
eval "$(/opt/homebrew/bin/brew shellenv zsh 2>/dev/null || /opt/homebrew/bin/brew shellenv)"
D="$HOME/.infopro-hub/whatsapp"
IMG=devlikeapro/waha:gows-arm-2026.9.2
eval "$(python3 -c "
import json,os; c=json.load(open(os.path.expanduser('~/.infopro-hub/whatsapp/config.json')))
print(f\"KEY={c['waha_api_key']}; SEG={c['segredo_webhook']}; DASH={c['dashboard_senha']}\")")"
docker rm -f waha >/dev/null 2>&1 || true
docker run -d --name waha --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v "$D/sessoes:/app/.sessions" \
  -e WHATSAPP_DEFAULT_ENGINE=GOWS \
  -e WAHA_API_KEY="$KEY" \
  -e WAHA_DASHBOARD_USERNAME=davi -e WAHA_DASHBOARD_PASSWORD="$DASH" \
  -e WHATSAPP_SWAGGER_USERNAME=davi -e WHATSAPP_SWAGGER_PASSWORD="$DASH" \
  -e WHATSAPP_HOOK_URL="http://host.docker.internal:3101/webhook?k=$SEG" \
  -e WHATSAPP_HOOK_EVENTS=message.any \
  -e WAHA_BASE_URL=http://localhost:3000 \
  -e WHATSAPP_FILES_LIFETIME=600 \
  -e WHATSAPP_RESTART_ALL_SESSIONS=True \
  -e WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC=true \
  -e WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT=365 \
  -e WAHA_GOWS_DEVICE_HISTORY_SYNC_SUPPORT_GROUP_HISTORY=true \
  "$IMG" >/dev/null
echo "WAHA recriado ($IMG)."
