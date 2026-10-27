# Universo delimitado, tecnologias e demonstrações

Base: `37ebd25eed6020ea0e6d3babac93773906af8c4a`, na branch `feature/frontend-rebuild`. Esta entrega evolui os módulos desse commit e substitui as regras de universo ilimitado e de luas para quaisquer linguagens secundárias. O documento `PROCEDURAL-SPACE.md` descreve a versão anterior.

## Espaço e contenção

O cubo jogável mede **1.920 × 1.920 × 1.920 unidades**, de −960 a +960 em cada eixo. A escolha considera nave de raio 3, planetas de raio 6–25, sistemas com até quatro luas, velocidade normal 30 e Dobra 90, chunks de 256 e câmera com far plane 1.600. Uma travessia completa demanda aproximadamente 64 s em velocidade normal ou 21,3 s de Dobra constante, antes da contenção e sem considerar recarga. Há espaço para dezenas de sistemas: o posicionador reserva até 4,6 raios de planeta, ou 115 unidades no tamanho máximo, e evita sobreposição dessas reservas para novos projetos. Não foram redistribuídas posições persistidas anteriormente que já eram válidas.

`shared/world-config.js` centraliza os limites, a faixa de contenção de 96 unidades, a reserva de 16 para a câmera e a margem de aproximação de 12. A física aplica damping progressivo somente à componente de velocidade voltada à borda. Também limita essa velocidade a duas vezes a distância restante, aproximando-se de zero suavemente. O clamp final impede ultrapassagem mesmo durante Dobra ou após correção de colisão. A nave fica com folga de raio + reserva da câmera; a câmera também tem clamp próprio, inclusive durante foco em projeto. Tangenciar a borda e afastar-se dela continuam livres.

O cubo não possui mesh, parede, grid ou textura. As coordenadas lógicas/globais e o FloatingOrigin continuam separados das coordenadas de renderização. Planetas ativos são contidos considerando sua extensão visual completa; os novos planetas já recebem posições do backend com folga conservadora. Dados `project.orbit` não são sobrescritos pelo renderizador.

## Estrelas e asteroides

Os chunks determinísticos continuam existindo: 125 no modo normal, 27 no econômico. As estrelas dos chunks continuam com densidade baseada em noise e descarte dos recursos exclusivos. Uma camada adicional determinística de **2.400 pontos** forma uma esfera de raios 850–1.150 em torno da câmera, sem fog nem redução de tamanho por distância. Essa camada acompanha a câmera, inclusive no foco do projeto. Assim, todas as faces do cubo continuam tendo estrelas além da área jogável, sem revelar borda quadrada do gerador. A limitação gráfica de Chromium impediu confirmar visualmente a composição; os testes verificaram a distribuição nas seis faces e os parâmetros de renderização.

Asteroides continuam usando `InstancedMesh` e geometria/material compartilhados. A geração filtra esferas que ultrapassariam os limites. A colisão consulta apenas chunks vizinhos da nave em subpassos de até 1/120 s; na velocidade máxima, cada subpasso move no máximo 0,75 unidade, menor que o raio mínimo de contato nave/asteroide.

`ASTEROIDS.breakSpeed = 55` usa a **componente de velocidade de impacto na normal do contato**. Shift sozinho não destrói; colisão tangencial com pouca velocidade contra a superfície também não. Em impacto normal, há separação das esferas, restituição de 0,15 e redução de velocidade para 85%, sem impulso violento. Acima do threshold, a instância recebe escala zero e seu collider é desativado imediatamente.

IDs estáveis `chunkX,chunkY,chunkZ:índice` alimentam `destroyedAsteroidIds`. Ao recarregar o chunk, essas instâncias não voltam durante a sessão. O conjunto é limitado pelo total finito de asteroides possíveis dentro do cubo e é limpo ao destruir o gerenciador; não é persistido no banco.

Fragmentos rochosos usam um único `InstancedMesh`: **24 slots × 12 fragmentos = 288 instâncias máximas**, com duração de **1 segundo**, desaceleração exponencial de 4/s e redução de escala até zero. Quando há mais de 24 impactos simultâneos, um slot é reutilizado. Ao expirar, o burst sai do Map e do update; sem bursts, a mesh fica invisível. Não são criados materiais, geometrias ou listeners por impacto. O descarte do universo também libera o buffer de instâncias e os recursos compartilhados. O teste exerceu 500 bursts e confirmou limite e limpeza.

