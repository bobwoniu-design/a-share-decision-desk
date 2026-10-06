"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Download,
  Upload,
  BookOpen,
  NotebookPen,
  Check,
  Trash2,
  History,
  Search,
  FileDown,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useDesk } from "./provider";
import {
  calculate,
  dailySummary,
  money,
  today,
  toCSV,
  importCSV,
  fingerprint,
  tradeSchema,
  type Trade,
  type Review,
  type NewsEvent,
} from "@/lib/ledger";
function AuditDetail({ detail }: { detail: string }) {
  let value: {
    summary: string;
    previous?: Trade | null;
    submitted?: Trade | null;
  };
  try {
    value = JSON.parse(detail);
  } catch {
    value = { summary: detail };
  }
  return (
    <>
      <b>{value.summary}</b>
      {value.previous && (
        <p>
          原记录：{value.previous.name} · {value.previous.time} ·{" "}
          {value.previous.qty} 股 @ {value.previous.price} · 费用{" "}
          {value.previous.fee}
          <br />
          原理由：{value.previous.reason || "未填写"}
          <br />
          原计划：{value.previous.plan || "未填写"}
        </p>
      )}
      {value.submitted && (
        <p>
          保存后：{value.submitted.qty} 股 @ {value.submitted.price} · 费用{" "}
          {value.submitted.fee}
          <br />
          理由：{value.submitted.reason || "未填写"}
        </p>
      )}
    </>
  );
}
export function Panel({
  title,
  extra,
  children,
  className = "",
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function download(name: string, content: string, type = "text/plain") {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Positions() {
  const { ledger, setTrade, loading } = useDesk();
  const result = calculate(ledger.trades);
  return (
    <Panel title="我的持仓" extra={<span className="muted">真实账本</span>}>
      {result.positions.length ? (
        <div className="page-pad">
          {result.positions.map((p) => (
            <div className="list-pair" key={p.code}>
              <div>
                <b>{p.name}</b>
                <small>
                  {p.code} · {p.qty.toLocaleString()} 股
                </small>
              </div>
              <div style={{ textAlign: "right" }}>
                <b>¥{money(p.cost / p.qty)}</b>
                <small>含费单位成本</small>
              </div>
            </div>
          ))}
          <div className="status-line" style={{ marginTop: 12 }}>
            未连接报价，浮盈与总仓位暂不计算。
          </div>
          <button className="button" onClick={() => setTrade(null)}>
            <Plus size={14} />
            记录交易
          </button>
        </div>
      ) : (
        <div className="empty-compact">
          <BookOpen size={27} />
          <b>{loading ? "正在读取账本" : "从第一笔交易开始"}</b>
          <p>已有持仓可先录入期初数量和成本。</p>
          <button className="button" onClick={() => setTrade(null)}>
            记录交易
          </button>
        </div>
      )}
    </Panel>
  );
}
export function TradeDialog() {
  const { trade, setTrade, save, busy } = useDesk();
  const [form, setForm] = useState<Record<string, string>>({}),
    [recordId, setRecordId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (trade === undefined) return;
    setRecordId(trade?.id || crypto.randomUUID());
    setForm({
      code: trade?.code || "",
      name: trade?.name || "",
      time: trade?.time || today() + "T09:30",
      side:
        trade?.side === "sell"
          ? "卖出"
          : trade?.side === "opening"
            ? "期初持仓"
            : "买入",
      price: String(trade?.price || ""),
      qty: String(trade?.qty || ""),
      fee: String(trade?.fee ?? 0),
      reason: trade?.reason || "",
      plan: trade?.plan || "",
      tag: trade?.tag || "分歧承接",
      discipline: trade?.discipline || "未记录",
    });
    setError("");
  }, [trade]);
  const update = (key: string, v: string) =>
    setForm((f) => ({ ...f, [key]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const stamp = new Date().toISOString();
    const parsed = tradeSchema.safeParse({
      ...form,
      id: recordId,
      side:
        form.side === "买入"
          ? "buy"
          : form.side === "卖出"
            ? "sell"
            : "opening",
      price: Number(form.price),
      qty: Number(form.qty),
      fee: Number(form.fee),
      source: trade?.source || "manual",
      createdAt: trade?.createdAt || stamp,
      updatedAt: stamp,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (await save("trade", parsed.data)) setTrade(undefined);
  }
  return (
    <Dialog
      open={trade !== undefined}
      onOpenChange={(o) => !o && setTrade(undefined)}
    >
      <DialogContent className="dialog-body sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trade ? "更正成交记录" : "记录一笔交易"}</DialogTitle>
          <DialogDescription>
            记录已发生的成交。时间按北京时间；不会发送交易委托。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          {error && (
            <div role="alert" className="error-banner">
              {error}
            </div>
          )}
          <div className="form-grid">
            <label>
              股票代码
              <input
                required
                placeholder="600000.SH"
                value={form.code || ""}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
              />
            </label>
            <label>
              股票名称
              <input
                required
                value={form.name || ""}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label>
              操作类型
              <Choice
                value={form.side || "买入"}
                onChange={(v) => update("side", v)}
                options={["买入", "卖出", "期初持仓"]}
                label="操作类型"
              />
            </label>
            <label>
              成交时间
              <input
                required
                type="datetime-local"
                value={form.time || ""}
                onInput={(e) => update("time", e.currentTarget.value)}
              />
            </label>
            <label>
              {form.side === "期初持仓"
                ? "含费单位成本（元）"
                : "成交价格（元）"}
              <input
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={form.price || ""}
                onChange={(e) => update("price", e.target.value)}
              />
            </label>
            <label>
              成交数量（股）
              <input
                required
                type="number"
                min="1"
                step="1"
                value={form.qty || ""}
                onChange={(e) => update("qty", e.target.value)}
              />
            </label>
            <label>
              总费用（元）
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.fee || "0"}
                onChange={(e) => update("fee", e.target.value)}
              />
            </label>
            <label>
              交易模式
              <Choice
                value={form.tag || "分歧承接"}
                onChange={(v) => update("tag", v)}
                options={[
                  ...new Set(
                    [
                      "分歧承接",
                      "转强确认",
                      "趋势跟随",
                      "事件驱动",
                      "止损退出",
                      "止盈退出",
                      "未分类",
                      form.tag,
                    ].filter(Boolean),
                  ),
                ]}
                label="交易模式"
              />
            </label>
            <label className="full">
              执行情况
              <Choice
                value={form.discipline || "未记录"}
                onChange={(v) => update("discipline", v)}
                options={["按计划", "临时操作", "未记录"]}
                label="执行情况"
              />
            </label>
            <label className="full">
              买卖理由
              <textarea
                placeholder="当时看到了什么？为什么选择这个时点？"
                value={form.reason || ""}
                onChange={(e) => update("reason", e.target.value)}
              />
            </label>
            <label className="full">
              原计划 / 逻辑失效条件
              <textarea
                placeholder="例如：观察板块同步性；记录你自己的判断条件。"
                value={form.plan || ""}
                onChange={(e) => update("plan", e.target.value)}
              />
            </label>
          </div>
          {form.side === "期初持仓" && (
            <p className="status-line">
              请以首次买卖之前的时间初始化；含费成本已包含历史费用时，总费用填
              0。
            </p>
          )}
          <div className="status-line" style={{ marginTop: 12 }}>
            行情上下文未连接，仅保存你填写的成交与理由。
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => setTrade(undefined)}
            >
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "正在保存…" : "保存成交"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Trades() {
  const { ledger, setTrade, save, busy, audit } = useDesk();
  const [query, setQuery] = useState(""),
    [date, setDate] = useState(""),
    [side, setSide] = useState("全部"),
    [voidId, setVoidId] = useState(""),
    [showVoided, setShowVoided] = useState(false),
    [preview, setPreview] = useState<Trade[] | null>(null),
    [similar, setSimilar] = useState(false),
    [importError, setImportError] = useState(""),
    [showAudit, setShowAudit] = useState(false);
  const rows = ledger.trades
    .filter(
      (t) =>
        (showVoided || !t.voided) &&
        (!date || t.time.startsWith(date)) &&
        (!query ||
          [t.code, t.name, t.reason, t.tag].join(" ").includes(query)) &&
        (side === "全部" ||
          t.side ===
            (side === "买入" ? "buy" : side === "卖出" ? "sell" : "opening")),
    )
    .sort((a, b) => b.time.localeCompare(a.time));
  const duplicate =
    preview?.filter((t) =>
      ledger.trades.some(
        (x) =>
          x.id === t.id || (!x.voided && fingerprint(x) === fingerprint(t)),
      ),
    ).length || 0;
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error("文件请控制在2MB以内");
      setPreview(importCSV(await file.text()));
      setImportError("");
      setSimilar(false);
    } catch (e) {
      setImportError((e as Error).message);
    }
  }
  const csvTemplate =
    "code,name,time,side,price,qty,fee,reason,plan,tag,discipline\n600000.SH,示例名称,2026-09-28T10:00,buy,10.20,100,5,填写真实成交理由,填写原计划,分歧承接,按计划";
  return (
    <>
      <div className="toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="搜索交易"
            placeholder="搜索股票、理由或交易模式"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <input
          aria-label="筛选成交日期"
          type="date"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
        <div style={{ width: 110 }}>
          <Choice
            value={side}
            onChange={setSide}
            options={["全部", "买入", "卖出", "期初持仓"]}
            label="交易方向筛选"
          />
        </div>
        {date && (
          <button className="text-link" onClick={() => setDate("")}>
            全部日期
          </button>
        )}
        <span className="spacer" />
        <button className="button" onClick={() => setShowAudit(true)}>
          <History size={15} />
          变更记录
        </button>
        <button
          className="button"
          onClick={() =>
            download("交易记录.csv", toCSV(rows), "text/csv;charset=utf-8")
          }
        >
          <Download size={15} />
          导出
        </button>
        <label className="button">
          <Upload size={15} />
          导入 CSV
          <input
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button className="button primary" onClick={() => setTrade(null)}>
          <Plus size={16} />
          记录交易
        </button>
      </div>
      {importError && (
        <div className="error-banner">
          {importError}{" "}
          <button
            className="text-link"
            onClick={() => download("成交导入模板.csv", "\uFEFF" + csvTemplate)}
          >
            下载标准模板
          </button>
        </div>
      )}
      <div className="workspace-grid">
        <Panel
          title="逐笔成交"
          extra={<span className="muted">{rows.length} 笔 · 人工记录</span>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "成交时间",
                  "股票",
                  "方向",
                  "价格 / 数量",
                  "费用",
                  "交易模式",
                  "操作",
                ].map((t) => (
                  <TableHead key={t}>{t}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} style={{ opacity: t.voided ? 0.5 : 1 }}>
                  <TableCell>
                    {t.time.slice(0, 10)}
                    <small className="cell-sub">
                      {t.time.slice(11)} 北京时间
                    </small>
                  </TableCell>
                  <TableCell>
                    <b>{t.name}</b>
                    <small className="cell-sub">{t.code}</small>
                  </TableCell>
                  <TableCell>
                    <span className={t.side === "sell" ? "down" : "up"}>
                      {t.voided
                        ? "已撤销"
                        : t.side === "buy"
                          ? "买入"
                          : t.side === "sell"
                            ? "卖出"
                            : "期初"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {money(t.price)}
                    <small className="cell-sub">
                      {t.qty.toLocaleString()} 股
                    </small>
                  </TableCell>
                  <TableCell>{money(t.fee)}</TableCell>
                  <TableCell>
                    <span className="tag">{t.tag}</span>
                    <small className="cell-sub">
                      {t.reason ? "已记录理由" : "待补理由"}
                    </small>
                  </TableCell>
                  <TableCell>
                    {!t.voided && (
                      <div className="actions-inline">
                        <button
                          className="text-link"
                          onClick={() => setTrade(t)}
                        >
                          详情 / 更正
                        </button>
                        <button
                          aria-label={"撤销" + t.name + "成交"}
                          className="text-link loss-button"
                          onClick={() => setVoidId(t.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length && (
            <div className="empty-compact">
              <BookOpen size={32} />
              <b>暂无符合条件的成交</b>
              <p>记录第一笔真实交易，或导入标准 CSV。</p>
              <button
                className="button"
                onClick={() =>
                  download("成交导入模板.csv", "\uFEFF" + csvTemplate)
                }
              >
                下载导入模板
              </button>
            </div>
          )}
          <div className="page-pad">
            <label className="checkbox-label">
              <Checkbox
                checked={showVoided}
                onCheckedChange={(v) => setShowVoided(v === true)}
              />
              显示已撤销记录
            </label>
          </div>
        </Panel>
        <div className="column">
          <Positions />
          <Panel title="记录，也记录当时的想法">
            <div className="page-pad">
              <p className="muted">
                理由和计划可以稍后补充。回看时，将买卖结果与决策过程分别评估。
              </p>
              <div className="divider" />
              <div className="list-pair">
                <span>待补理由</span>
                <b>
                  {
                    ledger.trades.filter((t) => !t.voided && !t.reason.trim())
                      .length
                  }{" "}
                  笔
                </b>
              </div>
              <div className="list-pair">
                <span>未记录执行情况</span>
                <b>
                  {
                    ledger.trades.filter(
                      (t) => !t.voided && t.discipline === "未记录",
                    ).length
                  }{" "}
                  笔
                </b>
              </div>
            </div>
          </Panel>
        </div>
      </div>
      <AlertDialog open={!!voidId} onOpenChange={(o) => !o && setVoidId("")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销这笔记录？</AlertDialogTitle>
            <AlertDialogDescription>
              会重新计算持仓与盈亏，原记录仍保留在历史中。若影响后续卖出的持仓数量，系统会拒绝撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留记录</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (await save("void", { id: voidId })) setVoidId("");
              }}
            >
              确认撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="dialog-body sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>核对导入内容</DialogTitle>
            <DialogDescription>
              识别 {preview?.length} 笔，疑似与已有成交重复 {duplicate}{" "}
              笔。时间按北京时间。
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                {["股票", "时间", "方向", "价格", "数量"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview?.slice(0, 20).map((t, i) => (
                <TableRow key={i}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.time}</TableCell>
                  <TableCell>
                    {t.side === "sell"
                      ? "卖出"
                      : t.side === "opening"
                        ? "期初"
                        : "买入"}
                  </TableCell>
                  <TableCell>{t.price}</TableCell>
                  <TableCell>{t.qty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(preview?.length || 0) > 20 && (
            <p className="muted">预览前20笔，确认后导入全部。</p>
          )}
          <label className="checkbox-label">
            <Checkbox
              checked={similar}
              onCheckedChange={(v) => setSimilar(v === true)}
            />
            保留同时间、同价格、同数量的成交（相同ID仍跳过）
          </label>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              if (
                await save("import", { trades: preview, allowSimilar: similar })
              )
                setPreview(null);
            }}
          >
            确认导入
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="dialog-body">
          <DialogHeader>
            <DialogTitle>账本变更记录</DialogTitle>
            <DialogDescription>
              最近30次修改；刷新账本后可查看最新记录。
            </DialogDescription>
          </DialogHeader>
          {audit.length ? (
            audit.map((a) => (
              <div className="note-row" key={a.revision}>
                <b>#{a.revision}</b>
                <AuditDetail detail={a.detail} />
                <p>
                  {new Date(a.created_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </p>
              </div>
            ))
          ) : (
            <p className="muted">尚无变更记录。</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Reviews() {
  const { ledger, revision, save, busy } = useDesk();
  const [date, setDate] = useState(today()),
    [drafts, setDrafts] = useState<Record<string, Review>>({}),
    [dirty, setDirty] = useState<Record<string, boolean>>({}),
    [history, setHistory] = useState(false);
  const fallback: Review = {
    date,
    good: "",
    improve: "",
    plan: "",
    market: "",
    status: "draft",
    updatedAt: "",
    basedOnRevision: revision,
    version: 1,
  };
  const form = drafts[date] || ledger.reviews[date] || fallback,
    s = dailySummary(ledger, date),
    saved = ledger.reviews[date];
  function change(key: keyof Review, value: string) {
    setDrafts((d) => ({
      ...d,
      [date]: { ...form, [key]: value, status: "draft" },
    }));
    setDirty((d) => ({ ...d, [date]: true }));
  }
  useEffect(() => {
    if (!Object.values(dirty).some(Boolean)) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function persist(status: "draft" | "confirmed") {
    if (await save("review", { ...form, status, date })) {
      setDirty((d) => ({ ...d, [date]: false }));
      setDrafts((d) => {
        const n = { ...d };
        delete n[date];
        return n;
      });
    }
  }
  const report = `${date} 每日复盘\n\n成交 ${s.count} 笔（买入 ${s.buys} / 卖出 ${s.sells}）\n已实现盈亏 ${money(s.realized)} 元；当日费用 ${money(s.fees)} 元\n成本按含费移动平均，未平仓不计入胜率；不是账户当日收益。\n\n市场回顾\n${form.market || "尚未填写"}\n\n做得好的地方\n${form.good || "尚未填写"}\n\n需要改进\n${form.improve || "尚未填写"}\n\n下一交易日计划\n${form.plan || "尚未填写"}\n\n今日操作\n${s.trades.map((t) => `${t.time.slice(11)} ${t.name} ${t.side === "sell" ? "卖出" : "买入"} ${t.qty}股 @${t.price}；理由：${t.reason || "待补充"}`).join("\n") || "无成交记录"}\n`;
  return (
    <>
      <div className="toolbar">
        <input
          type="date"
          aria-label="复盘日期"
          value={date}
          onInput={(e) =>
            e.currentTarget.value && setDate(e.currentTarget.value)
          }
        />
        <span className="tag">
          {dirty[date]
            ? "有未保存修改"
            : saved?.status === "confirmed"
              ? "已确认"
              : "复盘草稿"}
        </span>
        <span className="muted">
          {saved ? "版本 " + saved.version + " · 已保存" : "尚未保存"}
        </span>
        <span className="spacer" />
        <button className="button" onClick={() => setHistory(true)}>
          <History size={15} />
          历史版本
        </button>
        <button
          className="button"
          onClick={() => download(date + "-每日复盘.txt", report)}
        >
          <FileDown size={15} />
          导出复盘
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => persist("draft")}
        >
          保存草稿
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => persist("confirmed")}
        >
          <Check size={16} />
          确认复盘
        </button>
      </div>
      <div className="stat-card-grid">
        {[
          [
            "今日成交",
            String(s.count),
            "买入 " + s.buys + " / 卖出 " + s.sells,
          ],
          ["已实现盈亏", "¥" + money(s.realized), "含已分摊买入费用及卖出费用"],
          ["当日费用", "¥" + money(s.fees), "已纳入成本或盈亏，不重复扣减"],
          ["日末持仓", s.positions.length + " 只", "截至所选日期的账本持仓"],
        ].map((m, i) => (
          <div className="stat-card" key={m[0]}>
            <label>{m[0]}</label>
            <strong
              className={i === 1 ? (s.realized >= 0 ? "up" : "down") : ""}
            >
              {m[1]}
            </strong>
            <small>{m[2]}</small>
          </div>
        ))}
      </div>
      <div className="workspace-grid">
        <Panel
          title="复盘笔记"
          extra={<span className="muted">事实自动汇总 · 判断由你填写</span>}
        >
          <div className="page-pad">
            {saved &&
              ledger.trades.some(
                (t) =>
                  t.updatedAt > saved.updatedAt && t.time.slice(0, 10) <= date,
              ) && (
                <div className="notice">
                  复盘保存后账本发生过更改，汇总已更新，请重新核对后确认。
                </div>
              )}
            <div className="review-block">
              <h3>01　市场与主线回顾</h3>
              <textarea
                aria-label="市场与主线回顾"
                placeholder="今天市场处于什么阶段？哪些主线增强或减弱？没有交易，也可以记录观察。"
                value={form.market}
                onChange={(e) => change("market", e.target.value)}
              />
            </div>
            <div className="review-block">
              <h3>02　今天做对了什么</h3>
              <textarea
                aria-label="今天做对了什么"
                placeholder="写下一个值得重复的决策或执行动作。"
                value={form.good}
                onChange={(e) => change("good", e.target.value)}
              />
            </div>
            <div className="review-block">
              <h3>03　下次需要改进什么</h3>
              <textarea
                aria-label="下次需要改进什么"
                placeholder="结合原计划与当时信息，而不只看最终盈亏。"
                value={form.improve}
                onChange={(e) => change("improve", e.target.value)}
              />
            </div>
            <div className="review-block">
              <h3>04　下一交易日计划</h3>
              <textarea
                aria-label="下一交易日计划"
                placeholder="关注标的、触发条件、放弃条件和需要核实的事件。"
                value={form.plan}
                onChange={(e) => change("plan", e.target.value)}
              />
            </div>
          </div>
        </Panel>
        <div className="column">
          <Panel title="今日操作与执行检查">
            <div className="page-pad">
              {s.trades.length ? (
                s.trades.map((t) => (
                  <div className="note-row" key={t.id}>
                    <div className="list-pair" style={{ padding: 0 }}>
                      <b>
                        {t.time.slice(11)} {t.name}
                      </b>
                      <span className={t.side === "sell" ? "down" : "up"}>
                        {t.side === "sell" ? "卖出" : "买入"} {t.qty}股
                      </span>
                    </div>
                    <p>{t.reason || "买卖理由待补充"}</p>
                    <p>
                      执行：{t.discipline} ·{" "}
                      {t.plan ? "已记录计划" : "缺少事前计划，无法判断偏离"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="empty-compact">
                  <NotebookPen size={28} />
                  <b>当天没有成交记录</b>
                  <p>可以记录主动空仓的原因与放弃的机会。</p>
                </div>
              )}
              <div className="divider" />
              <div className="list-pair">
                <span>待补买卖理由</span>
                <b>{s.missing} 笔</b>
              </div>
              <div className="list-pair">
                <span>自评临时操作</span>
                <b>{s.unplanned} 笔</b>
              </div>
            </div>
          </Panel>
          <Panel title="日末持仓检查">
            <div className="page-pad">
              {s.positions.map((p) => (
                <div className="list-pair" key={p.code}>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {p.qty}股 · 成本 {money(p.cost / p.qty)}
                    </small>
                  </div>
                </div>
              ))}
              <p className="muted">
                {s.positions.length
                  ? "检查买入逻辑是否仍成立，将观察条件写入次日计划。"
                  : "日末无持仓。"}
              </p>
            </div>
          </Panel>
          <Panel title="已保存的复盘">
            <div className="page-pad">
              {Object.values(ledger.reviews)
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 12)
                .map((r) => (
                  <button
                    key={r.date}
                    className="list-pair review-date"
                    onClick={() => setDate(r.date)}
                  >
                    <span>{r.date}</span>
                    <span className="tag">
                      {r.status === "confirmed" ? "已确认" : "草稿"}
                    </span>
                  </button>
                ))}
              {!Object.keys(ledger.reviews).length && (
                <p className="muted">保存后可从这里回看。</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="dialog-body">
          <DialogHeader>
            <DialogTitle>{date} · 历史复盘</DialogTitle>
            <DialogDescription>
              重新保存会保留上一版，不覆盖历史文字。
            </DialogDescription>
          </DialogHeader>
          {ledger.reviewHistory
            .filter((r) => r.date === date)
            .reverse()
            .map((r) => (
              <div className="note-row" key={r.version}>
                <b>
                  版本 {r.version} ·{" "}
                  {r.status === "confirmed" ? "已确认" : "草稿"}
                </b>
                <p>市场：{r.market || "未填写"}</p>
                <p>做对：{r.good || "未填写"}</p>
                <p>改进：{r.improve || "未填写"}</p>
                <p>计划：{r.plan || "未填写"}</p>
              </div>
            ))}
          {!ledger.reviewHistory.some((r) => r.date === date) && (
            <p className="muted">暂无历史版本。</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Stats() {
  const { ledger } = useDesk();
  const result = calculate(ledger.trades),
    [group, setGroup] = useState("交易模式");
  const groups = new Map<string, typeof result.closed>();
  for (const c of result.closed) {
    const key = group === "交易模式" ? c.tag : c.discipline;
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  let cumulative = 0;
  const points = result.closed.map((c) => ({
    date: c.time.slice(0, 10),
    pnl: (cumulative += c.pnl),
  }));
  const hi = Math.max(1, ...points.map((p) => p.pnl)),
    lo = Math.min(0, ...points.map((p) => p.pnl));
  const path = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${45 + (i * 630) / Math.max(1, points.length - 1)},${185 - ((p.pnl - lo) / (hi - lo)) * 150}`,
    )
    .join(" ");
  return (
    <>
      <div className="status-line">
        真实交易账本 · 按完整持仓周期统计 · 已扣成交费用 · 样本{" "}
        {result.closed.length} 笔
      </div>
      <div className="stat-card-grid">
        {[
          [
            "已实现盈亏",
            "¥" + money(result.realized),
            "包含部分卖出已实现部分",
          ],
          [
            "已平仓胜率",
            result.winRate === null ? "—" : result.winRate.toFixed(1) + "%",
            "盈利周期 / 全部已平仓周期",
          ],
          [
            "平均盈亏比",
            result.payoff === null ? "—" : result.payoff.toFixed(2),
            "平均盈利 / 平均亏损绝对值",
          ],
          [
            "累计成交费用",
            "¥" + money(result.fees),
            "包含仍在持仓中的买入费用",
          ],
        ].map((m, i) => (
          <div className="stat-card" key={m[0]}>
            <label>{m[0]}</label>
            <strong
              className={i === 0 ? (result.realized >= 0 ? "up" : "down") : ""}
            >
              {m[1]}
            </strong>
            <small>{m[2]}</small>
          </div>
        ))}
      </div>
      <div className="workspace-grid">
        <Panel
          title="已平仓累计盈亏"
          extra={<span className="muted">金额曲线 · 非账户净值</span>}
        >
          {points.length ? (
            <svg
              viewBox="0 0 720 230"
              className="stats-chart"
              aria-label="已平仓累计盈亏曲线"
              role="img"
            >
              {[35, 110, 185].map((y) => (
                <line
                  key={y}
                  x1="45"
                  x2="680"
                  y1={y}
                  y2={y}
                  stroke="#2b3a50"
                  strokeDasharray="3 5"
                />
              ))}
              <text x="45" y="23" fill="#879bb9" fontSize="12">
                ¥{money(hi)}
              </text>
              <text x="45" y="215" fill="#879bb9" fontSize="12">
                {points[0]?.date}
              </text>
              <text x="570" y="215" fill="#879bb9" fontSize="12">
                {points.at(-1)?.date}
              </text>
              <path d={path} fill="none" stroke="#85b3f7" strokeWidth="2.5" />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={45 + (i * 630) / Math.max(1, points.length - 1)}
                  cy={185 - ((p.pnl - lo) / (hi - lo)) * 150}
                  r="4"
                  fill="#85b3f7"
                >
                  <title>{`${p.date} ¥${money(p.pnl)}`}</title>
                </circle>
              ))}
            </svg>
          ) : (
            <div className="empty-compact">
              <BookOpen size={34} />
              <b>还没有完整平仓样本</b>
              <p>记录完整买入和卖出后，在这里回看结果。</p>
            </div>
          )}
        </Panel>
        <Panel
          title="分组表现"
          extra={
            <div style={{ width: 125 }}>
              <Choice
                value={group}
                onChange={setGroup}
                options={["交易模式", "执行情况"]}
                label="统计分组"
              />
            </div>
          }
        >
          <div className="page-pad">
            {[...groups].map(([name, cs]) => (
              <div className="note-row" key={name}>
                <div className="list-pair">
                  <b>{name}</b>
                  <span
                    className={
                      cs.reduce((s, c) => s + c.pnl, 0) >= 0 ? "up" : "down"
                    }
                  >
                    ¥{money(cs.reduce((s, c) => s + c.pnl, 0))}
                  </span>
                </div>
                <p>
                  {cs.length} 个周期 · 胜率{" "}
                  {(
                    (cs.filter((c) => c.pnl > 0).length / cs.length) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              </div>
            ))}
            {!groups.size && <p className="muted">尚无分组样本。</p>}
            <div className="divider" />
            <p className="muted">
              小样本仅供回顾。交易模式取本轮首次买入标签，执行情况取首次买入自评。
            </p>
          </div>
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="已平仓明细">
          <Table>
            <TableHeader>
              <TableRow>
                {["完成时间", "股票", "交易模式", "净盈亏"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.closed.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>{c.time.replace("T", " ")}</TableCell>
                  <TableCell>
                    {c.name} <small className="muted">{c.code}</small>
                  </TableCell>
                  <TableCell>{c.tag}</TableCell>
                  <TableCell className={c.pnl >= 0 ? "up" : "down"}>
                    {money(c.pnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
      <div className="notice" style={{ marginTop: 16 }}>
        账户收益率与最大回撤暂不计算：仍需完整资金流、期初权益及每日持仓估值。当前只展示可从成交账本核对的结果。
      </div>
    </>
  );
}
export function EventDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { save, busy } = useDesk();
  const [form, setForm] = useState({
    title: "",
    date: today(),
    url: "",
    code: "",
    note: "",
    verified: false,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="dialog-body">
        <DialogHeader>
          <DialogTitle>记录新闻与事件</DialogTitle>
          <DialogDescription>
            保留原始来源与个人判断，独立于行情评分。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save("event", { ...form, id: crypto.randomUUID() })) {
              setOpen(false);
              setForm({ ...form, title: "", url: "", note: "" });
            }
          }}
        >
          <div className="form-grid">
            <label className="full">
              事件标题
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              事件日期
              <input
                required
                type="date"
                value={form.date}
                onInput={(e) =>
                  setForm({ ...form, date: e.currentTarget.value })
                }
              />
            </label>
            <label>
              关联代码
              <input
                placeholder="可选"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className="full">
              来源链接
              <input
                type="url"
                placeholder="https://"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </label>
            <label className="full">
              摘要与个人判断
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <label className="checkbox-label full">
              <Checkbox
                checked={form.verified}
                onCheckedChange={(v) =>
                  setForm({ ...form, verified: v === true })
                }
              />
              已人工核实来源
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={busy}>
              保存事件
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function SettingsDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { ledger, save, busy } = useDesk();
  const [status, setStatus] = useState("正在检查"),
    [backup, setBackup] = useState<unknown>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (open)
      fetch("/api/market?status=1")
        .then(
          (r) => r.json() as Promise<{ configured?: boolean; error?: string }>,
        )
        .then((d) =>
          setStatus(
            d.configured
              ? "已配置 · 待实际查询验证"
              : d.error || "未配置 · 真实行情暂不可用",
          ),
        )
        .catch(() => setStatus("检查失败，请稍后重试"));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="dialog-body">
        <DialogHeader>
          <DialogTitle>数据与备份</DialogTitle>
          <DialogDescription>
            交易与复盘保存在当前用户的持久账本中。
          </DialogDescription>
        </DialogHeader>
        <div className="note-row">
          <b>Tushare 行情</b>
          <p>{status}</p>
          <p>
            接入需要在服务端配置
            TUSHARE_TOKEN，并具有历史分钟数据权限。凭据不存入网页。
          </p>
        </div>
        <div className="note-row">
          <b>完整账本备份</b>
          <p>包含成交、复盘历史、事件和观察名单。支持恢复到空账本。</p>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button
              className="button"
              onClick={() =>
                download(
                  "短线决策台-备份-" + today() + ".json",
                  JSON.stringify(
                    {
                      format: "trading-desk-v1",
                      exportedAt: new Date().toISOString(),
                      ledger,
                    },
                    null,
                    2,
                  ),
                  "application/json",
                )
              }
            >
              <Download size={15} />
              导出备份
            </button>
            <label className="button">
              <Upload size={15} />
              选择备份
              <input
                hidden
                type="file"
                accept=".json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2000000) throw new Error("备份文件过大");
                    const d = JSON.parse(await file.text());
                    if (d.format !== "trading-desk-v1")
                      throw new Error("不是短线决策台备份");
                    setBackup(d.ledger);
                    setError("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          {error && <p className="up">{error}</p>}
          {!!backup && (
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (await save("restore", backup)) setBackup(null);
              }}
            >
              确认恢复到空账本
            </button>
          )}
        </div>
        <p className="muted">
          未接券商账户。新闻为人工录入；每日复盘汇总在打开日期时生成，不在后台定时运行。
        </p>
      </DialogContent>
    </Dialog>
  );
}
