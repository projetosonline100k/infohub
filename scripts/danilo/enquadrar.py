"""Enquadramento por referência (16/11/2026, Davi: "mais de uma hora tentando ensinar o Danilo a deixar o vídeo igual à referência"):
acha o rosto na imagem de referência e no quadro do bruto e CALCULA o zoom e o foco dos blocos de zoom, em vez de tentar valores às cegas.

    python3 danilo.py enquadrar <edicao_id> <referencia.png> [bloco,bloco…] [--cy-ref 0.30]

- Cada bloco ganha z, foco_x e foco_y (tipo seco) e o projeto.json antigo vai para versoes/.
- Gera <pasta>/_enquadre.jpg: referência | resultado lado a lado, para CONFERIR olhando antes de gerar a versão.
- Depois: `danilo.py versao <edicao_id>`.
Matemática (o motor corta assim): rosto_na_tela = z * rosto_no_bruto - foco * (z - 1)  (x e y, em fração do quadro); z = largura_do_rosto_ref / largura_do_rosto_bruto.
"""
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

FF = os.path.expanduser("~/.infopro-hub/creator-bin/ffmpeg")
W, H = 540, 960


def _rosto(arquivo):
    import cv2
    c = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    im = cv2.imread(str(arquivo))
    if im is None:
        raise SystemExit(f"não consegui abrir {arquivo}")
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    achados = c.detectMultiScale(g, 1.1, 5, minSize=(int(w * 0.10), int(w * 0.10)))
    if len(achados) == 0:
        return None
    x, y, fw, fh = max(achados, key=lambda r: r[2] * r[3])
    return {"cx": (x + fw / 2) / w, "cy": (y + fh / 2) / h, "w": fw / w, "larg": w, "alt": h}


def _como_9x16(r):
    """A referência costuma ser um print do Reel dentro de uma caixa que não é 9:16: leva o rosto para as frações do quadro 9:16 inteiro."""
    larg, alt = r["larg"], r["alt"]
    conteudo_alt = larg * 16 / 9
    if conteudo_alt >= alt:     # sobrou altura: o reel preenche a largura e foi cortado em cima e embaixo
        cortado = (conteudo_alt - alt) / 2
        return {"cx": r["cx"], "cy": (r["cy"] * alt + cortado) / conteudo_alt, "w": r["w"]}
    conteudo_larg = alt * 9 / 16   # sobrou largura
    sobra = (conteudo_larg - larg) / 2
    return {"cx": (r["cx"] * larg + sobra) / conteudo_larg, "cy": r["cy"], "w": r["w"] * larg / conteudo_larg}


def calcular(ref, bruto, z_min=1.0, z_max=2.2):
    z = min(max(ref["w"] / bruto["w"], z_min), z_max)
    if z - 1 < 0.02:
        return 1.0, 0.5, 0.5
    fx = (z * bruto["cx"] - ref["cx"]) / (z - 1)
    fy = (z * bruto["cy"] - ref["cy"]) / (z - 1)
    return round(z, 3), round(min(max(fx, 0), 1), 3), round(min(max(fy, 0), 1), 3)


def _quadro(proxy, t, destino):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", str(proxy), "-frames:v", "1", str(destino)], check=True)


def _aplicar(origem, z, fx, fy, destino):
    vf = f"scale=w={W * z}:h={H * z},crop={W}:{H}:{W * (z - 1) * fx}:{H * (z - 1) * fy}"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(origem), "-vf", vf, str(destino)], check=True)


def enquadrar(pasta, referencia, blocos=None, cy_ref=None):
    pasta = Path(pasta)
    projeto = json.loads((pasta / "projeto.json").read_text())
    proxy = pasta / "proxy.mp4"
    ref = _rosto(referencia)
    if not ref:
        raise SystemExit("não achei um rosto de frente na referência: mande um quadro em que ele olhe para a câmera")
    alvo = _como_9x16(ref)
    if cy_ref is not None:
        alvo["cy"] = cy_ref
    zooms = projeto.get("zooms") or []
    # Sem lista de blocos, mexe só nos que já têm foco (os de tela cheia que já foram enquadrados): nunca em todos os zooms de uma vez.
    escolhidos = [k for k in zooms if (k["id"] in blocos if blocos else ("foco_x" in k or "foco_y" in k))]
    if not escolhidos:
        raise SystemExit("diga quais blocos de zoom enquadrar (ids em projeto.json › zooms), por exemplo: zc0,zc1")
    tmp = pasta / "_tmp"
    tmp.mkdir(exist_ok=True)
    resultados = []
    for k in escolhidos:
        t = k["inicio"] + min(1.0, (k["fim"] - k["inicio"]) / 2)
        _quadro(proxy, t, tmp / f"enq_{k['id']}.png")
        b = _rosto(tmp / f"enq_{k['id']}.png")
        if not b:   # rosto de lado/coberto nesse instante: tenta 1 s depois
            _quadro(proxy, min(t + 1, k["fim"] - 0.05), tmp / f"enq_{k['id']}.png")
            b = _rosto(tmp / f"enq_{k['id']}.png")
        if not b:
            resultados.append((k["id"], None))
            continue
        z, fx, fy = calcular(alvo, b)
        k.update({"tipo": "seco", "z": z, "foco_x": fx, "foco_y": fy})
        k.pop("de", None)
        _aplicar(tmp / f"enq_{k['id']}.png", z, fx, fy, tmp / f"enq_{k['id']}_res.png")
        resultados.append((k["id"], (z, fx, fy)))
    feitos = [r for r in resultados if r[1]]
    if not feitos:
        raise SystemExit("não achei o rosto no bruto nesses trechos")
    hist = pasta / "versoes"
    hist.mkdir(exist_ok=True)
    shutil.copyfile(pasta / "projeto.json", hist / f"projeto-{datetime.now():%Y%m%d-%H%M%S}-antes-enquadrar.json")
    (pasta / "projeto.json").write_text(json.dumps(projeto, ensure_ascii=False, indent=1))
    # conferência: referência | resultado do primeiro bloco
    ref_im = pasta / "_tmp" / "enq_ref.png"
    shutil.copyfile(referencia, ref_im)
    primeiro = feitos[0][0]
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", str(ref_im), "-i", str(tmp / f"enq_{primeiro}_res.png"), "-filter_complex",
                    f"[0:v]scale=-2:{H}[a];[1:v]scale=-2:{H}[b];[a][b]hstack", str(pasta / "_enquadre.jpg")], check=True)
    return alvo, resultados


