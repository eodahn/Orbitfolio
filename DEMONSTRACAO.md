# Orbitfolio para apresentação escolar

Use Node.js 24 LTS e abra o PowerShell na pasta que contém este arquivo e o package.json.

```powershell
npm.cmd ci
npm.cmd run demo
```

Também é possível iniciar com `npm.cmd run dev`. Ambos os comandos servem a interface e a API na mesma porta. Para desenvolvimento com atualização automática e backend iniciado separadamente, use `npm.cmd run dev:vite`.

O primeiro comando instala as dependências. Nas próximas sessões basta executar o segundo. Acesse http://127.0.0.1:5173/login e entre como **eodahn@demo.local** com a senha local exibida por `Get-Content .\data\school-demo.key` em outro PowerShell. O perfil é **@eodahn**. Mantenha o terminal aberto durante a apresentação. Ctrl+C encerra o servidor.

## Roteiro de apresentação

1. Entre em **Projetos**, abra **Orbitfolio** e clique em **Ir até o planeta**. Clique no universo para pilotar. Use WASD para mover a nave, E para abrir o planeta próximo e Esc para liberar o cursor.
2. Abra **Explorar** para mostrar os projetos públicos. A conta também possui o planeta privado **Laboratório orbital**, acessível em **Projetos**.
3. Em **Progresso**, selecione Orbitfolio para ver a trajetória fictícia gravada no SQLite. Em **Conta**, mostre seguidores, pessoas seguidas, amigos, edição de perfil e privacidade.
4. Visite a **Lua Social**, pesquise viajantes e abra um perfil. Abra um planeta da comunidade, favorite e confira o resultado em **Favoritos**. O ranking fica em **Em destaque**.
5. Para criar um planeta, escolha **Projetos → Adicionar projeto → Continuar sem integração → Personalizar**. Informe nome, descrição e um endereço válido. Os dados persistem quando o servidor é reiniciado.

## Banco e capturas

A demo abre diretamente o SQLite em `data/school-demo.sqlite`. Cada instalação cria o próprio banco. Os registros incluem dez perfis, trabalhos fictícios, dez referências públicas selecionadas para a mostra e atividades simuladas. O botão **Integrar com GitHub** abre um catálogo simulado com as referências do banco. Você pode selecionar um repositório, revisar suas linguagens, publicar o planeta e consultar a atividade registrada localmente. Os links de sites e repositórios externos dependem de internet. As telas e o histórico demonstrativo funcionam localmente.

Para restaurar a carga inicial, encerre a demo, execute `npm.cmd run demo:reset` e inicie novamente. Isso apaga alterações feitas durante o ensaio, inclusive projetos criados e sessões desse banco.

Os PNGs em `artifacts/screenshots/` têm 1920 × 1080. Para repetir a captura, mantenha a demo rodando e execute em outro PowerShell, na mesma pasta:

```powershell
npx.cmd playwright install chromium
npm.cmd run demo:prints
```

O roteiro usa a conta inicial, cria e exclui um projeto de ensaio e verifica a persistência de favoritos e privacidade. Para reproduzir as mesmas telas depois de editar os dados, restaure a carga inicial primeiro.

A base é Orbitfolio 0.1.0, branch feature/frontend-rebuild, commit cdb14ea98ee2fadafade4a9fc73702b76684bdf8. A navbar e o universo 3D vêm dessa revisão. A demonstração usa o login local do aplicativo. A integração OAuth do servidor normal continua disponível na implementação original.

Ao atualizar uma instalação anterior que usava senha fixa, a conta existente conserva sua senha até a restauração dos dados com demo:reset.
