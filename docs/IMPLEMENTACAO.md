# Entrega — Conta social e universo 3D

Branch exclusiva: `feature/frontend-rebuild`. Nenhum merge em main.

## Funcionalidades

- Conta e perfis visitados reutilizam `renderProfile`, cartões de usuários e de projetos.
- Avatar (URL ou iniciais), nome, username, bio, planetas e quantidade de projetos; edição disponível ao proprietário.
- Seguidores, Seguindo e Amigos clicáveis. Todos os cartões abrem `Visualizar conta`.
- Amigos são derivados de duas relações recíprocas em `follows`, sem tabela/lista duplicada.
- Curtidos e Favoritos disponíveis na própria Conta e nos perfis públicos autorizados.
- Privacidade individual para seguidores, seguindo, amigos, curtidas e favoritos: Público/Somente eu.
- O servidor identifica o proprietário pela sessão autenticada. Listas privadas retornam 403 a visitantes; contagens privadas retornam null. O proprietário sempre mantém acesso. A interface omite seções não autorizadas.
- Seguir/deixar de seguir, indicação de amizade e de quem segue o visitante.
- Botão Fechar compartilhado em páginas secundárias; usa o histórico interno, com Home como fallback.
- A Home conserva o mesmo canvas, renderizador e objetos Three.js. Páginas secundárias pausam a física e cancelam o frame; retornar retoma a mesma cena. Não se serializa a cena nem se sorteia novo spawn durante navegação.
- Nova inicialização sorteia distribuição e spawn seguros em XYZ. A nave começa orientada horizontalmente para o planeta mais próximo.
- Planetas com escala por bytes, massas por volume, atmosfera esférica procedural transparente e biomas conformados à superfície.

## Arquitetura e dados

A branch já possuía API Node/SQLite real; a implementação amplia essa camada em vez de acoplar o navegador aos mocks. `src/api/index.js` continua sendo o adaptador HTTP. Migrations preservam os registros existentes e adicionam username, URL de avatar, privacidade e tamanho em bytes. O seed continua restrito a desenvolvimento.

Novos endpoints: `GET /api/users/:id/{projects,followers,following,friends,likes,favorites}`, `PATCH /api/account/privacy`, `PATCH /api/account/profile`.

`GET /api/users/:id` mantém o booleano `following` existente e acrescenta `followingCount`, `friends`, `followsViewer`, `isFriend`, `visibility` e os campos do perfil. As configurações `privacy` completas são enviadas somente ao proprietário.

## Escala e física

`r = 6 + 19 × min(1, log1p(bytes / 1048576) / log1p(10240))`.

Raio entre 6 e 25 unidades, saturando em 10 GiB. O diâmetro mínimo de 12 supera duas vezes a maior dimensão da nave, verificada pela bounding box do modelo. `sizeBytes` é aceito na criação de projetos pela API; ausente, assume zero e raio mínimo. O seed novo usa tamanhos variados. Uma futura importação do campo `size` do GitHub deve converter KiB para bytes multiplicando por 1024.

`massaPlaneta = 30 × (raio / 6)³`; massa da nave = 10. Colisões esfera-esfera aplicam impulso pela velocidade relativa e inversos das massas, com restituição 0,72, e corrigem penetração. Subpassos de até 1/120 s evitam atravessamento às velocidades previstas. Um spatial hash reduz pares candidatos; três passadas resolvem contatos. Planetas conservam velocidade sem arrasto; a nave mantém amortecimento leve. Limites [-320,320] em todos os eixos refletem a velocidade, descontando o raio.

Posicionamento usa tentativas aleatórias limitadas e fallback em grade. Saturação é sinalizada e não gera sobreposição nem loop infinito. Atmosferas compartilham material e usam ruído 3D, sem costura UV. Geometrias não são recriadas por frame.

## Arquivos

Criados:

- `database/migrations/002_social_world.sql`
- `server/social.js`
- `src/components/user-card.js`
- `src/utils/html.js`
- `src/three/world.js`, `src/three/physics.js`
- `tests/social.test.js`, `tests/physics.test.js`
- `tests/browser.mjs`, `tests/world-browser.mjs`
- `docs/IMPLEMENTACAO.md`

Alterados:

