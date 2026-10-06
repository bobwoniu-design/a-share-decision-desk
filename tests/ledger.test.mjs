import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  dailySummary,
  blankLedger,
  tradeSchema,
  importCSV,
  toCSV,
  parseCSV,
} from "../lib/ledger.ts";
import {personalFeedback} from "../lib/personal-feedback.ts";
let n = 0;
const t = (
  side,
  qty,
  price,
  fee = 5,
  time = "2026-09-28T10:00",
  extra = {},
) => ({
  id: String(++n),
  code: "600000.SH",
  name: "测试股票",
  side,
  qty,
  price,
  fee,
  time,
  reason: "测试理由",
  plan: "测试计划",
  tag: "分歧承接",
  discipline: "按计划",
  source: "manual",
  voided: false,
  createdAt: "2026-09-28T03:00:00Z",
  updatedAt: "2026-09-28T03:00:00Z",
  ...extra,
});
test("多笔买入后部分卖出，费用只分摊一次", () => {
  const r = calculate([
    t("buy", 100, 10),
    t("buy", 100, 12),
    t("sell", 100, 13),
  ]);
  assert.equal(r.positions[0].qty, 100);
  assert.equal(r.positions[0].cost, 1105);
  assert.equal(r.realized, 190);
  assert.equal(r.closed.length, 0);
  assert.equal(r.winRate, null);
});
test("完整清仓与再次开仓归为两个周期", () => {
  const r = calculate([
    t("buy", 100, 10),
    t("sell", 100, 11),
    t("buy", 100, 12),
    t("sell", 100, 11),
  ]);
  assert.equal(r.closed.length, 2);
  assert.equal(r.realized, -20);
  assert.equal(r.winRate, 50);
  assert.equal(r.payoff, 90 / 110);
  assert.equal(r.positions.length, 0);
});
test("跨日与期初持仓", () => {
  const ledger = blankLedger();
  ledger.trades = [
    t("opening", 200, 10, 0, "2026-09-25T15:00"),
    t("sell", 100, 11, 5, "2026-09-28T10:00"),
  ];
  assert.equal(dailySummary(ledger, "2026-09-25").count, 0);
  assert.equal(dailySummary(ledger, "2026-09-28").realized, 95);
  assert.equal(dailySummary(ledger, "2026-09-28").positions[0].qty, 100);
});
test("个人反馈排除期初快照，按首次买入计划与含费平仓结果分类",()=>{
  const ledger=blankLedger();ledger.trades=[
    t("opening",100,10,0,"2026-09-25T15:00"),t("sell",100,12,0,"2026-09-26T10:00"),
    t("buy",100,10,5,"2026-09-27T10:00"),t("sell",100,11,5,"2026-09-28T10:00"),
    t("buy",100,10,0,"2026-09-29T10:00",{discipline:"临时操作",plan:"",reason:""}),t("sell",100,9,0,"2026-09-30T10:00"),
  ];
  const f=personalFeedback(ledger);
  assert.equal(f.excludedOpeningCycles,1);assert.equal(f.closedCycles,2);
  assert.equal(f.buckets.find(b=>b.label==="按计划盈利").count,1);
  assert.equal(f.buckets.find(b=>b.label==="偏离计划亏损").count,1);
  assert.equal(f.pending.length,1);assert.equal(f.pending[0].issues.length,2);
});
test("超卖及撤销关联买入时拒绝损坏账本", () => {
  assert.throws(() => calculate([t("sell", 100, 10)]), /超过/);
  assert.throws(
    () =>
      calculate([
        t("buy", 100, 10, 5, undefined, { voided: true }),
        t("sell", 100, 11),
      ]),
    /超过/,
  );
});
test("舍入尾差在最后卖出完全清算", () => {
  const r = calculate([
    t("buy", 3, 10, 0.01),
    t("sell", 1, 11, 0),
    t("sell", 1, 11, 0),
    t("sell", 1, 11, 0),
  ]);
  assert.equal(r.positions.length, 0);
  assert.ok(Math.abs(r.realized - 2.99) < 1e-10);
});
test("按时间排序，保持同分钟输入顺序", () => {
  const buy = t("buy", 100, 10, 0, "2026-09-28T10:00"),
    sell = t("sell", 100, 11, 0, "2026-09-29T10:00");
  assert.equal(calculate([sell, buy]).realized, 100);
});
test("CSV中文、逗号、引号和换行往返", () => {
  const original = t("buy", 100, 10, 5, undefined, {
    reason: '理由,含"引号"\n换行',
  });
  assert.deepEqual(importCSV(toCSV([original]))[0].reason, original.reason);
  assert.equal(parseCSV('a,b\r\n"甲,乙","丙"').length, 2);
});
test("非法日期及非有限价格被拒绝", () => {
  assert.equal(tradeSchema.safeParse(t("buy", 100, NaN)).success, false);
  assert.equal(
    tradeSchema.safeParse(t("buy", 100, 10, 0, "2026-02-31T10:00")).success,
    false,
  );
  assert.equal(
    tradeSchema.safeParse(t("buy", 100, 10, 0, "2026-09-28T10:99")).success,
    false,
  );
});
test("重复ID与无效CSV拒绝", () => {
  const a = t("buy", 100, 10);
  assert.throws(() => calculate([a, a]), /ID重复/);
  assert.throws(() => importCSV("code,name\n600000.SH,测试"), /缺少列/);
});
test("无交易日与零损益平仓边界", () => {
  assert.equal(dailySummary(blankLedger(), "2026-09-28").count, 0);
  const r = calculate([t("buy", 100, 10, 0), t("sell", 100, 10, 0)]);
  assert.equal(r.winRate, 0);
  assert.equal(r.payoff, null);
});
