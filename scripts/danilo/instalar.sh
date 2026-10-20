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
  local label="$1" script="$2" log="$3" cliente="$4"
  local env=""
  [ -n "$cliente" ] && env="<key>EnvironmentVariables</key><dict><key>DANILO_CLIENTE</key><string>$cliente</string></dict>"
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
  $env
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
# Um Danilo por projeto (20/10): cada um com a própria fila. O trabalho pesado (whisper,
# montagem) continua um por vez no Mac pela trava pesado.lock.
for linha in \
  "matheus c2373b17-98ef-4c0a-b0ad-6e57fef4ce98" \
  "instalivros e354f4be-8a8d-4c34-8f47-f85e5981b8d3" \
  "yuri f4cf4d62-e34c-412b-9c36-4cbed478186d"; do
  set -- $linha
  instalar "com.infoprohub.danilo-servico-$1" servico.py "launchd-servico-$1.log" "$2"
done
echo "Danilo instalado. Logs: ~/.infopro-hub/danilo/servidor.log e servico.log"