## Configuração única de tecnologias

`shared/technology-visuals.js` reúne cores, aliases, categorias documentadas em JSDoc e classificação. O parser de bytes/percentuais existente continua em `project-languages.js`, reexportando a paleta para compatibilidade. A mesma fonte é consumida pelo seletor, formulário de criação, badges dos cards, barras dos detalhes, PlanetSystem e identidade das prévias.

| Categoria | Representação |
| --- | --- |
| Web/frontend | A maior porcentagem nessa categoria define a base; outras contribuem para a superfície. |
| Backend/geral | Luas proporcionais, com clamp e órbitas determinísticas. |
| Shell/scripts/configuração | Anéis concêntricos discretos com a cor de cada tecnologia. |
| Bancos/queries | Biomas/manchas orgânicas na superfície, sem luas. |
| Markup/dados | Detalhes/manchas orgânicas na superfície, sem luas. |
| Desconhecidas | Cor HSL determinística e contribuição de superfície; não são classificadas arbitrariamente como backend. |

Sem frontend, a maior linguagem geral fornece a base. Ela conserva sua representação categórica: Python/Go/Dockerfile resulta em base Python, duas luas e um anel. O raio das luas continua limitado a 9%–26% do raio do planeta, evitando duplicação visual exagerada. Com mais de quatro backends, aparecem três luas individuais e uma **Outros Backend**, com percentual agregado; o tooltip lista os membros. A cor neutra do agregado é determinística.

As manchas usam o noise tridimensional do terreno e transições suaves entre cores, com intervalos acumulados proporcionais ao peso das tecnologias de superfície. A cobertura é aproximada, não uma medição exata por pixel; aumentar o peso de uma tecnologia amplia seu intervalo. Não há discos ou círculos colados à esfera. Iluminação padrão, roughness, terreno, atmosfera, transparência, cache de geometria e LOD permanecem. Nenhum recurso gráfico é recriado no loop de órbitas.

Anéis agora dependem de linguagens Shell/Config, **não de views ou ferramentas inferidas**. O mapa inclui todas as cores solicitadas, incluindo JavaScript `#f1e05a`, TypeScript `#3178c6`, Python `#3572A5`, Dockerfile `#384d54` e PostgreSQL `#e38c00`. Aliases incluem JS, TS, Cpp, CSharp, Bash/Shell, postgres/PostgreSQL, MySQL, SCSS/SASS e LaTeX/TeX. O HTML preserva os nomes fornecidos nos dados; a classificação usa a forma canônica. O antigo nome combinado HTML/CSS é reconhecido como identidade HTML para compatibilidade, sem inventar divisão de percentuais.

## Ir até o planeta

A Pesquisa agora apresenta somente resultados que abrem projetos ou perfis. O botão **IR ATÉ O PLANETA** fica no componente compartilhado de detalhes, tanto na página de projeto quanto no painel da Home. O link navega para `/?planet=id`; a Home consome o parâmetro uma vez, fecha o painel, libera Pointer Lock, restaura foco e aproxima a nave. Não chama novamente a abertura dos detalhes.

`findSafeApproach` testa direções tridimensionais e distâncias adicionais quando há obstáculos ou bordas. A distância inicial é **visualRadius + shipRadius + 12**. `visualRadius` já engloba atmosfera, anéis e a maior órbita mais o raio da lua; somá-los novamente seria redundante. Valida também outros sistemas, asteroides, câmera e os limites globais. A nave chega com velocidade zero, orientada para o planeta, e a câmera o enquadra à frente. Se não existir ponto seguro, mantém o aviso existente e não força uma chegada sobreposta.

## Exemplos públicos e fontes

A pesquisa avaliou cinco candidatos em 2026-10-05 UTC (noite de 04/10 em São Paulo). Consultas HTTP diretas confirmaram resposta 200 para os cinco sites, nomes públicos via GitHub e bytes pelo endpoint `/repos/{owner}/{repo}/languages`. Isso verifica disponibilidade e vínculo público; não equivale a uma auditoria de todos os fluxos interativos dos sites externos.

