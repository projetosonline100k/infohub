# Infopro Assistant — extensão Chrome (POC)

Mostra a orbe do Assistant em outras abas do navegador, sincronizada com a
mesma sessão de foco do sistema (mesma tabela `atividades` do Supabase — sem
timer paralelo).

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ative "Modo do desenvolvedor" (canto superior direito).
3. Clique em "Carregar sem compactação" e selecione a pasta `chrome-extension/` deste repositório.
4. A orbe vai aparecer em qualquer aba `http(s)` aberta a partir de agora (abas já abertas antes de instalar precisam ser recarregadas).

## Configurar

Edite **dois arquivos** antes de usar fora do `localhost:5183`:

- `config.js` → `APP_URL` (endereço do seu app em produção).
- `manifest.json` → `content_scripts[0].matches` e `exclude_matches` do segundo bloco (troque `https://SEU-DOMINIO-AQUI.exemplo.com/*` pelo seu domínio real). É nesse primeiro bloco que o Chrome decide em qual origem o `bridge.js` roda — sem isso certo, a extensão nunca recebe a sessão/tarefa do app.

`SUPABASE_URL`/`SUPABASE_ANON_KEY` em `config.js` já vêm preenchidos com os
mesmos valores públicos do app (a "anon key" do Supabase é pública por
design — protegida pela Row Level Security no banco, não é segredo).

## Como funciona a sincronização

**App → extensão (push imediato, principal):**
```
App web (Assistant.tsx)
  → window.postMessage (só p/ própria origem) — SESSION / CURRENT_TASK / FOCUS_STATE / TASKS_SNAPSHOT
  → bridge.js (content script, roda só na origem do app — repassa qualquer mensagem, genérico)
  → chrome.runtime.sendMessage
  → background.js (service worker)
  → chrome.storage.local (session, currentTaskId, focus, tasks, project)
  → chrome.storage.onChanged
  → orb.js (content script em qualquer outra aba)
```
`FOCUS_STATE` é mandado toda vez que a tarefa em foco muda de verdade
(criar, iniciar, pausar, retomar, concluir, trocar de tarefa, mudar
estimativa). `TASKS_SNAPSHOT` é mandado toda vez que a lista de tarefas
pendentes muda — carga inicial, Realtime, BroadcastChannel entre abas do
app, ou uma mutação local — sempre a MESMA lista que a aba "Hoje" do
Assistant web mostra, só com os campos que a extensão precisa (id, título,
cliente_id, nome do projeto, status, concluída, datas, prioridade,
estimativa, campos do timer). A extensão aplica os dois na hora, sem
esperar o alarme de 30s.

**Extensão busca sozinha, sem depender do app estar aberto (item 3):**
`background.js` expõe `GET_TASKS`, `GET_CURRENT_FOCUS`/`GET_FOCUS`,
`REFRESH_TASKS` e `GET_ASSISTANT_STATE` — se a extensão já tem uma sessão
salva (de uma vez que o app esteve aberto) mas nenhuma aba está mandando
push, ela mesma consulta o PostgREST do Supabase (`fetchTarefasDireto`,
com embed `clientes(nome_especialista)` pra trazer o nome do projeto numa
única ida). **Toda consulta autenticada acontece só em background.js** — o
`orb.js` (content script, roda dentro da página visitada) nunca fala com o
Supabase diretamente, só troca mensagens com o background.

**Toda orbe nova pede o estado completo na hora (item 8):** ao ser
injetado, `orb.js` manda `GET_ASSISTANT_STATE` e recebe
`{focus, tasks, project, orbPosition, sessionExpired, updatedAt}` de uma
vez, sem esperar o próximo polling — e depois qualquer atualização (de
outra aba, do app, ou do fallback) chega via uma mensagem ativa
`ASSISTANT_STATE_CHANGED` que o `background.js` manda com
`chrome.tabs.sendMessage` pra toda aba aberta (`chrome.tabs.query`), então
todas as orbes abertas (Google, YouTube, ChatGPT...) refletem junto (item
7). **Não é mais `chrome.storage.onChanged`**: desde que `chrome.storage.
local` passou a ser `TRUSTED_CONTEXTS` (ver seção de segurança abaixo),
esse evento simplesmente não chega mais em content scripts — por isso o
broadcast ativo via mensagem, que não depende de acesso à storage
nenhuma.

