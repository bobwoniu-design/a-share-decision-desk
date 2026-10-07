import test from "node:test";
import assert from "node:assert/strict";
import {equalWeightMinute} from "../lib/block-minute.ts";

const bar=(time,close)=>({time,open:close,high:close,low:close,close,vol:1,amount:close});

test("representative-member intraday line is equal weight and leaves low-coverage minutes blank",()=>{
  const samples=[
    {code:"A",name:"A",preClose:10,bars:[bar("09:31",11),bar("09:32",12),bar("09:33",11)]},
    {code:"B",name:"B",preClose:20,bars:[bar("09:31",22),bar("09:33",18)]},
    {code:"C",name:"C",preClose:40,bars:[bar("09:31",40),bar("09:33",44)]}
  ];
  const result=equalWeightMinute(samples);
  assert.deepEqual(result.map(point=>point.time),["09:31","09:32","09:33"]);
  assert.ok(Math.abs(result[0].level-106.6666666667)<1e-6);
  assert.equal(result[1].level,null);
  assert.equal(result[1].coverage,1);
  assert.equal(result[2].level,103.33333333333333);
});

test("fewer than three members cannot create a sector line",()=>{
  assert.deepEqual(equalWeightMinute([{code:"A",name:"A",preClose:10,bars:[bar("09:31",11)]}]),[]);
});
