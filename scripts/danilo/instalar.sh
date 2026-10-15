#!/bin/bash
# Instala o Danilo como LaunchAgents (ligam com o Mac e voltam se cair):
#   com.infoprohub.danilo          servidor.py (porta 3103: mini editor, prévias, aprovar)
#   com.infoprohub.danilo-servico  servico.py (pega sozinho os brutos do Drive e a fila de tarefas)
# Rodar de novo atualiza. O serviço usa o login do Claude em segundo plano do
# ouvinte do Jarvis. Desligar: launchctl bootout gui/$(id -u)/<label>
set -e
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$(command -v python3)"
mkdir -p "$HOME/.infopro-hub/danilo"

instalar() {
  local label="$1" script="$2" log="$3"
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>$RAIZ/scripts/danilo/$script</string></array>
  <key>WorkingDirectory</key><string>$RAIZ/scripts/danilo</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/.infopro-hub/danilo/$log</string>
  <key>StandardErrorPath</key><string>$HOME/.infopro-hub/danilo/$log</string>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
}

instalar com.infoprohub.danilo servidor.py launchd.log
instalar com.infoprohub.danilo-servico servico.py launchd-servico.log
echo "Danilo instalado. Logs: ~/.infopro-hub/danilo/servidor.log e servico.log"
