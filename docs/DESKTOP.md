# Infopro Hub Desktop (Tauri)

Mesmo código-base do app web (`src/`) empacotado como app desktop via
[Tauri v2](https://v2.tauri.app). Nada em `src/` foi duplicado — a camada
desktop vive só em `src-tauri/` (Rust) e em `src/lib/desktop/*` (wrappers
finos sobre `@tauri-apps/api`, sempre atrás de `isDesktop()` em
`src/lib/platform.ts`).

## Rodando

```bash
npm run dev          # web, como sempre — nada mudou aqui
npm run tauri dev    # desktop — abre a janela principal + a janela Jarvis
```

Pré-requisito pra `npm run tauri dev`/`npm run tauri build`: Rust instalado
(`rustup`). No Linux também são necessárias as libs do WebKitGTK — ver
https://v2.tauri.app/start/prerequisites/.

Login/Supabase funcionam igual à web: a janela desktop carrega o mesmo
`index.html`/bundle, mesma origem, mesmo `localStorage` — a sessão do
Supabase é a mesma.

## Janela principal

Redimensionável, minimiza/maximiza normalmente. Tamanho/posição são
lembrados entre reinícios via `tauri-plugin-window-state`.

**Fechar a janela principal não mata o app** — ela só esconde (ver
`src-tauri/src/lib.rs`, `on_window_event` + `CloseRequested`). O processo
continua rodando com a janela Jarvis ativa. Isso vale também pro `Cmd+Q`
(macOS) — de propósito, ver "Sair" abaixo.

Tray icon (bandeja/menu bar):
- **Abrir Infopro Hub** — reexibe e foca a janela principal.
- **Sair do Infopro Hub** — o único jeito de encerrar o processo de
  verdade.

## Janela Jarvis

Segunda janela nativa (`label: "jarvis"` em `src-tauri/tauri.conf.json`),
carregando a rota `/jarvis` (`src/pages/JarvisWindow.tsx`) — o mesmo
componente `Assistant` (`src/components/assistant/Assistant.tsx`), só que
com `variant="window"` em vez de `variant="embedded"` (usado na web/janela
principal). Mesma lógica de tarefas/timer/Supabase, nada duplicado — ver
`useAssistantAtividades`, `useAssistantCobranca`, `useAssistantProjeto`,
`useAssistantDocumentos`.

Características (já configuradas em `tauri.conf.json`):
- transparente, sem bordas/decorações, sem entrada na dock/taskbar
  (`skipTaskbar`);
- `alwaysOnTop` + `visibleOnAllWorkspaces` — continua visível mesmo trocando
  de espaço/app (ex.: Chrome em primeiro plano);
- nasce em 80x80; ao clicar pra abrir o painel, a própria janela cresce pra
  ~380x600 (`setJarvisExpanded` em `src/lib/desktop/window.ts`) mantendo o
  canto inferior direito fixo na tela — depois volta a 80x80 ao fechar;
- arrastar a orbe move a janela de verdade (`startWindowDrag`, API nativa
  `startDragging()`), não um `div` posicionado por CSS;
- posição é lembrada entre reinícios (mesmo `tauri-plugin-window-state` da
  janela principal).

Testar: `npm run tauri dev`, logar na janela principal, minimizá-la ou
fechá-la (ela só esconde) — a orbe Jarvis continua flutuando, clicável,
arrastável, mostrando a tarefa atual/timer.

## Auto-update e assinatura

**Já configurado**: `src-tauri/tauri.conf.json` > `plugins.updater` tem a
chave pública real e aponta pro GitHub Releases do próprio repo
(`.../releases/latest/download/latest.json`, o caminho padrão que o
`tauri-action` publica em cada release). `.github/workflows/release.yml`
builda, assina e publica sozinho a cada push de tag `v*` (ex.: `git tag
v0.1.1 && git push origin v0.1.1`) — só macOS por enquanto. No app,
`src/components/DesktopUpdateBanner.tsx` (montado em `DashboardLayout.tsx`,
só no desktop) checa `checkForUpdate()` ao abrir e a cada 4h; se houver
versão nova, mostra uma faixa com "Atualizar agora" (chama
`installUpdateAndRelaunch()`, que baixa/instala/reinicia sozinho).

**Ainda manual, fora deste repo** (não dá pra automatizar por aqui):

1. A chave **privada** gerada (par com a pública já em `tauri.conf.json`)
   precisa virar 2 secrets do repo no GitHub (Settings → Secrets and
   variables → Actions): `TAURI_SIGNING_PRIVATE_KEY` (conteúdo do arquivo
   `.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (a senha escolhida ao
   gerar — vazia, nesta chave). **Nunca commitar a chave privada nem a
   senha**; `.gitignore` já bloqueia `*.key`/`*.key.pub` como rede de
   segurança. Se precisar gerar uma chave nova (ex.: a atual vazou):
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/infopro-hub.key
   ```
   e trocar a pública em `plugins.updater.pubkey`.
2. Sem notarização Apple configurada ainda (precisa de conta Apple
   Developer paga) — quem baixar ou receber uma atualização vai ver o
   aviso "desenvolvedor não identificado" do Gatekeeper e precisa liberar
   manualmente (clique direito no app → Abrir) na primeira vez. Ativar
   notarização depois é só adicionar `APPLE_CERTIFICATE`,
   `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
   `APPLE_PASSWORD`, `APPLE_TEAM_ID` como secrets — o `tauri-action` já
   assina/notariza sozinho se esses existirem, sem mudar o workflow.
3. Disparar a primeira release de verdade (criar e empurrar a tag).

## Iniciar com o computador

`tauri-plugin-autostart` já está registrado (`src-tauri/src/lib.rs`) e
`src/lib/desktop/autostart.ts` expõe `isAutostartEnabled()`/
`setAutostart(bool)` — mas fica **desligado por padrão** e não há UI ainda
pra ligar. Próximo passo (fora desta entrega): um toggle em alguma tela de
preferências chamando `setAutostart(true)`.

## Build

```bash
npm run tauri build
```

Empacota pra instalador nativo da plataforma atual (`.dmg`/`.app` no
macOS, `.msi`/`.exe` no Windows, `.deb`/AppImage no Linux). Sem assinatura
de código/notarização configurada ainda — só empacotamento local.

## Limitações desta entrega

- Nenhum monitoramento de computador/apps/sites — de propósito, fora de
  escopo aqui.
- Updater funciona (endpoint/chave reais — ver seção acima), mas ainda sem
  notarização Apple: cada instalação/atualização pede liberação manual no
  Gatekeeper na primeira vez.
- Autostart sem UI de preferências ainda.
- `Cmd+Q`/"sair" do sistema não encerra o app por padrão — só o item "Sair
  do Infopro Hub" do tray. Comportamento intencional (seção 6 do pedido
  original), mas não é o padrão de um app comum — documentado aqui de
  propósito.
- Sincronização de sessão entre as duas janelas depende do evento
  `storage` do navegador (ver `src/auth/AuthProvider.tsx`) — cobre login
  feito na janela principal refletindo na Jarvis (e vice-versa), mas pode
  levar um instante, não é instantâneo por IPC.
- `chrome-extension/` continua intacta e funcionando — não foi tocada.
