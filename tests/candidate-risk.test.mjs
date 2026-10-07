import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCandidateRisk} from '../lib/candidate-risk.ts';

test('high board, thin liquidity and sealed limit are cautions, not hidden candidates',()=>{
  const risk=assessCandidateRisk({pct:10,amountYi:.4,height:6,limit:'U',openTimes:0,asOf:'2026-09-30 15:00'});
  assert.equal(risk.level,'注意');
  assert.ok(risk.flags.some(x=>x.includes('流动性')));
  assert.ok(risk.flags.some(x=>x.includes('实际可成交性')));
  assert.ok(risk.flags.some(x=>x.includes('高位连板')));
});
