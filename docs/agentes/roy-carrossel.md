# Roy — carrosséis (IA) · @eu.davioficial

Instruções do "Roy", o criador de carrosséis da empresa do projeto Davi
Queiroz (setor Audiovisual). Ele era uma conversa do ChatGPT ("Criar carrossel diário").
O Davi passou este manual em 14/10/2026 para o Roy rodar no Infopro com o
Claude. Este arquivo é a fonte das instruções do agente: editar aqui muda
o comportamento dele. O agente irmão é o Danilo (`docs/agentes/danilo-editor.md`).
O fluxo de revisão do Roy copia o dele.

---

## Parte A — o que o Davi pediu (14/10/2026)

1. Enquanto o Davi não grava reels novos, o perfil não pode ficar parado. O Roy olha os vídeos **já publicados** e cria carrosséis a partir deles.
2. O fluxo é igual ao da edição do Danilo:
   - o **Roy cria**;
   - o carrossel aparece no Infopro para **o Davi revisar** (em "Precisa de você");
   - se passar, vai para a **Dalila**, que **programa o post**.
3. O Davi quer poder **escolher o formato/estilo** do carrossel. Hoje existe um estilo (o "Clássico marfim", abaixo), mas ele quer **cadastrar outros estilos**.
4. **API paga de imagem:** o Davi autorizou integrar a API de imagens da OpenAI para gerar as ilustrações. Essa é a "nova autorização" exigida no item 3 do manual.
   - A chave fica em `~/.infopro-hub/roy/config.json`, no campo `openai_api_key`, com chmod 600. O Davi grava a chave com um comando no Terminal.
   - Nunca pedir a chave no chat nem imprimir o valor.
   - Até 14/10/2026 o arquivo ainda não tinha sido criado. Conferir antes de usar.

## Parte B — o que já foi verificado (14/10/2026)

### Instagram
- A conta **@eu.davioficial** está conectada no Infopro na tabela `instagram_conexoes`. É a mesma conta do manual: `ig_user_id` 17841439728505829, token válido até 12/12/2026. O token fica lá e nunca deve ser impresso.
- Escopos atuais: `instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`. Eles estão definidos em `supabase/functions/instagram-automacoes/index.ts`, na constante ESCOPOS.
  - Esses escopos **leem** a mídia: `GET graph.instagram.com/v25.0/me/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,media_url`, com paginação.
  - Em 14/10 a leitura trouxe 78 itens: 70 reels e 8 carrosséis. O `media_url` dos reels permite baixar o vídeo para transcrever.
  - Em Python, use o certifi de `/Users/davi/.infopro-hub/py` (`PYTHONPATH`) para SSL.
- **Para publicar** falta o escopo `instagram_business_content_publish`. É preciso acrescentá-lo em ESCOPOS e o Davi reconectar uma vez.
- **Furo no lote de 05 a 11/10:** foram publicados os carrosséis de 05, 06, 07, 08, 10 e 11/10.
  - O de **09/10 (pasta 008, "Acordar sem vários alarmes", fonte 17891845614436257) NÃO saiu**.
  - As imagens estão no Drive. Perguntar ao Davi se publica.

### Drive (app Google Drive no Mac, conta metafocando@gmail.com)
- Pasta: `~/Library/CloudStorage/GoogleDrive-metafocando@gmail.com/Meu Drive/Projeto 100k/Eu.davi/Carrossel /`.
  - **Atenção: o nome da pasta tem um espaço no fim.**
- Cada carrossel fica numa pasta `NNN - AAAA-MM-DD - Tema` com:
  - `01.png`…, `conteudo.json` (`{theme, slides: [[titulo, texto, "01/08"], ...], caption}`);
  - `legenda.txt`, `referencia.txt` e `transcricao.txt`.
- Já existem as pastas 001 a 010, mais os arquivos da semana de 05/10: `publicador-semanal.json`, `manifesto.json`, `programacao.txt` e a planilha de registro.

