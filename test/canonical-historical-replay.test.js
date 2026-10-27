import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalizeStrict} from '../src/canonical.js';
import {canonicalizeStrictBoundedArtifact} from '../src/canonical-historical-replay.js';

test('a larger historical member budget does not enlarge the normal input budget',()=>{
  const archived=Array.from({length:70000},(_,i)=>i);
  assert.throws(()=>canonicalizeStrict(archived),/canonical member budget exceeded/);
  assert.equal(canonicalizeStrictBoundedArtifact(archived),JSON.stringify(archived));
});
test('historical serialization preserves exact canonical bytes and rejects accessors',()=>{
  const archived={z:[true,null,17],a:{message:'frozen evidence'}};
  assert.equal(canonicalizeStrictBoundedArtifact(archived),canonicalizeStrict(archived));
  let reads=0;const dangerous={};Object.defineProperty(dangerous,'value',{enumerable:true,get(){reads++;return 'unexpected';}});
  assert.throws(()=>canonicalizeStrictBoundedArtifact(dangerous));assert.equal(reads,0);
});
