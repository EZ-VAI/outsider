// One platform connection, not per-merchant registration. Address grant is
// scoped to the expressly approved goal and seller, never Global Catalog.
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
const [nodeDirectory, endpointFile, approvedQuoteFile, goalRequestId] = process.argv.slice(2);
if (![nodeDirectory,endpointFile,approvedQuoteFile].every(p=>path.isAbsolute(p??'')) || !goalRequestId) throw new Error('CONNECTION_ARGUMENTS_INVALID');
const endpoint=JSON.parse(readFileSync(endpointFile)), approved=JSON.parse(readFileSync(approvedQuoteFile));
if(!endpoint.readbackMatched || approved.storeUrl!=='https://verabradley.com')throw new Error('QUOTATION_APPROVAL_SCOPE_MISMATCH');
const folder=path.join(nodeDirectory,'connections');mkdirSync(folder,{recursive:true,mode:0o700});
writeOnce(path.join(folder,'shopify-ucp.json'),{schema:'outsider/shopify-ucp-connection/v1',profileUrl:endpoint.profileUrl,
  profileHash:`sha256:${endpoint.sha256}`,catalogMarketOnly:true,paymentEnabled:false,
  quoteAddressGrants:[{requestIds:[goalRequestId],origins:[approved.storeUrl],address:approved.address,
    expiresAt:'2026-09-12T00:00:00Z',authorization:approved.authorization}]});
console.log(JSON.stringify({connected:true,profileUrl:endpoint.profileUrl,goalRequestId,addressPublished:false,paymentEnabled:false}));
