# Empresa do projeto Matheus Souto (Filosofia)

Em 14/10/2026 o Davi pediu para levar a mesma equipe do projeto Davi Queiroz para o projeto
Matheus Souto (cliente `c2373b17-98ef-4c0a-b0ad-6e57fef4ce98`): "vamos levar essa equipe para
ele também". O Ítalo (copy) vai começar por lá.

## O que já foi feito (14/10/2026)

- Migração `20261014120000_empresa_matheus_souto`, teste `supabase/tests/empresa_matheus_souto.sql`,
  script `scripts/apply-empresa-matheus-souto-migration.py` (`--testar` desfaz tudo). Ela copiou:
  - os 3 setores: Diretoria, Marketing e Audiovisual;
  - os 8 membros, com o mesmo nome, função, IA/pessoa e responsabilidades:
    - Diretoria: Davi e Jarvis;
    - Marketing: Ítalo (IA), Pedro e Gabriel;
    - Audiovisual: Danilo, Roy e Dalila.
  - O "Davi" mantém a conta de login dele, então as tarefas dele aparecem em "Precisa de você" também nesse projeto.
  - A automação "entrou em Edição → tarefa `Editar: {titulo}` do Danilo, 2 dias".
- O banco já funciona por projeto:
  - o gatilho do carrossel aprovado acha a Dalila **do mesmo projeto**;
  - a `dalila-publicar` procura a conexão do Instagram pelo `cliente_id` do carrossel.

## Regra fixa (Davi, 14/10/2026)

Quando a equipe vai para outro projeto, ela **chega zerada**:
- vai junto só a estrutura: setores, pessoas e automações;
- vai junto o conhecimento **geral** de cada agente, por exemplo os livros de copy do Ítalo;
- não vai nada específico do projeto de origem: voz, estilo, Drive, Instagram, CTA e histórico.

## Chats (14/10/2026)

- O Davi notou que não havia chats nem pasta do Matheus. Foi criado o grupo **"Matheus Souto"** na barra lateral do Claude.
- Três chats foram sugeridos para abrir lá:
  - Danilo · Matheus;
  - Roy · Matheus;
  - Dalila · Matheus.
- O Roy e a Dalila dependem do código ainda sem commit nos worktrees `agitated-khayyam-369d7a` e `elastic-keller-d7f84a`.
- O Ítalo continua neste mesmo chat ("Implementar o Ítalo"), que atende os dois projetos. A conversa com ele também acontece dentro do Infopro, em cada projeto.

## O que falta para ficar 100% igual ao do Davi

1. **Instagram do Matheus:** conectar o perfil dele em Automações, com `cliente_id` = Matheus. Sem isso, o Roy não lê os reels e a Dalila não publica. Hoje só existem `eu.davioficial` e `yuricbdicas`.
2. **Roy:** está preso ao Davi em `scripts/roy/`, no worktree `agitated-khayyam-369d7a`, ainda sem commit:
   - `CLIENTE` e o caminho do Drive em `roy.py`;
   - `CONTA` em `instagram.py`;
   - o prompt em `servico.py`.
   - Precisa virar "por projeto" (`--cliente`) e ganhar:
     - uma pasta de carrosséis do Matheus no Drive;
     - um estilo próprio em `estilos_carrossel` (o "Clássico marfim" é do Davi);
     - o CTA final, porque "comente INSTALIVROS" é do Davi.
   - Isso deve ser feito numa sessão do Roy.
3. **Danilo:** o manual é do estilo Eu.daviqueiroz, e as pastas de entrada e de destino no Drive são as do Davi. Falta:
   - definir as pastas do Matheus;
   - definir o estilo de edição dele (ou confirmar que é o mesmo).
4. **Dalila:** o ritmo (1 post por dia às 10h) e a conferência valem iguais. Só depende do item 1.
5. **Ítalo:** falta a voz do Matheus. O que já existe:
   - 17 vídeos de referência, todos com transcrição;
   - o núcleo de influência, que está **vazio**;
   - o produto ativo **Cinesofia**.
6. **Pessoas:** confirmar se o Pedro e o Gabriel trabalham mesmo nesse projeto e se o Matheus deve entrar na Diretoria (por exemplo, para aprovar).
7. **Manuais:** cada agente deve dizer para qual projeto está trabalhando (Davi ou Matheus), ou ganhar uma seção "projeto Matheus Souto".

Situação do projeto em 14/10:
- 18 vídeos em `ideia` e 1 em `roteiro`;
- 7 colunas de atividade;
- nenhuma tarefa da empresa ainda.
