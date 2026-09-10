/** Backend capability descriptors. No unsupported endpoint is called. */
export const capabilities = Object.freeze({
  jsonApi: false, auth: false, projects: false, social: false, favorites: false,
  likes: false, rankings: false, commits: false,
});

export class ApiUnavailableError extends Error {
  constructor(feature) { super(`A API para ${feature} ainda não está disponível.`); this.name = "ApiUnavailableError"; }
}
