import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8787",
  owner = "qa-" + crypto.randomUUID(),
  headers = {
    "oai-authenticated-user-id": owner,
    "oai-authenticated-user-email": "qa@example.test",
    "Content-Type": "application/json",
    Origin: origin,
  };
async function get(h = headers) {
  const r = await fetch(origin + "/api/ledger", { headers: h });
  return { status: r.status, ...(await r.json()) };
}
async function post(revision, action, data, h = headers) {
  const r = await fetch(origin + "/api/ledger", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ revision, action, data }),
  });
  return { status: r.status, ...(await r.json()) };
}
const stamp = new Date().toISOString();
const trade = {
  id: "buy-1",
  code: "600000.SH",
  name: "API测试",
  time: "2026-09-28T10:00",
  side: "buy",
  price: 10,
  qty: 200,
  fee: 5,
  reason: "API测试",
  plan: "计划",
  tag: "分歧承接",
  discipline: "按计划",
  source: "manual",
  createdAt: stamp,
  updatedAt: stamp,
};
assert.equal((await get({})).status, 401);
assert.equal((await get()).revision, 0);
assert.equal(
  (
    await post(0, "trade", trade, {
      ...headers,
      Origin: "https://example.test",
    })
  ).status,
  403,
);
assert.equal((await post(0, "trade", trade)).revision, 1);
assert.equal((await post(0, "trade", { ...trade, id: "stale" })).status, 409);
assert.equal(
  (
    await post(1, "trade", {
      ...trade,
      id: "sell",
      time: "2026-09-29T10:00",
      side: "sell",
      qty: 300,
    })
  ).status,
  400,
);
assert.equal(
  (
    await post(1, "trade", {
      ...trade,
      id: "sell",
      time: "2026-09-29T10:00",
      side: "sell",
      qty: 100,
      price: 11,
    })
  ).revision,
  2,
);
assert.equal((await get()).ledger.trades.length, 2);
const r = {
  date: "2026-09-29",
  good: "保留人工笔记",
  improve: "原计划",
  plan: "次日观察",
  market: "人工分析",
  status: "confirmed",
  updatedAt: stamp,
  basedOnRevision: 2,
  version: 1,
};
assert.equal((await post(2, "review", r)).revision, 3);
assert.equal((await post(3, "review", { ...r, plan: "更新计划" })).revision, 4);
assert.equal((await get()).ledger.reviewHistory[0].plan, "次日观察");
assert.equal(
  (await post(4, "import", { trades: [trade], allowSimilar: false })).ledger
    .trades.length,
  2,
);
assert.equal(
  (await get({ ...headers, "oai-authenticated-user-id": owner + "-other" }))
    .ledger.trades.length,
  0,
);
assert.equal((await post(5, "void", { id: "buy-1" })).status, 400);
console.log(
  "API验证通过：身份隔离、来源校验、持久保存、并发版本、超卖保护、复盘版本、重复导入、撤销保护。测试数据仅在本地独立验收用户。",
);
