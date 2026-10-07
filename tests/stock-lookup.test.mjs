import test from "node:test";
import assert from "node:assert/strict";
import {resolveListedStock} from "../lib/stock-lookup.ts";

const rows=[{ts_code:"600519.SH",name:"贵州茅台"},{ts_code:"002058.SZ",name:"紫竹高科"},{ts_code:"123456.SH",name:"甲"},{ts_code:"123456.SZ",name:"乙"}];

test("手工输入六位代码可查得完整代码与当前股票名称",()=>{
  assert.deepEqual(resolveListedStock("002058",rows),{code:"002058.SZ",name:"紫竹高科"});
  assert.deepEqual(resolveListedStock("600519.sh",rows),{code:"600519.SH",name:"贵州茅台"});
});

test("不能把不存在或有歧义的代码加入其他股票",()=>{
  assert.throws(()=>resolveListedStock("000000",rows),/未找到/);
  assert.throws(()=>resolveListedStock("123456",rows),/多只股票/);
  assert.deepEqual(resolveListedStock("123456.SZ",rows),{code:"123456.SZ",name:"乙"});
});
