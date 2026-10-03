# PostgreSQL, perfis e navegação

## Estado da continuação

A branch `feature/frontend-rebuild` já continha trabalho parcial não publicado: dependência `pg`, adaptador assíncrono, conversão das consultas, esquema PostgreSQL e esboço de importador SQLite. Faltavam validação em PostgreSQL, scripts/deploy/documentação e as novas funções. Esse trabalho foi continuado. O OAuth existente foi preservado (state, PKCE, callback e criptografia); sua persistência foi adaptada para consultas assíncronas e transações.

## Banco de produção

`DATABASE_URL` seleciona PostgreSQL. Em `NODE_ENV=production`, a ausência dessa variável impede a inicialização: não há fallback silencioso para SQLite. O pool usa conexões próprias para transações, queries parametrizadas, migrations ordenadas e lock de migração entre processos. Inteiros grandes usados em IDs, bytes e expiração são convertidos sem arredondamento silencioso. Dados de contas, projetos, relações, privacidade, sessões e tokens ficam no banco compartilhado.

SQLite permanece para desenvolvimento sem `DATABASE_URL`, testes rápidos e leitura/cópia de backups antigos. `PRAGMA` aparece somente nessa camada e no importador. Não é fonte de dados de produção. O backend PHP/MySQL histórico foi preservado, mas não recebe as novas funções; o Dockerfile principal e o Blueprint Node agora usam Node/PostgreSQL.

## Instalação nova no Render Node (opção escolhida)

Foi autorizado começar com um PostgreSQL vazio, sem importar as contas antigas. Isso não executa nem exige apagar um banco existente. No serviço Node já existente, selecione a branch `feature/frontend-rebuild`, configure `DATABASE_URL` com a conexão interna do PostgreSQL e mantenha as variáveis OAuth indicadas abaixo. Use Node 22.13 ou superior, Build `npm ci && npm run build` e Start `node server.mjs`.

Configure `SEED_DEMO=false` e `SEED_SHOWCASE=true`. A inicialização aplica migrations automaticamente e cria a demonstração uma única vez. Também é possível executar `npm run migrate` e `npm run seed:demo` manualmente. Cadastre uma conta nova após o deploy; confira `/api/health` com driver `node-postgres`, faça login e repita após reiniciar o serviço. Não use `import:sqlite` neste caminho. A configuração do painel e o deploy real ainda precisam ser verificados no Render.

## Transferir os dados existentes (opcional)

O código não tem acesso às credenciais privadas ou ao SQLite do Render. A execução dos testes transfere somente dados fictícios; não equivale à transferência do serviço real.

1. Antes de qualquer redeploy, preserve o SQLite do servidor antigo. Pause alterações de usuários durante a transferência. Execute `npm run backup:db -- /tmp/orbitfolio-backup.sqlite` no servidor antigo e baixe a cópia por um canal privado. Na versão nova, se `DATABASE_URL` já estiver definida, acrescente `--sqlite` para confirmar que deseja copiar o SQLite antigo. O backup usa a API SQLite, incluindo o WAL. Um arquivo local do seu computador pode ser outro banco: confirme a origem.
2. Guarde outra cópia intacta. Não envie o backup nem credenciais ao repositório. Se o banco antigo foi apagado e não há backup, não é possível recuperá-lo por esta migração.
3. Configure `DATABASE_URL` no ambiente onde executará o importador. Use a conexão apropriada fornecida pelo provedor. Dentro do Render, a URL interna exige que serviço e banco estejam na mesma região/rede; fora dele, use a URL externa com a configuração TLS fornecida pelo provedor. O código não desabilita validação de certificados.
4. Com o destino vazio e a aplicação ainda parada, execute:

   ```sh
   npm ci
   npm run migrate
   npm run import:sqlite -- /caminho/orbitfolio-backup.sqlite --dry-run
   npm run import:sqlite -- /caminho/orbitfolio-backup.sqlite
   npm run seed:demo
   ```

5. O importador cria uma cópia temporária privada da origem, aplica migrations somente nessa cópia e transfere todas as tabelas em uma transação. Confere conteúdo e quantidade dos registros. `--dry-run` faz a transferência e verificação, mas reverte as linhas ao final. A criação do esquema pelas migrations permanece. Um destino com dados é recusado; o mesmo backup já importado é identificado e não sobrescreve alterações posteriores. Não use o script como sincronização recorrente.
6. Uma origem corrompida, com relacionamentos inválidos ou valores acima dos novos limites causa interrupção e rollback, sem truncar conteúdo. Revise esses registros em uma cópia antes de tentar novamente. Preserve a origem original.
7. Inicie a aplicação apontando ao mesmo PostgreSQL e confira login, projetos, relações e avatar em dois navegadores. Só descarte a origem após validar, mantendo backups. `SEED_SHOWCASE=true` pode ser habilitado depois da importação; ativá-lo antes pode preencher o destino e impedir a importação.

