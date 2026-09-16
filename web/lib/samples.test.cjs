const test = require('node:test')
const assert = require('node:assert/strict')
const MAX = 240
const scopeKey = (chainId, contract) => `signal:v1:${chainId}:${contract.toLowerCase()}:network`
const validSamples = value => Array.isArray(value) ? value.filter(x => x && x.ok === true && typeof x.observedAt === 'string' && Number.isFinite(x.block?.ageSeconds) && Number.isFinite(x.block?.latencyMs) && Number.isFinite(x.block?.number)).slice(-MAX) : []
test('network history scope includes chain and lowercase contract', () => { assert.equal(scopeKey(968, '0xAB'), 'signal:v1:968:0xab:network') })
test('sample validator excludes failures and malformed observations', () => { assert.equal(validSamples([{ ok:false }, {}, { ok:true, observedAt:'t', block:{ageSeconds:1,latencyMs:2,number:3} }]).length, 1) })
test('sample retention is bounded and keeps newest entries', () => { const list=Array.from({length:241},(_,i)=>({ok:true,observedAt:String(i),block:{ageSeconds:1,latencyMs:2,number:i}})); const result=validSamples(list); assert.equal(result.length,240); assert.equal(result[0].observedAt,'1') })
