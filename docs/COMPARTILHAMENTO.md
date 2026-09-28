# Compartilhamento no desktop

O endereço padrão é `https://infopro-hub.vercel.app`, tanto no desktop quanto na web. Para substituir, defina `VITE_SITE_URL=https://seu-dominio-publico` em `.env.local` antes de iniciar ou compilar o app. Reinicie o servidor de desenvolvimento após mudar essa variável. O endereço precisa servir a versão web do mesmo projeto Supabase usado pelo desktop.

Para releases desktop, configure também a variável de repositório `VITE_SITE_URL` no GitHub Actions. Ela é incorporada ao frontend durante o build.

Sem essa configuração, o app usa o endereço padrão acima. Uma configuração inválida bloqueia o compartilhamento para evitar links inacessíveis.

O campo “Nome do documento” na janela de compartilhamento salva o título. O link inclui esse nome em `?nome=`, preservando a rota `/compartilhado/:token` e a compatibilidade com versões web anteriores. Renomear não invalida links existentes. O token continua necessário e não é substituído por um nome previsível.

O destinatário continua entrando ou criando uma conta para acessar. Nenhuma permissão de documento é alterada por esta correção.
