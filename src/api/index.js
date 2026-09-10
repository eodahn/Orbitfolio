import { capabilities, ApiUnavailableError } from "./contracts.js";
import { developmentProjects, developmentUsers } from "../mocks/development-data.js";

// Swap this adapter for a server adapter when documented JSON endpoints exist.
const developmentAdapter = {
  getProjects: async () => developmentProjects,
  getProject: async (id) => developmentProjects.find((project) => project.id === id) ?? null,
  getUsers: async () => developmentUsers,
  getUser: async (id) => developmentUsers.find((user) => user.id === id) ?? null,
  getFeatured: async () => [...developmentProjects].sort((a, b) => b.likes - a.likes),
};
const unsupported = (name) => async () => { throw new ApiUnavailableError(name); };

export const api = {
  capabilities,
  projects: { list: developmentAdapter.getProjects, get: developmentAdapter.getProject, create: unsupported("criação de projetos") },
  users: { list: developmentAdapter.getUsers, get: developmentAdapter.getUser, search: unsupported("pesquisa de usuários") },
  rankings: { featured: developmentAdapter.getFeatured },
  auth: { session: unsupported("sessão"), login: unsupported("login via API"), register: unsupported("cadastro via API"), logout: unsupported("logout via API") },
  social: { follow: unsupported("seguir usuários"), unfollow: unsupported("deixar de seguir"), favorites: unsupported("favoritos"), like: unsupported("curtidas") },
  commits: { list: unsupported("commits") }
};
