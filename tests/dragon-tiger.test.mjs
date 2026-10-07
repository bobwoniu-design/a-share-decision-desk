import test from "node:test";
import assert from "node:assert/strict";
import {buildDragonTigerDay} from "../lib/dragon-tiger.ts";

test("龙虎榜按所选日聚合，同一股票的多个上榜原因不重复",()=>{
  const day=buildDragonTigerDay("2026-09-30",[
    {trade_date:"20260930",ts_code:"600418.SH",name:"江淮汽车",reason:"日涨幅偏离值"},
    {trade_date:"20260930",ts_code:"600418.SH",name:"江淮汽车",reason:"换手率异常"},
    {trade_date:"20260930",ts_code:"600418.SH",name:"江淮汽车",reason:"换手率异常"},
  ],"2026-10-01T00:00:00.000Z");
  assert.deepEqual(day.byCode["600418.SH"].reasons,["日涨幅偏离值","换手率异常"]);
  assert.equal(day.rows,3);
  assert.equal(day.byCode["000001.SZ"],undefined);
});

test("空名单、混入其他日期或异常代码不会生成未上榜结论",()=>{
  assert.throws(()=>buildDragonTigerDay("2026-09-30",[],""));
  assert.throws(()=>buildDragonTigerDay("2026-09-30",[{trade_date:"20260929",ts_code:"600418.SH"}],""));
  assert.throws(()=>buildDragonTigerDay("2026-09-30",[{trade_date:"20260930",ts_code:"bad"}],""));
});
