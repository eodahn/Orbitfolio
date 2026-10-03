# Contas persistentes e configuração de login/GitHub

> Atualização: produção usa PostgreSQL por `DATABASE_URL`. Os passos SQLite abaixo são históricos e servem para preservar a origem. Siga [o guia atual de migração](POSTGRESQL-E-NOVAS-FUNCOES.md).

A imagem reportada mostra `401` em `/api/auth/login` e “Integração GitHub indisponível”. São rotas diferentes: `/api/auth/login` valida o e-mail/senha do Orbitfolio; OAuth inicia em `GET /api/github/auth` (mantendo `POST /api/github/connect`) e `/api/github/callback`. O 401 deve continuar existindo para credenciais inválidas. Não é possível concluir pela imagem se a conta deixou de existir, se a senha estava incorreta ou qual variável OAuth estava ausente.

## Contas não expiram

O cadastro permanece no banco, sem prazo de expiração. Sair da conta ou expirar uma sessão não exclui o usuário. O cookie de sessão não é um backup do cadastro. Não se deve guardar a senha no navegador para simular persistência.

No servidor Node, o banco agora tem caminho estável relativo ao projeto (mesmo que o diretório de execução mude), cria os diretórios necessários e possui teste de persistência em processos diferentes. Hashes de senha inválidos geram 401, em vez de erro interno. A tela de login mantém a mensagem visível e impede envio duplo.

## Render com Node/SQLite

O filesystem padrão do Render é temporário: dados fora de um disco persistente são perdidos em reinicializações/redeploys. Um caminho absoluto sozinho não transforma o diretório em armazenamento persistente.

1. Antes de reimplantar ou adicionar disco, faça backup do banco ainda existente. No Shell do serviço: `npm run backup:db -- /tmp/orbitfolio-backup.sqlite`. O backup usa a API SQLite e inclui gravações no WAL. Baixe esse arquivo por um canal privado antes de continuar. Ele contém dados de contas e deve ser protegido.
2. No painel do serviço, adicione um disco persistente com mount path `/var/data`. Discos persistentes exigem serviço pago. A criação/mudança de plano não foi executada por este commit.
3. Configure `ORBITFOLIO_DATABASE_PATH=/var/data/orbitfolio.sqlite` e `SEED_DEMO=false`.
4. Restaure o backup nesse caminho, com a aplicação parada. Não sobrescreva um banco que já contém contas. Se o banco antigo já tiver sido perdido e não houver backup, este código não consegue recuperar os registros.
5. Depois de inicializar/restaurar o banco correto, configure `ORBITFOLIO_REQUIRE_EXISTING_DATABASE=true`. Isso cancela a inicialização se o arquivo desaparecer ou se o caminho estiver errado, evitando criar silenciosamente um cadastro vazio. Não ative antes da primeira inicialização/restauração.

`deploy/render-node.yaml` é um Blueprint opcional para um serviço Node com disco. Ele não é aplicado automaticamente ao serviço existente, não transfere os dados antigos e pode criar infraestrutura paga. Para o serviço atual, prefira configurar disco e variáveis no painel após preservar os dados.

## Render com PHP/MySQL

Se `/api/health` indicar `back1-php-mysql`, as contas estão no MySQL externo. Mantenha o mesmo banco persistente e as variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`. Não crie um banco novo em cada deploy. Use backups do MySQL. O SQLite e o MySQL continuam sendo bases separadas; mudar de runtime não transfere os usuários. Veja `backend/README.md`.

## Ativar OAuth GitHub

Na OAuth App do GitHub, configure:

- Homepage: `https://orbitfolio.onrender.com`
- Callback: `https://orbitfolio.onrender.com/api/github/callback`

No Environment do Render:

- `APP_ORIGIN=https://orbitfolio.onrender.com`
- `GITHUB_CALLBACK_URL=https://orbitfolio.onrender.com/api/github/callback`
- `GITHUB_CLIENT_ID`: Client ID da OAuth App.
- `GITHUB_CLIENT_SECRET`: Client secret da mesma OAuth App.
- `GITHUB_TOKEN_ENCRYPTION_KEY`: chave fixa de 64 caracteres hexadecimais.

Para gerar uma chave **uma única vez**, localmente: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde-a de forma privada, configure-a no Render e não a troque em cada deploy. Não envie client secret ou chave pelo chat e não use variáveis `VITE_*` para esses valores.

URLs com barra final/espaços são normalizadas. Em produção, o callback usa exclusivamente o domínio oficial; em desenvolvimento, APP_ORIGIN ou RENDER_EXTERNAL_URL podem indicar o ambiente local; não se usa o header Host do visitante para construir callback. O diagnóstico autenticado `/api/github/status` informa `configurationIssues` com **nomes** das variáveis ausentes/inválidas, sem valores secretos. No Node, `npm run check:config` também faz essa verificação e informa se o banco existe. Nenhum desses diagnósticos faz consentimento OAuth nem prova as permissões da organização.

Depois de salvar as variáveis e reimplantar, entre no Orbitfolio e use “Integrar com GitHub” → “Conectar com GitHub”. Credenciais GitHub/Render não foram fornecidas nesta sessão; essas configurações não foram aplicadas ao serviço e o login OAuth real em produção ainda precisa ser confirmado.

Referências oficiais: https://render.com/docs/disks e https://render.com/docs/blueprint-spec.

## Alterações e validação

O servidor inicia a autorização no GitHub oficial, verifica state vinculado à sessão e PKCE, troca o código no backend e mantém tokens criptografados fora das respostas públicas. As migrações aditivas `database/migrations/004_github_identity.sql` e `backend/database/002_github_identity.php` preservam dados anteriores e acrescentam nome, avatar e URL da conta GitHub. Migrações antigas não foram alteradas.

Os botões X usam `goHome()` e levam explicitamente à Home. Cancelar e Escape continuam cancelando o diálogo. A composição desktop permanece em telas menores com rolagem; regras por largura que reorganizavam colunas foram removidas. O modo de desempenho reduzido depende do hardware.

`npm test` verifica persistência entre processos, expiração apenas de sessão, backup/restauração, credenciais inválidas, privacidade e OAuth com respostas controladas. `npm run test:login` verifica cadastro, reinicialização do servidor, login 401/200, botões X e redirecionamento ao GitHub oficial interceptado pelo teste. Os testes de navegador existentes verificam Conta, relações, privacidade, projetos e universo. Esses testes não substituem consentimento real no GitHub nem inspeção do armazenamento do Render.

Validação desta alteração: 17 testes Node aprovados; build aprovado; suites de navegador `login-browser`, `browser`, `projects-browser` e `world-browser` aprovadas com Chromium. Os arquivos PHP alterados passaram pelo parser PHP do Prettier; a execução PHP/MySQL não foi repetida nesta alteração por indisponibilidade do runtime. O bundle mantém o aviso de tamanho acima de 500 kB.
