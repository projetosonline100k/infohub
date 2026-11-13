"""Classifica os livros do Instalivros (books.csv) nos temas do quiz (13/11/2026, Davi: "com base nessa lista, selecionar os livros que melhor se encaixam para a pessoa").
O CSV não tem categoria: o tema sai de palavras do título e do autor. Temas = as áreas que o quiz pergunta (areas): foco, hábitos, autoconfiança, comunicação, finanças, carreira, mentalidade, liderança.
Livros de religião, saúde/dieta e família/relacionamento ficam de fora do plano (tema "fora"), porque não combinam com o funil.

  python3 scripts/quiz/livros_temas.py gerar /caminho/books.csv   → escreve src/data/livros-instalivros.json
  python3 scripts/quiz/livros_temas.py amostra /caminho/books.csv → mostra uns livros de cada tema para conferir
"""
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "src" / "data" / "livros-instalivros.json"


def norm(t):
    t = unicodedata.normalize("NFD", t or "").lower()
    return re.sub(r"[^a-z0-9 ]+", " ", "".join(c for c in t if unicodedata.category(c) != "Mn"))


# Palavras (ou expressões) separadas por vírgula; o tema com mais acertos no título e no autor vence (os 2 melhores ficam).
PALAVRAS = {
    "foco": "foco,concentra,atencao,distra,mente organizada,produtiv,deep work,essencialismo,priorid,rapt,talento,treinamento cerebral,memoria,aprender,estudar,como ler,cerebro,minimalis,simplific,sem limites",
    "habitos": "habito,rotina,disciplina,constancia,atomic,efeito composto,compound,procrastina,forca de vontade,willpower,micro habitos,novos habitos,agora,comecar,pequenos passos",
    "autoconfianca": "autoconfianca,confianca,autoestima,inabalavel,coragem,medo,ansiedade,inseguranca,resilien,superar,autossabotagem,boazinha,autoconhecimento,apaixone se por si,poder da presenca,emocoes,emocional,autorresponsabilidade,indomavel,carencia",
    "comunicacao": "comunica,persuasao,persuasivo,convencer,influen,carisma,oratoria,apresentac,negocia,vendas,vender,venda,linguagem corporal,conversa,pessoas,contato visual,storytelling,historias,go giver,go givers",
    "financas": "dinheiro,riqueza,rico,ricos,milionario,investir,investimento,investidor,financ,economia,economiza,poupar,patrimonio,aposentadoria,prosperidade,bilionario,fortuna,renda,independencia financeira,pai rico",
    "carreira": "carreira,trabalho,profissional,emprego,sucesso,empreend,negocio,empresa,startup,marketing,gestor,gestao,executivo,trabalhar,promocao,mercado,inova,corporativ",
    "mentalidade": "mentalidade,mente,pensamento,pensar,pense,mindset,crenca,poder da mente,subconsciente,positivo,atitude,proposito,sentido,filosofia,estoic,sabedoria,psicolog,neuro,decisao,decisoes,felicidade,feliz,virada,novo eu,vitoria,triunfo",
    "lideranca": "lider,lideranca,liderar,equipe,equipes,time,chefe,comando,influenciar,influencia,maxwell,legado,servir,cultura",
}
AUTORES = {
    "foco": ["cal newport", "jim kwik", "greg mckeown", "nir eyal", "mortimer j adler"],
    "habitos": ["james clear", "charles duhigg", "bj fogg", "darren hardy", "s j scott", "neil a fiore", "stephen guise"],
    "autoconfianca": ["brene brown", "walter riso", "augusto cury", "nick vujicic", "amy cuddy", "thibaut meurisse"],
    "comunicacao": ["dale carnegie", "chris voss", "robert cialdini", "bob burg", "daniel pink", "carmine gallo", "patrick king", "jeb blount"],
    "financas": ["robert kiyosaki", "gustavo cerbasi", "morgan housel", "napoleon hill", "bruno gimenes", "t harv eker", "bruno gimenez"],
    "carreira": ["max gehringer", "roberto shinyashiki", "ryan holiday", "brian tracy", "jim collins"],
    "mentalidade": ["napoleon hill", "paulo vieira", "joe dispenza", "viktor e frankl", "tiago brunet", "epicteto", "seneca", "marco aurelio", "carol dweck", "daniel kahneman", "vishen lakhiani"],
    "lideranca": ["john c maxwell", "simon sinek", "leonardo peracini", "stephen covey", "daniel coyle"],
}
# Fora do plano: religião, saúde/dieta, família e relacionamento, psicanálise/clínica, masculinidade e biografias.
FORA = ("deus,jesus,biblia,biblico,biblicas,cristao,cristianismo,cristo,igreja,oracao,espirito,ministerio,ungido,jejum,apostolo,profet,sobrenatural,gloria,evangel,pastor,cura,paternidade,casamento,filhos,"
        "adolescentes,emagrec,dieta,receita,saude,corpo,cancer,sexo,sexual,erotico,pornografia,romance,depressao,borderline,transtorno,fome,nutri,comida,amor,amar,casal,"
        "homem de verdade,masculinidade,manliness,better man,spartan,homens,ayrton senna,maria,culto,adao,diabo,reino,fe ,nacoes,herdeir,filho,pai ,mae ,sintoma,codependencia").split(",")