**Extensão → Supabase → app (Realtime, sem passar pela extensão de volta):**
```
orb.js → chrome.runtime.sendMessage (PAUSE/RESUME/COMPLETE)
  → background.js → PATCH direto no PostgREST (mesma tabela `atividades`)
  → Supabase Realtime (postgres_changes)
  → useAssistantAtividades.ts (qualquer aba do app web) atualiza sozinho
```
A extensão nunca manda o resultado de volta pro app diretamente — ela só
escreve no Supabase, e o app já está inscrito em Realtime nessa tabela, então
recebe a mudança do mesmo jeito que receberia de qualquer outra aba ou do
Kanban principal.

**Fallback (não a via principal):** `chrome.alarms` a cada ~30s — cobre só o
caso de uma mudança acontecer sem nenhuma aba do app aberta (ou um push
perdido). Um service worker MV3 não mantém WebSocket vivo de forma
confiável (pode ser encerrado a qualquer momento pelo Chrome), então não dá
pra ter Realtime de verdade *dentro* da extensão — só esse polling leve como
rede de segurança.

Não existe token copiado manualmente: o app manda a sessão (access/refresh
token) automaticamente quando você está logado.

## Fonte de verdade e o que o chrome.storage guarda (item 14)

O Supabase é a única fonte de verdade — `chrome.storage` nunca é tratado como
um banco paralelo, só cache/preferência, dividido em duas áreas por
sensibilidade:

| Área | Guarda | Sobrevive a... |
| --- | --- | --- |
| `chrome.storage.local` | `refreshToken`, cache de tarefas (`tasks`), foco atual (`focus`), tarefa selecionada (`currentTaskId`), projeto (`project`), posição da orbe (`orbPosition`), flag `sessionExpired` | fechar/reabrir o Chrome |
| `chrome.storage.session` | `accessToken` + `expiresAt` (o par de curto prazo, o que vai no header `Authorization` de cada chamada) | só o service worker reiniciar — é limpa quando o Chrome fecha de vez |

O `refresh_token` fica em `local` **de propósito**: é o que permite recuperar
a sessão sozinho ao reiniciar o Chrome, sem depender do app web estar
aberto (itens 11 e 13 pedem exatamente isso). Sozinho, sem o `access_token`,
ele não autentica nenhuma chamada — só serve pra pedir um `access_token`
novo.

### Endurecimento do refresh_token (rodada mais recente)

`refresh_token` é tratado como credencial sensível, não como um dado de
cache qualquer:

- **`chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`**
  — chamado explicitamente no topo de `background.js`, ao lado do mesmo
  `setAccessLevel` que `chrome.storage.session` já tinha. Isso é uma
  restrição do **navegador**, não do código: com ela, content scripts
  (`orb.js`, `bridge.js`) ficam impedidos de ler `chrome.storage.local` —
  uma chamada `chrome.storage.local.get(...)` feita de dentro desses
  arquivos simplesmente não retorna nada, mesmo que alguém adicione esse
  código depois por engano.
- **`orb.js`/`bridge.js` nunca leem `accessToken` nem `refreshToken`, nunca
  os recebem por mensagem, e nunca os repassam pra página visitada.** Os
  dois arquivos foram auditados (ver "Validação" abaixo) e não têm nenhuma
  referência a `token`/`session` fora de uma flag booleana
  (`sessionExpired`, que não carrega o token em si, só indica que ele
  precisa ser renovado). Toda leitura/escrita de token está confinada a
  quatro funções de `background.js`: `armazenarSessao`, `atualizarSessao`,
  `garantirSessaoValida`, `chamarSupabase`.
