import { escapeHtml as e } from "../utils/html.js";
export function avatar(user) {
  return user.avatarUrl &&
    (/^https?:\/\//i.test(user.avatarUrl) ||
      /^\/api\/users\/[^/]+\/avatar(?:\?v=[a-zA-Z0-9-]+)?$/.test(
        user.avatarUrl,
      ))
    ? `<span class="avatar avatar-frame"><img src="${e(user.avatarUrl)}" alt="Foto de ${e(user.name)}" referrerpolicy="no-referrer" style="object-position:${Number(user.avatarOffsetX ?? 50)}% ${Number(user.avatarOffsetY ?? 50)}%;transform:scale(${Number(user.avatarZoom || 1)});transform-origin:${Number(user.avatarOffsetX ?? 50)}% ${Number(user.avatarOffsetY ?? 50)}%"></span>`
    : `<span class="avatar avatar-fallback" role="img" aria-label="Avatar de ${e(user.name)}">${e(user.name.slice(0, 2).toUpperCase())}</span>`;
}
export function userCard(user) {
  return `<article class="project-card user-card">${avatar(user)}<div><h3>${e(user.name)}</h3><p>@${e(user.username)}</p><p>${e(user.bio)}</p><a class="button" data-route href="/user/${encodeURIComponent(user.id)}">Visualizar conta</a></div></article>`;
}