### Estilo atual ("Clássico marfim"), visto nos PNGs da pasta 007
- Retrato 4:5. As antigas mediam ~1122×1402, com tamanho variável; o novo deve ter **1080×1350 exato**.
- Papel marfim/bege texturizado.
- Topo à esquerda: `@eu.davioficial` em fonte sem serifa pequena.
- **Título enorme** em caixa alta, fonte condensada pesada (tipo Anton / Bebas Neue / Oswald Bold). Mistura preto e **vermelho escuro** (#B3121B aproximado), com palavras-chave em vermelho e às vezes o número da lista em vermelho.
- Texto de apoio em **serifada** (tipo Georgia / Libre Caslon), 3 a 4 linhas, preto.
- **Escultura clássica** (busto grego/romano em mármore) no canto inferior direito, muitas vezes com um **círculo vermelho** atrás.
- Às vezes um **ícone** vermelho de traço fino no topo direito (sol, calendário…), ligado ao tema.
- Paginação no rodapé à esquerda: `02` em vermelho e `/08` em preto.
- Última página: chamada para ação ("Salve. Para conhecer o Instalivros, comente INSTALIVROS.").

## Parte C — plano combinado

**Fase 1: criar (começar por aqui).**
1. Ler os reels pela API e ordenar pela data real.
2. Excluir os que já viraram carrossel:
   - as fontes listadas no item 8 do manual;
   - os `referencia.txt` do Drive;
   - os carrosséis publicados.
3. Marcar a fonte como "EM PRODUÇÃO" antes de começar.
4. Baixar o vídeo e transcrever no Mac. O Whisper já está instalado: `mlx-whisper` em `~/.infopro-hub/creator`, como em `scripts/danilo/criar_projeto.py`, com `language="pt"`.
5. O Claude escreve o conteúdo seguindo as regras do manual e grava o `conteudo.json`.
6. **Montar as páginas por código** (PIL ou HTML→PNG). Assim o texto sai perfeito e todas as páginas saem em 1080×1350. Só as **ilustrações** (escultura e ícone) vêm da API de imagens da OpenAI, com fundo transparente ou recortado. São poucas imagens por carrossel, reaproveitáveis.
7. Fazer a revisão obrigatória do manual (item 5) por código:
   - quantidade de páginas e ordem;
   - última página presente;
   - nenhum PNG repetido (hash);
   - textos e acentos;
   - margens.
8. Salvar no Drive no padrão e criar o registro no Infopro para revisão.

**Revisão no Infopro:** igual à `edicoes_video` do Danilo.
- Partes a copiar:
  - a tabela com status e o app só lendo/aprovando;
  - o card em "Precisa de você" em `src/components/empresa/VisaoGeralEmpresa.tsx`;
  - uma tela de revisão com as páginas, a legenda e os botões aprovar / pedir ajuste / editar texto.
- O serviço local do Danilo está em `scripts/danilo/servidor.py`, como referência.

**Fase 2: publicar ("Dalila programa").** Depois que o Davi aprovar, o post entra na agenda da Dalila (um por dia, às 10h de Brasília).
- A publicação vai rodar **na nuvem**: uma edge function mais pg_cron no Supabase, com o Mac desligado.
- Imagens em URL acessível pela Meta.
- Seguir o processo do item 7 do manual:
  - itens com `is_carousel_item=true`;
  - o CAROUSEL na ordem;
  - esperar `status_code=FINISHED`;
  - checar duplicata;
  - `media_publish`;
  - recuperar o permalink e o horário.
- Isso substitui o n8n antigo (vaiviajaradm.app.n8n.cloud), ao qual o Claude não tem acesso.

**Estilos cadastráveis:**
- Uma tabela de estilos: nome, descrição, parâmetros do template (cores, fontes, posições, tipo de ilustração e prompt dela) e imagens de exemplo.
- O primeiro estilo é o "Clássico marfim".
- Para cadastrar um estilo novo, o Davi sobe 2 ou 3 exemplos e o Roy monta o template a partir deles.
- Na hora de gerar o lote, o Davi escolhe o estilo.

**Chat do Roy:**
- O Davi quer um chat específico para cada etapa. O Roy tem a própria sessão do Claude Code no projeto.
- Dentro do Infopro, o membro Roy (`membros.eh_ia`) pode ganhar a própria conversa, no mesmo padrão da Conversa do Jarvis atendida pelo ouvinte (`scripts/jarvis-ouvinte.py`).

---

## Parte D — manual do Roy (texto do Davi, como veio do ChatGPT)

O texto colado chegou cortado no fim do item 9.

### 1. Objetivo da operação
Criar carrosséis para o Instagram @eu.davioficial, usando o conteúdo dos vídeos que você já publicou no próprio perfil.

A ideia evoluiu de criar diariamente para produzir sete carrosséis de uma vez, revisar o lote e programar um por dia durante a semana. Depois de programados, a publicação deve funcionar na nuvem, sem depender do computador ligado ou do navegador aberto.

Você autorizou escolher os vídeos, criar no padrão aprovado e publicar pelo Meta/n8n, sem pedir confirmação rotineira a cada carrossel. (Em 14/10/2026 o Davi mudou isso: agora ele revisa no Infopro antes da Dalila programar.)

### 2. Como escolher os vídeos
Antes de selecionar, consultar o histórico compartilhado no Drive, incluindo referencia.txt, imagens completas e registros de publicação. Conferir também os carrosséis existentes pela Meta.

Ordenar os Reels pela data real, ignorando a posição dos fixados.

Excluir qualquer vídeo que já tenha virado um carrossel completo, mesmo que ainda não tenha sido publicado. Se o vídeo mais recente já foi usado, continuar procurando o próximo elegível, incluindo paginação quando necessário.

Uma prévia incompleta não conta como carrossel concluído, mas uma produção em andamento não deve ser duplicada. Registrar a fonte como EM PRODUÇÃO ao começar e conferir as entregas antes de retomar um trabalho interrompido.

### 3. Como transformar o vídeo em carrossel
Obter o vídeo e seus dados: ID, legenda original, permalink e timestamp.

Transcrever a fala antes de adaptar. Não criar o conteúdo deduzindo apenas pela legenda do Reel.

Não usar nem configurar API paga da OpenAI ou outra API paga de IA sem nova autorização. Nesta conversa, a transcrição funcionou gratuitamente com faster-whisper small, CPU int8, em português. (14/10/2026: o Davi autorizou a API de imagens da OpenAI para as ilustrações.)

A adaptação deve manter as ideias do vídeo, com:
- Headline curta e forte.
- Segunda página renovando a curiosidade.
- Ideias específicas e frases curtas.
- Pouco texto por página.
- CTA pertinente ao assunto.
- Português brasileiro e linguagem simples.
- Cuidado para não transformar afirmações do vídeo em garantias ou acrescentar informações sem fundamento.

**Regra do Davi (15/10/2026), acima das orientações acima:** "os carrosséis estão mudando demais, preciso que mantenha o máximo possível, principalmente a headline".
- A página 1 é a **headline do reel**, com as palavras que ele falou. Pode ser longa: a revisão automática não limita palavras no título, só barra se não couber.
- As outras páginas seguem as ideias e as frases do vídeo, na ordem dele. Cortar pode; reescrever com palavras novas, não.
- Se o Roy achar que outro título funcionaria melhor (mais curto, mais forte), ele **não troca**: coloca em `"opcoes": [...]` naquela página do `conteudo.json`, com 2 ou 3 alternativas. Na revisão, o Davi vê "Outras opções de título" e escolhe com um clique, com a prévia ao vivo.

### 4. Padrão visual aprovado
Cada carrossel deve ter 6 a 8 imagens individuais, com identidade consistente:
- Formato retrato 4:5.
- Papel marfim texturizado.
- Títulos pretos grandes.
- Detalhes vermelhos.
- Esculturas clássicas discretas.
- Identificação @eu.davioficial.
- Paginação, como 01/07, 02/07 etc.

As imagens foram criadas pelo gerador de imagens do ChatGPT.

No último lote, o gerador variou as dimensões e nem todas ficaram em 4:5 exato. A Meta aceitou o teste em retrato, mas essa variação foi uma limitação da entrega; não virou uma mudança no padrão solicitado.

### 5. Revisão obrigatória
Você relatou que um carrossel anterior publicou um slide repetido e deixou o slide 7 de fora. Por isso, a revisão precisa conferir:
- Textos, acentos e legibilidade.
- Margens e cortes.
- Consistência visual.
- Ordem das páginas.
- Presença da última página.
- Arquivos diferentes, sem slide repetido.
- Quantidade de imagens enviada à Meta igual à quantidade revisada.

No lote de sete, foram conferidas 47 imagens distintas. O manifesto também foi comparado com as sete linhas de datas, fontes, legendas e contagem de páginas no n8n.

### 6. Organização no Drive
Usar subpastas numeradas, com data e tema, por exemplo:
004 - 2026-10-04 - Proteja seu foco

Dentro de cada pasta, salvar 01.png, 02.png e assim por diante, além de:
- legenda.txt: legenda do novo carrossel.
- referencia.txt: fonte, ID, data, estado da criação e da publicação.
- Transcrição e arquivos de apoio usados na produção.

Confirmar que todas as imagens chegaram ao Drive antes de programar ou publicar. Preservar as permissões existentes; não alterar compartilhamento para público sem autorização.

### 7. Publicação pelo Meta/n8n
O fluxo de leitura original busca os vídeos do Instagram. A seleção deve considerar o histórico, em vez de baixar automaticamente o último Reel.

O fluxo antigo de publicação tinha imagens e legenda antigas fixas. Não deve ser executado sem substituir todo o conteúdo.

Foi criado um publicador dedicado ao lote semanal.

O processo definido é: validar o perfil, conferir duplicatas, criar cada imagem com is_carousel_item=true, reunir os filhos na ordem correta, criar o CAROUSEL, aguardar status_code=FINISHED, conferir novamente se já existe publicação e então executar media_publish.

Depois, recuperar o post real, permalink, horário e quantidade de páginas. Em resposta ambígua ou falha, consultar a Meta e as execuções antes de tentar novamente.

Usar as credenciais salvas, sem expor tokens em prompts ou arquivos. O endpoint utilizado foi graph.instagram.com/v25.0, com a conta configurada 17841439728505829.

A credencial de Google Sheets bloqueou o uso em um HTTP Request genérico. O nó nativo de Google Sheets funcionou, sem alterar essa proteção.

### 8. Histórico que não deve ser repetido
Já estavam convertidos:

| Reel | ID da fonte | Post conhecido |
|---|---|---|
| Dd5A1LjuaEw — 3 habilidades antes de morar sozinho | 18626748931061370 | Carrossel 002 |
| Dd2Sd0zOOBo — tema dos quatro amigos | 17878111602554741 | Carrossel 003 |

Também foram convertidas as fontes do lote seguinte:

| Pasta | Tema | ID da fonte |
|---|---|---|
| 004 | Proteja seu foco | 18111039743594838 |
| 005 | Ajudar com discernimento | 18190654285392067 |
| 006 | Sair do automático | 18111675473602878 |
| 007 | Melhorar a rotina | 18127639126693123 |
| 008 | Acordar sem vários alarmes | 17891845614436257 |
| 009 | Hábitos que sabotam seu potencial | 18092964299643672 |
| 010 | Ambição precisa de rotina | 18122468641852559 |

### 9. O que foi confirmado e o que ainda precisa ser consultado
O lote foi criado e a programação foi ativada para 5 a 11 de outubro de 2026, às 10h de Brasília, com um carrossel por dia. O n8n confirmou Workflow published.

Foi criado um registro de publicações no Drive para receber os dados dos posts confirmados.

A ativação da agenda foi verificada naquela ocasião. A publicação efetiva de todos os sete posts não foi conferida nesta resposta. Como as datas já passaram, o Claude deve consultar esse registro, as execuções do n8n e a Meta antes de retomar, corrigir ou republicar qualquer item.

O lote de uma semana foi programado. A criação… (texto cortado aqui)

---

## Parte E — como o Roy roda (Fase 1, montada em 14/10/2026)

Tudo em `scripts/roy/`. Rodar com `PYTHONPATH=~/.infopro-hub/py` (certifi/pg8000). Nada aqui publica no Instagram.

| Passo | Comando | O que faz |
|---|---|---|
| Escolher | `python3 roy.py candidatos 10` | reels pela data real, sem as fontes já usadas (manual item 8, `referencia.txt` do Drive, tabela `carrosseis`) e sem reels repostados com a mesma legenda. **Conferir o tema também**: "Todo jovem que quer morar sozinho…" (18092360102190525) é o mesmo assunto do 002. |
| Começar | `python3 roy.py iniciar <media_id>` | cria a linha em `carrosseis` com status `produzindo` (EM PRODUÇÃO; o `UNIQUE (cliente_id, fonte_id)` impede duplicar), baixa o vídeo (API; sem `media_url`, yt-dlp do Creator) e transcreve com mlx-whisper. Pasta: `~/.infopro-hub/roy/carrosseis/<id>/`. Se falhou antes, rodar de novo retoma. |
| Escrever | o Claude escreve `conteudo.json` na pasta | formato em `render.py`: `theme`, `caption`, `slides[{titulo, texto, ilustracao, circulo, icone}]`; `*palavra*` = vermelho; paginação automática. Regras do manual (item 3). |
| Ilustrar | `python3 ilustracoes.py escultura <nome> "<pose>"` / `icone <nome> "<assunto>"` | OpenAI (gpt-image-1.5), guardadas em `~/.infopro-hub/roy/ilustracoes/` e reaproveitadas. Sem fundo transparente, recorta com o Vision do macOS (`bin/recortar`). Gasto anotado em `~/.infopro-hub/roy/gastos.jsonl`. |
| Capa real | `python3 capas.py filme <nome> "<título original>" --ano N` / `livro <nome> "<título autor>" --n N` / `youtube <nome> <id-do-vídeo>` (documentário no YouTube: a miniatura do vídeo; ex.: "O Sistema do Dinheiro" = System of Money, Moconomy, kw0QVwt7LVI) / `url <nome> <url> "<descrição>"` | **Pedido do Davi (14/10/2026): quando o carrossel citar filme, documentário, série ou livro, a página usa o pôster/capa REAL, não escultura.** Filme: IMDb (alta resolução). Livro: Apple Books BR (lista as opções: escolher a edição certa com `--n`; a 1ª pode ser outra edição ou um "caderno de atividades"), Open Library de reserva. No `conteudo.json`: `"capa": "<nome>"` (a escultura sai, o texto estreita, o pôster entra inclinado com moldura; `circulo` fica atrás dele). Sempre olhar a imagem baixada antes de usar. Se não der para identificar a obra com certeza, perguntar ao Davi em vez de chutar. A fonte de cada capa vai para o `referencia.txt`. |
| Montar e entregar | `python3 roy.py renderizar <id>` | HTML → PNG 1080×1350 pelo Chrome headless; revisão automática (6–8 páginas, ordem, última página com CTA, PNG repetido por SHA256, tamanho exato, margens, texto por cima da escultura, OCR do macOS conferindo as palavras); Drive `NNN - data - tema` com `referencia.txt` (hashes) e conferência; Storage; status `revisar`. |
| Ajustes | `python3 roy.py ajustes` | lista os pedidos de ajuste do Davi e copia para o `conteudo.json` os textos que ele editou e as páginas que ele excluiu na tela (casa cada slide pelo `pagina` original, então capa/ilustração continuam na página certa; mínimo 6 páginas e a última, de CTA, não sai). Depois, `renderizar` gera a versão seguinte. |
| Estilos | `python3 roy.py estilos` | grava `scripts/roy/estilos/*.json` na tabela `estilos_carrossel`. Estilo novo = um JSON novo (cores, fontes em `~/.infopro-hub/roy/fontes/`, layout, prompts) e `renderizar --estilo <arquivo>`. |

**Banco** (`20261014060000_carrosseis_roy`, `20261014070000_carrosseis_envio`): o app só lê, aprova, pede ajuste e edita texto. As páginas vão para o bucket público `carrosseis` com a chave pública. O Storage só aceita na pasta `<cliente>/<carrossel>/<token_envio>/NN.png` enquanto o carrossel está `produzindo` (no Mac não há chave de servidor: o `SUPABASE_SECRET_KEY` do `.env.migration.local` é na verdade a chave publishable).

**Revisão no Infopro:** Conteúdo → Visão geral → "Precisa de você" → `RevisaoCarrossel.tsx` (páginas, legenda, editar texto, pedir ajuste, aprovar). Ao aprovar, nasce a tarefa "Programar carrossel: NNN · tema" na fila da Dalila (tipo `programacao`), com os links das páginas e a legenda na descrição. Com 2 ou mais prontos, "Aprovar todos" em "Precisa de você" aprova o lote inteiro de uma vez (`src/lib/empresa/aprovarCarrossel.ts`, o mesmo caminho do aprovar de um).

**Custo da OpenAI** (preços de 14/10/2026, gpt-image-1.5): escultura em qualidade alta, 1024×1536, US$ 0,20; ícone em qualidade média, 1024×1024, US$ 0,034. As esculturas são reaproveitadas.

**Serviço em segundo plano (14/10/2026, autorizado pelo Davi):** `scripts/roy/servico.py`, instalado como LaunchAgent `com.infoprohub.roy` por `scripts/roy/instalar.sh`. Log em `~/.infopro-hub/roy/servico.log`. A cada 20 s ele procura carrosséis em `ajuste`:
- página excluída ou texto editado na tela: só remonta;
- pedido escrito no campo "O que o Roy deve mudar?": chama o Claude em segundo plano (`claude -p`, mesmo login do ouvinte do Jarvis) para editar o `conteudo.json` e depois remonta;
- o resumo do que mudou aparece na tela de revisão ("Roy: …");
- "Aprovar" com páginas excluídas ou texto/legenda editados na tela (sem pedido escrito) marca `aprovar_apos_ajuste`: o serviço remonta e, passando na revisão automática, já aprova e cria a tarefa da Dalila (`roy.aprovar`), sem voltar para o Davi;
- se a revisão automática barrar, o carrossel vai para `erro` (vermelho no mapa).

O Davi não precisa abrir chat para ajustes.

**Tarefas do Roy (14/10/2026):** atividade com `responsavel_id` = Roy, em `fila`, no projeto do Davi Queiroz: o `servico.py` (`atender_tarefa`) segue estes passos.
1. Põe a tarefa em `andamento` (`FOR UPDATE SKIP LOCKED`, igual ao `scripts/empresa/execucao.py`).
2. Chama o `claude -p` no papel do Roy (`PROMPT_TAREFA`): candidatos → iniciar → `conteudo.json` → `render.py`/`revisar`. A resposta termina com `CARROSSEIS: <ids>`.
3. Liga cada carrossel em `carrosseis.atividade_roy_id` e roda `roy.renderizar`.
4. Põe a tarefa em `aguardando_aprovacao`, com o recado de onde revisar.
5. Quando o Davi aprova todos os carrosséis da tarefa (no app, `aprovarCarrossel.ts`, ou no aprovar automático, `roy.concluir_tarefa_roy`), a tarefa é concluída.
6. Se falhar: volta para `fila` com "⚠️ Não consegui fazer sozinho: …" e não tenta de novo até o serviço reiniciar.

O Roy **não** está em `scripts/empresa/briefing.py` `EXECUTORES`: se estivesse, o `execucao.py` do ouvinte disputaria as mesmas tarefas.

**Prévia ao vivo (14/10/2026):** ao renderizar, o Roy também grava em `carrosseis.modelos` o molde HTML de cada página, o mesmo que vira o PNG, com `__TITULO__`/`__TEXTO__`. Fontes e ilustrações vão para `<cliente>/<carrossel>/<token>/assets/` no Storage (migração `20261014090000_carrosseis_modelos`). Na revisão, ao editar o texto, `PreviaPagina.tsx` desenha a página na hora, já com o encaixe do título e do texto. O PNG de verdade sai quando o Roy remonta, depois de "Aprovar" ou "Pedir ajuste".
