"""Drive do Roy pelo rclone (19/10/2026): o app Google Drive do Mac travava
arquivos (Errno 11) e o cache dele ocupava ~20 GB. O remote "metafocando"
(metafocando@gmail.com) está em ~/.config/rclone/rclone.conf, logado pelo Davi;
a configuração nunca é impressa.

Pasta dos carrosséis: "Projeto 100k/Eu.davi/Carrossel " (com espaço no fim).
Cada carrossel: "NNN - AAAA-MM-DD - Tema/" com 01.png…, conteudo.json,
legenda.txt, referencia.txt e transcricao.txt.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

REMOTE = "metafocando"
RAIZ = "Projeto 100k/Eu.davi/Carrossel "  # atenção: espaço no fim


class DriveCheio(OSError):
    """Conta do Drive sem espaço: não adianta tentar de novo logo."""


def _bin():
    for c in ("/opt/homebrew/bin/rclone", "/usr/local/bin/rclone", shutil.which("rclone")):
        if c and os.path.exists(c):
            return c
    raise RuntimeError("rclone não está instalado neste Mac")


def _alvo(rel=""):
    return f"{REMOTE}:{RAIZ}/{rel}" if rel else f"{REMOTE}:{RAIZ}"


def _rodar(args, entrada=None, tentativas=4):
    """Roda o rclone (com -q: sem o aviso do client_id). Tenta de novo em falha
    de rede; erro de verdade sobe com a mensagem dele."""
    ultimo = ""
    for i in range(tentativas):
        r = subprocess.run([_bin(), "-q", *args], input=entrada, capture_output=True, timeout=600)
        if r.returncode == 0:
            return r.stdout
        ultimo = (r.stderr or b"").decode(errors="replace").strip()[-400:]
        if "storageQuotaExceeded" in ultimo:
            raise DriveCheio("o Google Drive do metafocando está cheio (sem espaço para gravar)")
        if r.returncode in (3, 4):  # diretório/arquivo não existe: não adianta repetir
            break
        time.sleep(3 * (i + 1))
    raise OSError(f"rclone {args[0]} falhou: {ultimo}")


def pastas():
    """{nome: id} das pastas de carrossel."""
    itens = json.loads(_rodar(["lsjson", "--dirs-only", _alvo()]) or b"[]")
    return {x["Name"]: x.get("ID") for x in itens}


def pasta_do_numero(numero):
    return next((n for n in pastas() if n.startswith(f"{numero:03d} - ")), None)


def link(nome):
    pid = pastas().get(nome)
    return f"https://drive.google.com/drive/folders/{pid}" if pid else _alvo(nome)


def referencias():
    """Texto de todos os referencia.txt (pra saber as fontes já usadas), numa chamada só."""
    try:
        return _rodar(["cat", _alvo(), "--include", "*/referencia.txt"]).decode(errors="replace")
    except OSError:
        return ""


def ler(rel):
    return _rodar(["cat", _alvo(rel)]).decode(errors="replace")


def gravar(local, rel):
    _rodar(["copyto", str(local), _alvo(rel)])


def escrever(texto, rel):
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt", encoding="utf-8") as f:
        f.write(texto)
    try:
        gravar(f.name, rel)
    finally:
        Path(f.name).unlink(missing_ok=True)


def renomear(antigo, novo):
    _rodar(["moveto", _alvo(antigo), _alvo(novo)])


def apagar_paginas(nome):
    """Apaga NN.png antigas da pasta (a versão nova pode ter menos páginas)."""
    try:
        _rodar(["delete", _alvo(nome), "--include", "[0-9][0-9].png", "--max-depth", "1"])
    except OSError:
        pass  # pasta nova: nada pra apagar


def md5s(nome):
    """{arquivo: md5} da pasta no Drive (o Drive guarda o MD5 de cada arquivo)."""
    itens = json.loads(_rodar(["lsjson", "--files-only", "--hash", "--hash-type", "md5", _alvo(nome)]) or b"[]")
    return {x["Name"]: (x.get("Hashes") or {}).get("md5") for x in itens}


def md5_local(p):
    return hashlib.md5(Path(p).read_bytes()).hexdigest()
