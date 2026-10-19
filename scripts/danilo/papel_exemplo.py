"""Exemplo de papel_cenas.py: as 9 cenas do vídeo dos 4 hábitos (aprovado pelo
Davi em 17/10/2026). Copie o jeito, não o conteúdo: cada vídeo tem as suas cenas.

Regras que funcionaram:
- uma cena por ideia da fala (gancho, cada tópico, a virada), entrando quando ele começa a falar dela;
- palavra-chave escrita à mão no instante da fala; marca-texto amarelo na ênfase; círculo/risco vermelho na conclusão;
- desenhos simples (relógio, despertador, lua/sol, caderno, bateria, chuveiro, termômetro, checklist, alvo);
- folha 940 x 560: nada encostado na borda (texto grande corta: confira no contato);
- u = segundos desde o começo da cena; k = "boil" (o tremido da mão muda a cada 4 quadros).
"""
import math

from papel import *  # noqa: F401,F403

FIM = None   # tempo do bruto em que volta a tela cheia (ex.: começo do CTA do INSTALIVROS)



# ---------------------------------------------------------------- cenas (u = segundos desde o início)
def c_manha(b, d, u, k):
    traco(d, [(40, 430), (900, 432)], prog(u, 0.0, 0.6), 1, k)
    arco = [(470 + 120 * math.cos(math.pi + math.pi * i / 24), 430 + 120 * math.sin(math.pi + math.pi * i / 24)) for i in range(25)]
    traco(d, arco, prog(u, 0.4, 1.0), 2, k, cor=VERMELHO)
    for j in range(7):
        a = math.pi + math.pi * (j + 0.5) / 7
        traco(d, [(470 + 150 * math.cos(a), 430 + 150 * math.sin(a)), (470 + 205 * math.cos(a), 430 + 205 * math.sin(a))],
                prog(u, 0.9 + j * 0.08, 1.15 + j * 0.08), 10 + j, k, cor=VERMELHO, larg=5)
    texto(b, u, 0.2, 1.4, "4 hábitos", (40, 20), 96)
    texto(b, u, 1.4, 2.2, "pras suas manhãs", (480, 50), 54)


def c_30min(b, d, u, k):
    cx, cy, r = 230, 280, 190
    traco(d, circulo(cx, cy, r, 48, 1.02), prog(u, 0.0, 0.8), 1, k)
    for h in range(12):
        a = h * math.pi / 6
        traco(d, [(cx + (r - 18) * math.sin(a), cy - (r - 18) * math.cos(a)), (cx + (r - 34) * math.sin(a), cy - (r - 34) * math.cos(a))],
                prog(u, 0.6, 0.9), 20 + h, k, larg=4)
    meia = [(cx + (r - 55) * math.sin(math.pi * i / 30), cy - (r - 55) * math.cos(math.pi * i / 30)) for i in range(31)]
    traco(d, meia, prog(u, 1.2, 3.6), 3, k, cor=VERMELHO, larg=14)          # meia volta = 30 min
    traco(d, [(cx, cy), (cx, cy - r + 60)], prog(u, 0.8, 1.0), 4, k, larg=7)
    traco(d, [(cx, cy), (cx + 95, cy + 40)], prog(u, 0.9, 1.1), 5, k, larg=7)
    texto(b, u, 0.9, 1.8, "os primeiros", (480, 60), 60)
    texto(b, u, 1.6, 2.4, "30 min", (480, 140), 130, VERMELHO)
    texto(b, u, 3.6, 5.0, "depois de abrir", (480, 320), 52)
    texto(b, u, 4.4, 5.6, "os olhos", (480, 390), 52)


def despertador(b, d, u, k, x, y, t0, sem):
    traco(d, circulo(x, y, 80, 34), prog(u, t0, t0 + 0.5), sem, k)
    for s in (-1, 1):
        traco(d, [(x + s * 35, y - 95), (x + s * 75, y - 70), (x + s * 50, y - 60)], prog(u, t0 + 0.4, t0 + 0.6), sem + 2 + s, k, larg=6)
        traco(d, [(x + s * 45, y + 70), (x + s * 62, y + 98)], prog(u, t0 + 0.5, t0 + 0.7), sem + 5 + s, k, larg=6)
    traco(d, [(x, y), (x, y - 50)], prog(u, t0 + 0.6, t0 + 0.7), sem + 8, k, larg=6)
    traco(d, [(x, y), (x + 35, y + 10)], prog(u, t0 + 0.65, t0 + 0.75), sem + 9, k, larg=6)