| Candidato | Repositório | Site | Decisão |
| --- | --- | --- | --- |
| Amit Das | https://github.com/AmitDas4321/Portfolio | https://amitdas-dev.web.app/ | Selecionado: portfólio pessoal com React/GSAP/Three.js documentados no README. |
| Henry Heffernan | https://github.com/henryjeff/portfolio-website | https://henryheffernan.com/ | Selecionado: portfólio 3D, com referência ao computador virtual no README. |
| Brittany Chiang | https://github.com/bchiang7/v4 | https://v4.brittanychiang.com/ | Selecionada: portfólio frontend pessoal, Gatsby documentado no README. |
| Andrew Woan | https://github.com/andrewwoan/abigail-bloom-portolio-bokoko33 | https://abigail-bloom-portolio-bokoko33.vercel.app/ | Válido como criação pública, mas preterido por ser uma recriação com personagem de demonstração. |
| Ryan Balieiro | https://github.com/ryanbalieiro/react-portfolio-template | https://ryanbalieiro.github.io/react-portfolio-template/ | Válido como projeto público, mas preterido por ser template com persona demonstrativa. |

Os resultados das cinco consultas estão em `docs/demo-research.json`. Os três registros usados pelo seed estão em `server/showcase-data.json`, incluindo URLs de fontes, bytes sem arredondamento e data de verificação. Os tamanhos dos repositórios seguem a regra existente de conversão do campo `size` do GitHub (KiB) para bytes. Não foram copiados os sites nem simulados commits, views ou vínculos com seus autores.

### Amit Das

Username: `demo-amit-das`. Projeto: **Portfolio**.

Portfólio interativo com React, animações GSAP e elementos Three.js/WebGL.

Site: https://amitdas-dev.web.app

Repositório: https://github.com/AmitDas4321/Portfolio

| Linguagem | Bytes verificados | Percentual calculado |
| --- | ---: | ---: |
| TypeScript | 65226 | 60.430255% |
| CSS | 39095 | 36.220538% |
| HTML | 2023 | 1.874259% |
| JavaScript | 1592 | 1.474948% |

Fontes: https://api.github.com/repos/AmitDas4321/Portfolio, https://api.github.com/repos/AmitDas4321/Portfolio/languages, https://github.com/AmitDas4321, https://amitdas-dev.web.app

### Henry Heffernan

Username: `demo-henry-heffernan`. Projeto: **Portfolio Website**.

Portfólio 3D de Henry Heffernan com uma experiência de computador virtual.

Site: https://henryheffernan.com

Repositório: https://github.com/henryjeff/portfolio-website

| Linguagem | Bytes verificados | Percentual calculado |
| --- | ---: | ---: |
| TypeScript | 106491 | 85.975521% |
| CSS | 4649 | 3.753371% |
| JavaScript | 4384 | 3.539423% |
| GLSL | 4249 | 3.430431% |
| HTML | 4089 | 3.301255% |

Fontes: https://api.github.com/repos/henryjeff/portfolio-website, https://api.github.com/repos/henryjeff/portfolio-website/languages, https://github.com/henryjeff, https://henryheffernan.com

### Brittany Chiang

Username: `demo-brittany-chiang`. Projeto: **Portfolio v4**.

Quarta versão do portfólio pessoal de Brittany Chiang, construída com Gatsby.

Site: https://v4.brittanychiang.com/

Repositório: https://github.com/bchiang7/v4

| Linguagem | Bytes verificados | Percentual calculado |
| --- | ---: | ---: |
| JavaScript | 135515 | 99.954270% |
| Shell | 62 | 0.045730% |

Fontes: https://api.github.com/repos/bchiang7/v4, https://api.github.com/repos/bchiang7/v4/languages, https://github.com/bchiang7, https://v4.brittanychiang.com/

## Seed e publicação

`seedShowcase()` mantém a transação e o advisory lock PostgreSQL existentes. IDs e usernames são estáveis, inserts usam `ON CONFLICT DO NOTHING`, e um usuário real que já ocupe o username não recebe projetos de demonstração. Num banco limpo são criadas exatamente três contas e três projetos, mesmo após duas execuções. Uma eventual demonstração antiga de Bruno Simon já existente não é apagada; o novo seed não a recria.

As contas têm `is_demo=1`, senha NULL, email no domínio reservado `.invalid`, sem OAuth, token ou senha pública. A UI já identifica perfis demonstrativos e os resultados vêm da API normal. Cada conta recebe exatamente um projeto inicial, com link externo, repo, bytes e percentuais. Todos passam pelo mesmo PlanetSystem. Brittany inclui Shell nos bytes reais e, portanto, recebe um anel automaticamente. Não foram inventados backends para forçar luas nos demos.

