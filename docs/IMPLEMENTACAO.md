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
