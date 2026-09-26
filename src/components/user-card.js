import { escapeHtml as e } from "../utils/html.js";
export function avatar(user) {
  return user.avatarUrl && /^https?:\/\//i.test(user.avatarUrl)
    ? `<img class="avatar" src="${e(user.avatarUrl)}" alt="Foto de ${e(user.name)}" referrerpolicy="no-referrer">`
    : `<span class="avatar avatar-fallback" role="img" aria-label="Avatar de ${e(user.name)}">${e(user.name.slice(0, 2).toUpperCase())}</span>`;
}
export function userCard(user) {
  return `<article class="project-card user-card">${avatar(user)}<div><h3>${e(user.name)}</h3><p>@${e(user.username)}</p><p>${e(user.bio)}</p><a class="button" data-route href="/user/${encodeURIComponent(user.id)}">Visualizar conta</a></div></article>`;
}