- **Rotação do refresh_token (item 4)**: o Supabase troca o
  `refresh_token` a cada renovação (o antigo para de funcionar). Sempre que
  `atualizarSessao()` recebe uma resposta com `refresh_token` novo,
  `armazenarSessao()` já grava esse valor na hora, substituindo o anterior
  — nunca fica um `refresh_token` desatualizado salvo.
- **Falha por token revogado/inválido (item 5)**: se o endpoint de refresh
  do Supabase responder `400`/`401` (assinatura de refresh_token
  inválido, expirado ou revogado — diferente de um erro de rede, que não
  mexe na sessão salva e só tenta de novo depois), `background.js` chama
  `limparSessaoInvalida()`: apaga `accessToken`/`expiresAt` (session) e
  `refreshToken` (local), marca `sessionExpired: true`, e avisa todas as
  orbes abertas. O Jarvis **continua funcionando visualmente** (olhos,
  respiração, anel, cache de tarefas ainda visível) — só troca a ação
  principal do painel por "Sessão expirada — entrar novamente" com um
  atalho pro app.
- **Logout (item 6)**: a mensagem `SESSION` com `session: null` limpa
  `refreshToken`, `accessToken`, `expiresAt`, `currentTaskId`, `project` e
  a flag `sessionExpired`, e zera `focus`/`tasks` — mas **preserva
  `orbPosition`**, porque é preferência visual, não dado de sessão.

**Ao (re)iniciar o Chrome** (`chrome.runtime.onStartup`/`onInstalled` →
`inicializar()`), 4 passos:
1. o cache em `chrome.storage.local` já está lá — a próxima orbe injetada
   mostra o Jarvis na hora com ele, sem esperar nada daqui;
2. `garantirSessaoValida()` — o `access_token` foi zerado pelo restart
   (`session`), mas o `refresh_token` sobreviveu em `local`, então dá pra
   tirar um `access_token` novo na hora, sem o app web precisar estar
   aberto (só não recupera nada se você nunca logou nesta extensão, ou
   deslogou explicitamente);
3. com sessão válida, consulta o Supabase de verdade;
4. substitui o cache pelos dados atuais.

Na prática: o Jarvis funciona com o Infopro Hub inteiro fechado, inclusive
depois de reiniciar o Chrome — só precisa ter feito login pelo app web pelo
menos uma vez pra extensão guardar um `refresh_token`.

## Os dois caminhos (item 13)

```
CAMINHO RÁPIDO (app aberto):
Kanban/Assistant web → Realtime → useAssistantAtividades.ts
  → TASKS_SNAPSHOT/FOCUS_STATE (push) → background.js → chrome.storage → orb.js

CAMINHO INDEPENDENTE (app fechado):
chrome.alarms (30s) → background.js → garantirSessaoValida()
  → (renova token se preciso) → PostgREST (/rest/v1/atividades)
  → chrome.storage → todas as orbes abertas atualizam
```
Os dois escrevem no mesmo lugar (`chrome.storage.local`) e a mesma tabela
(`atividades`) é a fonte em ambos — não existem dois estados "oficiais",
só duas formas de alimentar o mesmo cache.

## Autenticação (item 12)

- `access_token`/`refresh_token` só existem em `chrome.storage` (divididos
  entre `local` e `session`, ver tabela acima), escritos e lidos
  exclusivamente por `background.js`. **`orb.js` nunca recebe token
  nenhum** — só manda `{type, taskId}` e recebe dados já prontos
  (`{focus, tasks, ...}`).
- **Renovação automática**: antes de qualquer chamada autenticada,
  `garantirSessaoValida()` confere se o `access_token` expira nos próximos
  5 minutos; se sim, chama `POST /auth/v1/token?grant_type=refresh_token`
  direto (mesmo endpoint que o `supabase-js` usa por baixo dos panos) e
  substitui a sessão salva. Se mesmo assim uma chamada voltar com `401`,
  `chamarSupabase()` tenta renovar mais uma vez e repete — rede de
  segurança em cima da checagem proativa.