def c_alarme(b, d, u, k):
    for i, x in enumerate((170, 470, 770)):
        despertador(b, d, u, k, x, 230, i * 0.35, 10 + i * 10)
    for i, x in enumerate((170, 770)):                                   # riscados: fica um só
        traco(d, [(x - 95, 135), (x + 95, 335)], prog(u, 2.4 + i * 0.3, 2.6 + i * 0.3), 50 + i, k, cor=VERMELHO, larg=9)
        traco(d, [(x + 95, 135), (x - 95, 335)], prog(u, 2.6 + i * 0.3, 2.8 + i * 0.3), 60 + i, k, cor=VERMELHO, larg=9)
    marcatexto(d, u, 3.4, 4.0, 300, 640, 428, 70, k)
    texto(b, u, 3.0, 4.0, "1 alarme só", (300, 360), 78)
    texto(b, u, 5.2, 6.0, "soneca", (40, 380), 60)
    traco(d, [(40, 430), (250, 415)], prog(u, 6.1, 6.5), 80, k, cor=VERMELHO, larg=8)


def c_horario(b, d, u, k):
    lua = [(150 + 85 * math.cos(a), 115 + 85 * math.sin(a)) for a in [math.pi * 0.35 + i * math.pi * 1.3 / 24 for i in range(25)]]
    lua += [(175 + 60 * math.cos(a), 95 + 60 * math.sin(a)) for a in [math.pi * 1.65 - i * math.pi * 1.3 / 24 for i in range(25)]]
    traco(d, lua, prog(u, 0.0, 0.8), 1, k)
    texto(b, u, 0.6, 1.1, "22h", (230, 150), 60)
    traco(d, [(340, 115), (590, 115)], prog(u, 1.0, 1.5), 2, k, larg=6)
    traco(d, [(560, 90), (595, 115), (560, 140)], prog(u, 1.4, 1.6), 3, k, larg=6)
    traco(d, circulo(720, 115, 55, 30), prog(u, 1.6, 2.1), 4, k, cor=VERMELHO)
    for j in range(8):
        a = j * math.pi / 4
        traco(d, [(720 + 72 * math.cos(a), 115 + 72 * math.sin(a)), (720 + 98 * math.cos(a), 115 + 98 * math.sin(a))],
                prog(u, 2.0 + j * 0.05, 2.2 + j * 0.05), 30 + j, k, cor=VERMELHO, larg=5)
    texto(b, u, 2.3, 2.8, "6h", (835, 150), 60, VERMELHO)
    for i, dia in enumerate("STQQSSD"):                                 # a semana inteira, todo dia igual
        x = 70 + i * 120
        traco(d, [(x, 400), (x + 80, 402), (x + 80, 482), (x, 480), (x, 400)], prog(u, 3.0 + i * 0.1, 3.3 + i * 0.1), 40 + i, k, larg=5)
        texto(b, u, 3.1 + i * 0.1, 3.4 + i * 0.1, dia, (x + 20, 330), 48)
        traco(d, [(x + 14, 440), (x + 34, 468), (x + 72, 410)], prog(u, 4.6 + i * 0.35, 4.85 + i * 0.35), 60 + i, k, cor=VERMELHO, larg=8)


def c_suplemento(b, d, u, k):
    texto(b, u, 0.0, 0.9, "consistência", (40, 150), 92, VERMELHO)
    texto(b, u, 0.9, 1.2, ">", (560, 150), 92)
    capsula = [(700 + 40 * math.cos(math.pi / 2 + math.pi * i / 16), 240 + 40 * math.sin(math.pi / 2 + math.pi * i / 16)) for i in range(17)]
    capsula += [(820 + 40 * math.cos(-math.pi / 2 + math.pi * i / 16), 240 + 40 * math.sin(-math.pi / 2 + math.pi * i / 16)) for i in range(17)]
    traco(d, capsula + capsula[:1], prog(u, 1.1, 1.7), 1, k)
    traco(d, [(760, 200), (760, 280)], prog(u, 1.6, 1.8), 2, k, larg=5)
    traco(d, [(650, 160), (880, 330)], prog(u, 2.0, 2.4), 3, k, cor=VERMELHO, larg=10)
    texto(b, u, 2.3, 3.2, "qualquer suplemento", (300, 380), 54)


def c_caderno(b, d, u, k):
    x0, y0, x1, y1 = 60, 40, 600, 520
    traco(d, [(x0, y0), (x1, y0 + 4), (x1, y1), (x0 + 2, y1), (x0, y0)], prog(u, 0.0, 0.8), 1, k)
    for i in range(7):                                                   # espiral
        traco(d, circulo(x0, y0 + 50 + i * 65, 14, 14), prog(u, 0.5 + i * 0.05, 0.7 + i * 0.05), 10 + i, k, larg=4)
    for i in range(6):
        traco(d, [(x0 + 40, y0 + 110 + i * 68), (x1 - 30, y0 + 112 + i * 68)], prog(u, 0.8, 1.2), 20 + i, k, cor=AZUL, larg=2)
    texto(b, u, 1.4, 3.0, "o que merece", (x0 + 50, y0 + 40), 58)
    texto(b, u, 3.0, 4.6, "minha energia", (x0 + 50, y0 + 110), 58, VERMELHO)
    texto(b, u, 4.6, 5.6, "hoje?", (x0 + 50, y0 + 180), 58)
    # bateria enchendo (energia)
    bx, by = 690, 140
    traco(d, [(bx, by), (bx + 180, by), (bx + 180, by + 320), (bx, by + 320), (bx, by)], prog(u, 6.0, 6.6), 40, k)
    traco(d, [(bx + 60, by - 25), (bx + 120, by - 25), (bx + 120, by), (bx + 60, by)], prog(u, 6.5, 6.8), 41, k)
    nivel = prog(u, 7.0, 11.0)
    if nivel > 0.05:
        topo = by + 320 - 300 * nivel
        d.rectangle([(bx + 14) * S, topo * S, (bx + 166) * S, (by + 306) * S], fill=AMARELO + (200,))
    texto(b, u, 11.5, 12.6, "energia", (650, 470), 56)


