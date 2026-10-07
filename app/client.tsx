"use client";
import { useEffect, useState } from "react";
import { HistoricalMarket, type MarketNavigation } from "@/components/desk/history";
import { NewsPage } from "@/components/desk/news";
import {
  Activity,
  BookOpen,
  ChartNoAxesCombined,
  ListFilter,
  NotebookPen,
  Newspaper,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeskProvider, useDesk } from "@/components/desk/provider";
import {
  Trades,
  Reviews,
  Stats,
  Positions,
  TradeDialog,
  SettingsDialog,
} from "@/components/desk/workspace";
import { DEFAULT_MARKET_DATE } from "@/lib/market-data";
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
    [settingsOpen, setSettingsOpen] = useState(false);
  const { error, refresh } = useDesk();
  useEffect(()=>{
    try {
      const saved=window.sessionStorage.getItem("decision-desk-market-view");
      if(saved){const value=JSON.parse(saved) as Partial<MarketNavigation>;if((value.mode==="close"||value.mode==="live")&&typeof value.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&typeof value.code==="string")setMarketNavigation({mode:value.mode,date:value.date,code:value.code,themeCode:typeof value.themeCode==="string"&&/^BK\d+\.DC$/.test(value.themeCode)?value.themeCode:undefined});}
      const view=new URL(window.location.href).searchParams.get("view");
      if(["market","selection","news","trades","review","stats"].includes(view??""))setTab(view!);
    } catch { /* Browser storage can be unavailable. The default view remains usable. */ }
    const onBack=()=>{const view=new URL(window.location.href).searchParams.get("view");setTab(["market","selection","news","trades","review","stats"].includes(view??"")?view!:"market");};
    window.addEventListener("popstate",onBack);return()=>window.removeEventListener("popstate",onBack);
  },[]);
  useEffect(()=>{try{window.sessionStorage.setItem("decision-desk-market-view",JSON.stringify({mode:marketNavigation.mode,date:marketNavigation.date,code:marketNavigation.code,themeCode:marketNavigation.themeCode}));}catch{}},[marketNavigation]);
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
              ["news", "新闻", Newspaper],
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
      </header>
      <main>
        {tab!=="market"&&tab!=="selection"&&<div className="page-title">
          <div>
            <small>
              {tab === "news"
                  ? "NEWS BRIEFING"
                : tab === "trades"
                  ? "TRADING JOURNAL"
                  : tab === "review"
                    ? "DAILY REVIEW"
                    : "PERFORMANCE"}
            </small>
            <h1>
              {tab === "news"
                  ? "新闻"
                : tab === "trades"
                  ? "持仓与交易"
                  : tab === "review"
                    ? "每日复盘"
                    : "交易统计"}
            </h1>
          </div>
        </div>}
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
        <TabsContent value="news"><NewsPage/></TabsContent>
        <TabsContent value="trades">
          <div className="trades-toolbar"><button className="button" onClick={()=>setSettingsOpen(true)}><Settings2 size={16}/>数据与备份</button></div>
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
        <span>市场总览：环境与板块　/　选股与自选：个股分析　/　新闻：盘前速览</span>
        <span>短线决策台 · v1.5 开发中</span>
      </footer>
      <TradeDialog />
      <SettingsDialog open={settingsOpen} setOpen={setSettingsOpen} />
    </Tabs>
  );
}
