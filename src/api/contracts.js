/** Public capabilities provided by the local Orbitfolio JSON API. */
export const capabilities = Object.freeze({ jsonApi:true, auth:true, projects:true, social:true, favorites:true, likes:true, rankings:true, commits:true, search:true });
export class ApiError extends Error { constructor(message, status = 500) { super(message); this.name = "ApiError"; this.status = status; } }