As senhas permanecem como hashes; os IDs e relações são preservados. Mantenha a mesma `GITHUB_TOKEN_ENCRYPTION_KEY` para decifrar os tokens já salvos. Não é necessário recriar o OAuth App.

## Configuração

No serviço Node do Render:

- `DATABASE_URL`: URL privada do PostgreSQL, configurada no painel.
- `NODE_ENV=production`.
- `APP_ORIGIN=https://orbitfolio.onrender.com`.
- `GITHUB_CALLBACK_URL=https://orbitfolio.onrender.com/api/github/callback`.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `GITHUB_TOKEN_ENCRYPTION_KEY`: manter os valores existentes.
- `SEED_DEMO=false` (mocks de desenvolvimento).
- `SEED_SHOWCASE=true` somente após importar ou para uma instalação nova.
- Build: `npm ci && npm run build`. Start: `node server.mjs`.

`/api/health` identifica `node-postgres`. `npm run check:config` verifica presença/configuração sem imprimir segredos; não testa conexão nem consentimento real. `npm run migrate` testa a conexão ao aplicar as migrations. Não é necessário disco local para contas ou avatares. A retenção, capacidade e backups do PostgreSQL dependem do provedor e plano escolhidos; a aplicação não promete armazenamento eterno independente deles.

## Migrations

| Arquivo | Finalidade |
| --- | --- |
| `database/postgres/001_initial.sql` | Tabelas equivalentes ao SQLite, índices únicos de e-mail/username sem distinção de caixa, relações, sessões, projetos e GitHub. |
| `database/postgres/002_import_history.sql` | Registro das importações já concluídas. |
| `database/postgres/003_profile_avatar.sql` | Enquadramento, marcação demo, limites e tabela `user_avatars` com `BYTEA`. |
| `database/migrations/005_profile_avatar.sql` | Compatibilidade do desenvolvimento SQLite e da cópia de importação. |

As migrations antigas SQLite não foram reescritas. As migrations de produção não apagam tabelas ou dados. Os novos checks `NOT VALID` não removem registros anteriores já presentes em PostgreSQL; novas gravações devem respeitar os limites.

## Cadastro, limites e pesquisa

Cadastro e edição compartilham a validação: nome de exibição de 2–50 caracteres, repetível, e username de 3–50 caracteres com letras, números, `_` e `-`. O username é salvo em minúsculas e possui índice UNIQUE sobre `lower(username)`. Duplicatas, inclusive concorrentes, retornam 409 com mensagem amigável. Perfis mantêm URLs por ID estável; a busca considera nome e username.

Nome do projeto: 2–50; nome de linguagem: até 50, sem espaços externos e duplicações por caixa; descrição: até 350. Há `maxlength`, contadores e validação backend sem truncamento silencioso. A bio mantém seu limite de 500. Não foi criada uma segunda tela de edição de projeto; o editor de criação existente aplica os novos limites também ao revisar importações GitHub.

## Avatares

Cadastro e edição de perfil permitem escolher PNG, JPEG, WebP ou GIF de até 5 MiB. A prévia circular tem zoom, arraste, posição horizontal/vertical, reset, confirmar e cancelar. O upload autenticado usa `multipart/form-data` com Busboy e limites explícitos. Sharp identifica e decodifica a imagem, confronta o MIME declarado e rejeita conteúdo renomeado/inválido. Dimensões: até 4096 px; GIF: até 200 quadros e 20 milhões de pixels decodificados no total.

Sem serviço de objetos configurado, arquivos ficam em `user_avatars.data` (`BYTEA`), separados da tabela de usuários para não carregar binários nas listagens. É uma escolha para o volume pequeno deste projeto; para crescimento, migrar os arquivos para object storage mantendo URLs/metadados. Há uma imagem atual por usuário. MIME, tamanho e versão segura ficam no banco, assim como zoom/posição.

O GIF original é armazenado e servido sem conversão; o enquadramento usa CSS idêntico no preview e no avatar. `/api/users/:id/avatar?v=...` serve o binário com MIME, ETag, cache versionado e `nosniff`. Não há Base64 no JSON nem uploads permanentes no filesystem local.

## Navegação da galáxia

