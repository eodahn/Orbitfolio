import { api } from "../api/index.js";
import { shell, toast } from "../components/shell.js";
import { navigate } from "../router/router.js";
import { avatar, userCard } from "../components/user-card.js";
import { projectCard } from "../components/project-card.js";
import { escapeHtml as e } from "../utils/html.js";
const categories = {
  projects: "Meus planetas",
  followers: "Seguidores",
  following: "Seguindo",
  friends: "Amigos",
  likes: "Curtidos",
  favorites: "Favoritos",
  privacy: "Privacidade",
  edit: "Editar perfil",
};

export async function renderAccount(root) {
  return renderProfile(root);
}
export async function renderProfile(root, id) {
  const viewer = await api.auth.session();
  if (!id && !viewer) {
    root.innerHTML = shell(
      `<main class="page narrow"><h1>Conta</h1><p class="lead">Entre para publicar projetos, criar conexões e salvar órbitas.</p><div class="actions"><a class="button button-primary" data-route href="/login">Entrar</a><a class="button" data-route href="/register">Criar conta</a></div></main>`,
      "/account",
    );
    return;
  }
  let user;
  try {
    user = await api.users.get(id || viewer.id);
  } catch (error) {
    if (error.status !== 404) throw error;
    root.innerHTML = shell(
      '<main class="page"><h1>Usuário não encontrado.</h1></main>',
    );
    return;
  }
  const own = viewer?.id === user.id,
    base = own ? "/account" : `/user/${encodeURIComponent(user.id)}`;
  const selected =
    new URLSearchParams(location.search).get("tab") || "projects";
  const allowed = (key) =>
    key === "projects" ||
    (["privacy", "edit"].includes(key) ? own : user.visibility[key]);
  const tab = Object.hasOwn(categories, selected) ? selected : "projects";
  const count = (key) =>
    ({
      projects: user.projects,
      followers: user.followers,
      following: user.followingCount,
      friends: user.friends,
    })[key];
  let body = "";
  if (!allowed(tab)) body = "<p>Esta seção é privada.</p>";
  else if (tab === "privacy")
    body = `<form data-privacy class="profile-form"><p>“Somente eu” oculta a categoria para outras pessoas. Você continua tendo acesso.</p>${Object.keys(
      user.privacy,
    )
      .map(
        (key) =>
          `<label>${categories[key]}<select name="${key}"><option value="public" ${user.privacy[key] === "public" ? "selected" : ""}>Público</option><option value="private" ${user.privacy[key] === "private" ? "selected" : ""}>Somente eu</option></select></label>`,
      )
      .join(
        "",
      )}<button class="button button-primary">Salvar privacidade</button></form>`;
  else if (tab === "edit")
    body = `<form data-profile class="profile-form"><label>Nome<input name="name" value="${e(user.name)}" required minlength="2" maxlength="80"></label><label>Username<input name="username" value="${e(user.username)}" required pattern="[a-zA-Z0-9_-]{3,64}"></label><label>Informações do perfil<textarea name="bio" maxlength="500">${e(user.bio)}</textarea></label><label>URL da foto<input name="avatarUrl" type="url" value="${e(user.avatarUrl)}"></label><button class="button button-primary">Salvar perfil</button></form>`;
  else {
    const data = await api.users.section(user.id, tab);
    body = data.users
      ? data.users.length
        ? `<div class="project-grid">${data.users.map(userCard).join("")}</div>`
        : "<p>Nenhum viajante nesta lista.</p>"
      : data.projects.length
        ? `<div class="project-grid">${data.projects.map((p) => projectCard(p)).join("")}</div>`
        : "<p>Nenhum planeta nesta lista.</p>";
  }
  root.innerHTML = shell(
    `<main class="page profile-page"><header class="profile-heading">${avatar(user)}<div><p class="eyebrow">${own ? "MINHA CONTA" : "PERFIL DO VIAJANTE"}</p><h1>${e(user.name)}</h1><p>@${e(user.username)}</p><p class="lead">${e(user.bio)}</p><p>${user.projects} planetas${!own && user.isFriend ? " · Vocês são amigos" : !own && user.followsViewer ? " · Segue você" : ""}</p></div></header><div class="actions">${own ? '<a class="button" data-route href="/progress">Meu progresso</a><button class="button" data-logout>Sair</button>' : `<button class="button button-primary" data-follow>${user.following ? "Deixar de seguir" : "Seguir"}</button>`}</div><nav class="profile-tabs" aria-label="Seções do perfil">${Object.keys(
      categories,
    )
      .filter(allowed)
      .map(
        (key) =>
          `<a data-route class="button ${tab === key ? "is-active" : ""}" ${tab === key ? 'aria-current="page"' : ""} href="${base}?tab=${key}">${key === "projects" && !own ? "Planetas" : categories[key]}${count(key) != null ? ` (${count(key)})` : ""}</a>`,
      )
      .join(
        "",
      )}</nav><section aria-label="${categories[tab]}"><h2>${tab === "projects" && !own ? "Planetas" : categories[tab]}</h2>${body}</section></main>`,
    own ? "/account" : "/social",
  );
  root
    .querySelector("[data-follow]")
    ?.addEventListener("click", async (event) => {
      if (!viewer) return navigate("/login");
      event.currentTarget.disabled = true;
      try {
        await (user.following ? api.social.unfollow : api.social.follow)(
          user.id,
        );
        await renderProfile(root, id);
      } catch (error) {
        toast(error.message, "error");
        event.target.disabled = false;
      }
    });
  root.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await api.auth.logout();
    await navigate("/account");
  });
  for (const [selector, save] of [
    ["[data-privacy]", api.users.privacy],
    ["[data-profile]", api.users.update],
  ])
    root.querySelector(selector)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      try {
        await save(Object.fromEntries(new FormData(event.currentTarget)));
        await renderProfile(root, id);
        toast("Alterações salvas.");
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
}
export function renderLogin(root, register = false) {
  const label = register ? "Criar conta" : "Entrar";
  root.innerHTML = shell(
    `<main class="page narrow auth-page"><p class="eyebrow">${register ? "NOVA ÓRBITA" : "BOAS-VINDAS"}</p><h1>${label}</h1><form class="auth-card" data-auth>${register ? `<label>Nome<input required name="name" autocomplete="name"></label>` : ""}<label>E-mail<input required type="email" name="email" autocomplete="email"></label><label>Senha<input required minlength="8" type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}"></label><button class="button button-primary">${label}</button></form><p class="auth-switch">${register ? "Já possui uma conta?" : "Ainda não possui conta?"} <a data-route href="${register ? "/login" : "/register"}">${register ? "Entrar" : "Criar conta"}</a></p></main>`,
  );
  root
    .querySelector("[data-auth]")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      try {
        await (register ? api.auth.register : api.auth.login)(data);
        navigate("/account");
      } catch (error) {
        toast(error.message, "error");
      }
    });
}

export async function renderSocial(root) {
  const users = await api.users.list();
  root.innerHTML = shell(
    `<main class="page"><div class="page-heading"><div><p class="eyebrow">LUA SOCIAL</p><h1>Encontre viajantes</h1><p>Conexões e perfis da comunidade.</p></div><input data-search aria-label="Buscar viajantes" placeholder="Buscar viajantes"></div><div class="project-grid" data-users>${users.map(userCard).join("")}</div></main>`,
    "/social",
  );
  let search = 0;
  root
    .querySelector("[data-search]")
    .addEventListener("input", async (event) => {
      const current = ++search,
        container = root.querySelector("[data-users]");
      try {
        const results = await api.users.search(event.target.value);
        if (current === search && container.isConnected)
          container.innerHTML =
            results.map(userCard).join("") ||
            "<p>Nenhum viajante encontrado.</p>";
      } catch (error) {
        toast(error.message, "error");
      }
    });
}
