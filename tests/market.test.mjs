import test from "node:test";
import assert from "node:assert/strict";
import {dailyRows,minuteRows,breadth,limits,validDate} from "../lib/market-data.ts";
test("daily totals preserve BJ breadth but exclude BJ from Shanghai/Shenzhen turnover",()=>{
 const data=dailyRows([{ts_code:"600000.SH",trade_date:"20260930",close:10,pre_close:9,pct_chg:11.11,amount:100000},{ts_code:"920001.BJ",trade_date:"20260930",close:8,pre_close:9,pct_chg:-11.11,amount:200000}],"2026-09-30");
 assert.deepEqual(breadth(data),{total:2,up:1,down:1,flat:0,amountYi:1});
 assert.throws(()=>dailyRows([{...data[0],ts_code:"600000.SH",trade_date:"20260929"}],"2026-09-30"));
});
test("missing amount and duplicate codes cannot produce complete market totals",()=>{
 const r={ts_code:"600000.SH",trade_date:"20260930",close:10,pre_close:9,pct_chg:11.11,amount:null};
 assert.throws(()=>dailyRows([r],"2026-09-30"));assert.throws(()=>dailyRows([{...r,amount:1},{...r,amount:1}],"2026-09-30"));
});
test("limit permission gaps stay null and broken-board denominator counts touched symbols",()=>{
 assert.equal(limits(null),null);assert.equal(limits([]).brokenRate,null);
 const s=limits([{ts_code:"a",limit:"U",limit_times:3},{ts_code:"b",limit:"Z"}]);assert.equal(s.brokenRate,50);assert.equal(s.height,3);
});
test("minutes use yuan/share without conversion and reject wrong date or symbol",()=>{
 const r={ts_code:"600000.SH",trade_time:"2026-09-30 09:31:00",open:10,high:11,low:9,close:10,vol:100,amount:1000};
 const b=minuteRows([r],"600000.SH","2026-09-30")[0];assert.equal(b.amount/b.vol,10);
 assert.throws(()=>minuteRows([r],"000001.SZ","2026-09-30"));assert.throws(()=>minuteRows([r],"600000.SH","2025-09-30"));assert.throws(()=>minuteRows([r,r],"600000.SH","2026-09-30"));
 assert.equal(validDate("2026-02-30"),false);assert.equal(validDate("2026-09-30"),true);
});
