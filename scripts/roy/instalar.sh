#!/bin/bash
# Instala o serviço do Roy (scripts/roy/servico.py) como
# LaunchAgent: liga com o Mac e volta se cair. Rodar de novo atualiza.
# Usa o login do Claude em segundo plano do ouvinte do Jarvis.
# Desligar: launchctl bootout gui/$(id -u)/com.infoprohub.roy
set -e
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$(command -v python3)"
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.roy.plist"
mkdir -p "$HOME/.infopro-hub/roy"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.roy</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/roy/servico.py</string></array>
  <key>WorkingDirectory</key><string>$RAIZ/scripts/roy</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/roy/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/roy/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.roy" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Serviço do Roy instalado. Log: ~/.infopro-hub/roy/servico.log"
