#!/bin/bash
# Instala o serviço da Dalila que prepara os reels (scripts/dalila/preparar_reels.py)
# como LaunchAgent: liga com o Mac e volta se cair. Rodar de novo atualiza.
# Usa o login do Claude em segundo plano do ouvinte do Atlas (legenda).
# Desligar: launchctl bootout gui/$(id -u)/com.infoprohub.dalila
set -e
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$(command -v python3)"
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.dalila.plist"
mkdir -p "$HOME/.infopro-hub/dalila"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.dalila</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/dalila/preparar_reels.py</string><string>--sempre</string></array>
  <key>WorkingDirectory</key><string>$RAIZ/scripts/dalila</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/dalila/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/dalila/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.dalila" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Serviço da Dalila instalado. Log: ~/.infopro-hub/dalila/servico.log"
