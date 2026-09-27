// Pure normalization shared by API validation and UI; never performs network requests.
export function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const u = new URL(String(value).trim());
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.href.length > 2048
    )
      return "";
    return u.href;
  } catch {
    return "";
  }
}
export function githubRepositoryUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return "";
  const u = new URL(safe);
  if (
    u.hostname.toLowerCase() !== "github.com" ||
    u.port ||
    !/^\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+\/?$/.test(u.pathname)
  )
    return "";
  const [owner, name] = u.pathname.split("/").slice(1);
  if ([".", "..", ""].includes(name.replace(/\.git$/, ""))) return "";
  return `https://github.com/${owner}/${name.replace(/\.git$/, "")}`;
}
export function projectLinks(project) {
  const github = githubRepositoryUrl(
      project.githubUrl || project.repositoryUrl,
    ),
    external =
      safeHttpUrl(project.demoUrl) ||
      (!github ? safeHttpUrl(project.repositoryUrl) : "");
  return { github, external, primary: external || github };
}
