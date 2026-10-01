# Orbitfolio

Portfólio social espacial em Vite, JavaScript, Three.js, Node.js 22.13+ e SQLite. Projetos persistidos tornam-se planetas; Conta reúne projetos, seguidores, seguindo, amigos, curtidas, favoritos e privacidade.

## Executar

```sh
npm ci
npm run server
# Em outro terminal:
npm run dev
```

Para a versão integrada: `npm start` e abra `http://localhost:3000`. As migrations são aplicadas automaticamente na abertura do banco. Node não carrega `.env` automaticamente: configure as variáveis no ambiente do processo/hosting ou use `node --env-file=.env server.mjs` no desenvolvimento.

Por padrão, nenhum mock é carregado. `SEED_DEMO=true` habilita dados demonstrativos somente quando o banco está vazio. `ORBITFOLIO_DATABASE_PATH` seleciona o arquivo SQLite; em produção, configure um **disco persistente** e mantenha backups. Sem persistência do disco, um redeploy pode perder o banco. `PORT` é 3000 por padrão.

## Projetos e GitHub

“Adicionar projeto” oferece integração GitHub ou continuação por link/manual. Links públicos do GitHub são lidos pela API oficial sem conexão de conta. “Personalizar” permite editar nome, descrição e linguagens, com porcentagens opcionais. A página Projetos lista apenas os projetos do usuário autenticado. Exclusão exige confirmação e autorização do proprietário no servidor.

A integração autenticada usa um **OAuth App do próprio Orbitfolio**. A conexão GitHub utilizada pelo assistente para editar este repositório não configura esse OAuth App.

Configure no servidor:

- `APP_ORIGIN`: origem pública exata, sem barra final; por exemplo `https://orbitfolio.onrender.com`.
- `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`: credenciais do OAuth App.
- `GITHUB_TOKEN_ENCRYPTION_KEY`: chave estável de 32 bytes, representada por 64 caracteres hexadecimais; gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e guarde em segredo.
- Callback do OAuth App: `APP_ORIGIN/api/github/callback`, por exemplo `https://orbitfolio.onrender.com/api/github/callback`.

O arquivo `.env.example` contém somente nomes e exemplos não secretos. Credenciais ausentes deixam a integração indisponível de forma explícita; criação manual e leitura de links públicos continuam funcionando. O OAuth usa `state`, PKCE S256 e tokens criptografados com AES-256-GCM no banco. O escopo `repo` dá acesso a repositórios privados e também inclui escrita no GitHub; a aplicação implementada só consulta os repositórios. Revogue o OAuth App no GitHub se quiser revogar a autorização, além de desconectar localmente.

Progresso lista apenas projetos próprios integrados. Commits vêm da API real, paginados, e usam sempre a credencial GitHub do visitante. Projetos de repositórios privados não aparecem nas listagens públicas. Mais detalhes e limites de sincronização em [docs/IMPLEMENTACAO.md](docs/IMPLEMENTACAO.md).

## Universo

W/S aceleram e freiam, A/D giram, Espaço/Shift controlam o eixo vertical. Clique em um planeta para aproximar a câmera e abrir suas informações sobre o universo. Fechar devolve o controle da nave. Posições iniciais dos planetas são persistidas no banco; movimentos causados por colisões permanecem durante a sessão. O spawn da nave pode mudar a cada nova inicialização.

Os previews das outras páginas são snapshots Three.js gerados pela mesma fábrica de planetas. Há um renderizador compartilhado para previews, cache limitado e renderização sob demanda.

## Testes

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:world
npm run test:projects
```

`CHROMIUM_EXECUTABLE` pode apontar para um Chromium instalado. Os testes usam bancos temporários. Reserve as portas 3091 (social), 3000/5173 (universo) e 3092/5174 (projetos). Testes OAuth usam respostas controladas exclusivamente no código de teste; não substituem a validação de consentimento com um OAuth App configurado.

## Estrutura atual

- `server.mjs`, `server/`: API, autenticação, projetos, GitHub, privacidade e SQLite.
- `database/migrations/`: evolução versionada do banco.
- `shared/`: configuração compartilhada de escala e limites.
- `src/api/`, `src/pages/`, `src/components/`: cliente HTTP, páginas e componentes.
- `src/three/`: cena, física, previews e fábrica de planetas.
- `tests/`: regressão, integração e navegador.
- `assets/`: versão histórica, preservada; não é a aplicação Vite atual.

O projeto mantém npm como caminho validado. O `pnpm-workspace.yaml` histórico tem valores inválidos de configuração de builds e não foi usado nesta validação.

## Backend tcc/back1 e navegação para planetas

O backend PHP/MySQL adaptado está em `backend/`, com Dockerfile para execução Apache e a mesma API JSON do frontend. Consulte [configuração, migração e testes](backend/README.md) antes de mudar o runtime do site. `npm start` permanece Node/SQLite; os dois bancos não são sincronizados automaticamente.

Em “Continuar sem integração”, qualquer URL HTTP(S) de portfólio abre a personalização sem consultar o GitHub. Na busca, “Ir para o planeta” leva à Home e teletransporta a nave para uma posição livre junto ao planeta escolhido.
