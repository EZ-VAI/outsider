/* Narrow, one-shot public HTTPS POST transport. No redirects, retries, auth or cookies. */
import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_PINNED_PUBLIC_HTTPS_ONE_USE_POST_TRANSPORT_V1_";
const NONPUBLIC4 = [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]];
const err = (code) => Object.assign(new Error(`${PREFIX}${code}`), { outsiderCode: code });
const fail = (code) => { throw err(code); };
const ip4 = (s) => s.split(".").reduce((n,p) => n * 256 + Number(p), 0) >>> 0;
const public4 = (s) => isIP(s) === 4 && !NONPUBLIC4.some(([base,bits]) =>
  (ip4(s) >>> (32-bits)) === (ip4(base) >>> (32-bits)));
function ip6(s) {
  const sides=s.toLowerCase().split("::"); if(sides.length>2)return null;
  const parse=(x)=>x?x.split(":").map((v)=>{if(!/^[0-9a-f]{1,4}$/u.test(v))fail("DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED");return BigInt(`0x${v}`);}):[];
  let a,b; try { a=parse(sides[0]); b=parse(sides[1]??""); } catch { return null; }
  const missing=8-a.length-b.length;if((sides.length===1&&missing!==0)||(sides.length===2&&missing<1))return null;
  return [...a,...Array(missing).fill(0n),...b].reduce((n,v)=>(n<<16n)|v,0n);
}
const in6=(n,base,bits)=>n>>(128n-BigInt(bits))===ip6(base)>>(128n-BigInt(bits));
function publicIp(address,family){
  if((family===4||family==="IPv4"))return public4(address);
  if(!(family===6||family==="IPv6")||isIP(address)!==6)return false;
  const n=ip6(address);return n!==null&&in6(n,"2000::",3)&&!in6(n,"2001::",23)&&!in6(n,"2001:db8::",32)&&!in6(n,"2002::",16)&&!in6(n,"3fff::",20);
}
function sameIp(a,b){if(isIP(a)!==isIP(b))return false;return isIP(a)===4?ip4(a)===ip4(b):ip6(a)===ip6(b);}
function normalizeUrl(raw){
  if(typeof raw!=="string"||Buffer.byteLength(raw)>16384)fail("URL_INVALID");let u;try{u=new URL(raw);}catch{fail("URL_INVALID");}
  const h=u.hostname.toLowerCase().replace(/\.$/u,"");
  if(u.protocol!=="https:"||u.username||u.password||u.hash||(u.port&&u.port!=="443")||isIP(h)||h==="localhost"||h.endsWith(".local")||h.endsWith(".localhost")||!h.includes("."))fail("PUBLIC_HTTPS_URL_REQUIRED");
  u.hostname=h;u.port="";return u;
}
function canonicalBody(value,max){
  const b=Buffer.isBuffer(value)?Buffer.from(value):value instanceof Uint8Array?Buffer.from(value):null;
  if(!b||b.length<2||b.length>max)fail("REQUEST_BODY_INVALID");let parsed;try{parsed=JSON.parse(b.toString("utf8"));}catch{fail("REQUEST_BODY_NOT_CANONICAL_JSON");}
  if(canonicalizeStrict(parsed)!==b.toString("utf8"))fail("REQUEST_BODY_NOT_CANONICAL_JSON");return b;
}
function defaultRequest(r){return new Promise((resolve,reject)=>{
  let cert=false;const q=httpsRequest(r.url,{method:"POST",headers:r.headers,agent:false,rejectUnauthorized:true,servername:r.hostname,signal:r.signal,family:r.family,autoSelectFamily:false,maxHeaderSize:65536,
    checkServerIdentity(host,certificate){if(host!==r.hostname)return err("TLS_SERVERNAME_BINDING_MISMATCH");const e=checkServerIdentity(host,certificate);if(!e)cert=true;return e;},
    lookup(host,options,cb){if(host.toLowerCase().replace(/\.$/u,"")!==r.hostname)return cb(err("TLS_SERVERNAME_BINDING_MISMATCH"));return options?.all?cb(null,[{address:r.address,family:r.family}]):cb(null,r.address,r.family);}},res=>{
      const chunks=[];let size=0;res.on("data",c=>{const b=Buffer.from(c);size+=b.length;if(size>r.maximumResponseBytes)res.destroy(err("RESPONSE_TOO_LARGE"));else chunks.push(b);});res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),remoteAddress:res.socket.remoteAddress,remoteFamily:res.socket.remoteFamily,tlsAuthorized:res.socket.authorized===true,tlsServernameVerified:cert,tlsCertificateHostnameVerified:cert}));res.on("error",reject);
    });q.on("socket",s=>s.once("secureConnect",()=>{if(!s.authorized||!cert||!sameIp(s.remoteAddress,r.address))q.destroy(err("TLS_REMOTE_OR_CERTIFICATE_MISMATCH"));}));q.on("error",reject);q.end(r.body);
  });}

