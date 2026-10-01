# Backend PHP/MySQL integrado ao frontend atual

Origem: `eodahn/Orbitfolio:tcc` em `45e1310c6819acc8b31c9bcfc4962410fc6bd7c7`, atualizado com o backend `marinsoliveira-TG/Orbitf-lio:back1` em `89b940f630a07aaad39e8e3d0bee7e1ddccd016b`.

A integração é uma adaptação do backend, não uma substituição do frontend pelas páginas PHP antigas. `database/back1.sql` conserva o esquema de origem como referência. `php/db.php`, `php/api.php` e `php/github.php` adaptam PDO, cadastro/login, portfólios/projetos e OAuth ao contrato `/api` já consumido pelo frontend. As páginas HTML antigas, configurações com credenciais e uploads de terceiros não são publicados.

## Dados e compatibilidade

As tabelas originais `usuario`, `portfolio`, `projeto`, `linguagem`, `projeto_entidade`, `favorito`, `curtida`, `comentario` e competências permanecem. Os IDs e as senhas criadas por `password_hash` continuam válidos. Senhas antigas em texto puro não são aceitas: devem ser redefinidas pelo administrador. Tabelas adicionais `orbit_*` guardam relações sociais, privacidade, metadados de projetos, importações temporárias e tokens criptografados.

`migrate.php` é exclusivo da linha de comando. Cria tabelas ausentes, amplia campos, corrige auto incremento e adiciona índices sem apagar registros. Reexecutá-lo é permitido. DDL do MySQL não é transacional: faça backup antes de atualizar um banco existente. E-mails/username duplicados precisam ser resolvidos antes da criação dos índices únicos. Metadados das órbitas são atribuídos aos projetos existentes e persistidos.

A conexão OAuth antiga precisa ser refeita: o campo legado `usuario.github_token` não é usado pela nova API. Após a reconexão ou desconexão, o token antigo é apagado. O novo token fica criptografado com AES-256-GCM, associado ao usuário, em `orbit_github`. Não execute simultaneamente as antigas páginas OAuth contra esse banco.

**O banco SQLite do servidor Node é separado do MySQL.** Esta migração adapta bancos `tcc/back1`; não transfere automaticamente contas/projetos do SQLite. Não troque um site existente de runtime sem planejar essa transferência e manter o backup. `npm start` continua disponível como execução Node/SQLite compatível. O Dockerfile executa o novo backend PHP/MySQL. `/api/health` identifica o backend PHP com `backend: back1-php-mysql`.

## Executar localmente

Requisitos: Node 22+ para compilar o frontend, PHP 8.3+ com PDO MySQL, cURL, OpenSSL, mbstring e fileinfo, e MySQL 8 ou MariaDB 10.11. Crie um banco vazio, ou use uma cópia do banco back1.

Configure no ambiente `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e `APP_ORIGIN`. O processo recebe variáveis do ambiente; não carrega `.env` automaticamente. Opcionalmente `DB_SOCKET` pode substituir host/porta em ambiente local.

```sh
npm ci
npm run build
php backend/migrate.php
php -S 127.0.0.1:3000 backend/router.php
```

Use `APP_ORIGIN=http://127.0.0.1:3000`. Em desenvolvimento com Vite na porta 5173, mantenha o PHP na porta 3000 e use `APP_ORIGIN=http://localhost:5173`. O proxy Vite encaminha `/api` para o backend. O servidor embutido do PHP é apenas para desenvolvimento; a imagem Docker usa Apache.

## Render / Docker

O `Dockerfile` compila exatamente o frontend existente e serve `dist` com PHP/Apache. Configure o serviço Docker para a branch `feature/frontend-rebuild`, com as variáveis de banco e OAuth. O MySQL deve ser persistente e acessível pelo serviço. O container não cria nem hospeda um banco de produção. Para um banco remoto, configure `DB_SSL_CA` com o caminho do certificado CA fornecido pelo provedor; a verificação do certificado é ativada quando essa variável está definida.

Execute `php backend/migrate.php` como comando de pré-deploy. Alternativamente, configure `MIGRATE_ON_START=true` para executar a migração antes do Apache; isso exige privilégios de DDL e uma única instância migrando. Após migrar, use uma conta de execução com os privilégios necessários de leitura/escrita. `PORT` é respeitada (padrão 10000). Arquivos de backend, configuração e SQL ficam fora do DocumentRoot. O build da imagem Docker deve ser validado no serviço: o ambiente de desenvolvimento desta alteração não possui Docker.

Um serviço Render configurado como Node **não passa a executar PHP só por receber este commit**. A troca para Docker/MySQL precisa ser configurada no painel. Nenhum deploy ou configuração do Render foi alterado por esta implementação.

## OAuth GitHub

Configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY` (64 caracteres hexadecimais, mantida estável) e `APP_ORIGIN=https://orbitfolio.onrender.com`. Cadastre na OAuth App:

```text
https://orbitfolio.onrender.com/api/github/callback
```

O callback antigo `/pages/github_callback.php` foi substituído pela rota acima. O frontend já usa essa rota. A autorização solicita `repo read:user`; `repo` permite consultar repositórios privados, mas também concede permissões de escrita no GitHub. O código somente consulta repositórios. Organizações podem exigir aprovação do aplicativo/SSO. A conexão com o plugin GitHub no ChatGPT não configura a OAuth App do site.

State de uso único, prazo de dez minutos, sessão autenticada e PKCE protegem a autorização. Importações duram 30 minutos, pertencem ao usuário e são consumidas na criação. Projetos integrados revalidam o acesso antes de salvar. Consultas privadas e commits usam a credencial do visitante, nunca a do proprietário. 401, 403, 404, limites 429 e falhas de rede têm mensagens distintas, sem devolver tokens ou respostas brutas do provedor.

## Testes

Use bancos descartáveis separados. `backend/tests/contracts.php` recusa nomes sem prefixo `orbit_test_`:

```sh
DB_NAME=orbit_test_contract php backend/migrate.php
DB_NAME=orbit_test_contract php backend/tests/contracts.php
DB_NAME=orbit_test_social php backend/migrate.php
DB_NAME=orbit_test_social APP_ORIGIN=http://127.0.0.1:3091 PHP_BIN=php npm run test:browser
DB_NAME=orbit_test_projects php backend/migrate.php
DB_NAME=orbit_test_projects PHP_BIN=php npm run test:projects
```

As variáveis DB_HOST/DB_PORT/DB_USER/DB_PASSWORD devem estar exportadas. Os bancos precisam existir e as suítes de navegador esperam bancos limpos. `CHROMIUM_EXECUTABLE` permite usar um Chromium já instalado. Sem `PHP_BIN`, os mesmos testes executam o servidor Node. `TEST_SERVER_LOG=1` habilita logs do servidor de testes.

Validação realizada: PHP 8.3 com MariaDB 10.11 reais, migração repetida, contratos OAuth com transporte controlado, e suítes de navegador Conta/privacidade e projetos/busca/teletransporte usando o backend PHP. O consentimento OAuth real e repositórios privados em produção dependem das credenciais/configuração do serviço e não foram testados nesta instalação.
