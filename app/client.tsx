"use client";
import { useEffect, useState } from "react";
import { HistoricalMarket, type MarketNavigation } from "@/components/desk/history";
import {
  Activity,
  BookOpen,
  ChartNoAxesCombined,
  ListFilter,
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
  SettingsDialog,
} from "@/components/desk/workspace";
import { RealMarketDialog } from "@/components/desk/market";
import { DEFAULT_MARKET_DATE } from "@/lib/market-data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export default function ClientDesk() {
  return (
    <DeskProvider>
      <Home />
    </DeskProvider>
  );
}
function Home() {
  const [tab, setTab] = useState("market"),
    [marketNavigation, setMarketNavigation] = useState<MarketNavigation>({mode:"close",date:DEFAULT_MARKET_DATE,code:""}),
    [progressOpen, setProgressOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [marketOpen, setMarketOpen] = useState(false);
  const { loading, error, refresh, setTrade } = useDesk();
  useEffect(()=>{
    try {
      const saved=window.sessionStorage.getItem("decision-desk-market-view");
      if(saved){const value=JSON.parse(saved) as Partial<MarketNavigation>;if((value.mode==="close"||value.mode==="live")&&typeof value.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&typeof value.code==="string")setMarketNavigation({mode:value.mode,date:value.date,code:value.code});}
      const view=new URL(window.location.href).searchParams.get("view");
      if(["market","selection","trades","review","stats"].includes(view??""))setTab(view!);
    } catch { /* Browser storage can be unavailable. The default view remains usable. */ }
    const onBack=()=>{const view=new URL(window.location.href).searchParams.get("view");setTab(["market","selection","trades","review","stats"].includes(view??"")?view!:"market");};
    window.addEventListener("popstate",onBack);return()=>window.removeEventListener("popstate",onBack);
  },[]);
  useEffect(()=>{try{window.sessionStorage.setItem("decision-desk-market-view",JSON.stringify({mode:marketNavigation.mode,date:marketNavigation.date,code:marketNavigation.code}));}catch{}},[marketNavigation]);
  const changeTab=(view:string)=>{setTab(view);const url=new URL(window.location.href);url.searchParams.set("view",view);window.history.pushState({view},"",url);};
  return (
    <Tabs value={tab} onValueChange={changeTab} className="app">
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
              ["selection", "选股与自选", ListFilter],
              ["trades", "持仓与交易", BookOpen],
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
          <button className="text-link progress-link" onClick={()=>setProgressOpen(true)}>开发进度</button>
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
                : tab === "selection"
                  ? "STOCK SELECTION"
                : tab === "trades"
                  ? "TRADING JOURNAL"
                  : tab === "review"
                    ? "DAILY REVIEW"
                    : "PERFORMANCE"}
            </small>
            <h1>
              {tab === "market"
                ? "市场总览"
                : tab === "selection"
                  ? "选股与自选"
                : tab === "trades"
                  ? "持仓与交易"
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
        {(tab==="market"||tab==="selection")&&<HistoricalMarket
          view={tab==="market"?"overview":"selection"}
          navigation={marketNavigation}
          onNavigationChange={setMarketNavigation}
          onSelectStock={()=>changeTab("selection")}
        />}
        <TabsContent value="trades">
          <Positions />
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
        <span>市场总览：环境与板块　/　选股与自选：个股分析</span>
        <span>短线决策台 · v0.7 开发中</span>
      </footer>
      <TradeDialog />
      <SettingsDialog open={settingsOpen} setOpen={setSettingsOpen} />
      <RealMarketDialog open={marketOpen} setOpen={setMarketOpen} />
      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="progress-dialog">
          <DialogHeader><DialogTitle>开发进度</DialogTitle><DialogDescription>按已上线、开发中和待开发展示；每次发布后更新。</DialogDescription></DialogHeader>
          <div className="progress-items">
            <div><span className="tag">已上线</span><b>基础看盘与交易记录 · v0.5</b><p>真实日线和分钟数据、行业评分、个股分钟阶段、持仓、交易记录、复盘与统计。</p></div>
            <div><span className="tag">已上线</span><b>五页分工 · v0.6</b><p>市场总览、选股与自选、持仓与交易、每日复盘、交易统计。市场和个股分开展示，切页保留日期与股票。</p></div>
            <div><span className="tag">本次发布</span><b>首页行业板块全景 · v0.7</b><p>新闻事件和每日复盘从首页移出；全部行业以卡片展示，可按定位筛选并点击查看梯队与成员详情。</p></div>
            <div><span className="tag">已核验</span><b>题材历史数据源</b><p>东财概念日表及历史成分可读取；9 月 30 日有 504 个概念。当前仍按行业展示排名。</p></div>
            <div><span className="tag">待开发</span><b>题材主线雷达与全景</b><p>按历史日期展示成员、强弱与证据；保留行业参考，避免把行业排名当成题材主线。</p></div>
            <div><span className="tag">待开发</span><b>跨日阶段、交易计划与复盘关联</b><p>建立题材跨日阶段、计划版本、成交现场记录和执行质量统计。</p></div>
          </div>
          <p className="progress-note">分数与条件仍是待验证规则，买卖由你人工决定。</p>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
