import test from 'node:test';
import assert from 'node:assert/strict';
import {minuteEngine,sectorMinuteEngine,tradingMinute,minuteFresh} from '../lib/minute-engine.ts';
import {buildDecision,weightedScore} from '../lib/decision-engine.ts';
import {sectorGroups} from '../lib/sectors.ts';
import {evaluateSignalDay} from '../lib/signal-metrics.ts';
function sample(){let price=10;return Array.from({length:100},(_,i)=>{const prev=price;price=i<25?10+i*.02:i<35?10.48-(i-24)*.06:i<45?9.88+(i-35)*.006:i<65?9.94+(i-45)*.04:i<75?10.74+(i-65)*.12:i<85?11.94+(i-75)*.2:13.94-(i-85)*.35;const vol=i<25?1000:i<35?3000:i<45?600:i<65?4000: i<85?10000+i*150:20000;return {time:`${String(Math.floor((571+i)/60)).padStart(2,'0')}:${String((571+i)%60).padStart(2,'0')}`,open:prev,high:Math.max(prev,price)+.001,low:Math.min(prev,price)-.001,close:price,vol,amount:(prev+price)/2*vol};});}
const bars=sample(),sector=bars.map(b=>({time:b.time,phase:'转强',strong:true,weak:false,reason:'validated test cohort',coverage:6,total:6}));
const context={sector,theme:sector,mainlineCore:true,themeAllowed:true,marketAllowed:true,preClose:10,floatShares:1e7};
test('causal engine reaches all six phases, staged conditions and invalidation',()=>{const r=minuteEngine(bars,context);for(const p of ['一致','分歧','承接','转强','加速','转弱'])assert.ok(r.frames.some(f=>f.phase===p),p);for(const s of ['第一笔条件出现：承接','第二笔条件出现：确认','第三笔条件出现：转强','逻辑失效'])assert.ok(r.frames.some(f=>f.signal===s),s);assert.ok(r.current.invalidated);assert.equal(r.current.signal,'逻辑失效');});
test('appending future bars cannot change any earlier individual state, evidence or signal',()=>{const full=minuteEngine(bars,context);for(const n of [20,30,45,60,75,90]){const prefix=minuteEngine(bars.slice(0,n),context);assert.deepEqual(prefix.frames,full.frames.slice(0,n));assert.deepEqual(prefix.transitions,full.transitions.filter(t=>t.time<=bars[n-1].time));}});
test('mainline, market and peer gates cannot be bypassed by a strong individual chart',()=>{for(const c of [{...context,mainlineCore:false},{...context,marketAllowed:false},{...context,sector:[]}]){const r=minuteEngine(bars,c);assert.ok(!r.frames.some(f=>/^第[一二三]笔/.test(f.signal)));}const r=minuteEngine(bars,{...context,sector:[]});assert.ok(!r.frames.some(f=>f.phase==='转强'||f.phase==='加速'));});
test('theme membership and independent same-minute peers gate staged signals',()=>{const accepted=minuteEngine(bars,context);for(const changed of [{...context,themeAllowed:false},{...context,themeAllowed:null},{...context,theme:[]},{...context,theme:sector.map(p=>({...p,strong:false,weak:true}))}]){const r=minuteEngine(bars,changed);assert.ok(!r.frames.some(f=>/^第[一二三]笔/.test(f.signal)));if(changed.themeAllowed!==true)assert.deepEqual(r.frames.map(f=>f.phase),accepted.frames.map(f=>f.phase));}});
test('observed peak-to-current pullback does not mistake a monotonic rally for disagreement',()=>{const rising=Array.from({length:80},(_,i)=>({...bars[i],open:10+i*.05,close:10+i*.05,high:10+i*.05,low:10+i*.05,vol:1000,amount:(10+i*.05)*1000}));const r=minuteEngine(rising,context);assert.ok(r.frames.every(f=>f.drawdown===0));assert.ok(!r.frames.some(f=>['分歧','承接','转强'].includes(f.phase)));});
test('missing opening data or an internal minute gap suppresses positive decisions',()=>{for(const damaged of [bars.slice(1),bars.filter((_,i)=>i!==25)]){const r=minuteEngine(damaged,context);assert.equal(r.current.quality,false);assert.ok(r.current.missing>0);assert.equal(r.current.phase,'待数据');assert.ok(!r.frames.filter(f=>f.missing).some(f=>/^第[一二三]笔/.test(f.signal)));}assert.throws(()=>minuteEngine([bars[1],bars[0]]));});
test('lunch break is not counted as missing minutes; real timestamps and staleness are checked',()=>{assert.equal(tradingMinute('13:01')-tradingMinute('11:30'),1);assert.equal(tradingMinute('12:00'),null);assert.equal(minuteFresh('2026-10-08','10:01',new Date('2026-10-08T02:03:00Z')),true);assert.equal(minuteFresh('2026-10-08','10:00',new Date('2026-10-08T02:03:00Z')),false);assert.equal(minuteFresh('2026-10-07','15:00',new Date('2026-10-08T02:03:00Z')),false);assert.equal(minuteFresh('2026-10-08','11:30',new Date('2026-10-08T04:30:00Z')),true);});
test('sector agreement needs at least three and 80% synchronized independent peers',()=>{const peers=Array.from({length:6},(_,i)=>({code:String(i),name:String(i),preClose:10,bars}));const times=bars.map(b=>b.time);const full=sectorMinuteEngine(peers,times);assert.ok(full.frames.some(f=>f.strong===true));const partial=sectorMinuteEngine(peers.map((p,i)=>({...p,bars:i<4?p.bars:[]})),times);assert.ok(partial.frames.every(f=>f.strong===null));const single=sectorMinuteEngine(peers.slice(0,1),times);assert.ok(single.frames.every(f=>f.strong===null));const n=55,cut=sectorMinuteEngine(peers,times.slice(0,n));assert.deepEqual(cut.frames,full.frames.slice(0,n));});
test('VWAP and turnover use yuan, shares, and only the observed prefix',()=>{const n=30,r=minuteEngine(bars.slice(0,n),context),amount=bars.slice(0,n).reduce((s,b)=>s+b.amount,0),vol=bars.slice(0,n).reduce((s,b)=>s+b.vol,0);assert.equal(r.current.vwap,amount/vol);assert.equal(r.current.turnover,vol/1e7*100);assert.equal(minuteEngine(bars,{}).current.turnover,null);});
test('missing score inputs remain unknown, never neutral zero or a probability',()=>{assert.equal(weightedScore([{name:'a',weight:60,score:90,detail:''},{name:'b',weight:40,score:null,detail:''}]),null);assert.equal(weightedScore([{name:'a',weight:80,score:90,detail:''},{name:'b',weight:20,score:null,detail:''}]),90);});
function days(){const basic=Array.from({length:8},(_,i)=>({ts_code:`60000${i}.SH`,name:`成员${i}`,industry:i<4?'甲':'乙',list_date:'20200101'}));return Array.from({length:12},(_,i)=>{const date=`2026-09-${String(i+1).padStart(2,'0')}`,prices=basic.map((b,j)=>({code:b.ts_code,close:10,preClose:10,pct:j<4?4+i*.1:-2,amount:(j<4?2:1)*1e8*(1+i*.05)})),limits=basic.slice(0,2).map((b,j)=>({ts_code:b.ts_code,trade_date:date.replaceAll('-',''),limit:'U',limit_times:j+2}));return {date,prices,limits,groups:sectorGroups(prices,basic,limits,date)};});}
test('full-market scoring ranks strength, includes previous-day deltas and reconciles promotion',()=>{const d=days(),r=buildDecision(d);assert.equal(r.sectors[0].name,'甲');assert.equal(r.market.promotion.value,100);assert.equal(r.market.promotion.total,2);assert.equal(r.market.promotion.advanced,2);assert.ok(r.sectors[0].score>r.sectors[1].score);assert.ok(r.sectors[0].delta!==null);assert.ok(r.sectors[0].factors.some(f=>f.name==='持续性'));assert.equal(r.market.history.length,12);});
test('industry mainline requires independent breadth, persistence and verified ladder evidence',()=>{
  const complete=buildDecision(days()).sectors.find(s=>s.name==='甲');
  assert.equal(complete.qualification.status,'通过');
  assert.equal(complete.label,'主线初筛');
  const noLadder=days(),last=noLadder.at(-1),basic=last.groups.flatMap(g=>g.members.map(m=>({ts_code:m.code,name:m.name,industry:m.industry})));
  last.limits=[];last.groups=sectorGroups(last.prices,basic,[],last.date);
  const weak=buildDecision(noLadder).sectors.find(s=>s.name==='甲');
  assert.ok(weak.score>=65);
  assert.equal(weak.qualification.checks.at(-1).result,'未通过');
  assert.notEqual(weak.label,'主线初筛');
  last.limits=null;last.groups=sectorGroups(last.prices,basic,null,last.date);
  const missing=buildDecision(noLadder).sectors.find(s=>s.name==='甲');
  assert.equal(missing.qualification.checks.at(-1).result,'待核验');
  assert.notEqual(missing.label,'主线初筛');
  const live=days();live.at(-1).partial=true;
  assert.equal(buildDecision(live).sectors.find(s=>s.name==='甲').qualification.checks.at(-1).result,'待核验');
});
test('future daily snapshots cannot rewrite earlier market or sector history',()=>{const d=days(),early=buildDecision(d.slice(0,10)),full=buildDecision(d);assert.deepEqual(early.market.history,full.market.history.slice(0,10));for(const s of early.sectors)assert.deepEqual(s.history,full.sectors.find(x=>x.name===s.name).history.slice(0,10));assert.throws(()=>buildDecision([d[1],d[0]]));});
test('intraday turnover does not compare a partial day against full daily amounts',()=>{const d=days();d[d.length-1].partial=true;const r=buildDecision(d);assert.equal(r.market.factors.find(f=>f.name==='成交活跃').score,null);assert.equal(r.mode,'live');assert.ok(r.sectors[0].factors.find(f=>f.name==='成交活跃').detail.includes('盘中'));});

