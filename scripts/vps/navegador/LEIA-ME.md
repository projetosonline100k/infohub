# Navegador do servidor (Chrome com o ChatGPT logado do Lauro) — 17/11/2026

Um Chrome roda na VPS numa tela virtual (Xvfb :99) com o perfil guardado em `/root/.infopro-hub/chrome-vps` (o login do ChatGPT fica lá).
Tudo escuta só em 127.0.0.1 (nada exposto na internet):
- `infopro-chrome` → Chrome com CDP em 127.0.0.1:9222 (o Claude controla por `playwright-mcp`, config em `mcp-chrome-vps.json`);
- `infopro-vnc` (5900) + `infopro-novnc` (6080) → ver e usar a tela pelo navegador do Mac.

**Entrar/ajustar o login (uma vez, ou quando o ChatGPT pedir de novo):** o túnel do Mac (`com.infoprohub.vps-tunel`) já traz a porta 6080. Abra
`http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale`, faça o login no ChatGPT na janela que aparece e feche a aba (o Chrome continua logado).

**Rodar o Claude com esse navegador:** `rodar_claude(..., chrome=True)` no ouvinte da VPS usa `--mcp-config ~/.infopro-hub/mcp-chrome-vps.json` e libera `mcp__chrome-vps`.
Instalado com: apt (xvfb x11vnc novnc websockify openbox fonts) + `npm i -g @playwright/mcp` + units em /etc/systemd/system.