- `server.mjs`, `server/app.js`, `server/seed.js`
- `src/api/index.js`, `src/app.js`, `src/router/router.js`
- `src/pages/account.js`, `src/pages/home.js`, `src/pages/project.js`
- `src/components/shell.js`, `src/components/project-card.js`
- `src/styles/main.css`
- `src/three/universe.js`, `src/three/planet-factory.js`
- `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `README.md`

## Validação

- `npm run build`: aprovado, imports resolvidos.
- `npm test`: cinco testes aprovados, incluindo amizades recíprocas, remoção de amizade, privacidade das cinco categorias, acesso do proprietário, edição, metadados, escala, massa, conservação de momento, inércia, contenção e distribuição sem sobreposição.
- `npm run test:browser`: fluxos Conta → Seguidores/Seguindo/Amigos → Visualizar conta; Conta → Curtidos/Favoritos/Privacidade; alteração das cinco categorias para Somente eu; listas do proprietário continuam preenchidas; visitante não vê abas privadas, inclusive ao tentar URL direta; busca da Lua Social; viewport móvel de 390 px sem rolagem horizontal; retorno de Destaques preserva canvas. Aprovado, sem erros de console/JavaScript.
- `npm run test:world`: compara exatamente os estados de nave/câmera/planetas antes e depois de Conta, Social e Destaques; confirma nova posição em nova inicialização; executa colisão nave-planeta e planeta-planeta no loop real; renderiza atmosfera de perto. Aprovado, sem erros de console/JavaScript.
- Inspeção de capturas do perfil móvel e da atmosfera.

Para repetir os testes de navegador: `npm ci`, `npx playwright install chromium`, depois os comandos acima. `CHROMIUM_EXECUTABLE` permite usar um Chromium já instalado. Os testes criam bancos temporários e iniciam/encerram seus próprios servidores. Deixe portas 3091 livres para o teste social e 3000/5173 para o teste do universo. Neste ambiente foi usado Chromium local com renderização de software.

## Limitações explícitas

- Não há sincronização automática de tamanho de repositórios com o GitHub; utiliza-se o metadado `sizeBytes` recebido pela API. Projetos antigos sem tamanho ficam no raio mínimo até receberem dados reais.
- Avatar é fornecido por URL; não foi acrescentado upload de arquivos.
- O estado de exploração persiste durante navegação na mesma execução, não após recarregar (quando o spawn deve mudar).
- Física usa aproximação esférica da nave, sem gravidade ou astrofísica. Validação em Chromium; desempenho em aparelhos físicos e outros navegadores não foi medido.
- As preferências ocultam as categorias no perfil, não tornam uma relação social anônima em todos os perfis: uma relação pode aparecer na lista pública da outra pessoa. O estado da relação com o próprio visitante permanece disponível para seguir/deixar de seguir.

- O `pnpm-workspace.yaml` preexistente contém valores inválidos de configuração de builds; a validação utilizou npm. Os metadados novos também foram incluídos no lockfile pnpm sem alterar essas permissões/configurações.

# Atualização — criação de projetos, GitHub e progresso

Esta seção substitui as limitações anteriores sobre importação por tamanho, commits e posições após reload.

## Fluxos implementados

- Criar projeto começa com “Deseja integrar este projeto com o GitHub?”. Integração configurada conduz ao OAuth, seleção paginada de repositório e revisão antes de gravar.
- Sem integração: link de repositório público é inspecionado por API oficial, sem token e sem habilitar commits autenticados. Links de outros sites conduzem à personalização manual; não há scraping ou requisições arbitrárias a URLs fornecidas.
- Personalizar: nome obrigatório, descrição opcional, linhas de linguagens adicionáveis/removíveis, porcentagens opcionais. Valores informados ficam entre 0 e 100; todas preenchidas exigem soma 100 ± 0,5. Campos omitidos são `null`, sem inventar porcentagens. A aparência 3D usa pesos de fallback apenas para desenhar cores.
- A página Projetos usa `GET /api/projects/mine`. Exclusão tem diálogo nativo de confirmação e validação de proprietário no servidor; foreign keys removem likes, favoritos e registros dependentes. O evento de exclusão remove imediatamente o objeto Three.js sem recriar a cena.
- Home abre um painel translúcido e suspende a física durante o foco. A distância é `raio × margem / sin(min(FOVvertical/2, FOVhorizontal/2))`, considerando atmosfera e viewport disponível ao lado/acima do painel. Interpolação de posição e quaternion enquadra e restaura a câmera. Controles voltam depois da transição.
- Cards, perfis, favoritos e detalhe usam snapshots de `createPlanet`; um único WebGLRenderer atende os previews visíveis. Cache máximo de 60 imagens, IntersectionObserver, descarte de geometrias/materiais exclusivos após o snapshot e descarte do contexto ao sair da página.
- Progresso consulta somente projetos próprios integrados. A timeline carrega 30 commits por página, com mensagem, autor/avatar, data, link, SHA e tooltip acessível por foco e hover.

## Banco e arquitetura

Nova migration: `003_projects_github.sql`. Acrescenta vínculo GitHub, privacidade do repositório, branch padrão, bytes por linguagem, posição XYZ e `description_text`. Este último preserva a coluna antiga e seu CHECK já aplicado, permitindo descrição opcional sem reconstruir tabelas existentes. Leituras usam o novo campo quando presente. Linguagens permanecem no JSON existente, agora aceitando `null`; bytes importados ficam em JSON separado.

Tabelas novas: `github_connections` (token criptografado), `github_oauth_states` (estado de uso único vinculado à sessão, verificador criptografado, validade de 10 minutos) e `project_imports` (prévia privada do usuário, validade de 30 minutos). A criação consome a prévia em transação e revalida no GitHub integrações autenticadas. O frontend não pode forjar o vínculo enviando flags de integração.

Migrations agora são transacionais. Não foram alteradas migrations já aplicadas. O seed passou a exigir `SEED_DEMO=true`; produção não recebe dados simulados automaticamente.

Posições orbitais são atribuídas a partir do ID, com distâncias mínimas e tentativas limitadas, e persistidas em `orbit_x/y/z`. Projetos antigos recebem posição no próximo início do servidor. Novos projetos não deslocam as posições já gravadas. Colisões alteram posições em memória durante a sessão; ao recarregar, volta-se à posição orbital gravada, enquanto a nave recebe novo spawn seguro.

## Endpoints

| Método e caminho | Comportamento |
|---|---|
| `GET /api/projects` | Universo/listagens; remove projetos privados de terceiros |
| `GET /api/projects/mine` | Somente projetos do usuário autenticado |
| `POST /api/projects` | Manual ou confirmação de prévia importada; dono vem da sessão |
| `DELETE /api/projects/:id` | Exclusão exclusiva do dono, com cascade |
| `GET /api/projects/:id` | Detalhe; projeto privado de terceiro exige acesso GitHub |
| `GET /api/github/status` | Disponibilidade e conta conectada, sem credenciais |
| `POST /api/github/connect` | Inicia OAuth com state e PKCE |
| `GET /api/github/callback` | Troca código no servidor e redireciona sem tokens |
| `DELETE /api/github/disconnect` | Remove credencial e estados locais |
| `GET /api/github/repositories?page=N` | Até 30 repositórios acessíveis pela credencial do usuário |
| `POST /api/github/repository/inspect` | Metadados/linguagens e prévia para confirmação |
| `GET /api/progress` | Projetos próprios com integração habilitada |
| `GET /api/projects/:id/commits?page=N` | Commits reais mediante autorização GitHub do visitante |

## Segurança, versões e configuração

Requer `APP_ORIGIN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `GITHUB_TOKEN_ENCRYPTION_KEY`; instruções de callback e disco persistente estão no README. Nunca configurar como variáveis `VITE_*`. Tokens ficam cifrados com AES-256-GCM, IV aleatório e AAD com ID do usuário; a chave fica apenas no ambiente. Trocar/perder a chave requer reconexão dos usuários. Credenciais não são devolvidas em HTML, respostas JSON, query strings ou logs. O código OAuth temporário é recebido apenas no callback padrão do provedor.

