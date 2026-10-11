import { z } from "zod";
import { context, failure } from "@/lib/server";
import {
  blankLedger,
  tradeSchema,
  reviewSchema,
  eventSchema,
  calculate,
  fingerprint,
  brokerStatementSchema,
  type Ledger,
} from "@/lib/ledger";
export const dynamic = "force-dynamic";
const mutationSchema = z.object({
  revision: z.number().int().min(0),
  action: z.enum([
    "trade",
    "void",
    "import",
    "review",
    "event",
    "watch",
    "restore",
    "statement",
  ]),
  data: z.unknown(),
});
const restoredSchema = z.object({
  brokerStatements: z.array(brokerStatementSchema).max(500).optional(),
  trades: z.array(tradeSchema).max(2500),
  reviews: z.record(reviewSchema),
  reviewHistory: z.array(reviewSchema).max(2000),
  events: z.array(eventSchema).max(500),
  watchlist: z
    .array(
      z.object({
        code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
        name: z.string().min(1).max(30),
      }),
    )
    .max(30),
});
export async function GET(request: Request) {
  try {
    const { db, owner } = await context(request);
    const row = await db
      .prepare("SELECT payload,revision FROM ledgers WHERE owner=?")
      .bind(owner)
      .first<{ payload: string; revision: number }>();
    const audit = await db
      .prepare(
        "SELECT revision,action,detail,created_at FROM audit WHERE owner=? ORDER BY revision DESC LIMIT 30",
      )
      .bind(owner)
      .all();
    return Response.json(
      {
        ledger: row ? JSON.parse(row.payload) : blankLedger(),
        revision: row?.revision || 0,
        audit: audit.results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, owner } = await context(request, true);
    const raw = await request.text();
    if (raw.length > 2000000)
      return Response.json(
        { error: "导入内容过大，请分批处理" },
        { status: 413 },
      );
    const parsed = mutationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ error: "保存参数无效" }, { status: 400 });
    const { revision, action, data } = parsed.data;
    const row = await db
      .prepare("SELECT payload,revision FROM ledgers WHERE owner=?")
      .bind(owner)
      .first<{ payload: string; revision: number }>();
    if ((row?.revision || 0) !== revision) throw new Error("CONFLICT");
    let ledger: Ledger = row ? JSON.parse(row.payload) : blankLedger();
    const stamp = new Date().toISOString();
    let detail = "";
    let previous: unknown = null;
    try {
      if (action === "trade") {
        const trade = tradeSchema.parse(data);
        trade.updatedAt = stamp;
        const index = ledger.trades.findIndex((t) => t.id === trade.id);
        if (index >= 0) {
          previous = structuredClone(ledger.trades[index]);
          trade.createdAt = ledger.trades[index].createdAt;
          trade.voided = ledger.trades[index].voided;
          ledger.trades[index] = trade;
          detail = "更正 " + trade.code;
        } else {
          trade.createdAt = stamp;
          trade.voided = false;
          ledger.trades.push(trade);
          detail = "新增 " + trade.code;
        }
      }
      if (action === "statement") {
        const statement = brokerStatementSchema.parse(data);
        statement.updatedAt = stamp;
        const statements = ledger.brokerStatements ?? [];
        const index = statements.findIndex(s => s.id === statement.id);
        if (index >= 0) {
          previous = structuredClone(statements[index]);
          statements[index] = statement;
        } else statements.push(statement);
        ledger.brokerStatements = statements;
        detail = `登记券商记录 ${statement.date}：${statement.fills.length} 笔成交、${statement.positions.length} 只持仓，成本及费用待对账`;
      }
      if (action === "void") {
        const { id } = z.object({ id: z.string() }).parse(data);
        const t = ledger.trades.find((t) => t.id === id);
        if (!t) throw new Error("成交记录不存在");
        previous = structuredClone(t);
        t.voided = true;
        t.updatedAt = stamp;
        detail = "撤销 " + t.code;
      }
      if (action === "import") {
        const { trades, allowSimilar } = z
          .object({
            trades: z.array(tradeSchema).min(1).max(500),
            allowSimilar: z.boolean(),
          })
          .parse(data);
        const ids = new Set(ledger.trades.map((t) => t.id));
        const hashes = new Set(
          ledger.trades.filter((t) => !t.voided).map(fingerprint),
        );
        let skipped = 0;
        for (const t of trades) {
          if (ids.has(t.id) || (!allowSimilar && hashes.has(fingerprint(t)))) {
            skipped++;
            continue;
          }
          t.createdAt = stamp;
          t.updatedAt = stamp;
          t.voided = false;
          ledger.trades.push(t);
          ids.add(t.id);
          hashes.add(fingerprint(t));
        }
        detail = `导入 ${trades.length - skipped} 笔，跳过 ${skipped} 笔重复`;
      }
      if (action === "review") {
        const review = reviewSchema.parse(data);
        const prior = ledger.reviews[review.date];
        if (prior) ledger.reviewHistory.push(prior);
        review.version = (prior?.version || 0) + 1;
        review.updatedAt = stamp;
        review.basedOnRevision = revision;
        ledger.reviews[review.date] = review;
        detail = "保存复盘 " + review.date;
      }
      if (action === "event") {
        const event = eventSchema.parse(data);
        const i = ledger.events.findIndex((e) => e.id === event.id);
        if (i >= 0) ledger.events[i] = event;
        else ledger.events.push(event);
        detail = "保存事件 " + event.title;
      }
      if (action === "watch") {
        const watch = z
          .object({
            code: z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),
            name: z.string().trim().min(1).max(30),
            remove: z.boolean().optional(),
          })
          .parse(data);
        ledger.watchlist = ledger.watchlist.filter(
          (w) => w.code !== watch.code,
        );
        if (!watch.remove)
          ledger.watchlist.push({ code: watch.code, name: watch.name });
        detail = (watch.remove ? "移除" : "添加") + "观察 " + watch.code;
      }
      if (action === "restore") {
        const backup = restoredSchema.parse(data);
        if (
          ledger.trades.length ||
          Object.keys(ledger.reviews).length ||
          ledger.events.length ||
          ledger.watchlist.length ||
          ledger.brokerStatements?.length
        )
          throw new Error("仅支持恢复到空账本，已有记录请使用成交 CSV 合并");
        ledger = backup;
        detail = "恢复完整备份";
      }
      restoredSchema.parse(ledger);
      calculate(ledger.trades);
    } catch (e) {
      const msg =
        e instanceof z.ZodError ? e.issues[0].message : (e as Error).message;
      return Response.json({ error: msg }, { status: 400 });
    }
    const next = revision + 1,
      token = crypto.randomUUID(),
      payload = JSON.stringify(ledger);
    if (new TextEncoder().encode(payload).byteLength > 1500000)
      return Response.json(
        {
          error:
            "账本达到当前版本容量上限，请先导出备份并扩展存储结构。现有记录不受影响。",
        },
        { status: 400 },
      );
    const auditDetail = JSON.stringify({
      summary: detail,
      previous,
      submitted: action === "trade" ? data : null,
    });
    const write = row
      ? db
          .prepare(
            "UPDATE ledgers SET payload=?,revision=?,mutation=?,updated_at=? WHERE owner=? AND revision=?",
          )
          .bind(payload, next, token, stamp, owner, revision)
      : db
          .prepare(
            "INSERT OR IGNORE INTO ledgers(owner,payload,revision,mutation,updated_at) VALUES(?,?,?,?,?)",
          )
          .bind(owner, payload, next, token, stamp);
    const result = await db.batch([
      write,
      db
        .prepare(
          "INSERT INTO audit(owner,revision,action,detail,created_at) SELECT owner,revision,?,?,? FROM ledgers WHERE owner=? AND mutation=?",
        )
        .bind(action, auditDetail, stamp, owner, token),
    ]);
    if (!result[0].meta.changes) throw new Error("CONFLICT");
    return Response.json({
      ledger,
      revision: next,
      message: detail,
      auditDetail,
    });
  } catch (e) {
    if (e instanceof SyntaxError)
      return Response.json({ error: "文件格式无效" }, { status: 400 });
    return failure(e);
  }
}
