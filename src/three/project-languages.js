import { hash } from "../utils/seed.js";
export const LANGUAGE_COLORS = Object.freeze({
  HTML:'#e34c26', CSS:'#563d7c', JavaScript:'#f1e05a', TypeScript:'#3178c6',
  SCSS:'#c6538c', SASS:'#c6538c', Vue:'#41b883', Svelte:'#ff3e00', WebAssembly:'#654ff0',
  Python:'#3572A5', Java:'#b07219', C:'#555555', 'C++':'#f34b7d', 'C#':'#178600',
  PHP:'#4F5D95', Ruby:'#701516', Go:'#00ADD8', Rust:'#dea584', Kotlin:'#A97BFF',
  Swift:'#F05138', Elixir:'#6e4a7e', Scala:'#c22d40', Dart:'#00B4AB', Lua:'#000080',
  R:'#198CE7', Julia:'#a270ba', Perl:'#0298c3', Haskell:'#5e5086', Clojure:'#db5855',
  Erlang:'#B83998', Zig:'#ec915c', Nim:'#ffc200', OCaml:'#3be133', Fortran:'#4d41b1',
  Assembly:'#6E4C13', Shell:'#89e051', Bash:'#89e051', PowerShell:'#012456',
  Dockerfile:'#384d54', Makefile:'#427819', Nix:'#7e78d5', SQL:'#e38c00',
  PostgreSQL:'#e38c00', MySQL:'#e38c00', PLpgSQL:'#336791', GraphQL:'#e10098',
  Markdown:'#083fa1', JSON:'#292929', YAML:'#cb171e', TeX:'#3D6117', LaTeX:'#3D6117',
  Outros:'#8b91a4', Unknown:'#748399',
});
const names = new Map(Object.keys(LANGUAGE_COLORS).map(name=>[name.toLowerCase(),name]));
const aliases = {js:'JavaScript',ts:'TypeScript',csharp:'C#',cpp:'C++',bash:'Shell','shell/bash':'Shell',yml:'YAML',latex:'TeX'};
export function normalizeLanguage(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  const key = name.toLowerCase();
  return (Object.hasOwn(aliases, key) ? aliases[key] : null) || names.get(key) || key;
}
export function languageColor(name) {
  const canonical = normalizeLanguage(name);
  return (Object.hasOwn(LANGUAGE_COLORS, canonical) ? LANGUAGE_COLORS[canonical] : null) || `hsl(${hash(canonical)%360}, 55%, 57%)`;
}
const amount = value => {
  if (value == null || typeof value === 'boolean' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
function entries(source, byteMode = false) {
  if (Array.isArray(source)) return source.map(item=>typeof item === 'string'
    ? [item,null] : [item?.name,item?.[byteMode?'bytes':'percentage']]);
  return source && typeof source === 'object' ? Object.entries(source) : [];
}
export function parseProjectLanguages(project = {}) {
  // Prefer server-supplied GitHub bytes; frontend percentages never override them.
  const bytes = entries(project.languageBytes ?? project.github?.languageBytes, true);
  const useBytes = bytes.some(([name,value])=>normalizeLanguage(name) && amount(value)>0);
  const raw = (useBytes ? bytes : entries(project.languages)).map(([name,value])=>({
    name:normalizeLanguage(name),value:amount(value),
  })).filter(item=>item.name);
  const hasValues = raw.some(item=>item.value>0);
  const weights = new Map();
  const scale = raw.reduce((max, item) => Math.max(max, item.value || 0), 1);
  for (const item of raw) {
    const weight = hasValues ? (item.value ?? 0) / scale : 1;
    weights.set(item.name,(weights.get(item.name)||0)+weight);
  }
  let total = [...weights.values()].reduce((a,b)=>a+b,0);
  const languages = [...weights].filter(([,weight])=>weight>0).map(([name,weight])=>({
    name, percentage:weight/total*100, color:languageColor(name), estimated:!hasValues,
  })).sort((a,b)=>b.percentage-a.percentage || a.name.localeCompare(b.name,'en'));
  if (!languages.length) return {languages:[],dominant:{name:'Unknown',percentage:0,color:LANGUAGE_COLORS.Unknown},secondary:[],others:null};
  const secondary = languages.slice(1,5);
  let others = null;
  if (languages.length > 5) {
    // Reserve the fourth moon for all languages after the three largest secondaries.
    const members = languages.slice(4);
    others = {name:'Outros',percentage:members.reduce((sum,item)=>sum+item.percentage,0),color:LANGUAGE_COLORS.Outros,members};
    secondary.splice(3,1,others);
  }
  return {languages,dominant:languages[0],secondary,others};
}
