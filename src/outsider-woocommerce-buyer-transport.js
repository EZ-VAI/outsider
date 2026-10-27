/* New buyer transport; the frozen anonymous read-only and one-use POST
 * transports remain unchanged. One public store origin, no redirects/cookies,
 * and only this adapter's session token. DNS is pinned for the TLS request. */
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import {openSync,closeSync,writeSync,unlinkSync} from 'node:fs';
import {isAbsolute,basename} from 'node:path';
import {createHash} from 'node:crypto';

const excluded = new BlockList();
for (const [address, bits] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],
  ["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],
  ["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]])
  excluded.addSubnet(address, bits, "ipv4");
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function wooCommerceStoreOrigin(value) {
  let url; try { url = new URL(value); } catch { fail("RETAIL_STORE_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search
    || url.pathname !== "/" || isIP(url.hostname) || !url.hostname.includes(".")
    || /\.(local|localhost|internal)$/iu.test(url.hostname)) fail("RETAIL_STORE_URL_INVALID");
  return url.origin;
}
export function createWooCommerceBuyerFetch(origin, {buyerDeliveryUrl, buyerReceiptVerification=false, buyerDeliveryFile,
  maximumResponseBytes=2*1024*1024}={}) {
  origin = wooCommerceStoreOrigin(origin);
  if(buyerDeliveryFile&&(!isAbsolute(buyerDeliveryFile)||!/^asset-[a-f0-9-]+\.zip$/u.test(basename(buyerDeliveryFile))||!buyerDeliveryUrl))
    fail('RETAIL_DELIVERY_FILE_INVALID');
  if(!Number.isSafeInteger(maximumResponseBytes)||maximumResponseBytes<1||maximumResponseBytes>(buyerDeliveryFile?1024*1024*1024:128*1024*1024))
    fail('RETAIL_RESPONSE_LIMIT_INVALID');
  return async (url, options = {}) => {
    const target = new URL(url);
    const delivery=(options.method==='GET'||buyerReceiptVerification&&options.method==='POST')&&target.href===buyerDeliveryUrl;
    if (target.origin !== origin || target.username || target.password || target.hash
      || !delivery&&!target.pathname.startsWith("/wp-json/wc/store/v1")
      || !["GET", "POST", "DELETE"].includes(options.method)) fail("RETAIL_TRANSPORT_SCOPE_INVALID");
    const addresses = await lookup(target.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some(row => excluded.check(row.address, "ipv4"))) fail("RETAIL_PUBLIC_ADDRESS_REQUIRED");
    const address = addresses[0].address;
    const headers = { Accept: "application/json", Connection: "close" };
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (!["accept", "content-type", "cart-token"].includes(key.toLowerCase())
        || typeof value !== "string" || value.length > 8192 || /[\r\n\0]/u.test(value)) fail("RETAIL_HEADER_INVALID");
      headers[key] = value;
    }
    if (options.body && Buffer.byteLength(options.body) > 32768) fail("RETAIL_REQUEST_TOO_LARGE");
    return new Promise((resolve, reject) => {
      let fd=null,created=false,finished=false;
      const rejected=error=>{
        if(finished)return;
        if(fd!==null){closeSync(fd);fd=null;}
        if(created){unlinkSync(buyerDeliveryFile);created=false;}
        reject(error);
      };
      const req = request(target, { method: options.method, headers, agent: false, family: 4,
        autoSelectFamily: false, signal: AbortSignal.timeout(buyerDeliveryFile?180000:delivery?60000:12000), maxHeaderSize: 32768,
        lookup(host, settings, callback) {
          if (host !== target.hostname) return callback(new Error("RETAIL_DNS_BINDING_INVALID"));
          settings?.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4);
        } }, res => {
        const chunks = []; let length = 0,prefix=Buffer.alloc(0),tail=Buffer.alloc(0);
        const disk=!!buyerDeliveryFile&&delivery&&options.method==='GET'&&res.statusCode===200,hasher=disk?createHash('sha256'):null;
        res.on("error", rejected);
        if(disk){try{fd=openSync(buyerDeliveryFile,'wx',0o600);created=true;}catch(error){res.destroy(error);return;}}
        res.on("data", chunk => { length += chunk.length;
          if (length > (disk?maximumResponseBytes:Math.min(maximumResponseBytes,2*1024*1024)))res.destroy(new Error('RETAIL_RESPONSE_TOO_LARGE'));
          else if(disk){try{
            let offset=0;while(offset<chunk.length)offset+=writeSync(fd,chunk,offset,chunk.length-offset);
            hasher.update(chunk);if(prefix.length<4)prefix=Buffer.concat([prefix,chunk]).subarray(0,4);
            tail=Buffer.concat([tail,chunk]).subarray(-65557);
          }catch(error){res.destroy(error);}}
          else chunks.push(chunk);
        });
        res.on("end", () => {if(fd!==null){closeSync(fd);fd=null;}finished=true;resolve({ status: res.statusCode, headers: new Headers(Object.entries(res.headers)
          .filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])),
          ...(disk?{fileReceipt:{artifactBytes:length,artifactHash:`sha256:${hasher.digest('hex')}`,prefix,tail}}:{}),
          arrayBuffer: async () => Buffer.concat(chunks) });});
      });
      req.on("error", rejected); req.end(options.body);
    });
  };
}