FORA_AUTORES = ["luiz herminio", "joyce meyer", "heward mills", "yonggi", "mike bickle", "larry crabb", "danny silk", "john eckhardt", "jentezen franklin", "luciano subira", "stuart scott",
                "richard d phillips", "tommy tenney", "james w sire", "sigmund freud", "marsha linehan", "melody beattie", "gary chapman", "lise bourbeau", "tim lahaye", "brett mckay", "brett h mckay",
                "bernardo stamateas", "andre steil", "dugand", "noam chomsky", "paulo sergio de ca", "lair ribeiro", "joel fuhrman", "pierre dukan", "david ludwig", "elizabeth gilbert", "elizabet gilbert"]


def pontuar(texto, autor):
    t, a = " " + norm(texto) + " ", " " + norm(autor) + " "
    pts = {}
    for tema, lista in PALAVRAS.items():
        pts[tema] = sum(1 for w in lista.split(",") if w and (f" {w} " in t if len(w) <= 4 else f" {w}" in t))
    for tema, nomes in AUTORES.items():
        if any(n in a for n in nomes):
            pts[tema] = pts.get(tema, 0) + 2
    return pts


def fora(titulo, autor):
    t, a = " " + norm(titulo) + " ", " " + norm(autor) + " "
    return any(n in a for n in FORA_AUTORES) or any((f" {w.strip()} " in t if len(w.strip()) <= 4 else f" {w.strip()}" in t) for w in FORA if w.strip())


def classificar(r):
    titulo = re.sub(r"\s+", " ", r["title"]).strip()
    if fora(titulo, r["author"]):
        return []
    pts = pontuar(titulo, r["author"])
    ordem = sorted(((v, k) for k, v in pts.items() if v >= 1), reverse=True)
    return [k for _, k in ordem[:2]]


def carregar(csv_path):
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    livros = []
    for r in rows:
        if not r["picture_url"].startswith("http"):
            continue
        titulo = re.sub(r"\s+", " ", r["title"]).strip()
        # "Título: subtítulo" → só o título principal na tela (o subtítulo vai separado)
        principal, _, sub = titulo.partition(":")
        if principal.count("(") > principal.count(")"):   # "Hooked (Fisgado: como…)" cortou dentro do parêntese
            principal += ")"
        livros.append({
            "id": int(r["id"]), "titulo": principal.strip(), "sub": sub.strip() or None, "autor": re.sub(r"\s+", " ", r["author"]).strip(),
            "capa": r["picture_url"], "nota": float(r["average_rating"] or 0), "audio": int(float(r["audio_duration"] or 0)), "texto": int(float(r["text_duration"] or 0)),
            "temas": classificar(r),
        })
    return livros


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    livros = carregar(sys.argv[2])
    if sys.argv[1] == "gerar":
        SAIDA.parent.mkdir(parents=True, exist_ok=True)
        uteis = [l for l in livros if l["temas"] and l["audio"] > 0]   # só os que entram no plano: com tema e com áudio
        SAIDA.write_text(json.dumps(uteis, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{len(uteis)} de {len(livros)} livros em {SAIDA} ({SAIDA.stat().st_size // 1024} KB)")
    else:
        import collections
        c = collections.Counter(t for l in livros for t in l["temas"])
        print(len(livros), "livros;", sum(1 for l in livros if not l["temas"]), "sem tema (fora do plano);", dict(c))
        for tema in c:
            print(f"\n== {tema}")
            for l in [x for x in livros if tema in x["temas"][:1]][:14]:
                print(f"  {l['titulo'][:55]} — {l['autor'][:22]}")
