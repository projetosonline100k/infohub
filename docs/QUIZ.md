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
