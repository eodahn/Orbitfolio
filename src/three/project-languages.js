import { LANGUAGE_COLORS, normalizeLanguage, languageColor } from "../../shared/technology-visuals.js";
export { LANGUAGE_COLORS, normalizeLanguage, languageColor } from "../../shared/technology-visuals.js";
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
