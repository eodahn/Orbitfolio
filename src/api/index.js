import { capabilities, ApiError } from "./contracts.js";
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      body:
        options.body instanceof FormData
          ? options.body
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
    });
  } catch {
    throw new ApiError("Conexão perdida. Tente novamente.", 0);
  }
  const data =
    response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "Não foi possível concluir a operação.",
      response.status,
    );
  return data;
}
export const api = {
  capabilities,
  search: (query) => request(`/api/search?q=${encodeURIComponent(query)}`),
  projects: {
    mine: async () => (await request("/api/projects/mine")).projects,
    delete: (id) =>
      request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
    list: async (query = "") =>
      (
        await request(
          `/api/projects${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        )
      ).projects,
    get: async (id) => {
      try {
        return (await request(`/api/projects/${encodeURIComponent(id)}`))
          .project;
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    create: async (input) =>
      (await request("/api/projects", { method: "POST", body: input })).project,
  },
  users: {
    uploadAvatar: async (body) =>
      (await request("/api/account/avatar", { method: "POST", body })).user,
    section: (id, category) =>
      request(`/api/users/${encodeURIComponent(id)}/${category}`),
    update: async (input) =>
      (await request("/api/account/profile", { method: "PATCH", body: input }))
        .user,
    privacy: async (input) =>
      (await request("/api/account/privacy", { method: "PATCH", body: input }))
        .privacy,
    list: async (query = "") =>
      (
        await request(
          `/api/users${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        )
      ).users,
    get: async (id) =>
      (await request(`/api/users/${encodeURIComponent(id)}`)).user,
    search: async (query) =>
      (await request(`/api/users?q=${encodeURIComponent(query)}`)).users,
  },
  rankings: {
    featured: async (period = "week") =>
      (await request(`/api/rankings/featured?period=${period}`)).projects,
  },
  auth: {
    session: async () => (await request("/api/auth/session")).user,
    login: async (input) =>
      (await request("/api/auth/login", { method: "POST", body: input })).user,
    register: async (input) =>
      (await request("/api/auth/register", { method: "POST", body: input }))
        .user,
    logout: () => request("/api/auth/logout", { method: "POST" }),
  },
  social: {
    follow: (id) =>
      request(`/api/users/${encodeURIComponent(id)}/follow`, {
        method: "POST",
      }),
    unfollow: (id) =>
      request(`/api/users/${encodeURIComponent(id)}/follow`, {
        method: "DELETE",
      }),
    favorites: async () => (await request("/api/favorites")).projects,
    like: (id) =>
      request(`/api/projects/${encodeURIComponent(id)}/like`, {
        method: "POST",
      }),
    unlike: (id) =>
      request(`/api/projects/${encodeURIComponent(id)}/like`, {
        method: "DELETE",
      }),
    favorite: (id) =>
      request(`/api/projects/${encodeURIComponent(id)}/favorite`, {
        method: "POST",
      }),
    unfavorite: (id) =>
      request(`/api/projects/${encodeURIComponent(id)}/favorite`, {
        method: "DELETE",
      }),
  },
  github: {
    status: () => request("/api/github/status"),
    connect: () => request("/api/github/connect", { method: "POST" }),
    disconnect: () => request("/api/github/disconnect", { method: "DELETE" }),
    repositories: (page = 1) =>
      request(`/api/github/repositories?page=${page}`),
    inspect: (input) =>
      request("/api/github/repository/inspect", {
        method: "POST",
        body: input,
      }),
  },
  commits: {
    page: (id, page = 1) =>
      request(`/api/projects/${encodeURIComponent(id)}/commits?page=${page}`),
    list: async (id) =>
      (await request(`/api/projects/${encodeURIComponent(id)}/commits`))
        .commits,
  },
  progress: () => request("/api/progress"),
};
