#!/bin/bash
# Liga o WhatsApp → Infopro no Mac: Colima (Docker) e o receptor
# (scripts/whatsapp-receptor.py) iniciam sozinhos com o Mac. O container
# "waha" já sobe sozinho junto com o Colima (--restart unless-stopped).
# Rodar de novo atualiza. Config: ~/.infopro-hub/whatsapp/config.json.
set -e
eval "$(/opt/homebrew/bin/brew shellenv zsh 2>/dev/null || /opt/homebrew/bin/brew shellenv)"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PY="$(command -v python3)"
brew services start colima >/dev/null
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.whatsapp-receptor.plist"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.whatsapp-receptor</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/whatsapp-receptor.py</string></array>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/whatsapp/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/whatsapp/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.whatsapp-receptor" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Receptor do WhatsApp instalado. Log: ~/.infopro-hub/whatsapp/receptor.log"
