import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "日期无效",
  );
export const tradeSchema = z.object({
  id: z.string().min(1).max(100),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}\.(SH|SZ|BJ)$/, "请输入例如 600000.SH 的证券代码"),
  name: z.string().trim().min(1).max(30),
  time: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .refine(
      (v) =>
        !isNaN(Date.parse(v + "+08:00")) &&
        v.slice(11) <= "23:59" &&
        v.slice(14) <= "59" &&
        new Date(v.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) ===
          v.slice(0, 10),
      "成交时间无效",
    ),
  side: z.enum(["buy", "sell", "opening"]),
  price: z.number().positive().max(100000),
  qty: z.number().int().positive().max(100000000),
  fee: z.number().min(0).max(10000000),
  reason: z.string().max(3000),
  plan: z.string().max(3000),
  tag: z.string().max(40),
  discipline: z.enum(["按计划", "临时操作", "未记录"]),
  source: z.enum(["manual", "csv"]),
  voided: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Trade = z.infer<typeof tradeSchema>;
export const reviewSchema = z.object({
  date,
  good: z.string().max(5000),
  improve: z.string().max(5000),
  plan: z.string().max(5000),
  market: z.string().max(5000),
  status: z.enum(["draft", "confirmed"]),
  updatedAt: z.string(),
  basedOnRevision: z.number().int(),
  version: z.number().int().positive(),
});
export type Review = z.infer<typeof reviewSchema>;
export const eventSchema = z.object({
  id: z.string(),
  date,
  title: z.string().trim().min(1).max(160),
  url: z
    .string()
    .max(2000)
    .refine((v) => !v || /^https?:\/\//i.test(v), "来源只支持 http/https 链接"),
  note: z.string().max(3000),
  code: z.string().max(20),
  verified: z.boolean(),
});
export type NewsEvent = z.infer<typeof eventSchema>;
// Broker evidence can be recorded before opening costs and fees are available.
// It must never be passed to calculate() as invented buys or zero-fee fills.
export const brokerStatementSchema = z.object({
  id: z.string().min(1).max(100),
  date,
  source: z.literal("user_screenshots"),
  status: z.literal("pending_reconciliation"),
  capturedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  displayedHoldingCount: z.number().int().nonnegative().nullable(),
  holdingsComplete: z.boolean(),
  notes: z.array(z.string().max(3000)).max(30),
  sourceImages: z.array(z.string().min(1).max(200)).min(1).max(50),
  fills: z.array(z.object({
    id: z.string().min(1).max(100),
    code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
    name: z.string().min(1).max(30),
    side: z.enum(["buy", "sell"]),
    orderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
    price: z.number().positive(),
    qty: z.number().int().positive(),
    fee: z.number().nonnegative().nullable(),
    sourceImages: z.array(z.string()).min(1),
  })).max(500),
  positions: z.array(z.object({
    code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
    name: z.string().min(1).max(30),
    qty: z.number().int().positive(),
    available: z.number().int().nonnegative(),
    brokerCost: z.number().nonnegative(),
    marketPrice: z.number().positive(),
  }).refine(p => p.available <= p.qty, "可用数量不能超过持仓数量")).max(200),
  excludedOrders: z.array(z.object({
    code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
    name: z.string().min(1).max(30),
    orderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
    price: z.number().positive(),
    qty: z.number().int().positive(),
    reason: z.literal("全部撤单，成交数量为0"),
  })).max(500),
  updatedAt: z.string(),
}).superRefine((s, ctx) => {
  if (new Set(s.fills.map(f => f.id)).size !== s.fills.length)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "券商成交记录ID重复"});
  if (new Set(s.positions.map(p => p.code)).size !== s.positions.length)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "券商持仓代码重复"});
});
export type BrokerStatement = z.infer<typeof brokerStatementSchema>;
export type Ledger = {
  trades: Trade[];
  reviews: Record<string, Review>;
  reviewHistory: Review[];
  events: NewsEvent[];
  watchlist: { code: string; name: string }[];
  brokerStatements?: BrokerStatement[];
};
export const blankLedger = (): Ledger => ({
  trades: [],
  reviews: {},
  reviewHistory: [],
  events: [],
  watchlist: [],
  brokerStatements: [],
});
export const cents = (value: number) =>
  Math.round((value + Number.EPSILON) * 100);
