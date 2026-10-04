# Espaço procedural e PlanetSystem

Implementação integrada ao Orbitfolio em `feature/frontend-rebuild`, partindo de `3265947`. Three.js puro, Vite e API existentes. Não foram alterados modelos GLB, autenticação, schema de banco, regras sociais, branch main ou configuração de divisão do bundle.

## Arquivos e integração

| Arquivo | Responsabilidade |
| --- | --- |
| `src/three/space-chunks.js` (novo) | Grade 3D, geração determinística, noise, recursos dos chunks e FloatingOrigin. |
| `src/three/project-languages.js` (novo) | Paleta completa, aliases, bytes/percentuais e agrupamento de linguagens. |
| `src/three/planet-system.js` (novo) | Planeta com terreno procedural, atmosfera, luas, anéis, órbitas, LOD e descarte. |
| `src/three/flight-motion.js` (novo) | Velocidade desejada, damping exponencial, limite e epsilon. |
| `src/three/universe.js` | Conecta os módulos ao loop da Home, física, posição global/local, teleporte e interação. |
| `src/three/planet-factory.js` | Mantém a interface usada pela Home e pelas prévias; delega ao PlanetSystem. |
| `src/three/planet-interaction.js` | Raycast de superfícies e luas, respeitando visibilidade e distância. |
| `src/three/flight-controls.js` | Encaminha clique pelo listener existente, evitando capturar Pointer Lock ao clicar num objeto. |
| `src/three/physics.js` | Opção `bounded:false` para voo ilimitado; conserva colisões e comportamento padrão dos demais consumidores. |
| `src/three/preview.js` | Mesmos sistemas nas prévias; enquadra luas/anéis e transporta metadados reais. |
| `src/pages/home.js` | Feedback do callback de clique em linguagem. |
| `src/styles/main.css` | Tooltip único sem captura de eventos, importado pelo `src/app.js` existente. |
| `server/app.js` | Expõe `language_bytes_json` já armazenado como `languageBytes`, sem migração. |
| `tests/procedural-space.test.js` (novo) | Testes específicos de geração, descarte, origem, linguagens, luas, movimento e teleporte. |
| `tests/flight-controls.test.js`, `tests/social.test.js`, `tests/world-browser.mjs` | Regressão de cliques/bytes; verificações integradas no navegador. |

A Home continua criando um único `Universe`. Cada frame integra movimento em passos de no máximo 1/120 s, aplica colisões, salva posições globais dos projetos ativos, reancora se necessário, atualiza chunks/câmera/órbitas/raycast e renderiza. Durante o foco de projeto, a transição de câmera e as órbitas continuam animadas. Ao sair da Home, o loop pausa como antes.

## Configuração do universo

As constantes ficam em `SPACE`, em `space-chunks.js`. `SpaceChunks` também aceita overrides no construtor.

| Configuração | Valor padrão |
| --- | --- |
| Seed | `orbitfolio-space-v1` |
| Aresta do chunk | 256 unidades |
| Raio ativo | 2 chunks: cubo de 5×5×5, máximo 125 |
| Modo econômico | Raio 1: máximo 27 chunks |
| Reancoragem | 2.048 unidades em qualquer eixo local |
| Estrelas base | 48 por chunk, moduladas pela densidade |
| Asteroides base | 7 por chunk, modulados pela densidade |

`floor(globalPosition / chunkSize)` funciona nos três eixos, inclusive em coordenadas negativas. Hash da seed com as coordenadas alimenta um PRNG exclusivo por chunk. Uma pequena implementação de **value noise trilinear suavizado**, técnica equivalente para campos de densidade, cria regiões mais vazias ou densas. Nenhuma dependência nova foi adicionada; o conteúdo dos chunks não usa `Math.random()`.

Estrelas usam `Points` e uma `BufferGeometry` por chunk; asteroides usam `InstancedMesh`, geometria icosaédrica e material compartilhados. Posição, escala e rotação são determinísticas. Asteroides são ambientação visual, sem colisão gravitacional.