- **Sobrevive a suspensão do service worker**: nada fica só em variável —
  toda leitura/escrita é direto em `chrome.storage` (local ou session), então
  o worker ser encerrado e recriado pelo Chrome (comportamento normal do
  MV3, acontece o tempo todo) não perde nada; `chrome.storage.session`
  sobrevive a isso igual `local` — só uma reinicialização completa do
  Chrome zera ela (ver "Fonte de verdade" acima). O próximo alarme
  (`chrome.alarms`, que também sobrevive à suspensão) retoma de onde parou.
- **Evita brigar com o app pelo mesmo refresh_token**: o Supabase rotaciona
  o `refresh_token` a cada troca (o antigo para de funcionar). Se o app web
  também está aberto, o `supabase-js` dele já renova sozinho e empurra a
  sessão nova via `SESSION` — nesse caso a extensão **não** tenta renovar
  por conta própria (só se não chegou nenhuma sessão fresca via push nos
  últimos 3 minutos), evitando os dois tentarem trocar o mesmo
  `refresh_token` ao mesmo tempo. Isso reduz bastante o risco de corrida,
  mas não elimina 100% (ver limitação abaixo).

## Validação: content scripts realmente não acessam os tokens

**Estática (já feita, repetível a qualquer momento):**
```
grep -n -i "token\|session" chrome-extension/orb.js chrome-extension/bridge.js
```
Único resultado esperado: a flag `sessionExpired` (booleana, sem valor de
token) e comentários explicando a restrição — nenhuma referência a
`accessToken`, `refreshToken`, `chrome.storage.local.get`/`.set` de token,
nem `chrome.storage.session` em nenhum dos dois arquivos.

**Em runtime (só você consegue rodar, precisa de um Chrome com a extensão
carregada):**
1. Abra qualquer site comum (ex. `google.com`) com a extensão ativa e a
   orbe visível.
2. Abra o DevTools da aba (`F12`) → aba "Console" → no seletor de contexto
   de execução (canto superior do painel Console, ao lado de "top"),
   escolha o contexto do content script da extensão (aparece como
   "Infopro Assistant (POC)" ou similar).
3. Rode `chrome.storage.local.get("refreshToken", console.log)` e
   `chrome.storage.local.get("accessToken", console.log)` (este último
   nunca existiu em `local`, mas serve pro teste) — com
   `setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})` ativo, o resultado
   deve vir vazio (`{}`), nunca o valor real do token.
4. Pra comparar, abra `chrome://extensions` → detalhes da extensão →
   "Inspecionar visualizações" → "service worker" (esse SIM é um contexto
   confiável) e rode o mesmo comando ali — aí sim o valor real aparece,
   confirmando que a restrição é por contexto, não uma falha geral do
   `chrome.storage`.

## Limitações desta POC

- **Corrida de refresh_token (rara)**: se o app web e a extensão tentarem
  renovar a sessão quase no mesmo instante (ex.: você reabre o app bem na
  hora em que a extensão também decidiu renovar), o Supabase pode rejeitar
  quem chegar depois com o `refresh_token` já trocado pelo outro lado. Se
  isso acontecer, o lado que falhou volta a funcionar assim que uma sessão
  nova for emitida (reabrir/logar de novo no app já resolve).
- **Sem Realtime dentro da extensão**: as escritas dela (Pausar/Retomar/
  Concluir) chegam ao app web via Realtime normalmente (é o app que está
  inscrito, não a extensão), mas mudanças feitas em OUTRO lugar enquanto
  nenhuma aba do app está aberta só chegam na extensão no próximo alarme
  (~30s) — ela não mantém uma inscrição Realtime própria (ver acima).
- **Sem tela de "nenhum foco"** muito elaborada além da lista de tarefas —
  sem busca, sem edição de campos, sem criar tarefa pela extensão.
- **Criar/editar tarefa não está na extensão** — ela reflete/controla a
  tarefa em foco e permite selecionar uma da lista pra começar
  (Iniciar foco/Pausar/Concluir/Abrir sistema), como pedido nesta versão.
