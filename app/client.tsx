"use client";
import { useState } from "react";
import {
  Activity,
  BookOpen,
  ChartNoAxesCombined,
  NotebookPen,
  Plus,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from "@/components/ui/table";
import { DeskProvider, useDesk } from "@/components/desk/provider";
import {
  Trades,
  Reviews,
  Stats,
  Positions,
  TradeDialog,
  EventDialog,
  SettingsDialog,
} from "@/components/desk/workspace";
import {
  MarketChart,
  RealMarketDialog,
  demoBars,
  evidence,
} from "@/components/desk/market";
const stocks = [
  ["示例科技", "DEMO01", "半导体", "容量中军", "+3.28%", "承接"],
  ["示例电子", "DEMO02", "半导体", "趋势核心", "+5.12%", "转强"],
  ["示例智能", "DEMO03", "机器人", "情绪龙头", "+2.46%", "分歧"],
  ["示例算力", "DEMO04", "算力", "容量中军", "−1.32%", "转弱"],
  ["示例装备", "DEMO05", "机器人", "弹性核心", "+1.86%", "确认"],
  ["示例新材", "DEMO06", "半导体", "补涨候选", "+0.73%", "观察"],
];
function Panel({
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
export default function ClientDesk() {
  return (
    <DeskProvider>
      <Home />
    </DeskProvider>
  );
}
function Home() {
  const [tab, setTab] = useState("market"),
    [selected, setSelected] = useState(0),
    [sector, setSector] = useState(""),
    [cursor, setCursor] = useState(79),
    [eventOpen, setEventOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [marketOpen, setMarketOpen] = useState(false);
  const { ledger, loading, error, refresh, setTrade } = useDesk();
  const stock = stocks[selected];
  const snapshots = stocks.map((s, i) => {
    const b = demoBars(i).slice(0, cursor),
      e = evidence(b)!;
    const pct = (e.last.close / (24.07 + i * 7.12) - 1) * 100;
    return [
      ...s.slice(0, 4),
      (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
      e.state,
    ];
  });
  return (
    <Tabs value={tab} onValueChange={setTab} className="app">
      <header className="topbar">
        <div className="brand">
          <ChartNoAxesCombined />
          <b>短线决策台</b>
          <span>工作台 / 01</span>
        </div>
        <TabsList className="main-tabs">
          {(
            [
              ["market", "市场总览", Activity],
              ["trades", "交易日志", BookOpen],
              ["review", "每日复盘", NotebookPen],
              ["stats", "交易统计", ChartNoAxesCombined],
            ] as const
          ).map(([id, label, Icon]) => (
            <TabsTrigger key={id as string} value={id as string}>
              <Icon size={16} />
              {label as string}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="top-actions">
          <button
            className="text-link"
            aria-label="数据与备份"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
          </button>
          <span className="mode-badge">演示行情</span>
          <button className="button primary" onClick={() => setTrade(null)}>
            <Plus size={16} />
            记录交易
          </button>
        </div>
      </header>
      <main>
        <div className="page-title">
          <div>
            <small>
              {tab === "market"
                ? "MARKET OVERVIEW"
                : tab === "trades"
                  ? "TRADING JOURNAL"
                  : tab === "review"
                    ? "DAILY REVIEW"
                    : "PERFORMANCE"}
            </small>
            <h1>
              {tab === "market"
                ? "市场总览"
                : tab === "trades"
                  ? "交易日志"
                  : tab === "review"
                    ? "每日复盘"
                    : "交易统计"}
            </h1>
          </div>
          <div className="toolbar" style={{ margin: 0 }}>
            <span className="muted">
              {loading
                ? "读取账本中…"
                : error
                  ? "账本读取异常"
                  : "个人账本已读取"}
            </span>
            <button className="button" onClick={() => setMarketOpen(true)}>
              真实行情 / 自选
            </button>
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}{" "}
            <button className="text-link" onClick={() => refresh()}>
              重新读取账本
            </button>
          </div>
        )}
        <TabsContent value="market">
          <div className="metric-grid">
            {[
              ["情绪温度", "68", "/ 100", "修复区间"],
              ["涨停 / 跌停", "56", "/ 8", "演示市场样本"],
              ["连板高度", "5", "板", "高度保持"],
              ["炸板率", "24.3", "%", "分歧仍在"],
              ["昨日涨停溢价", "+2.16", "%", "情绪反馈"],
              ["两市成交额", "6,842", "亿", "模拟累计成交"],
            ].map((m, i) => (
              <div className="metric" key={m[0]}>
                <label>{m[0]}</label>
                <strong className={i === 0 || i === 4 ? "up" : ""}>
                  {m[1]} <em>{m[2]}</em>
                </strong>
                <div className="metric-bottom">
                  <span>{m[3]}</span>
                  <svg viewBox="0 0 90 22">
                    <path
                      d="M0 20 L8 15 L16 17 L24 9 L32 12 L40 6 L48 10 L57 4 L66 7 L76 2 L88 0"
                      fill="none"
                      stroke={i === 4 ? "#f27680" : "#5b92ed"}
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
          <div className="cycle">
            <b>情绪周期</b>
            {["冰点", "修复", "发酵", "高潮", "分歧", "退潮"].map((s) => (
              <span key={s} className={s === "修复" ? "active" : ""}>
                {s}
              </span>
            ))}
            <small>规则候选：修复 · 待确认</small>
            <span className="muted">演示数据</span>
          </div>
          <div className="market-grid">
            <div className="column">
              <Panel
                title="主线板块"
                extra={<span className="muted">综合强度</span>}
              >
                <div className="sectors">
                  {[
                    ["半导体", 86, "主线"],
                    ["机器人", 79, "发酵"],
                    ["算力", 73, "分歧"],
                    ["低空经济", 61, "轮动"],
                  ].map((s, i) => (
                    <button
                      key={s[0]}
                      className="sector"
                      onClick={() =>
                        setSector(sector === s[0] ? "" : String(s[0]))
                      }
                    >
                      <span className="rank">0{i + 1}</span>
                      <b>{s[0]}</b>
                      <div className="bar">
                        <i style={{ width: s[1] + "%" }} />
                      </div>
                      <strong>{s[1]}</strong>
                      <span className="tag">{s[2]}</span>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel
                title="核心股池"
                extra={<span className="count">6只候选</span>}
              >
                {sector && (
                  <div className="stock-filter">
                    {sector}{" "}
                    <button className="text-link" onClick={() => setSector("")}>
                      · 显示全部
                    </button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称 / 角色</TableHead>
                      <TableHead>涨幅</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s, i) =>
                      sector && s[2] !== sector ? null : (
                        <TableRow
                          key={s[1]}
                          className={selected === i ? "selected" : ""}
                          onClick={() => setSelected(i)}
                        >
                          <TableCell>
                            <button
                              className="stock-name"
                              onClick={() => setSelected(i)}
                            >
                              {s[0]}
                              <small>{s[3]}</small>
                            </button>
                          </TableCell>
                          <TableCell
                            className={s[4].startsWith("-") ? "down" : "up"}
                          >
                            {s[4]}
                          </TableCell>
                          <TableCell>
                            <span className={"tag state-" + s[5]}>{s[5]}</span>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </Panel>
            </div>
            <MarketChart
              stock={stock}
              index={selected}
              cursor={cursor}
              setCursor={setCursor}
            />
            <div className="column">
              <Panel
                title="新闻与事件"
                extra={
                  <button
                    className="text-link"
                    onClick={() => setEventOpen(true)}
                  >
                    ＋ 记录事件
                  </button>
                }
              >
                <div className="events">
                  {ledger.events
                    .slice()
                    .reverse()
                    .slice(0, 4)
                    .map((e) => (
                      <article key={e.id}>
                        <div>
                          <time>{e.date}</time>
                          <span className="tag">
                            {e.verified ? "已核实" : "待核实"}
                          </span>
                        </div>
                        <h3>{e.title}</h3>
                        <p>{e.note}</p>
                        {e.url && (
                          <a
                            className="event-link"
                            href={e.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            查看来源
                          </a>
                        )}
                      </article>
                    ))}
                  {!ledger.events.length &&
                    [
                      ["09:17", "政策", "产业支持政策待核实"],
                      ["09:42", "公告", "公司公告待人工解读"],
                      ["10:21", "行业", "板块异动与事件关联待确认"],
                    ].map((e) => (
                      <article key={e[0]}>
                        <div>
                          <time>{e[0]}</time>
                          <span className="tag">{e[1]}</span>
                          <small>示例事件</small>
                        </div>
                        <h3>{e[2]}</h3>
                        <p>演示内容 · 真实事件可手动记录</p>
                      </article>
                    ))}
                </div>
              </Panel>
              <Positions />
            </div>
          </div>
          <div className="bottom-grid">
            <button className="summary-card" onClick={() => setTab("review")}>
              <NotebookPen />
              <div>
                <h3>每日复盘</h3>
                <p>市场回顾 · 执行检查 · 次日计划</p>
              </div>
              <span>{Object.keys(ledger.reviews).length} 日已记录</span>
            </button>
            <button className="summary-card" onClick={() => setTab("stats")}>
              <ChartNoAxesCombined />
              <div>
                <h3>个人交易统计</h3>
                <p>从真实成交积累自己的交易样本</p>
              </div>
              <span>查看</span>
            </button>
          </div>
        </TabsContent>
        <TabsContent value="trades">
          <Trades />
        </TabsContent>
        <TabsContent
          forceMount
          value="review"
          className={tab === "review" ? "" : "hidden"}
        >
          <Reviews />
        </TabsContent>
        <TabsContent value="stats">
          <Stats />
        </TabsContent>
      </main>
      <footer>
        <span>
          <ShieldCheck size={13} /> 人工决策 · 无自动委托
        </span>
        <span>首页：演示行情　/　交易与复盘：个人真实记录</span>
        <span>短线决策台 · v0.1</span>
      </footer>
      <TradeDialog />
      <EventDialog open={eventOpen} setOpen={setEventOpen} />
      <SettingsDialog open={settingsOpen} setOpen={setSettingsOpen} />
      <RealMarketDialog open={marketOpen} setOpen={setMarketOpen} />
    </Tabs>
  );
}