Clique no canvas para solicitar Pointer Lock. Mouse atualiza yaw/pitch com `MOUSE_SENSITIVITY=0.0022`; pitch limitado a `±0.44π`. W/S aceleram/freiam, A/D movem lateralmente e Espaço/Shift controlam altura. Esc, troca de página, foco em formulário e abertura de diálogo liberam o cursor. O retorno à Home não recaptura automaticamente.

A mira e “ESC — Liberar cursor” aparecem apenas em navegação. O raycast sai do centro da câmera e considera somente superfícies de planetas próximos. `PLANET_INTERACTION_DISTANCE=65` unidades é a distância da nave à superfície; raios dos planetas variam de 6 a 25. Um alvo recebe realce temporário e mostra projeto, criador, username, linguagens e “[E] Explorar”. E verifica novamente o alvo, libera o cursor e abre o mesmo painel de detalhes da Home. Alvos distantes, inputs, selects, textareas, contenteditable e diálogos não acionam E/WASD. Sem Pointer Lock, há fallback de teclado e seleção por clique. Listeners são removidos no descarte.

O X do seletor de linguagem fecha somente o diálogo; o formulário permanece montado e preserva seus valores. Os demais X principais mantêm sua navegação anterior.

## Demonstração e Explorar

`npm run seed:demo` ou `SEED_SHOWCASE=true` cria registros PostgreSQL normais e idempotentes: perfil demonstrativo Bruno Simon (`bruno-simon`) e Folio 2019. A interface identifica a demonstração sem alegar vínculo com o criador. A conta não tem senha/login público, OAuth nem privilégios administrativos. Username já pertencente a uma conta real não é alterado ou apropriado.

Website: https://2019.bruno-simon.com — GitHub: https://github.com/brunosimon/folio-2019. Não foram copiados assets ou textos extensos. Explorar lista projetos públicos pelo endpoint comum `/api/projects`; o perfil e o detalhe também reutilizam as páginas existentes. Links externos usam `noopener noreferrer`.

## Endpoints e arquivos

| Área | Alteração |
| --- | --- |
| `/api/auth/register`, `/api/account/profile` | Username explícito, identidade/limites compartilhados, conflitos 409. |
| `POST /api/account/avatar` | Upload multipart autenticado e enquadramento. |
| `GET /api/users/:id/avatar` | Arquivo público com cache e tipo validado. |
| `/api/projects`, `/api/users`, `/api/search`, relações e privacidade | Consultas assíncronas PostgreSQL, mantendo contratos e controle de acesso. |
| `/api/github/*` | Persistência assíncrona/transacional; state, PKCE, criptografia e callback existentes. |
| `/api/health` | Identificação do driver ativo. |

Principais arquivos: `server/postgres.js`, `server/db.js`, `server/import-sqlite.js`, `server/profile-fields.js`, `server/avatars.js`, `server/showcase.js`, `server.mjs` e serviços existentes; scripts de migração/importação/seed/configuração; componentes de avatar/contador/seletor; `src/three/flight-controls.js`, `planet-interaction.js`, `universe.js`; páginas Conta/criação/Explorar/Home, router, CSS; Dockerfile, Blueprint, exemplos e testes. Algumas linhas de arquivos existentes receberam apenas formatação.

## Validação

Verificações locais concluídas em 3 de outubro de 2026:

- `npm test`: 19 testes aprovados, incluindo autenticação, OAuth, relações/privacidade e controles de navegação.
- `npm run build`: aprovado; aviso de bundle JavaScript acima de 500 kB permanece.
- `npm run test:postgres`: aprovado em PostgreSQL 18.4 temporário. Valida migrations, importação SQLite com dry-run/rollback/idempotência, sessões, relações, privacidade, avatar binário, OAuth com respostas simuladas, concorrência e limites.
- Testes de navegador de Conta/social, mundo, login e projetos: aprovados durante a implementação.
- `npm run test:features`: valida os novos fluxos de cadastro, avatar/GIF, persistência entre navegadores e reinício, seletor de linguagens, demonstração, navegação e interação com planetas em PostgreSQL. O teste automatizado simula a captura Pointer Lock; o raycast usa os objetos reais da cena.

Os testes usam dados fictícios e schemas isolados. Não houve acesso ao banco de produção, deploy no Render nem consentimento OAuth real com uma conta GitHub. O Dockerfile foi adaptado, mas a imagem Docker não foi construída nesta validação; o serviço informado pelo usuário usa Node.

Referências técnicas: https://node-postgres.com/features/transactions, https://node-postgres.com/features/ssl, https://render.com/docs/postgresql-creating-connecting.
