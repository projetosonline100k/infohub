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
  → window.postMessage (só p/ própria origem) — SESSION / CURRENT_TASK / FOCUS_STATE
  → bridge.js (content script, roda só na origem do app)
  → chrome.runtime.sendMessage
  → background.js (service worker)
  → chrome.storage.local (session, currentTaskId, focus)
  → chrome.storage.onChanged
  → orb.js (content script em qualquer outra aba)
```
`FOCUS_STATE` é mandado toda vez que o Assistant detecta uma mudança
relevante na tarefa em foco (criar, iniciar, pausar, retomar, concluir,
trocar de tarefa, mudar estimativa) — a extensão aplica isso na hora, sem
esperar o alarme de 30s.

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
token) automaticamente quando você está logado; a extensão só guarda isso em
`chrome.storage.local` (exclusivo da extensão, nenhuma página consegue ler).

`chrome.storage` é usado só pra estado da própria extensão (posição da
orbe, cache do foco, a sessão recebida) — nunca como fonte de verdade: o
estado real do foco (rodando/pausado/tempo) sempre vem do Supabase, via push
do app ou, no fallback, de uma consulta fresca à tabela `atividades`.

## Limitações desta POC

- **Sem Realtime dentro da extensão**: as escritas dela (Pausar/Retomar/
  Concluir) chegam ao app web via Realtime normalmente (é o app que está
  inscrito, não a extensão), mas mudanças feitas em OUTRO lugar enquanto
  nenhuma aba do app está aberta só chegam na extensão no próximo alarme
  (~30s) — ela não mantém uma inscrição Realtime própria (ver acima).
- **Token sem renovação automática**: se o `access_token` expirar entre uma
  ida e outra ao app (sessões do Supabase costumam durar ~1h), a extensão
  para de conseguir ler/gravar até você reabrir/focar o app web (o que
  reenvia uma sessão fresca). Não implementei refresh de token dentro da
  extensão nesta rodada.
- **Sem tela de "nenhum foco"** muito elaborada — só um texto simples +
  "Abrir sistema".
- **Criar/selecionar tarefa não está na extensão** — ela só reflete/controla
  a tarefa que já está em foco no app web (Pausar/Retomar/Concluir/Abrir
  sistema), como pedido nesta primeira versão.