def c_banho(b, d, u, k):
    traco(d, [(80, 60), (300, 60), (300, 120)], prog(u, 0.0, 0.5), 1, k, larg=9)
    traco(d, [(230, 120), (370, 120), (350, 160), (250, 160), (230, 120)], prog(u, 0.4, 0.9), 2, k, larg=7)
    if u > 1.0:                                                          # gotas caindo
        for j in range(9):
            x = 255 + (j % 5) * 22
            y = 180 + ((u * 260 + j * 57) % 300)
            traco(d, [(x, y), (x - 4, y + 22)], 1, 70 + j, k, cor=AZUL, larg=6)
    texto(b, u, 1.0, 2.2, "30 s no frio", (480, 40), 70)
    tx, ty = 560, 170                                                    # termômetro descendo
    traco(d, [(tx, ty), (tx, ty + 230)], prog(u, 2.2, 2.6), 10, k, larg=6)
    traco(d, [(tx + 50, ty), (tx + 50, ty + 230)], prog(u, 2.2, 2.6), 11, k, larg=6)
    traco(d, circulo(tx + 25, ty + 270, 50, 26), prog(u, 2.5, 2.9), 12, k)
    frio = prog(u, 3.0, 6.0)
    topo = ty + 30 + 190 * frio
    d.rectangle([(tx + 12) * S, topo * S, (tx + 38) * S, (ty + 250) * S], fill=AZUL + (220,))
    d.ellipse([(tx - 12) * S, (ty + 233) * S, (tx + 62) * S, (ty + 307) * S], fill=AZUL + (220,))
    texto(b, u, 11.8, 12.8, "100% gelada", (640, 300), 64, AZUL)
    marcatexto(d, u, 12.6, 13.0, 640, 925, 368, 90, k)


def c_checklist(b, d, u, k):
    texto(b, u, 0.0, 1.4, "ir mesmo sem vontade", (40, 20), 70, VERMELHO)
    itens = [("no trabalho", 1.8), ("na tarefa difícil", 4.6), ("nas conversas que eu odiava", 6.9)]
    for i, (txt, t0) in enumerate(itens):
        y = 150 + i * 125
        traco(d, [(60, y), (140, y + 2), (140, y + 82), (60, y + 80), (60, y)], prog(u, t0, t0 + 0.4), 10 + i, k, larg=5)
        texto(b, u, t0 + 0.2, t0 + 1.2, txt, (180, y - 10), 62)
        traco(d, [(74, y + 40), (96, y + 68), (150, y - 10)], prog(u, t0 + 1.2, t0 + 1.5), 20 + i, k, cor=VERMELHO, larg=9)


def c_foco(b, d, u, k):
    for i, r in enumerate((170, 115, 60)):
        traco(d, circulo(240, 290, r, 40), prog(u, i * 0.3, 0.6 + i * 0.3), 1 + i, k, cor=VERMELHO if i == 2 else GRAFITE)
    voo = prog(u, 1.4, 2.0)                                              # flecha chega no centro
    sx, sy = 620 - 380 * voo, 80 + 210 * voo
    if voo > 0:
        traco(d, [(sx + 140, sy - 75), (sx, sy)], 1, 30, k, larg=8)
        traco(d, [(sx + 140, sy - 75), (sx + 160, sy - 105)], 1, 31, k, larg=6)
        traco(d, [(sx + 140, sy - 75), (sx + 175, sy - 70)], 1, 32, k, larg=6)
    texto(b, u, 2.2, 3.0, "foco", (480, 170), 88)
    texto(b, u, 3.0, 3.4, "=", (680, 170), 88)
    texto(b, u, 3.4, 4.6, "liberdade", (480, 290), 88, VERMELHO)


# (início no tempo do BRUTO, função). Neste exemplo eram tempos do vídeo final.
CENAS = [(0.15, c_manha), (3.2, c_30min), (15.2, c_alarme), (28.9, c_horario), (40.7, c_suplemento),
         (48.6, c_caderno), (69.6, c_banho), (84.7, c_checklist), (98.9, c_foco)]
