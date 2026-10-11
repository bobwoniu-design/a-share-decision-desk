import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {emptySelectionDay,addCandidates,recordEvidence,selectionStatus,applyIntent,summarizeChecks,discoverySession,selectionStage} from '../lib/selection.ts';
const candidate=(code='600000.SH')=>({code,name:'测试股票',reasons:['题材走强'],theme:null});
test('previous-close cohort persists after disappearance; intraday source merges without rewriting original',()=>{
 const day=emptySelectionDay('2026-10-08','2026-09-30');
 addCandidates(day,[candidate()],'盘前候选','2026-09-30','2026-09-30T10:00:00Z');
 addCandidates(day,[],'盘中新增','2026-10-08','2026-10-08T02:00:00Z');
 assert.equal(day.items.length,1);
 addCandidates(day,[{...candidate(),reasons:['盘中新依据']}],'盘中新增','2026-10-08','2026-10-08T02:30:00Z');
 addCandidates(day,[{...candidate(),reasons:['后来的依据']}],'盘中新增','2026-10-08','2026-10-08T03:00:00Z');
 assert.equal(day.items.length,1);assert.equal(day.items[0].sources.length,2);
 assert.equal(day.items[0].firstSeenAt,'2026-09-30T10:00:00Z');
 assert.deepEqual(day.items[0].sources[1].candidate.reasons,['盘中新依据']);
});
test('late reconstruction carries actual discovery time and explicit backfill marker',()=>{
 const day=emptySelectionDay('2026-10-08');addCandidates(day,[candidate()],'盘前候选','2026-09-30','2026-10-08T02:30:00Z',true);
 assert.equal(day.items[0].sources[0].backfilled,true);assert.equal(day.items[0].firstSeenAt,'2026-10-08T02:30:00Z');
});
test('condition confirmation expires and a manual plan cannot override missing checks',()=>{
 const day=emptySelectionDay('2026-10-08');addCandidates(day,[candidate()],'盘中新增',day.date,'2026-10-08T02:00:00Z');
 const item=day.items[0],e={at:'2026-10-08T02:01:00Z',expiresAt:'2026-10-08T02:03:00Z',stage:'盘中复核',status:'待核验',reason:'消息未知',checks:[],price:null,quoteTime:null,links:[]};
 recordEvidence(item,e);applyIntent(item,'计划',{low:10,high:11,qty:100,invalidation:'跌破支撑',note:''},e.at);
 assert.equal(selectionStatus(item,e.at),'待核验');assert.equal(selectionStatus(item,'2026-10-08T02:04:00Z'),'核验已过期');
 recordEvidence(item,{...e,at:'2026-10-08T02:00:00Z',status:'条件满足'});assert.equal(item.latest.status,'待核验');
});
test('risk downgrades are immediate and repeated identical evaluations do not spam history',()=>{
 const day=emptySelectionDay('2026-10-08');addCandidates(day,[candidate()],'盘中新增',day.date,'2026-10-08T02:00:00Z');
 const item=day.items[0],e={at:'2026-10-08T02:01:00Z',expiresAt:'2026-10-08T02:03:00Z',stage:'盘中复核',status:'条件满足',reason:'通过',checks:[],links:[]};
 recordEvidence(item,e);recordEvidence(item,{...e,at:'2026-10-08T02:02:00Z'});assert.equal(item.events.length,2);
 recordEvidence(item,{...e,at:'2026-10-08T02:03:00Z',status:'逻辑失效',reason:'转弱'});assert.equal(item.latest.status,'逻辑失效');assert.equal(item.events.length,3);
});
test('unknown data and risk clues veto positive confirmation',()=>{
 assert.equal(summarizeChecks([{label:'消息风险',pass:null,detail:'权限不足'}],false,true).status,'待核验');
 assert.equal(summarizeChecks([{label:'消息风险',pass:false,detail:'风险线索'}],false,true).status,'风险待核实');
 assert.equal(summarizeChecks([{label:'行业',pass:false,detail:'转弱'}],false,true).status,'继续观察');
 assert.equal(summarizeChecks([{label:'条件',pass:true,detail:'完整'}],false,true).status,'条件满足');
});
test('discovery covers 10:00, 10:30 and afternoon without lunch or after-hours discoveries',()=>{
 for(const t of ['09:42','10:00','10:30','14:30'])assert.equal(discoverySession(t),true);
 for(const t of ['09:25','12:00','15:01'])assert.equal(discoverySession(t),false);
 assert.equal(selectionStage('09:27'),'竞价复核');assert.equal(selectionStage('09:31'),'开盘复核');assert.equal(selectionStage('10:30'),'盘中复核');
});
test('SQLite persistence isolates owners and retries concurrent updates without losing actions',async()=>{
 const file=new URL('../lib/selection-store.ts',import.meta.url);
 const source=readFileSync(file,'utf8').replace('"./selection"',JSON.stringify(new URL('../lib/selection.ts',import.meta.url).href));
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {readSelection,updateSelection}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0004_needy_yellowjacket.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)??null;},async run(){return {meta:sqlite.prepare(sql).run(...values)};}};}};}};
 try{
  await updateSelection(db,'owner-a','2026-10-08',day=>addCandidates(day,[candidate()],'盘前候选','2026-09-30','2026-10-08T00:00:00Z',true));
  await Promise.all([
   updateSelection(db,'owner-a','2026-10-08',day=>applyIntent(day.items[0],'计划',{low:10,high:11,qty:100,invalidation:'测试失效条件',note:''},'2026-10-08T02:00:00Z')),
   updateSelection(db,'owner-a','2026-10-08',day=>addCandidates(day,[candidate('000001.SZ')],'盘中新增','2026-10-08','2026-10-08T02:30:00Z'))
  ]);
  const stored=await readSelection(db,'owner-a','2026-10-08');assert.equal(stored.day.items.length,2);assert.equal(stored.day.items[0].intent,'计划');assert.equal(stored.revision,3);
  assert.equal((await readSelection(db,'owner-b','2026-10-08')).day.items.length,0);
  assert.equal((await readSelection(db,'owner-a','2026-10-09')).day.items.length,0);
 }finally{sqlite.close();}
});
import {newsRiskReasons,newsRiskCheck} from '../lib/selection-news.ts';

test('cooperation uncertainty and abnormal-volatility notices are risk leads before the next open',()=>{
 const reasons=newsRiskReasons('江淮汽车：合作内容、合作形式等均未确定','与合作方确有沟洽合作意向，但未签署任何有约束力的正式协议，后续相关合作事项推进尚存在较大不确定性。','江淮汽车','600418.SH');
 assert.ok(reasons.includes('合作或事项尚未确定'));
 assert.ok(reasons.includes('尚未签署正式或有约束力的协议'));
 assert.ok(newsRiskReasons('江淮汽车股票交易异常波动公告','','江淮汽车','600418.SH').includes('股票交易异常波动'));
 assert.equal(newsRiskCheck(reasons,[],1).pass,false);
});
test('news digests isolate other companies and unmatched text never clears risk',()=>{
 assert.deepEqual(newsRiskReasons('晚间精选','①江淮汽车完成股份回购。②其他公司发生重大事故。','江淮汽车','600418.SH'),[]);
 assert.ok(newsRiskReasons('晚间精选','①江淮汽车：合作形式未确定。②其他公司完成回购。','江淮汽车','600418.SH').length);
 assert.equal(newsRiskCheck([],[],0).pass,null);
 assert.equal(newsRiskCheck([],[],5).pass,null);
 assert.match(newsRiskCheck(['股票交易异常波动'],['财联社快讯不可用'],1).detail,/来源缺失/);
});