Chunks fora do cubo ativo são descarregados antes de adicionar os próximos. Seus grupos saem da cena, geometrias exclusivas e buffers de instâncias são descartados, referências saem do Map. Recursos compartilhados só são descartados no encerramento do gerenciador. A coleção tem limite independente da distância viajada. A atualização reaproveita o estado quando chunk central e origem não mudaram. Fog esconde as bordas de carregamento; iluminação direcional mantém a cena iluminada longe da região inicial.

## Floating origin e projetos reais

`FloatingOrigin.offset` guarda a origem global em números JavaScript; `Universe.globalPosition` representa a nave globalmente. Renderização e física usam coordenadas próximas dessa origem. Ao cruzar o limite, nave, câmera e planetas ativos recebem a mesma translação; velocidade e rotação não mudam. Chunks são reposicionados a partir de sua origem lógica. Alvos de foco também têm suporte à translação, inclusive quando duas propriedades apontam para o mesmo vetor.

Os projetos continuam vindo da API. `project.orbit` permanece intacto; `userData.globalPosition` é uma cópia usada pelo mundo. Colisões ainda podem alterar a posição transitória de planetas, como antes, sem gravar novas posições no banco. Sistemas a mais de 1.200 unidades da nave saem da cena, mantêm seus metadados e pausam a física; não recebem coordenadas gráficas gigantes. Recursos de projetos continuam proporcionais à quantidade de projetos, enquanto recursos procedurais permanecem limitados aos chunks ativos.

Pesquisa, Explorar, perfil e associação ao proprietário continuam usando os IDs e rotas existentes. O teleporte busca uma posição global segura considerando a extensão das luas/anéis, redefine a origem local junto ao destino, carrega os chunks correspondentes, zera velocidade e preserva orientação da câmera para o projeto. Raycast passa a considerar objetos ativos e visíveis.

## Linguagens e aparência

`parseProjectLanguages(project)` aceita o mapa existente, arrays com `name/percentage`, listas de nomes e bytes em `languageBytes` ou `github.languageBytes`. Bytes válidos têm precedência sobre percentuais. Valores são normalizados para 100, aliases são reunidos, entradas inválidas não contaminam os cálculos e valores muito grandes são escalados antes da soma. Quando não há proporções positivas, os nomes recebem pesos iguais **estimados**, indicados por `≈` na interação. Projeto sem linguagens usa identidade neutra `Unknown`.

A constante `LANGUAGE_COLORS` contém todas as cores solicitadas. Aliases incluem JS/JavaScript, TS/TypeScript, CSharp/C#, Cpp/C++, Bash/Shell e LaTeX/TeX. Linguagens desconhecidas recebem HSL derivado do hash do nome normalizado.

O tamanho do planeta continua vindo de `projectRadius(sizeBytes)`: a regra logarítmica existente não foi substituída. A linguagem dominante define a cor da superfície e da atmosfera. O shader da superfície modula a iluminação padrão com noise 3D multiescala; não usa imagem externa nem esfera de cor totalmente uniforme. A atmosfera tem transparência, nuvens discretas, falloff angular e fog.

Até quatro linguagens secundárias aparecem como luas. Com mais de cinco linguagens totais, três secundárias conservam luas individuais e a quarta representa `Outros`, agregando todas as restantes. Os percentuais não são perdidos. Raio da lua: `planetRadius × clamp(0.07 + percentage/100 × 0.5, 0.09, 0.26)`.

Cada órbita usa PRNG de `projectId:language:index`; raio, velocidade, fase e inclinação são definidos na criação. A posição é `cos(phase + elapsed × speed)`/`sin(...)` em um grupo inclinado. As faixas radiais não se interceptam, considerando os raios das luas; a primeira fica além da superfície e do anel. Órbitas são estilizadas, sem simulação gravitacional.

Anéis leves aparecem apenas com ferramentas informadas (`Docker`, `Kubernetes`, `Tailwind`/`TailwindCSS`, `Terraform`, `Ansible`) ou pelo menos 1.000 visualizações reais. A API do componente aceita `frameworksOrTools`; não foram fabricados frameworks nem alterado o banco para introduzi-los.

Esferas são compartilhadas por resolução com contagem de referências. Materiais e geometrias não são recriados por frame. Atmosfera desliga além de 40 raios; luas e anéis, além de 35. O sistema completo distante sai da cena. As prévias usam o mesmo PlanetSystem, enquadram sua extensão e conservam o cache existente.