export const OUTSIDER_PINNED_PUBLIC_HTTPS_ONE_USE_POST_TRANSPORT_V1_BOUNDARY=Object.freeze({position:"PINNED_PUBLIC_HTTPS_ONE_USE_POST_ONLY",permittedMethods:Object.freeze(["POST"]),redirectsFollowed:false,retryPerformed:false,credentialsPermitted:false,cookiesPermitted:false,attemptsPerCapability:1,authorityEstablished:false,offerEstablished:false,capacityEstablished:false,outcomeEstablished:false});

export function createPinnedPublicHttpsOneUsePostTransportV1(config={}){
  const lookupImpl=config.lookupImpl??dnsLookup,requestImpl=config.requestImpl??defaultRequest,timeoutMs=config.timeoutMs??8000,maxReq=config.maximumRequestBytes??1048576,maxRes=config.maximumResponseBytes??2097152;
  if(typeof lookupImpl!=="function"||typeof requestImpl!=="function"||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maxReq)||maxReq<2||maxReq>8388608||!Number.isSafeInteger(maxRes)||maxRes<1||maxRes>8388608)fail("CONFIG_INVALID");
  let used=false;
  return async function post(rawUrl,options){
    if(used)fail("TRANSPORT_ALREADY_CONSUMED");used=true;
    if(!options||Object.getPrototypeOf(options)!==Object.prototype||Reflect.ownKeys(options).sort().join(",")!=="body,credentials,headers,method,redirect,signal")fail("FETCH_OPTIONS_FIELDS_INVALID");
    if(options.method!=="POST")fail("METHOD_FORBIDDEN");if(options.redirect!=="error")fail("REDIRECT_POLICY_REQUIRED");if(options.credentials!=="omit")fail("CREDENTIALS_OMIT_REQUIRED");
    const keys=options.headers&&Object.keys(options.headers);if(!keys||keys.length!==2||options.headers["Content-Type"]!=="application/json"||options.headers.Accept!=="application/json")fail("EXACT_HEADERS_REQUIRED");
    const signal=options.signal;if(!signal||typeof signal.addEventListener!=="function")fail("ABORT_SIGNAL_REQUIRED");if(signal.aborted)fail("ABORTED");
    const url=normalizeUrl(rawUrl),body=canonicalBody(options.body,maxReq),controller=new AbortController();let timer,abort;
    const abortPromise=new Promise(resolve=>{abort=()=>{controller.abort();resolve({kind:"ABORTED"});};signal.addEventListener("abort",abort,{once:true});});
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({kind:"TIMEOUT"});},timeoutMs);});
    const work=(async()=>{const rows=await lookupImpl(url.hostname,{all:true,verbatim:true,signal:controller.signal});if(!Array.isArray(rows)||rows.length<1||rows.length>16)fail("DNS_RESOLUTION_REFUSED");for(const row of rows)if(!row||!publicIp(row.address,row.family))fail("DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED");const selected=rows[0];const raw=await requestImpl({url:url.href,hostname:url.hostname,address:selected.address,family:selected.family===6||selected.family==="IPv6"?6:4,method:"POST",headers:Object.freeze({Accept:"application/json","Content-Type":"application/json",Connection:"close"}),body,signal:controller.signal,maximumResponseBytes:maxRes});
      if(!raw||!Number.isSafeInteger(raw.status)||raw.status<100||raw.status>599||raw.tlsAuthorized!==true||raw.tlsServernameVerified!==true||raw.tlsCertificateHostnameVerified!==true||!sameIp(raw.remoteAddress,selected.address))fail("TLS_REMOTE_OR_CERTIFICATE_MISMATCH");const rb=Buffer.from(raw.body??"");if(rb.length>maxRes)fail("RESPONSE_TOO_LARGE");const headers=raw.headers??{};return{kind:"RESPONSE",value:Object.freeze({status:raw.status,headers:Object.freeze({get(name){const v=headers[name.toLowerCase()]??headers[name]??null;return Array.isArray(v)?v.join(", "):v;}}),body:null,async text(){return rb.toString("utf8");}})};})().catch(error=>({kind:"ERROR",error}));
    try{const out=await Promise.race([work,timeout,abortPromise]);if(out.kind==="TIMEOUT")fail("TIMEOUT");if(out.kind==="ABORTED")fail("ABORTED");if(out.kind==="ERROR")throw out.error?.outsiderCode?out.error:err("TRANSPORT_UNAVAILABLE");return out.value;}finally{clearTimeout(timer);signal.removeEventListener("abort",abort);controller.abort();}
  };
}
