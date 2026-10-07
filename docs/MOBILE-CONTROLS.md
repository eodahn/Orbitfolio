# Camada mobile do Orbitfolio

Branch: `feature/frontend-rebuild`. Câmera touch adicionada sobre a base `b93e0cb`.

## Integração

- `src/input/touch-mode.js`: exige Pointer Events, `maxTouchPoints > 0` e `(pointer: coarse) and (hover: none)`. A largura sozinha nunca ativa controles touch. Mudanças de capacidade recriam somente o adaptador de input.
- `src/app.js`: mantém a classe `touch-mode`, observa mudanças de capacidade e remove/restaura o observador no ciclo pagehide/pageshow.
- `src/three/mobile-flight-controls.js`: adaptador separado, sem Pointer Lock; arrastes no canvas alimentam yaw/pitch. Mantém eixos analógicos X/Z e um Set de teclas equivalentes para altitude e Dobra.
- `src/three/universe.js`: escolhe o adaptador; mantém a mesma câmera de acompanhamento, raycast, física, energia e efeitos. Descarta o input anterior ao trocar modo e conserva a orientação da nave.
- `src/three/flight-motion.js`: parâmetro opcional de eixos contínuos. Sem esse parâmetro, o cálculo de teclado permanece igual; com ele, a intensidade parcial reduz a velocidade alvo, conservando os limites, damping e aceleração.
- `src/styles/mobile.css`: todos os seletores limitados à classe `touch-mode`. Navbar, cards, formulários, tabelas, listas, previews, diálogos, painéis e HUD adaptados; portrait/landscape e safe areas. Estilos desktop existentes não foram editados.
- `index.html`: viewport-fit=cover para safe areas; nenhuma restrição de zoom adicionada.
- `package.json`: comando `test:mobile`.

## Controles

O joystick inferior esquerdo usa zona morta de 12%, intensidade contínua e diagonais limitadas ao raio unitário. Pointer capture mantém o gesto no controle ao sair do círculo. Na extrema direita, os botões Subir e Descer alimentam Space e ControlLeft. O botão Dobra alimenta ShiftLeft somente enquanto pressionado.

Todos usam o mesmo `Warp` e os mesmos efeitos da nave, inclusive a nave especial. A barra compacta acima do joystick mostra a energia efetiva; não há energia ou materiais duplicados.

Os controles são elementos irmãos do canvas e interrompem propagação de Pointer Events e cliques de compatibilidade. Não executam raycast. O canvas aceita taps de até 450 ms e deslocamento máximo de 10 pixels, utilizando o callback de seleção já existente. Arrastes e múltiplos dedos no canvas não selecionam objetos. Um tap em espaço vazio não movimenta a nave nem captura o mouse.

Soltar, cancelar, perder captura, abrir UI, perder foco/visibilidade, redimensionar, mudar orientação, trocar modo e descartar os controles limpam as entradas. Abrir detalhes oculta os controles. O retorno à galáxia começa com input zerado.

A matemática do mouse foi extraída para `flight-look.js`, compartilhada com touch; sensibilidade desktop de 0,0022 e ESC/re-lock foram preservados. Touch usa 0,004 radianos por pixel e o mesmo limite de pitch (±0,44π). Após ultrapassar 10 pixels, o arraste aplica yaw/pitch à nave e à câmera de acompanhamento existente, sem órbita ou zoom. Joystick, câmera e botões usam pointers independentes. Não foram alterados shaders, regras de linguagens, GLBs, física de colisão, boundaries, teleporte, autenticação ou persistência.

## Validação

- `npm test`: 70 testes passaram, incluindo 12 testes mobile e todas as regressões de Pointer Lock.
- `node --test tests/mobile-controls.test.js`: 12 testes passaram.
- `npm run build`: passou; warning de chunk acima de 500 kB mantido.
- `npm run test:mobile`: tentado nesta correção, bloqueado na inicialização pela ausência de Chromium. `test:mobile`, `test:world` e `test:browser` precisam ser executados novamente no Windows local.

`tests/mobile-controls.test.js` verifica detecção, zona morta, direções/diagonais, intensidade, equivalência de altitude/velocidade, energia compartilhada, multitouch, cancelamento, UI, orientação, taps e cleanup/remount. São testes de lógica com elementos simulados, não validação visual.

`tests/mobile-browser.mjs` usa Chromium e entrada touch via CDP para 390x844, 430x932 e 844x390, testa arraste de câmera simultâneo ao joystick, acompanhamento da nave, arraste iniciado sobre planeta, layout dos controles, multitouch, isolamento do raycast, tap em planeta, altitude, Dobra segurada/cancelada, orientação, páginas responsivas e ausência de Pointer Lock mobile. Também verifica que uma janela desktop pequena não ativa o modo touch.

Executar localmente no PowerShell com Chromium instalado:

```powershell
npm.cmd run test:mobile
npm.cmd run test:world
npm.cmd run test:browser
```

A validação real de navegador/mobile e a inspeção em aparelho físico permanecem pendentes. Não foram corrigidas falhas antigas de caminhos/cleanup do Windows fora deste escopo.
