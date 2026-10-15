# Quiz (Conteúdo → Quiz)

Pedido do Davi (15/10/2026): quiz dentro do Infopro, com o **Roy de cada projeto** como responsável.

## Fluxo

1. Alguém do time pede (aba Quiz → "Pedir quiz ao Roy", ou conversa com o Roy com tipo `quiz`). Nasce uma tarefa do Roy (tipo `quiz`) e uma linha em `quizzes` (status `esboco`).
2. **Etapa 1, esboço.** O ouvinte (`execucao.py`) pega a tarefa. O Roy entrega um DOCUMENTO com o esboço:
   - nome do quiz e promessa;
   - as partes (abertura, perguntas, captura, resultado);
   - todas as perguntas com as opções;
   - os perfis de resultado e a ponte para a oferta.

   A tarefa vai para a aprovação do Davi.
3. O Davi lê e conversa em "Ver e aprovar". **Aprovar o esboço** muda o quiz para `criando` e devolve a tarefa para a fila do Roy.
4. **Etapa 2, criar.** O Roy monta a estrutura (JSON abaixo) a partir do esboço aprovado e da conversa, e salva com `scripts/quiz/quiz.py salvar`. O quiz vai para `revisar` e a tarefa para a aprovação.
5. O Davi testa o quiz na tela e conversa (o Roy ajusta com `salvar` de novo). **Aprovar** muda o quiz para `publicado` e conclui a tarefa.
6. Link público: `https://infopro-hub.vercel.app/quiz/<slug>`. As respostas vão para `quiz_respostas` e aparecem na aba Quiz.

## Estrutura (JSON salvo em `quizzes.estrutura`)

```json
{
  "intro": {"titulo": "Exame da Presença", "subtitulo": "Descubra em 2 minutos o que está sabotando o seu dia", "botao": "Começar"},
  "perguntas": [
    {"id": "q1", "texto": "Quando o dia termina, o que você sente?",
     "opcoes": [
       {"texto": "Que o importante ficou pra depois", "perfil": "disperso", "pontos": 2},
       {"texto": "Cansaço, mas fiz o que precisava", "perfil": "executor", "pontos": 1}
     ]}
  ],
  "perfis": [
    {"id": "disperso", "nome": "O Disperso", "descricao": "texto do que está sabotando a pessoa…",
     "cta_texto": "Quero entrar no Desafio Presença Total", "cta_url": "https://…"}
  ],
  "captura": {"ativa": true, "titulo": "Para onde enviamos o seu resultado?", "pedir": ["nome", "whatsapp"]},
  "cor": "#0ea5e9"
}
```

- `perguntas`: de 5 a 12. Cada opção soma `pontos` (padrão 1) no `perfil` dela. O resultado é o perfil com mais pontos.
- Pergunta sem perfil (só para identificar o público): as opções podem ir sem `perfil`.
- `perfis`: de 2 a 5, cada `id` em minúsculas e sem espaço. `cta_url` pode ficar vazio se o Davi ainda não passou o link: avise na entrega.
- `captura.pedir`: qualquer combinação de `nome`, `email` e `whatsapp`. Use `"ativa": false` para não pedir nada.
- Textos na voz do especialista; nada de prometer resultado que o produto não entrega.

## Quiz "dopaminérgico" (desde 15/10/2026)

Pedido do Davi: quiz cru (só texto e botão) não serve. Referências dele: inlead.digital/dhd-v2-37-copia e brandingcapital.vercel.app. Tudo opcional e compatível com o formato acima:

- `tema`: `"escuro"` (fundo preto, bom para o vermelho e preto do Matheus) ou `"claro"`.
- `intro`: `imagem`, `imagem_nota`, `credenciais` (lista de selos) e `rodape` ("Leva 2 minutos. É anônimo.").
- Pergunta: `imagem`, `imagem_nota`, `subtitulo`, `estilo: "cartoes"` (opções em grade, com `imagem` por opção). Opção: `emoji`, `resumo` (como a resposta entra em frases: "nos estudos").
- `telas`: lista de telas entre as perguntas. Cada uma tem `id`, `depois_de` (`"intro"` ou id da pergunta; várias no mesmo ponto saem na ordem da lista) e `tipo`:
  - `respiro`: `titulo`, `texto`, `imagem`, `citacao {texto, autor}`, `grafico {titulo, barras:[{rotulo, valor, legenda, destaque}]}`, `depoimentos [{nome, texto}]`, `depoimentos_nota`, `fonte`, `botao`;
  - `especialista`: foto redonda, `credenciais`, `audio` (URL) ou `audio_nota`;
  - `carregando`: `titulo` e `itens` (marcados um a um; passa sozinha em ~4 s);
  - `resultado`: mostra o perfil no meio do quiz (`titulo`, `texto`, `botao`); as perguntas depois dela continuam (sequência de sins).
- `resultado.grafico`: `{titulo, barras:[{rotulo, perfis:[ids]}]}`; cada barra é a % dos pontos dos perfis dela. Sem isso, uma barra por perfil.
- Perfil: `imagem`, `imagem_nota`, `resumo`, `virada` (a frase do perfil dentro da oferta). A `descricao` é dividida em blocos por linha em branco; o bloco que começa com "O que está te sabotando" ganha destaque.
- `oferta`: a página de vendas no fim (`titulo`, `subtitulo`, `texto`, `produto`, `dias`, `itens`, `depoimentos`, `garantia`, `preco`, `preco_detalhe` (linha menor embaixo do preço), `imagem`, `cta_texto`, `cta_url`, `fechamento`). Se não tiver `cta_url`, usa a do perfil.
- Nos textos: `{perfil}` vira o nome do perfil e `{resposta:q1}` a resposta da pergunta q1 (o `resumo` da opção ou o texto).
- **Imagem com URL vazia é lugar reservado**: no teste aparece pontilhada com o `imagem_nota` ("Falta: foto do Matheus"); no link público some. Não invente foto do especialista nem depoimento: deixe vazio com a nota.
- **O Davi edita na tela:** em "Ver e aprovar" → Testar o quiz → **Editar**, ele clica num texto para mudar a palavra ou numa imagem para enviar (bucket público `quiz-imagens`). Grava direto em `quizzes.estrutura`; antes de ajustar, rode `ver` de novo para não desfazer o que ele mudou.
- Copy nova (texto de tela, perfil, oferta) vem do Ítalo: use o texto do esboço dele; o Roy cuida de montar e do visual.
