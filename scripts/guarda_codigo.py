"""Bloqueia agente de programar (hook PreToolUse do `claude -p`; 12/11/2026, Davi: "ninguém programa, todo mundo dispara para a fila; quem programa é o Atlas").
Lê da entrada padrão o JSON da ferramenta e sai com código 2 (bloqueio, mensagem em stderr) se for editar código do sistema.
Não vale para o Atlas (a ponte roda sem este hook). É uma trava de segurança: a regra principal está no prompt (scripts/fila.py: REGRA).
"""
import json
import os
import re
import sys
from pathlib import Path

RAIZ = Path(os.environ.get("INFOPRO_RAIZ") or Path(__file__).resolve().parents[1]).resolve()
LIVRES = {"docs"}   # pastas do repositório onde agente pode escrever (manuais, notas)
MSG = ("Bloqueado: agente não programa. Abra um pedido na fila de desenvolvimento "
       "(python3 scripts/fila.py pedir --origem \"<seu nome>\" --titulo \"...\") e avise o Davi; o Atlas implementa e ele acompanha pelo sino.")


def no_codigo(caminho: str, cwd: str) -> bool:
    try:
        p = Path(caminho)
        p = (p if p.is_absolute() else Path(cwd or ".") / p).resolve()
        rel = p.relative_to(RAIZ)
    except (ValueError, OSError):
        return False   # fora do repositório: livre
    return bool(rel.parts) and rel.parts[0] not in LIVRES   # raiz, src, scripts, supabase, .git… tudo menos docs/


CODIGO = r"(?:src|src-tauri|supabase|api|tests|scripts|public)/"
PERIGOSOS = [
    r"\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|merge|rebase|reset|checkout|stash|apply|am|cherry-pick|revert|add)\b",
    r"\bnpx?\s+supabase\b", r"\bsupabase\s+(?:db|functions|migration)\b",
    r"scripts/apply-\S*\.py", r"\bpython3?\s+\S*apply-\S*\.py",
    r"\b(?:sed|perl)\s+(?:-\w*i\w*)\b[^|;&]*" + CODIGO,
    r"(?:>>?|\btee\b)\s*\S*" + CODIGO,
    r"\b(?:cp|mv|rm|touch|mkdir|ln)\b[^|;&]*" + CODIGO,
]


def main():
    try:
        d = json.load(sys.stdin)
    except ValueError:
        return 0
    nome, entrada, cwd = d.get("tool_name", ""), d.get("tool_input") or {}, d.get("cwd") or ""
    if nome in ("Edit", "Write", "NotebookEdit", "MultiEdit"):
        alvo = entrada.get("file_path") or entrada.get("notebook_path") or ""
        if alvo and no_codigo(alvo, cwd):
            print(MSG, file=sys.stderr)
            return 2
    elif nome == "Bash":
        cmd = str(entrada.get("command") or "")
        if any(re.search(r, cmd) for r in PERIGOSOS):
            print(MSG, file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
