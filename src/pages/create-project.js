import { chooseLanguage } from "../components/language-picker.js";
import { projectLinks } from "../../shared/project-links.js";
import { api } from "../api/index.js";
import { shell } from "../components/shell.js";
import { navigate } from "../router/router.js";
import { escapeHtml as e } from "../utils/html.js";
export async function renderCreateProject(root) {
  if (!(await api.auth.session())) return navigate("/login");
  let draft = { name: "", description: "", repositoryUrl: "", languages: {} },
    status,
    repoPage = 1;
  const frame = (body) => {
    root.innerHTML = shell(
      `<main class="page narrow create-page"><p class="eyebrow">UM NOVO PLANETA</p><h1>Adicionar projeto</h1><div class="creation-content">${body}</div><p data-create-error class="form-error" role="alert"></p></main>`,
      "/projects",
    );
  };
  const error = (err) => {
    const el = root.querySelector("[data-create-error]");
    if (el) el.textContent = err.message || "Conexão perdida. Tente novamente.";
  };
  async function busy(button, text, action) {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = text;
    try {
      await action();
    } catch (err) {
      error(err);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = old;
      }
    }
  }
  function choice() {
    frame(
      `<h2>Deseja integrar este projeto com o GitHub?</h2><p>Conecte sua conta para escolher um repositório e acompanhar commits reais, ou publique seu projeto manualmente.</p><div class="actions"><button class="button button-primary" data-github>Integrar com GitHub</button><button class="button" data-manual>Continuar sem integração</button></div>`,
    );
    root.querySelector("[data-github]").onclick = (event) =>
      busy(event.target, "Verificando conexão...", github);
    root.querySelector("[data-manual]").onclick = link;
  }
  function link() {
    frame(
      `<h2>Adicione o link do projeto</h2><p>Links de repositórios públicos do GitHub permitem importar nome, descrição e linguagens sem conectar sua conta. Para outros links, personalize os dados.</p><form data-link class="profile-form"><label>Link do projeto<input name="url" type="url" value="${e(draft.repositoryUrl)}" placeholder="https://github.com/usuario/projeto" required></label><div class="actions"><button class="button button-primary">Adicionar link</button><button type="button" class="button" data-custom>Personalizar</button><button type="button" class="button" data-back>Voltar</button></div></form>`,
    );
    root.querySelector("[data-link]").onsubmit = (event) => {
      event.preventDefault();
      draft.repositoryUrl = new FormData(event.currentTarget).get("url");
      busy(event.submitter, "Lendo informações do repositório...", async () => {
        draft = await api.github.inspect({
          url: draft.repositoryUrl,
          integrated: false,
        });
        editor();
      });
    };
    root.querySelector("[data-custom]").onclick = () => {
      draft.repositoryUrl = root.querySelector("[name=url]").value;
      editor();
    };
    root.querySelector("[data-back]").onclick = choice;
  }
  async function github() {
    status = await api.github.status();
    if (!status.available) {
      frame(
        '<h2>Integração GitHub indisponível</h2><p>A conexão com GitHub ainda não foi configurada neste servidor. Você pode adicionar um link público ou personalizar seu projeto.</p><button class="button" data-manual>Continuar sem integração</button>',
      );
      root.querySelector("[data-manual]").onclick = link;
      return;
    }
    if (!status.connected) {
      frame(
        `<h2>Conectar sua conta GitHub</h2><p>Você será encaminhado ao GitHub para autorizar o acesso aos repositórios. O escopo OAuth “repo” também inclui permissões de escrita, embora o Orbitfolio só consulte os dados.</p><div class="actions"><button class="button button-primary" data-connect>Autorizar no GitHub</button><button class="button" data-manual>Continuar sem integração</button></div>`,
      );
      root.querySelector("[data-connect]").onclick = (event) =>
        busy(event.target, "Abrindo GitHub...", async () => {
          location.assign((await api.github.connect()).url);
        });
      root.querySelector("[data-manual]").onclick = link;
      return;
    }
    let data;
    try {
      data = await api.github.repositories(repoPage);
    } catch (err) {
      frame(
        '<h2>Não foi possível listar os repositórios</h2><div class="actions"><button class="button" data-retry>Tentar novamente</button><button class="button" data-reconnect>Reconectar GitHub</button><button class="button" data-manual>Continuar sem integração</button></div>',
      );
      error(err);
      root.querySelector("[data-retry]").onclick = (event) =>
        busy(event.target, "Carregando...", github);
      root.querySelector("[data-reconnect]").onclick = (event) =>
        busy(event.target, "Abrindo GitHub...", async () =>
          location.assign((await api.github.connect()).url),
        );
      root.querySelector("[data-manual]").onclick = link;
      return;
    }
    frame(
      `<h2>Escolha um repositório</h2><p>Conectado como ${e(status.login)}.</p><div class="repository-list">${data.repositories.map((r) => `<button class="button repository-option" data-repository="${e(r.fullName)}">${e(r.fullName)} <small>${r.private ? "Privado" : "Público"}</small></button>`).join("") || "<p>Nenhum repositório autorizado nesta página.</p>"}</div><div class="actions">${repoPage > 1 ? '<button class="button" data-prev>Anterior</button>' : ""}${data.hasNext ? '<button class="button" data-next>Próxima página</button>' : ""}<button class="button" data-manual>Continuar sem integração</button><button class="button" data-disconnect>Desconectar GitHub</button></div>`,
    );
    for (const button of root.querySelectorAll("[data-repository]"))
      button.onclick = () =>
        busy(button, "Lendo informações do repositório...", async () => {
          draft = await api.github.inspect({
            fullName: button.dataset.repository,
            integrated: true,
          });
          editor();
        });
    for (const [selector, increment] of [
      ["[data-prev]", -1],
      ["[data-next]", 1],
    ])
      root.querySelector(selector)?.addEventListener("click", (event) =>
        busy(event.target, "Carregando...", async () => {
          repoPage += increment;
          await github();
        }),
      );
    root.querySelector("[data-manual]").onclick = link;
    root.querySelector("[data-disconnect]").onclick = (event) =>
      busy(event.target, "Desconectando...", async () => {
        await api.github.disconnect();
        choice();
      });
  }
  function editor() {
    const links = projectLinks(draft);
    frame(
      `<h2>${draft.importId ? "Revise seu projeto" : "Personalizar projeto"}</h2>${draft.github?.private ? '<p class="notice">Repositório privado: este projeto não será exibido publicamente. Os commits exigem acesso GitHub autorizado.</p>' : ""}<form class="profile-form project-form" data-project-form><label>Nome do projeto<input name="name" required minlength="2" maxlength="100" value="${e(draft.name)}"></label><label>Descrição<textarea name="description" maxlength="500">${e(draft.description)}</textarea></label><label>Repositório GitHub<input name="githubUrl" type="url" value="${e(links.github)}" ${draft.importId ? "readonly" : ""} placeholder="https://github.com/usuario/repositorio"></label><label>Link externo do projeto<input name="demoUrl" type="url" value="${e(links.external)}" placeholder="https://meu-projeto.com"></label><p>Adicione pelo menos um dos links.</p><fieldset><legend>Linguagens</legend><p>Porcentagens são opcionais. Quando todas forem preenchidas, devem somar 100%.</p><table class="language-table"><thead><tr><th>Linguagem</th><th>% (opcional)</th><th>Ações</th></tr></thead><tbody data-language-rows></tbody></table><button type="button" class="button" data-add-language>+ Adicionar linguagem</button></fieldset><div class="actions"><button class="button button-primary" type="submit">Criar projeto</button><button class="button" type="button" data-back>Voltar</button></div></form>`,
    );
    const rows = root.querySelector("[data-language-rows]");
    const add = (name = "", value = null) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td><input aria-label="Linguagem" readonly maxlength="50" required value="${e(name)}"></td><td><input aria-label="Porcentagem" type="number" min="0" max="100" step="any" value="${value == null ? "" : Number(value)}"></td><td><button class="button" type="button" aria-label="Remover linguagem">Remover</button></td>`;
      row.querySelector("button").onclick = () => row.remove();
      rows.append(row);
    };
    for (const entry of Object.entries(draft.languages || {})) add(...entry);
    root.querySelector("[data-add-language]").onclick = async () => {
      const name = await chooseLanguage(
        [...rows.querySelectorAll('[aria-label="Linguagem"]')].map(
          (input) => input.value,
        ),
      );
      if (name && rows.isConnected) add(name);
    };
    root.querySelector("[data-back]").onclick = () => {
      draft = { name: "", description: "", repositoryUrl: "", languages: {} };
      choice();
    };
    root.querySelector("[data-project-form]").onsubmit = (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget)),
        entries = [...rows.children].map((row) => {
          const [name, percent] = row.querySelectorAll("input");
          return [
            name.value.trim(),
            percent.value === "" ? null : Number(percent.value),
          ];
        });
      if (
        new Set(entries.map(([name]) => name.toLowerCase())).size !==
        entries.length
      )
        return error(new Error("Não repita linguagens."));
      if (!values.githubUrl.trim() && !values.demoUrl.trim())
        return error(
          new Error(
            "Adicione um link do GitHub ou um link externo para criar o projeto.",
          ),
        );
      busy(event.submitter, "Criando planeta...", async () => {
        const project = await api.projects.create({
          ...values,
          languages: Object.fromEntries(entries),
          importId: draft.importId,
        });
        await navigate(`/project/${encodeURIComponent(project.id)}`);
      });
    };
  }
  choice();
  const callback = new URLSearchParams(location.search).get("github");
  if (callback === "connected")
    try {
      await github();
    } catch (err) {
      error(err);
    }
  if (callback === "error")
    error(
      new Error(
        "A conexão foi cancelada ou expirou. Tente integrar novamente.",
      ),
    );
}