Acesso a commits usa a credencial do visitante e valida o ID do repositório. Nunca toma emprestado o token do proprietário. Metadados de projetos privados são omitidos de listagens públicas e contagens de projetos de terceiros. A preferência de privacidade social permanece independente. Respostas de API têm `Cache-Control: no-store`; erros remotos são traduzidos, sem ecoar payloads sensíveis.

Versão prioriza tag que aponta diretamente ao SHA (até 100 tags consultadas). Depois, até três releases recentes são comparadas com o commit mais recente da página, em consultas limitadas a 100 commits cada. Só se a resposta comprovar ancestralidade aparece `após <tag>`. Fora dessa janela, ou sem evidência de ancestralidade, exibe-se SHA curto. Não se inventa versão por proximidade de datas.

## Testes e limites restantes

Validados: testes unitários de persistência após reabertura do SQLite, linguagens opcionais, soma de porcentagens, mapping de bytes GitHub, exclusão/cascade e autorização; OAuth state/PKCE, criptografia vinculada ao usuário, credencial do visitante, bloqueio privado, rate limit e fallback SHA; regressão social e física; build; navegador social, universo e novo fluxo manual/exclusão/previews. O teste de projetos também cobre tooltip com foco de teclado e layout móvel. A importação pública de `eodahn/Orbitfolio` foi consultada na API real (nome, tamanho e três linguagens), sem habilitar integração autenticada.

O consentimento OAuth de ponta a ponta com conta real **não foi executado**, pois não foram fornecidas as credenciais do OAuth App do Orbitfolio. As rotas reais estão implementadas; o servidor sem configuração mostra indisponibilidade. Testes de autorização privada usam respostas controladas somente no ambiente de teste. Não declarar integração de produção conectada antes de configurar e validar o OAuth no hosting.