export const money = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
}
export type Position = {
  code: string;
  name: string;
  qty: number;
  cost: number;
  realized: number;
};
export type Closed = {
  code: string;
  name: string;
  pnl: number;
  time: string;
  tag: string;
  discipline: string;
  opening: boolean;
  planRecorded: boolean;
};
export function calculate(trades: Trade[]) {
  if (new Set(trades.map((t) => t.id)).size !== trades.length)
    throw new Error("成交记录ID重复");
  const positions: Record<string, Position> = {},
    cycles: Record<string, { pnl: number; tag: string; discipline: string; opening: boolean; planRecorded: boolean }> =
      {},
    closed: Closed[] = [],
    fills: { id: string; time: string; pnl: number }[] = [];
  let fees = 0;
  const active = trades
    .filter((t) => !t.voided)
    .map((t, i) => ({ ...t, order: i }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order);
  for (const t of active) {
    if (!positions[t.code])
      positions[t.code] = {
        code: t.code,
        name: t.name,
        qty: 0,
        cost: 0,
        realized: 0,
      };
    const p = positions[t.code],
      amount = cents(t.price * t.qty),
      fee = cents(t.fee);
    fees += fee;
    if (t.side === "buy" || t.side === "opening") {
      if (p.qty === 0)
        cycles[t.code] = {
          pnl: 0,
          tag: t.tag || "未分类",
          discipline: t.discipline,
          opening: t.side === "opening",
          planRecorded: !!t.plan.trim(),
        };
      if (t.side === "opening" && p.qty > 0)
        throw new Error(t.name + " 已有持仓，期初持仓应早于后续交易");
      p.qty += t.qty;
      p.cost += amount + fee;
      p.name = t.name;
    } else {
      if (p.qty < t.qty)
        throw new Error(
          t.name + " 卖出数量超过当时持仓，请先补录买入或期初持仓",
        );
      const allocated =
        t.qty === p.qty ? p.cost : Math.round((p.cost * t.qty) / p.qty);
      const pnl = amount - fee - allocated;
      p.qty -= t.qty;
      p.cost -= allocated;
      p.realized += pnl;
      fills.push({ id: t.id, time: t.time, pnl: pnl / 100 });
      cycles[t.code].pnl += pnl;
      if (p.qty === 0) {
        closed.push({
          code: t.code,
          name: t.name,
          pnl: cycles[t.code].pnl / 100,
          time: t.time,
          tag: cycles[t.code].tag,
          discipline: cycles[t.code].discipline,
          opening: cycles[t.code].opening,
          planRecorded: cycles[t.code].planRecorded,
        });
        delete cycles[t.code];
      }
    }
  }
  const wins = closed.filter((x) => x.pnl > 0),
    losses = closed.filter((x) => x.pnl < 0);
  return {
    positions: Object.values(positions)
      .filter((p) => p.qty > 0)
      .map((p) => ({ ...p, cost: p.cost / 100, realized: p.realized / 100 })),
    closed,
    fills,
    fees: fees / 100,
    realized: fills.reduce((a, b) => a + b.pnl, 0),
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    payoff:
      wins.length && losses.length
        ? wins.reduce((a, b) => a + b.pnl, 0) /
          wins.length /
          Math.abs(losses.reduce((a, b) => a + b.pnl, 0) / losses.length)
        : null,
  };
}
export function dailySummary(ledger: Ledger, dateValue: string) {
  const trades = ledger.trades.filter(
      (t) => !t.voided && t.time.startsWith(dateValue) && t.side !== "opening",
    ),
    calc = calculate(
      ledger.trades.filter((t) => t.time.slice(0, 10) <= dateValue),
    );
  return {
    count: trades.length,
    buys: trades.filter((t) => t.side === "buy").length,
    sells: trades.filter((t) => t.side === "sell").length,
    fees: trades.reduce((s, t) => s + t.fee, 0),
    realized: calc.fills
      .filter((f) => f.time.startsWith(dateValue))
      .reduce((s, f) => s + f.pnl, 0),
    missing: trades.filter((t) => !t.reason.trim()).length,
    unplanned: trades.filter((t) => t.discipline === "临时操作").length,
    positions: calc.positions,
    trades,
  };
}
export function csvEscape(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCSV(trades: Trade[]) {
  const headers = [
    "id",
    "code",
    "name",
    "time",
    "side",
    "price",
    "qty",
    "fee",
    "reason",
    "plan",
    "tag",
    "discipline",
  ];
  return (
    "\uFEFF" +
    [
      headers.join(","),
      ...trades
        .filter((t) => !t.voided)
        .map((t) =>
          headers.map((h) => csvEscape(t[h as keyof Trade])).join(","),
        ),
    ].join("\r\n")
  );
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importCSV(text: string) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("文件中没有成交记录");
  const headers = rows.shift()!;
  for (const h of ["code", "name", "time", "side", "price", "qty", "fee"])
    if (!headers.includes(h)) throw new Error("缺少列：" + h);
  return rows.map((r, i) => {
    const o = Object.fromEntries(headers.map((h, n) => [h, r[n] || ""]));
    const stamp = new Date().toISOString();
    const result = tradeSchema.safeParse({
      ...o,
      id: o.id || crypto.randomUUID(),
      price: Number(o.price),
      qty: Number(o.qty),
      fee: Number(o.fee),
      reason: o.reason || "",
      plan: o.plan || "",
      tag: o.tag || "未分类",
      discipline: o.discipline || "未记录",
      source: "csv",
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (!result.success)
      throw new Error(`第 ${i + 2} 行：${result.error.issues[0].message}`);
    return result.data;
  });
}
export function fingerprint(t: Trade) {
  return [t.code, t.time, t.side, t.price, t.qty, t.fee].join("|");
}