`npm run seed:demo` foi executado duas vezes no banco local configurado, sem duplicar os três registros. Para aplicar no PostgreSQL de hospedagem, após publicar a branch, executar o mesmo script no ambiente do servidor ou manter **`SEED_SHOWCASE=true`**, mecanismo já existente no startup. O seed local não significa que o banco do Render tenha sido modificado.

Links externos passam pelo normalizador http(s); `Acessar projeto` prioriza `externalUrl`/`demoUrl`, com o repositório separado. Links em nova aba usam `rel="noopener noreferrer"` nos detalhes. Protocolos `javascript:` continuam rejeitados.

## Validação e limites

- **`npm test`: 49/49 passaram.** Foram adicionados testes de seis faces, câmera/origem deslocada, voo normal/Dobra, limite rígido, estrelas além das bordas, asteroides em baixa/alta velocidade e de raspão, Shift parado, collider removido, instância oculta, não reaparecimento e pool após 500 efeitos.
- Testes das categorias solicitadas, fallback backend-only, mais de quatro backends, aliases, cores exatas, peso de superfície, aproximação nas faces/cantos, mudança de posição do botão e ausência de reabertura automática passaram.
- Seed testado duas vezes com 3 usuários/3 projetos, proprietários corretos, links, percentuais, `isDemo`, pesquisa e proteção a conflito com username real.
- **Build passou**, 49 módulos; aviso de bundle acima de 500 kB mantido sem alterar funcionalidades fora do escopo.
- **`node tests/static-assets.mjs` passou**: HTML/JS/CSS de produção, ambos GLBs, rotas e 404 de assets ausentes.
- **`npm run test:world` foi executado**, mas não chegou aos casos: falta `/root/.cache/ms-playwright/chromium_headless_shell-1234/.../chrome-headless-shell`.
- **`npm run test:browser` foi executado**: seu build passou; lançamento do navegador bloqueado pela mesma ausência do Chromium.
- `test:world` foi atualizado para as novas bordas, estrelas, fragmentos, shader de biomas e luas backend. `test:projects` foi atualizado para Pesquisa → detalhes → aproximar sem painel reaberto; `test:features` passa a consultar Brittany em vez do antigo seed. Os dois últimos scripts não foram executados nesta entrega; a validação gráfica permanece pendente no computador com Chromium.
- Testes existentes de autenticação, privacidade, contas, pesquisa, projetos, física, tamanhos, controles, Dobra, seleção/loads/fallback/descarte dos GLBs continuaram aprovados. Não foi realizado teste contra uma instância PostgreSQL de produção nem deploy no Render.

Para validar no Windows após importar/atualizar a branch:

```powershell
npm.cmd run test:world
npm.cmd run test:browser
npm.cmd run test:projects
```

## Arquivos desta alteração

Novos: `shared/technology-visuals.js`, `src/three/boundaries.js`, `src/three/asteroid-impact.js`, `src/three/approach.js`, `server/showcase-data.json`, `tests/bounded-space.test.js`, `tests/showcase.test.js`, `docs/demo-research.json` e este relatório.

Alterados: `shared/world-config.js`, `shared/project-links.js`, `server/app.js`, `server/project-data.js`, `server/showcase.js`, `src/three/universe.js`, `src/three/space-chunks.js`, `src/three/planet-system.js`, `src/three/project-languages.js`, `src/three/planet-factory.js`, `src/components/language-picker.js`, `src/components/project-card.js`, `src/pages/create-project.js`, `src/pages/project.js`, `src/pages/search.js`, `src/pages/home.js`, `tests/procedural-space.test.js`, `tests/world-browser.mjs`, `tests/projects-browser.mjs` e `tests/features-browser.mjs`.

`flight-motion.js`, `flight-controls.js`, `ship.js`, `warp.js` e o schema PostgreSQL foram preservados. A contenção e impactos são chamados pelo loop existente, sem outro sistema concorrente de navegação. O hash final e a situação da tentativa única de push são informados na entrega. `git log -1 --format='%H %s' -- docs/BOUNDED-SPACE.md` identifica o commit deste relatório.