Limites: sem refresh automático de tokens OAuth revogados (reconexão explícita); tags/releases com consultas limitadas; metadados, tamanho, branch e flag privada são um retrato da importação, sem sincronização periódica de alterações posteriores do repositório. Um repositório tornado privado depois de importado publicamente exige excluir/reimportar o projeto para ocultar os metadados previamente publicados; commits continuam protegidos por autorização ao vivo. Dados de planetas privados nunca são deliberadamente publicados ao importar como privado. Avatares seguem por URL. Testes gráficos usam Chromium com renderização de software; outros navegadores e desempenho em dispositivos físicos não foram medidos.

Arquivos novos: migration 003; `server/github.js`, `server/project-data.js`, `shared/world-config.js`; `src/pages/create-project.js`, `src/components/dialog.js`, `src/components/commit-timeline.js`, `src/three/preview.js`; `.env.example`; `tests/projects-github.test.js`, `tests/projects-browser.mjs`.

Arquivos ajustados: servidor/API e serializadores, migrations runner, páginas de projetos/Home, fábrica/universo/configuração 3D, cards, estilos, scripts de teste, teste de universo, `.gitignore`, README e este documento. Todas as alterações permanecem em `feature/frontend-rebuild`.

## Busca, links e diagnóstico GitHub — 27/09/2026

A navegação agora inclui `/search?q=...`, com contas por nome/username e projetos por nome, descrição e linguagens. A busca ignora caixa e acentos, prioriza correspondências exatas e filtra projetos privados antes de classificar resultados. O proprietário pode encontrar seus próprios projetos privados. Não existe alteração na privacidade das listas sociais.

O formulário separa repositório GitHub e endereço externo (`demo_url`, coluna existente); exige pelo menos um link http(s), sem credenciais. `githubUrl` exige o endereço principal de um repositório. O botão principal prefere o endereço externo; com ambos os links há um botão GitHub separado. Projetos antigos continuam legíveis sem migração. O autor é um link para o perfil no componente compartilhado pela página e pelo painel da Home.

O seletor de linguagens usa diálogo estilizado, filtro, navegação por teclado e “Outra” na primeira posição. Nomes personalizados ficam no projeto; não se adicionam ao catálogo. Duplicatas sem distinção de caixa e o nome literal “Outra” são recusados no servidor.

### Diagnóstico do 403

Falha reproduzida no código anterior: `githubRequest` convertia toda resposta upstream 404 em 403, tornando impossível distinguir recurso indisponível de acesso negado. Agora preserva 404 com orientação para endereço/permissão, distingue 401 (reconectar), 403 (permissões de OAuth/organização/SSO) e 429 (limites primários/secundários). Não devolve mensagens brutas, tokens nem corpos do GitHub ao cliente. Redirecionamentos de repositórios renomeados são limitados e só seguem para `https://api.github.com`, preservando a autenticação sem enviá-la a terceiros. Linguagens são consultadas pelo nome canônico retornado pelo GitHub. `integrated` deve ser booleano explícito para evitar importação anônima acidental.

O fluxo integrado continua usando o token criptografado da conta atual, OAuth com state vinculado à sessão e PKCE, e escopos `read:user repo`. A criação revalida o acesso ao repositório vinculado. Estar autenticado no Orbitfolio não equivale a estar conectado ao GitHub. A configuração exige APP_ORIGIN, client ID, client secret e chave de criptografia; a URL de callback deve coincidir com a aplicação OAuth. Restrições de organização precisam ser autorizadas no GitHub.

Não foi possível atribuir a ocorrência concreta no site a uma causa específica: não foram fornecidos resposta original, logs da instalação ou credenciais OAuth para consentimento real. Os testes usam respostas controladas do GitHub e verificam estado, criptografia, autorização por usuário, repositório privado, erros e redirecionamentos. Não representam validação de consentimento real com repositório privado em produção.

Validação: 13 testes unitários; build Vite; suítes de navegador social, universo e projetos. Incluem listas Seguidores/Seguindo/Amigos → Visualizar conta, Curtidos, Favoritos, cinco categorias “Somente eu” ainda acessíveis ao dono; busca e navegação pelo autor; criação sem link recusada, somente externo, somente GitHub, ambos; linguagens padrão e personalizada; regressões de física, persistência e exclusão. Build mantém aviso de tamanho do bundle Three.js. Nenhuma migração nova ou destrutiva.

Arquivos principais: `server/github.js`, `server/search.js`, `server/app.js`, `server.mjs`, `shared/project-links.js`, `src/pages/search.js`, `src/pages/create-project.js`, `src/pages/project.js`, `src/components/language-picker.js` e navegação/API/estilos correspondentes.