test('official zero-volume minutes preserve price continuity but never generate a positive signal themselves',()=>{const all=bars.map((b,i)=>i===68||i===69?{...b,vol:0,amount:0}:b);const r=minuteEngine(all,context);assert.ok(r.frames[69].above>=3);assert.ok(!/^第[一二三]笔/.test(r.frames[69].signal));assert.equal(r.frames[69].quality,true);});
test('an uninterrupted one-price limit-up is consistency, not a fabricated disagreement entry',()=>{const flat=bars.slice(0,40).map(b=>({...b,open:11,high:11,low:11,close:11,vol:1000,amount:11000}));const r=minuteEngine(flat,{...context,upLimit:11});assert.equal(r.current.phase,'一致');assert.ok(!r.frames.some(f=>/^第[一二三]笔/.test(f.signal)));});
test('historical signal outcome starts at the next trading minute and excludes locked or missing exits',()=>{
  const day=[{time:'14:58',open:9.8,high:10,low:9.8,close:10,vol:100,amount:990},{time:'14:59',open:10.1,high:10.2,low:10,close:10.2,vol:100,amount:1010},{time:'15:00',open:10.4,high:10.6,low:10.4,close:10.5,vol:100,amount:1045}];
  const frames=[{signal:'第二笔条件出现：确认'},{signal:'观察'},{signal:'观察'}];
  const checked=evaluateSignalDay('2026-09-30',day,frames,null);
  assert.equal(checked.events.length,1);assert.equal(checked.events[0].entryTime,'14:59');assert.equal(checked.events[0].entry,10.1);assert.ok(Math.abs(checked.events[0].netPct-((10.5/10.1-1)*100-.2))<1e-9);
  assert.equal(evaluateSignalDay('2026-09-30',day.slice(0,2),frames.slice(0,2),null).events.length,0);
  const locked=[...day];locked[1]={...locked[1],open:11,high:11,low:11,close:11};assert.equal(evaluateSignalDay('2026-09-30',locked,frames,11).events.length,0);
});
