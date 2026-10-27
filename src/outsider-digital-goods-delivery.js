/* A buyer's native digital order -> its issued download -> private received
 * bytes. No browser, email scraping, account creation or public redistribution.
 * A local file receipt is not an independent inspector or usage licence. */
import path from 'node:path';
import {existsSync,mkdirSync,writeFileSync,lstatSync,openSync,readSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createWooCommerceBuyerFetch} from './outsider-woocommerce-buyer-transport.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from './outsider-user-held-durable-execution-v2.js';
const read=f=>JSON.parse(readPrivateExecutionBytes(f));
const hash=b=>`sha256:${createHash('sha256').update(b).digest('hex')}`;
const fail=c=>{throw Object.assign(new Error(c),{code:c});};
function fileHash(file){
  const fd=openSync(file,'r'),h=createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);
  try{let length;while((length=readSync(fd,buffer,0,buffer.length,null))>0)h.update(buffer.subarray(0,length));}
  finally{closeSync(fd);}return `sha256:${h.digest('hex')}`;
}
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&#038;','&').replaceAll('&#38;','&').replaceAll('&quot;','"');
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([a-zA-Z_-]+)\s*=\s*(["'])(.*?)\2/gu)].map(m=>[m[1].toLowerCase(),decode(m[3])]));
export function createDigitalGoodsDelivery({directory,buyer,origin,fetchImpl,clock=()=>new Date().toISOString()}){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const receiptFile=path.join(directory,'received-file.json');
  async function receive(url,maximumResponseBytes,outputFile=null){
    for(let hop=0;hop<4;hop++){
      const u=new URL(url);
      if(u.protocol!=='https:'||u.username||u.password||u.hash)fail('DIGITAL_GOODS_DELIVERY_URL_INVALID');
      // Only merchant-issued URLs and their explicit redirects. A new public
      // DNS-pinned transport per hop sends no cookies, auth or referer onward.
      const transport=fetchImpl??createWooCommerceBuyerFetch(u.origin,{buyerDeliveryUrl:u.href,maximumResponseBytes,
        ...(outputFile?{buyerDeliveryFile:outputFile}:{})});
      const r=await transport(u.href,{method:'GET',headers:{Accept:'application/octet-stream,text/html'},redirect:'manual'});
      const bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length>maximumResponseBytes)fail('DIGITAL_GOODS_DELIVERY_TOO_LARGE');
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');if(!location)fail('DIGITAL_GOODS_REDIRECT_INVALID');
        url=new URL(location,u).href;continue;
      }
      if(r.status!==200)fail(`DIGITAL_GOODS_DELIVERY_HTTP_${r.status}`);
      return {bytes,...(r.fileReceipt?{fileReceipt:r.fileReceipt}:{}),contentType:r.headers.get('content-type')??'',observedAt:clock(),sourceUrlHash:hash(url)};
    }
    fail('DIGITAL_GOODS_TOO_MANY_REDIRECTS');
  }
  async function verifyBuyerReceipt(page,reference){
    const forms=[...page.bytes.toString('utf8').matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)]
      .filter(m=>attributes(m[0].slice(0,m[0].indexOf('>')+1)).class?.split(/\s+/u).includes('woocommerce-verify-email'));
    if(!forms.length)return page;
    if(forms.length!==1)fail('DIGITAL_GOODS_BUYER_VERIFICATION_FORM_INVALID');
    const form=forms[0][0],tag=attributes(form.slice(0,form.indexOf('>')+1));
    if(tag.method?.toLowerCase()!=='post'||new URL(tag.action??'',reference.url).href!==reference.url)
      fail('DIGITAL_GOODS_BUYER_VERIFICATION_FORM_INVALID');
    const fields=Object.fromEntries([...form.matchAll(/<input\b[^>]*>/giu)].map(m=>attributes(m[0]))
      .filter(a=>a.type==='hidden').map(a=>[a.name,a.value??'']));
    if(!/^[a-zA-Z0-9]{8,32}$/u.test(fields.check_submission??'')
      ||Object.keys(fields).some(k=>!['check_submission','_wp_http_referer'].includes(k)))fail('DIGITAL_GOODS_BUYER_VERIFICATION_FORM_INVALID');
    // Standard Woo guest-order verification, not a new purchase or account.
    // Reuse only this accepted order's approved email and its issued nonce.
    // No form body follows redirects or leaves the exact merchant receipt URL.
    const transport=fetchImpl??createWooCommerceBuyerFetch(origin,{buyerDeliveryUrl:reference.url,
      buyerReceiptVerification:true,maximumResponseBytes:700000});
    const response=await transport(reference.url,{method:'POST',redirect:'error',headers:{Accept:'text/html',
      'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,email:reference.billingEmail,verify:'1'}).toString()});
    const bytes=Buffer.from(await response.arrayBuffer());
    if(response.status!==200||bytes.length>700000||!/html/iu.test(response.headers.get('content-type')??''))
      fail('DIGITAL_GOODS_BUYER_VERIFICATION_NOT_COMPLETED');
    return {bytes,contentType:response.headers.get('content-type'),observedAt:clock(),sourceUrlHash:hash(reference.url),
      guestEmailVerificationPerformed:true};
  }
  function inspect(){
    if(!existsSync(receiptFile))return null;
    const receipt=read(receiptFile),file=path.join(directory,receipt.fileName),stat=lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||stat.size!==receipt.artifactBytes
      ||fileHash(file)!==receipt.artifactHash)fail('DIGITAL_GOODS_RECEIVED_FILE_CHANGED');
    return receipt;
  }
  return {inspect,
    async acquire(){
      const previous=inspect();if(previous)return previous;
      const order=await buyer.readOrder();
      if(!order.sellerOrderAccepted||order.needsPayment!==false||order.totalAmountMinor!=='0')fail('DIGITAL_GOODS_ACCEPTED_ZERO_TOTAL_ORDER_REQUIRED');
      const reference=buyer.digitalReceiptReference();
      const page=await verifyBuyerReceipt(await receive(reference.url,700000),reference);
      if(!/html/iu.test(page.contentType))fail('DIGITAL_GOODS_BUYER_RECEIPT_HTML_REQUIRED');
      const {bytes:pageBytes,...pageMetadata}=page;
      writeOnce(path.join(directory,`merchant-receipt-${randomUUID()}.json`),{...pageMetadata,
        bodyBase64:page.bytes.toString('base64'),bodyHash:hash(page.bytes),bodyBytes:page.bytes.length});
      const links=new Map();
      for(const m of page.bytes.toString('utf8').matchAll(/href\s*=\s*["']([^"']+)["']/giu)){
        let u;try{u=new URL(decode(m[1]),origin);}catch{continue;}
        if(u.origin!==origin||u.searchParams.get('download_file')!==String(reference.productId)
          ||u.searchParams.get('order')!==reference.orderKey)continue;
        links.set(u.href,u);
      }
      if(links.size!==1)fail(links.size?'DIGITAL_GOODS_DOWNLOAD_SELECTION_REQUIRED':'DIGITAL_GOODS_DOWNLOAD_ENTITLEMENT_NOT_ISSUED');
      const fileName=`asset-${randomUUID()}.zip`,payload=await receive([...links.keys()][0],1024*1024*1024,path.join(directory,fileName));
      const artifactBytes=payload.fileReceipt?.artifactBytes??payload.bytes.length,
        artifactHash=payload.fileReceipt?.artifactHash??hash(payload.bytes),
        prefix=payload.fileReceipt?.prefix??payload.bytes.subarray(0,4),tail=payload.fileReceipt?.tail??payload.bytes;
      // This initial contract is an actual nonempty ZIP package, not a login
      // page downloaded with a .zip name. It does not execute embedded files.
      if(artifactBytes<22||!['504b0304','504b0506'].includes(prefix.toString('hex'))
        ||/html|json/iu.test(payload.contentType))fail('DIGITAL_GOODS_ZIP_PACKAGE_NOT_RECEIVED');
      const end=tail.lastIndexOf(Buffer.from('504b0506','hex')),absoluteEnd=artifactBytes-tail.length+end;
      if(end<0||end+22>tail.length||end+22+tail.readUInt16LE(end+20)!==tail.length
        ||tail.readUInt32LE(end+16)+tail.readUInt32LE(end+12)>absoluteEnd)
        fail('DIGITAL_GOODS_ZIP_PACKAGE_INCOMPLETE');
      if(!payload.fileReceipt)writeFileSync(path.join(directory,fileName),payload.bytes,{flag:'wx',mode:0o600});
      const result={schema:'outsider/native-digital-goods-delivery/v1',fileName,artifactHash,artifactBytes,
        archiveEntryCount:tail.readUInt16LE(end+10),orderRefHash:order.orderRefHash,merchantOrigin:origin,merchantOrderReceipt:order.receipt,
        entitlementReceiptHash:hash(page.bytes),sourceUrlHash:payload.sourceUrlHash,receivedAt:payload.observedAt,
        contentType:payload.contentType,deliveryObservation:'LOCAL_BUYER_RECEIVED_ZIP_BYTES',
        independentOfBeneficiary:false,redistributionAuthorized:false,paymentPerformed:false,accountCreated:false};
      writeOnce(receiptFile,result);return inspect();
    }};
}