def verificar(pasta, referencia, blocos=None, cy_ref=None, tol_pos=0.06, tol_larg=0.15):
    """Mede o vídeo JÁ GERADO (previa.mp4) contra a referência. Devolve (ok, linhas). Só dê o trabalho por feito quando isto passar:
    olhar não basta, medir. Um bloco falha se o rosto estiver mais de `tol_pos` longe (em fração do quadro) ou com a largura fora de `tol_larg`."""
    sys.path.insert(0, str(Path(__file__).parent))
    import motor
    pasta = Path(pasta)
    previa, projeto_json = pasta / "previa.mp4", pasta / "projeto.json"
    if not previa.exists():
        return False, ["sem previa.mp4: gere a versão antes (danilo.py versao <edicao_id>)"]
    if previa.stat().st_mtime < projeto_json.stat().st_mtime:
        return False, ["a prévia é MAIS ANTIGA que o projeto.json: gere a versão (danilo.py versao <edicao_id>) e verifique de novo"]
    projeto = json.loads(projeto_json.read_text())
    ref = _rosto(referencia)
    if not ref:
        return False, ["não achei rosto na referência"]
    alvo = _como_9x16(ref)
    if cy_ref is not None:
        alvo["cy"] = cy_ref
    mapa = motor.Mapa(motor.trechos_mantidos(projeto))
    tmp = pasta / "_tmp"
    tmp.mkdir(exist_ok=True)
    zooms = projeto.get("zooms") or []
    escolhidos = [k for k in zooms if (k["id"] in blocos if blocos else ("foco_x" in k or "foco_y" in k))]
    linhas, ok = [], True
    for k in escolhidos:
        t_final = mapa.para_final(k["inicio"] + min(1.0, (k["fim"] - k["inicio"]) / 2), "inicio")
        if t_final is None:
            linhas.append(f"{k['id']}: esse trecho foi cortado do vídeo (nada a conferir)")
            continue
        vel = projeto.get("velocidade") or 1
        if vel != 1 and projeto.get("formato") != "papel":   # o vídeo pronto é acelerado: o tempo na prévia é o do mapa dividido pela velocidade
            t_final = t_final / vel
        arq = tmp / f"ver_{k['id']}.png"
        _quadro(previa, t_final, arq)
        r = _rosto(arq)
        if not r:
            ok = False
            linhas.append(f"{k['id']} (em {t_final:.1f}s): FALHOU — não achei o rosto no vídeo gerado (coberto por capa/headline ou fora do quadro?)")
            continue
        dx, dy, dw = r["cx"] - alvo["cx"], r["cy"] - alvo["cy"], r["w"] / alvo["w"] - 1
        bom = abs(dx) <= tol_pos and abs(dy) <= tol_pos and abs(dw) <= tol_larg
        ok &= bom
        linhas.append(f"{k['id']} (em {t_final:.1f}s): {'OK' if bom else 'FALHOU'} — rosto x {r['cx']:.2f} (alvo {alvo['cx']:.2f}), y {r['cy']:.2f} (alvo {alvo['cy']:.2f}), largura {r['w']:.2f} (alvo {alvo['w']:.2f})"
                      + ("" if bom else f" → ajuste: foco_y {'+' if dy > 0 else '-'}{abs(dy) / max(k.get('z', 1.3) - 1, 0.1):.2f}, foco_x {'+' if dx > 0 else '-'}{abs(dx) / max(k.get('z', 1.3) - 1, 0.1):.2f}, z × {1 / (1 + dw):.2f}"))
    return ok, linhas


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2:
        raise SystemExit(__doc__)
    cy = float(a[a.index("--cy-ref") + 1]) if "--cy-ref" in a else None
    lista = [x for x in a[2:] if not x.startswith("--") and x != str(cy)]
    print(enquadrar(a[0], a[1], lista[0].split(",") if lista and lista[0] != "todos" else None, cy))
