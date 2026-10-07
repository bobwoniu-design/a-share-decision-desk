import test from "node:test";
import assert from "node:assert/strict";
import {normalizeHotMoneyRoster,normalizeHotMoneyTrades} from "../lib/hot-money.ts";

test("游资名录按名称去重并保留完整关联营业部",()=>{
  const rows=normalizeHotMoneyRoster([{name:"甲",desc:"简介",orgs:"营业部一、营业部二"},{name:"甲",desc:"重复"},{name:"乙",orgs:"营业部三"}]);
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.name==="甲")?.organizations,"营业部一、营业部二");
});

test("游资交易明细保留披露金额与方向，并拒绝错日记录",()=>{
  const rows=normalizeHotMoneyTrades([{trade_date:"20260930",ts_code:"600001.SH",ts_name:"样本股",hm_name:"甲",hm_orgs:"营业部",buy_amount:1000000,sell_amount:1800000,net_amount:-800000}],"2026-09-30");
  assert.equal(rows[0].netAmount,-800000);
  assert.equal(rows[0].stockName,"样本股");
  assert.throws(()=>normalizeHotMoneyTrades([{trade_date:"20260929",ts_code:"600001.SH",hm_name:"甲"}],"2026-09-30"));
});

test("名录和交易明细排除机构、量化与股通类别，但保留关联席位提及机构的游资",()=>{
  const roster=normalizeHotMoneyRoster([
    {name:"机构专用5",desc:"机构席位"},
    {name:"量化基金"},
    {name:"境外机构"},
    {name:"沪股通专用"},
    {name:"赵老哥",desc:"与机构席位有关",orgs:"某量化机构营业部"},
  ]);
  assert.deepEqual(roster.map(item=>item.name),["赵老哥"]);
  const row={trade_date:"20260930",ts_code:"600001.SH",ts_name:"样本股",buy_amount:1000000,sell_amount:0};
  const trades=normalizeHotMoneyTrades([
    {...row,hm_name:"机构专用"},
    {...row,hm_name:"量化打板"},
    {...row,hm_name:"深股通专用"},
    {...row,hm_name:"赵老哥",hm_orgs:"某机构席位"},
  ],"2026-09-30");
  assert.deepEqual(trades.map(item=>item.hotMoneyName),["赵老哥"]);
});
