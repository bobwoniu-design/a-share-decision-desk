"use client";
import { useState } from "react";
import { HistoricalMarket } from "@/components/desk/history";
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
import { RealMarketDialog } from "@/components/desk/market";
export default function ClientDesk() {
  return (
    <DeskProvider>
      <Home />
    </DeskProvider>
  );
}
function Home() {
  const [tab, setTab] = useState("market"),
    [eventOpen, setEventOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [marketOpen, setMarketOpen] = useState(false);
  const { loading, error, refresh, setTrade } = useDesk();
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
          <span className="mode-badge">历史行情</span>
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
          <HistoricalMarket onRecordEvent={() => setEventOpen(true)} onReview={() => setTab("review")} />
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
        <span>首页：历史行情　/　交易与复盘：个人真实记录</span>
        <span>短线决策台 · v0.4</span>
      </footer>
      <TradeDialog />
      <EventDialog open={eventOpen} setOpen={setEventOpen} />
      <SettingsDialog open={settingsOpen} setOpen={setSettingsOpen} />
      <RealMarketDialog open={marketOpen} setOpen={setMarketOpen} />
    </Tabs>
  );
}
