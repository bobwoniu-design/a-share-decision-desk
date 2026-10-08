import test from "node:test";
import assert from "node:assert/strict";
import {marketRecovery} from "../lib/market-recovery.ts";

test("IP quota failure offers the actual previous trading date, never fabricated live data",()=>{
  const result=marketRecovery("rt_k：您的IP数量超限，最大数量为10个！（40204）","2026-10-08","live",["2026-09-29","2026-09-30","2026-10-08"]);
  assert.equal(result.code,"TUSHARE_IP_LIMIT");
  assert.equal(result.blocked,true);
  assert.equal(result.recoveryDate,"2026-09-30");
  assert.match(result.error,/连续重试不能解除/);
});

test("missing calendar or historical mode must not silently select a different date",()=>{
  assert.equal(marketRecovery("40204","2026-10-08","live").recoveryDate,null);
  assert.equal(marketRecovery("40204","2026-10-08","close",["2026-09-30"]).recoveryDate,null);
  assert.equal(marketRecovery("40204","2026-10-08","live",["2026-10-08","2026-10-09","bad-date"]).recoveryDate,null);
});

test("transient failures remain retryable and preserve their message",()=>{
  const result=marketRecovery("连接超时","2026-10-08","live",["2026-09-30"]);
  assert.equal(result.error,"连接超时");
  assert.equal(result.blocked,false);
  assert.equal(result.code,null);
  assert.equal(result.recoveryDate,null);
});
