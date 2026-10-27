import {readFileSync} from 'node:fs';
const groups=JSON.parse(readFileSync(new URL('../data/service-area-groups.json',import.meta.url))).groups;
const key=v=>String(v??'').normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function serviceAreaIncludes(areas,town){const targets=[key(town),...String(town??'').split(',').map(key)].filter(Boolean);return areas.some(area=>targets.includes(key(area))
  ||groups.some(g=>g.names.some(n=>key(n)===key(area))&&g.members.some(n=>targets.includes(key(n)))));}
const words=v=>key(v).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2).map(w=>w.replace(/(?:ing|ed|s)$/u,'').replace(/e$/u,''));
export function serviceWordsMatch(service,request){const offered=words(service),wanted=new Set(words(request));return offered.length>0&&offered.some(w=>wanted.has(w));}
