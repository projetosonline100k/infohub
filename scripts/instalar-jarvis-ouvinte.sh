#!/bin/bash
# Instala o ouvinte do Jarvis (scripts/jarvis-ouvinte.py) como LaunchAgent:
# liga sozinho quando o Mac liga e reinicia se cair. Rodar de novo atualiza.
#
# Antes, uma vez: logar o Claude Code de segundo plano na conta do plano:
#   "$(ls -d ~/Library/Application\ Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude | tail -1)" auth login
#
# Desligar: launchctl bootout gui/$(id -u)/com.infoprohub.jarvis-ouvinte
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PY="$(command -v python3)"
PLIST="$HOME/Library/LaunchAgents/com.infoprohub.jarvis-ouvinte.plist"
mkdir -p "$HOME/.infopro-hub/ouvinte" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.infoprohub.jarvis-ouvinte</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/jarvis-ouvinte.py</string></array>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/ouvinte/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/ouvinte/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/com.infoprohub.jarvis-ouvinte" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Ouvinte do Jarvis instalado. Log: ~/.infopro-hub/ouvinte/ouvinte.log"
