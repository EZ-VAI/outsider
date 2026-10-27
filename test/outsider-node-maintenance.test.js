import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutcomeNodeMaintenance} from '../src/outsider-node-maintenance.js';

test('immediately resolved background phases leave the event loop available to customer requests',async()=>{
  let requestHandled=false;
  const maintenance=createOutcomeNodeMaintenance({phases:[
    {name:'FIRST_PHASE',run:async()=>{setImmediate(()=>{requestHandled=true;});}},
    {name:'NEXT_PHASE',run:async()=>assert.equal(requestHandled,true)},
  ]});
  assert.ok((await maintenance.run()).every(row=>row.ok));
});

test('an unavailable provider inbox does not starve due orders, follow-up or expiry', async () => {
  const calls=[], failures=[];
  let unavailable=true;
  const maintenance=createOutcomeNodeMaintenance({phases:[
    {name:'PROVIDER_EVENTS',run:async()=>{calls.push('events');if(unavailable)throw new Error('private provider details');}},
    {name:'DUE_TASKS',run:async()=>calls.push('due')},
    {name:'RETAIL_FOLLOWUP',run:async()=>calls.push('retail')},
    {name:'RESOURCE_GRAPH_EXPIRY',run:async()=>calls.push('expiry')},
  ],onFailure:phase=>failures.push(phase)});
  const first=await maintenance.run();
  assert.deepEqual(calls,['events','due','retail','expiry']);
  assert.deepEqual(failures,['PROVIDER_EVENTS']);
  assert.deepEqual(first.map(row=>row.ok),[false,true,true,true]);
  unavailable=false;
  assert.ok((await maintenance.run()).every(row=>row.ok));
  assert.deepEqual(calls,['events','due','retail','expiry','events','due','retail','expiry']);
  await maintenance.close();
});

test('overlapping ticks share the same work and shutdown drains the current operation', async () => {
  const calls=[];let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const maintenance=createOutcomeNodeMaintenance({phases:[
    {name:'PROVIDER_EVENTS',run:async()=>{calls.push('start');await pending;calls.push('saved');}},
    {name:'DUE_TASKS',run:async()=>calls.push('next')},
  ]});
  const first=maintenance.run();assert.equal(maintenance.run(),first);
  let closed=false;const close=maintenance.close().then(()=>{closed=true;});
  await Promise.resolve();assert.equal(closed,false);
  release();await close;
  assert.deepEqual(calls,['start','saved']);
  assert.deepEqual(await maintenance.run(),[]);
});
