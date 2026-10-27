import { hash } from "../src/utils/seed.js";
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
const aliases = {js:'JavaScript',ts:'TypeScript',csharp:'C#',cpp:'C++',bash:'Shell','shell/bash':'Shell',yml:'YAML',latex:'TeX',postgres:'PostgreSQL','html/css':'HTML'};
export function normalizeLanguage(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  const key = name.toLowerCase();
  return (Object.hasOwn(aliases, key) ? aliases[key] : null) || names.get(key) || key;
}
export function languageColor(name) {
  const canonical = normalizeLanguage(name);
  return (Object.hasOwn(LANGUAGE_COLORS, canonical) ? LANGUAGE_COLORS[canonical] : null) || `hsl(${hash(canonical)%360}, 55%, 57%)`;
}

/** @typedef {'WEB_FRONTEND'|'BACKEND'|'CONFIG'|'DATABASE'|'MARKUP'|'UNKNOWN'} TechnologyCategory */
const categories = {
  WEB_FRONTEND: ['HTML','CSS','JavaScript','TypeScript','SCSS','SASS','Vue','Svelte','WebAssembly'],
  BACKEND: ['Python','Java','C','C++','C#','PHP','Ruby','Go','Rust','Kotlin','Swift','Elixir','Scala','Dart','Lua','R','Julia','Perl','Haskell','Clojure','Erlang','Zig','Nim','OCaml','Fortran','Assembly'],
  CONFIG: ['Shell','PowerShell','Dockerfile','Makefile','Nix'],
  DATABASE: ['SQL','PostgreSQL','MySQL','PLpgSQL','GraphQL'],
  MARKUP: ['Markdown','JSON','YAML','TeX'],
};
/** Single source of color/category for DOM and Three.js. */
export const TECHNOLOGY_VISUALS = Object.freeze(Object.fromEntries(Object.entries(categories).flatMap(([category,names]) => names.map(name => [name,Object.freeze({name,color:LANGUAGE_COLORS[name],category})]))));
export function technologyVisual(name) {
  const canonical = normalizeLanguage(name);
  return TECHNOLOGY_VISUALS[canonical] && Object.hasOwn(TECHNOLOGY_VISUALS,canonical)
    ? TECHNOLOGY_VISUALS[canonical] : {name:canonical,color:languageColor(canonical),category:'UNKNOWN'};
}
export function classifyTechnologies(languages) {
  const tagged = languages.map(item => ({...item,category:technologyVisual(item.name).category}));
  const base = tagged.find(item => item.category === 'WEB_FRONTEND') || tagged[0] || {name:'Unknown',color:LANGUAGE_COLORS.Unknown,percentage:0};
  const backends = tagged.filter(item => item.category === 'BACKEND');
  const moons = backends.slice(0,4);
  if (backends.length > 4) {
    const members = backends.slice(3), percentage = members.reduce((sum,item)=>sum+item.percentage,0);
    moons[3] = {name:'Outros Backend',percentage,color:LANGUAGE_COLORS.Outros,members};
  }
  return {base, moons, rings:tagged.filter(item=>item.category === 'CONFIG'),
    surface:tagged.filter(item=>item !== base && ['WEB_FRONTEND','DATABASE','MARKUP','UNKNOWN'].includes(item.category))};
}