## Interação, voo e recursos preservados

O Raycaster distingue planeta e lua. Planeta abre o projeto. Lua mostra nome e percentual em um único tooltip sem eventos de ponteiro; o clique chama `onLanguageClick({projectId, language, percentage, estimated})`. O valor do callback mantém a precisão do cálculo; a apresentação arredonda para até quatro casas. A Home usa o callback para feedback discreto. `E` também funciona sobre a mira central. O tooltip desaparece ao sair do alvo, liberar navegação, ocultar detalhes ou pausar.

O listener de clique já existente no FlightControls agora consulta a interação antes de capturar o ponteiro. Clique vazio continua iniciando voo; clique em objeto não inicia Pointer Lock indevidamente. WASD, Espaço, Ctrl, Shift, mouse, Escape e bloqueio durante digitação/modal continuam integrados.

| Parâmetro de `FLIGHT` | Valor |
| --- | --- |
| Aproximação da velocidade desejada | 5/s |
| Drag sem input | 9/s |
| Drag sem input durante Dobra | 6/s |
| Corte de velocidade residual | 0,025 unidades/s |
| Velocidade normal / Dobra | 30 / 90 unidades/s, constantes existentes |
| Aproximação da câmera | 12/s |

O fator usa `1 - exp(-rate × delta)`. Soltar movimento leva a velocidade exatamente a zero após a pequena desaceleração; mouse sozinho não cria translação. Direções simultâneas são normalizadas. Subpassos de no máximo 1/120 s tornam deslocamento e colisões consistentes em FPS baixo; o limite de 0,25 s para suspensão prolongada da aba permanece. A Dobra continua consumindo/recarregando energia e controlando os propulsores ciano via código existente.

`ship.js`, `warp.js`, seleção por usuário e os dois GLBs não foram alterados. Permanecem o modelo padrão, o modelo das contas autorizadas, diagnóstico de carregamento, fallback/retry, HUD de energia, restauração dos materiais e descarte de loads tardios.

## Validação

- `npm test`: **38/38 testes passaram**. Dez casos novos; contratos existentes também passaram.
- Novos testes: bytes/aliases/proporções/extremos/Outros; coordenadas negativas/noise/seed; 40 saltos com limite constante e reconstrução idêntica; descarte exclusivo/compartilhado; origem/câmera/alvos; cores/tamanho/órbitas/LOD; raycast de luas; damping e deslocamento em 4/30/60/120 FPS; travessia do limite antigo; teleporte de origem remota; clique sem captura indevida.
- Contrato da API verifica exposição dos bytes já persistidos. Testes de autenticação, privacidade, projetos, pesquisa, física, GLBs, falha de loader e Dobra continuaram passando.
- `npm run build`: **passou**, 45 módulos. O aviso acima de 500 kB foi mantido como warning, sem refatoração fora do escopo.
- `node tests/static-assets.mjs`: **passou**; HTML/JS/CSS de produção, ambos GLBs binários, 404 de assets ausentes e rotas SPA.
- `npm run test:world`: **bloqueado antes de abrir navegador**, porque falta o executável Chromium neste ambiente Linux.
- `npm run test:browser`: build passou; **mesmo bloqueio de Chromium** ao iniciar Playwright.
- `test:world` foi ampliado para testar recursos GPU durante viagens longas, teleporte pós-rebase, shader/atmosfera/anéis, clique e tooltip de lua, além das verificações anteriores. Esses novos casos de navegador ainda precisam ser executados no computador com Chromium disponível. Não são declarados aprovados.
- Regressão encontrada e corrigida durante os testes: arredondamento de ponto flutuante podia ultrapassar 30 por uma fração mínima ao encerrar Dobra; o clamp agora respeita estritamente o teto.

No Windows, com a branch atualizada e Chromium já instalado:

```powershell
npm.cmd run test:world
npm.cmd run test:browser
```

A validação visual e gráfica desta versão permanece pendente desses testes; o resultado anterior informado pelo usuário se refere à versão anterior. O hash do commit desta implementação e o resultado da tentativa única de push são fornecidos na mensagem de entrega. Para consultar o commit que contém este relatório: `git log -1 --format='%H %s' -- docs/PROCEDURAL-SPACE.md`.
