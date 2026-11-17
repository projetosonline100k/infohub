#!/bin/bash
# Compila o controle do Mac do Lauro (scripts/mac/controle.swift) para ~/.infopro-hub/bin/controle. Rode de novo depois de mudar o .swift.
set -e
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$HOME/.infopro-hub/bin"
swiftc -O "$RAIZ/scripts/mac/controle.swift" -o "$HOME/.infopro-hub/bin/controle"
swiftc -O "$RAIZ/scripts/mac/gravar.swift" -o "$HOME/.infopro-hub/bin/gravar" 2>/dev/null   # modo treino (scripts/treino.py)
echo "Pronto: $HOME/.infopro-hub/bin/controle e gravar"
"$HOME/.infopro-hub/bin/controle" diagnostico || true
