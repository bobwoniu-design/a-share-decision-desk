import test from "node:test";
import assert from "node:assert/strict";
import {candleFromRow,seriesForCode,equalWeightBasket} from "../lib/candle-data.ts";

const d1="2026-09-29",d2="2026-09-30";
const row=(code,date,open,high,low,close,pre_close,amount=100000)=>({ts_code:code,trade_date:date.replaceAll("-",""),open,high,low,close,pre_close,amount});

test("candle rows preserve amount units and reject malformed OHLC",()=>{
  assert.equal(candleFromRow(row("600000.SH",d1,10,11,9,10,10),"thousand")?.amountYi,1);
  assert.equal(candleFromRow(row("BK0001.DC",d1,10,11,9,10,10),"yuan")?.amountYi,.001);
  assert.equal(candleFromRow(row("600000.SH",d1,10,9,9,10,10),"thousand"),null);
  assert.throws(()=>seriesForCode([row("600000.SH",d1,10,11,9,10,10),row("600000.SH",d1,10,11,9,10,10)],"600000.SH",[d1],"thousand"));
});

test("industry basket uses equal-weight constituent returns and leaves thin days blank",()=>{
  const a="600000.SH",b="000001.SZ",members=new Set([a,b]);
  const result=equalWeightBasket([d1,d2],members,[
    [row(a,d1,10,11,9,11,10),row(b,d1,20,21,19,20,20)],
    [row(a,d2,11,12,10,12,11),row(b,d2,20,20,19,19,20)]
  ]);
  assert.equal(result.points.length,2);
  assert.equal(result.points[0].close,105);
  assert.ok(Math.abs(result.points[1].close-105*((12/11+19/20)/2))<1e-10);
  const thin=equalWeightBasket([d1,d2],new Set([a,b,"300001.SZ"]),[[row(a,d1,10,11,9,11,10)],[row(a,d2,11,12,10,12,11)]]);
  assert.equal(thin.points.length,0);
});
