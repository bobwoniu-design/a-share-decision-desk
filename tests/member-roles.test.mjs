import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRoles} from '../lib/member-roles.ts';

function group(){
  const members=[
    {code:'600001.SH',name:'连板股',quote:{close:12,preClose:10,pct:20,amount:2e9},limit:'U',height:2,leaderRank:1},
    {code:'600002.SH',name:'容量股',quote:{close:11,preClose:10,pct:10,amount:5e9},limit:'',height:0,leaderRank:2},
    {code:'600003.SH',name:'后发股',quote:{close:10.5,preClose:10,pct:5,amount:1e9},limit:'',height:0,leaderRank:3},
  ];
  return {name:'样本',total:3,traded:3,up:3,down:0,flat:0,averagePct:35/3,amountYi:80,limitUp:1,limitDown:0,broken:0,members};
}

test('leadership and capacity labels require independent evidence',()=>{
  const g=group();
  assert.ok(memberRoles(g,g.members[0]).some(r=>r.label==='龙头候选'));
  assert.ok(memberRoles(g,g.members[1]).some(r=>r.label==='容量中军候选'));
  assert.ok(!memberRoles(g,g.members[2]).some(r=>r.label==='补涨候选'));
  assert.ok(!memberRoles(g,{...g.members[0],height:1}).some(r=>r.label==='龙头候选'));
  assert.deepEqual(memberRoles(g,{...g.members[0],quote:null}),[]);
});

test('catch-up label needs the historical industry role, not one-day strength',()=>{
  const g=group(),stock=g.members[2];
  assert.ok(!memberRoles(g,stock).some(r=>r.label==='补涨候选'));
  const historical=[{code:stock.code,roles:['补涨候选'],return5:2}];
  assert.ok(memberRoles(g,stock,historical).some(r=>r.label==='补涨候选'));
});
