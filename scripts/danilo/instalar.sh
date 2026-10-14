#!/bin/bash
# Instala o serviço local do Danilo (scripts/danilo/servidor.py) como
# LaunchAgent: liga com o Mac e volta se cair. Rodar de novo atualiza.
set -e
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$(command -v python3)"
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.danilo.plist"
mkdir -p "$HOME/.infopro-hub/danilo"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.danilo</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/danilo/servidor.py</string></array>
  <key>WorkingDirectory</key><string>$RAIZ/scripts/danilo</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/danilo/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/danilo/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.danilo" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Serviço do Danilo instalado. Log: ~/.infopro-hub/danilo/servidor.log"
