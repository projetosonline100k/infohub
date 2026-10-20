#!/bin/bash
# Segundo WhatsApp no Mac: o número PESSOAL do Davi (20/10/2026, "quero conectar outro no Davi Queiroz").
# Sobe um WAHA próprio (container waha-pessoal, porta 3002, sessão em ~/.infopro-hub/whatsapp-pessoal/sessoes)
# e um receptor próprio (porta 3102, LaunchAgent com.infoprohub.whatsapp-receptor-pessoal) que grava as
# mensagens com conta = 'pessoal'. Usa as mesmas chaves do principal (só no Mac, nunca no git).
# Os áudios do pessoal são transcritos pelo receptor principal (um só Whisper no Mac).
set -e
eval "$(/opt/homebrew/bin/brew shellenv zsh 2>/dev/null || /opt/homebrew/bin/brew shellenv)"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PY="$(command -v python3)"
D="$HOME/.infopro-hub/whatsapp-pessoal"
mkdir -p "$D/sessoes" "$D/midia"
python3 - <<PYEOF
import json, os
base = json.load(open(os.path.expanduser('~/.infopro-hub/whatsapp/config.json')))
cfg = {k: base[k] for k in ('waha_api_key', 'segredo_webhook', 'dashboard_senha')}
cfg.update({'waha_url': 'http://localhost:3002', 'sessao': 'default', 'porta': 3102, 'conta': 'pessoal', 'transcrever': False})
caminho = os.path.expanduser('~/.infopro-hub/whatsapp-pessoal/config.json')
with open(caminho, 'w') as f:
    json.dump(cfg, f, indent=2)
os.chmod(caminho, 0o600)
PYEOF
IMG=devlikeapro/waha:gows-arm-2026.9.2
eval "$(python3 -c "
import json,os; c=json.load(open(os.path.expanduser('~/.infopro-hub/whatsapp-pessoal/config.json')))
print(f\"KEY={c['waha_api_key']}; SEG={c['segredo_webhook']}; DASH={c['dashboard_senha']}\")")"
docker rm -f waha-pessoal >/dev/null 2>&1 || true
docker run -d --name waha-pessoal --restart unless-stopped \
  -p 127.0.0.1:3002:3000 \
  -v "$D/sessoes:/app/.sessions" \
  -e WHATSAPP_DEFAULT_ENGINE=GOWS \
  -e WAHA_API_KEY="$KEY" \
  -e WAHA_DASHBOARD_USERNAME=davi -e WAHA_DASHBOARD_PASSWORD="$DASH" \
  -e WHATSAPP_SWAGGER_USERNAME=davi -e WHATSAPP_SWAGGER_PASSWORD="$DASH" \
  -e WHATSAPP_HOOK_URL="http://host.docker.internal:3102/webhook?k=$SEG" \
  -e WHATSAPP_HOOK_EVENTS=message.any \
  -e WAHA_BASE_URL=http://localhost:3002 \
  -e WHATSAPP_FILES_LIFETIME=600 \
  -e WHATSAPP_RESTART_ALL_SESSIONS=True \
  -e WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC=true \
  -e WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT=30 \
  -e WAHA_GOWS_DEVICE_HISTORY_SYNC_SUPPORT_GROUP_HISTORY=true \
  "$IMG" >/dev/null
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.whatsapp-receptor-pessoal.plist"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.whatsapp-receptor-pessoal</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/whatsapp-receptor.py</string></array>
  <key>EnvironmentVariables</key><dict><key>WHATSAPP_PASTA</key><string>$D</string></dict>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$D/launchd.log</string>
  <key>StandardErrorPath</key><string>$D/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.whatsapp-receptor-pessoal" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "WhatsApp pessoal: WAHA na porta 3002, receptor na 3102. Falta escanear o QR."
