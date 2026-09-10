# Orbitfolio

## Front-end rebuild

O front-end atual é uma experiência espacial construída com Three.js: projetos são
planetas determinísticos e a Home é navegável com teclado. O código novo fica em
`src/`; os arquivos históricos em `assets/` foram preservados apenas como legado.

### Executar

```bash
npm install
npm run dev
```

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

### Arquitetura

- `src/three`: universo, nave, voo, estrelas e fábrica procedural de planetas.
- `src/api`: contratos e adaptadores; não pressupõe endpoints inexistentes.
- `src/mocks`: dados exclusivos para desenvolvimento visual.
- `src/pages` e `src/components`: interface, navegação e estados da aplicação.

O backend atual não expõe API JSON para favoritos, curtidas, ranking, pesquisa
social ou commits. Essas áreas mostram estados de integração pendente, sem fingir
persistência local. Quando houver contratos documentados, substitua o adaptador
de desenvolvimento em `src/api/index.js` por um adaptador HTTP.

Universo 3D onde uma nave espacial viaja entre planetas. Cada planeta representa um projeto publicado por um usuário real da comunidade Orbitfolio.

## Como rodar

Abra a pasta com a extensão Live Server (VS Code) e acesse `index.html`.
Como os módulos usam `import`/`export`, é necessário abrir via servidor local (Live Server resolve isso automaticamente).

## Estrutura

- `index.html` — estrutura da página, as 4 seções/páginas e os painéis
- `style.css` — todo o visual, incluindo painéis, grid de ranking, timeline de commits e página social
- `main.js` — ponto de entrada, liga todos os módulos e roda o loop de animação
- `scene.js` — cria a cena Three.js
- `camera.js` — cria a câmera e faz ela seguir a nave suavemente (inclusive no eixo Y)
- `lights.js` — cria as luzes da cena
- `stars.js` — gera as estrelas de fundo aleatoriamente
- `spaceship.js` — monta a nave com geometrias básicas
- `controls.js` — captura as teclas W A S D, Espaço e Shift esquerdo
- `physics.js` — aplica velocidade, inércia e rotação manualmente, incluindo eixo vertical
- `planets.js` — cria os planetas (a partir dos projetos) e controla o destaque por proximidade
- `database.js` — "banco de dados" simulado: usuários, projetos e commits
- `api.js` — camada de acesso aos dados; hoje lê de `database.js`, no futuro pode virar chamadas de API sem mudar quem a usa
- `router.js` — troca qual página fica visível quando um link do menu é clicado
- `ranking.js` — monta o grid de projetos mais populares
- `commits.js` — monta a timeline de commits de um projeto selecionado
- `social.js` — monta a lista de usuários, perfis e o sistema de seguir
- `ui.js` — controla o painel de detalhes do projeto e o indicador de interação
- `utils.js` — funções reutilizáveis (matemática, cor, data)

## Páginas

- **Início** — a experiência principal: pilotar a nave e explorar os planetas/projetos
- **Ranking** — grid com os projetos mais populares da comunidade
- **Commits** — histórico de versões de um projeto, inspirado no GitHub
- **Social** — perfis de usuários, seguir/deixar de seguir e acesso ao próprio perfil

## Controles

- `W` acelera / `S` freia
- `A` gira à esquerda / `D` gira à direita
- `Espaço` sobe / `Shift esquerdo` desce
- Clique em um planeta próximo para abrir o painel do projeto

## Dados simulados

`database.js` simula 3 usuários e 5 projetos com curtidas, avaliações, visualizações, data de publicação e histórico de commits. Quando o backend existir, basta reescrever as funções de `api.js` para buscar de uma API real — nenhum outro arquivo precisa mudar.

## Simplificações conscientes desta versão

- A timeline de commits mostra apenas uma linha principal (sem os ramos/branches curvos do wireframe), para manter o código simples de entender.
- "Seguir" é guardado apenas em memória (Set), reiniciando ao recarregar a página — não há login real ainda.
- Ao clicar em um projeto na página Social ou no Ranking, o painel de detalhes abre diretamente (em vez de mover a nave 3D até o planeta).

## Próximos passos sugeridos

- Trocar `api.js` por chamadas reais de API/backend
- Adicionar autenticação e cadastro
- Persistir o "seguir" e as avaliações em um banco de dados
- Levar a nave até o planeta ao clicar em um projeto fora da página Início
- Adicionar texturas nos planetas e sons de motor
"# Orbitfolio" 
