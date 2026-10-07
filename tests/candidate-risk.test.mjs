import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidateRisk} from '../lib/candidate-risk.ts';

test('high board, thin liquidity and sealed limit are cautions, not hidden candidates',()=>{
  const risk=assessCandidateRisk({pct:10,amountYi:.4,height:6,limit:'U',limitDataReady:true,openTimes:0,asOf:'2026-09-30 15:00'});
  assert.equal(risk.level,'注意');
  assert.ok(risk.flags.some(x=>x.includes('流动性')));
  assert.ok(risk.flags.some(x=>x.includes('实际可成交性')));
  assert.ok(risk.flags.some(x=>x.includes('高位连板')));
});
test('a normally traded candidate is not marked suspended or unverified',()=>{
  const risk=assessCandidateRisk({pct:2,amountYi:5,height:0,limit:null,limitDataReady:true,openTimes:null,asOf:'2026-09-30 15:00'});
  assert.equal(risk.level,'一般');
  assert.deepEqual(risk.flags,[]);
});
test('a missing official board list is distinguished from a clean result',()=>{
  const risk=assessCandidateRisk({pct:2,amountYi:5,height:null,limit:null,limitDataReady:false,openTimes:null,asOf:'2026-09-30 15:00'});
  assert.equal(risk.level,'待核验');
  assert.deepEqual(risk.flags,['涨跌停名单未核验']);
});
