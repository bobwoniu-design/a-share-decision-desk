import test from "node:test";
import assert from "node:assert/strict";
import {buildLimitUpDay} from "../lib/limit-up.ts";

test("选股涨停标记与涨停榜默认口径一致，仅收盘封板入选",()=>{
  const day=buildLimitUpDay("2026-09-30",[
    {trade_date:"20260930",ts_code:"600001.SH",name:"封板股",limit:"U",limit_times:2},
    {trade_date:"20260930",ts_code:"600002.SH",name:"炸板股",limit:"Z",limit_times:0},
    {trade_date:"20260930",ts_code:"600003.SH",name:"跌停股",limit:"D",limit_times:0},
  ],"2026-09-30T07:00:00.000Z");
  assert.deepEqual(day.byCode,{"600001.SH":{name:"封板股",height:2}});
  assert.equal(day.sealed,1);
});

test("空名单、混入其他日期、重复代码或异常状态不会生成未涨停结论",()=>{
  assert.throws(()=>buildLimitUpDay("2026-09-30",[],""));
  assert.throws(()=>buildLimitUpDay("2026-09-30",[{trade_date:"20260929",ts_code:"600001.SH",limit:"U",limit_times:1}],""));
  assert.throws(()=>buildLimitUpDay("2026-09-30",[{trade_date:"20260930",ts_code:"600001.SH",limit:"Q"}],""));
  assert.throws(()=>buildLimitUpDay("2026-09-30",[{trade_date:"20260930",ts_code:"600001.SH",limit:"U",limit_times:1},{trade_date:"20260930",ts_code:"600001.SH",limit:"Z"}],""));
});
