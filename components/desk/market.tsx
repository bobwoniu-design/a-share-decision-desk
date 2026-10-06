"use client";
import { useEffect, useState } from "react";
import { Activity, Plus, ExternalLink, Search, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useDesk } from "./provider";
import { Panel } from "./workspace";
import { money, today } from "@/lib/ledger";
export type Bar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number;
};
export function demoBars(index: number): Bar[] {
  const base = 24.07 + index * 7.12;
  return Array.from({ length: 120 }, (_, i) => {
    const shape =
      i < 22
        ? 1.02 - i * 0.0032
        : i < 48
          ? 0.95 + (i - 22) * 0.001
          : i < 60
            ? 0.978 - (i - 48) * 0.0003
            : 0.974 + (i - 60) * 0.0013;
    const close = +(
        base *
        (shape +
          Math.sin(i * 1.9 + index) * 0.002 +
          Math.sin(i * 0.42) * 0.003 +
          (i > 60 ? (i - 60) * (0.0015 - index * 0.00035) : 0))
      ).toFixed(2),
      vol =
        12000 +
        Math.round((Math.sin(i * 2.7) + 1) * 9000) +
        (i < 15 ? 20000 : 0);
    const minute = 570 + i;
    return {
      time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
      open: close - 0.02,
      high: close + 0.05,
      low: close - 0.04,
      close,
      vol,
      amount: close * vol,
    };
  });
}
export function evidence(bars: Bar[]) {
  if (!bars.length) return null;
  let amount = 0,
    volume = 0;
  const vwaps = bars.map((b) => {
    amount += b.amount;
    volume += b.vol;
    return volume > 0 ? amount / volume : null;
  });
  const last = bars.at(-1)!;
  const valid = vwaps.at(-1);
  let above = 0;
  for (
    let i = bars.length - 1;
    i >= 0 && vwaps[i] !== null && bars[i].close > vwaps[i]!;
    i--
  )
    above++;
  const half = Math.max(1, Math.floor(bars.length / 2));
  const low1 = Math.min(...bars.slice(0, half).map((b) => b.low)),
    low2 = Math.min(...bars.slice(half).map((b) => b.low));
  const higher = bars.length >= 20 && low2 > low1;
  const peak = Math.max(...bars.map((b) => b.high));
  const trough = Math.min(...bars.map((b) => b.low));
  const drawdown = ((peak - trough) / peak) * 100;
  const state =
    bars.length < 20
      ? "观察"
      : drawdown >= 2 && higher && above >= 3
        ? "确认"
        : drawdown >= 2 && higher
          ? "承接"
          : drawdown >= 2
            ? "分歧"
            : "观察";
  return { vwaps, last, above, higher, drawdown, state, vwap: valid };
}
export function Plot({ bars }: { bars: Bar[] }) {
  const e = evidence(bars);
  if (!e) return null;
  const min =
      Math.min(
        ...bars.map((b) => b.low),
        ...e.vwaps.filter((v): v is number => v !== null),
      ) * 0.998,
    max = Math.max(...bars.map((b) => b.high)) * 1.002;
  const y = (v: number) => +(30 + ((max - v) / (max - min)) * 185).toFixed(3);
  const x = (i: number) =>
    +(46 + (i / Math.max(bars.length - 1, 1)) * 590).toFixed(3);
  const path = bars
    .map((b, i) => `${i ? "L" : "M"}${x(i)},${y(b.close)}`)
    .join(" ");
  const vwapPath = e.vwaps
    .map((v, i) =>
      v === null
        ? ""
        : `${i && e.vwaps[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`,
    )
    .join(" ");
  const maxVol = Math.max(...bars.map((b) => b.vol), 1);
  return (
    <svg
      viewBox="0 0 700 300"
      className="price-chart"
      role="img"
      aria-label="所选股票分时价格、累计VWAP及成交量"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line
            x1="46"
            x2="638"
            y1={30 + i * 46}
            y2={30 + i * 46}
            stroke="#26344b"
            strokeDasharray="3 5"
          />
          <text x="0" y={34 + i * 46} fontSize="12" fill="#8194b1">
            {(max - (i * (max - min)) / 4).toFixed(2)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#d1e0f6" strokeWidth="2" />
      <path d={vwapPath} fill="none" stroke="#d7b16a" strokeWidth="2" />
      <circle
        cx={x(bars.length - 1)}
        cy={y(e.last.close)}
        r="4"
        fill="#8cbbff"
      />
      {bars.map((b, i) => (
        <rect
          key={i}
          x={x(i)}
          y={+(263 - (b.vol / maxVol) * 30).toFixed(3)}
          width={+Math.max(1, 500 / bars.length).toFixed(3)}
          height={+((b.vol / maxVol) * 30).toFixed(3)}
          fill={i && b.close < bars[i - 1].close ? "#4fa990" : "#d47683"}
          opacity=".8"
        >
          <title>{`${b.time} 价格 ${b.close} 成交量 ${b.vol}`}</title>
        </rect>
      ))}
      {[0, Math.floor((bars.length - 1) / 2), bars.length - 1].map((i, n) => (
        <text key={n} x={x(i) - 8} y="288" fill="#8194b1" fontSize="12">
          {bars[i].time}
        </text>
      ))}
    </svg>
  );
}
export function MarketChart({
  stock,
  index,
  cursor,
  setCursor,
}: {
  stock: string[];
  index: number;
  cursor: number;
  setCursor: (v: number) => void;
}) {
  const [detail, setDetail] = useState(false);
  const bars = demoBars(index).slice(0, cursor),
    e = evidence(bars)!;
  const pct = (e.last.close / (24.07 + index * 7.12) - 1) * 100;
  return (
    <Panel
      title={stock[0]}
      extra={
        <span className="muted">
          {stock[2]} · {stock[3]}
        </span>
      }
      className="chart-panel"
    >
      <div className="quote">
        <strong className={pct >= 0 ? "up" : "down"}>
          {e.last.close.toFixed(2)}{" "}
          <span>
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </span>
        </strong>
        <span>模拟回放 · {e.last.time}</span>
      </div>
      <div className="chart-toolbar">
        <span className="pill">分时回放</span>
        <div>
          <i className="legend white" />
          价格
          <i className="legend amber" />
          VWAP
        </div>
      </div>
      <Plot bars={bars} />
      <div className="replay-control">
        <span>09:30</span>
        <Slider
          aria-label="模拟回放分钟"
          min={1}
          max={120}
          step={1}
          value={[cursor]}
          onValueChange={(v) => setCursor(v[0])}
        />
        <span>{e.last.time}</span>
      </div>
      <div className="state-path">
        {["观察", "分歧", "承接", "确认", "转强"].map((s) => (
          <span key={s} className={s === e.state ? "active" : ""}>
            {s}
          </span>
        ))}
      </div>
      <div className="evidence">
        <div>
          <small>低点结构</small>
          <b>{e.higher ? "后段低点抬高" : "尚未确认抬高"}</b>
        </div>
        <div>
          <small>均价位置</small>
          <b>上方 {e.above} 分钟</b>
        </div>
        <div>
          <small>板块同步</small>
          <b className="amber-text">数据不足</b>
        </div>
      </div>
      <button
        className="signal-note w-full"
        style={{ textAlign: "left" }}
        onClick={() => setDetail(true)}
      >
        <Activity size={16} />
        <div>
          <b>{e.state}候选 · 查看判断依据</b>
          <p>演示规则 v0.1，所有判断仅使用回放时点之前的数据。</p>
        </div>
      </button>
      <Dialog open={detail} onOpenChange={setDetail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>状态依据 · {e.last.time}</DialogTitle>
            <DialogDescription>
              原型规则，用于验证界面和回放流程，未经过策略有效性验证。
            </DialogDescription>
          </DialogHeader>
          <div className="evidence-grid">
            <div>
              <small>已观察价格区间振幅</small>
              {e.drawdown.toFixed(2)}%
            </div>
            <div>
              <small>累计 VWAP</small>
              {e.vwap?.toFixed(3) || "不可计算"}
            </div>
            <div>
              <small>连续收盘位于 VWAP 上方</small>
              {e.above} 分钟
            </div>
            <div>
              <small>后半段最低价高于前半段</small>
              {e.higher ? "满足" : "不满足"}
            </div>
          </div>
          <p className="muted">
            至少20根分钟线后，已观察区间振幅≥2%标记分歧；后半段低点抬高标记承接；再连续3分钟站上VWAP标记确认。板块同步数据缺失，暂不输出转强。
          </p>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
export function RealMarketDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { ledger, save, busy } = useDesk();
  const [code, setCode] = useState("600000.SH"),
    [name, setName] = useState(""),
    [date, setDate] = useState("2026-09-30"),
    [rows, setRows] = useState<Bar[]>([]),
    [fetching, setFetching] = useState(false),
    [error, setError] = useState(""),
    [fetched, setFetched] = useState("");
  async function query() {
    setFetching(true);
    setError("");
    setRows([]);
    try {
      const r = await fetch(
        "/api/market/history?code=" + encodeURIComponent(code) + "&date=" + date,
      );
      const d = (await r.json()) as {
        error?: string;
        rows: Record<string, unknown>[];
        fetchedAt: string;
      };
      if (!r.ok) throw new Error(d.error);
      const parsed = d.rows.map((b: Record<string, unknown>) => ({
        time: String(b.trade_time).slice(11, 16),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        vol: Number(b.vol),
        amount: Number(b.amount),
      }));
      if (
        parsed.some((b: Bar) =>
          [b.open, b.high, b.low, b.close, b.vol, b.amount].some(
            (v) => !Number.isFinite(v),
          ),
        )
      )
        throw new Error("行情字段不完整，无法显示");
      setRows(parsed);
      setFetched(
        new Date(d.fetchedAt).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        }),
      );
      if (!parsed.length)
        setError("该日期无分钟数据，请检查交易日、证券代码及权限。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFetching(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="dialog-body sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>真实行情与自选观察</DialogTitle>
          <DialogDescription>
            Tushare 历史1分钟 ·
            手动查询。成交量单位股，成交额单位元；与个人账本分开记录。
          </DialogDescription>
        </DialogHeader>
        <div className="market-query">
          <input
            aria-label="查询证券代码"
            placeholder="600000.SH"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <input
            aria-label="查询行情日期"
            type="date"
            value={date}
            onInput={(e) => setDate(e.currentTarget.value)}
          />
          <button
            className="button primary"
            disabled={fetching}
            onClick={query}
          >
            <Search size={16} />
            {fetching ? "查询中…" : "查询分钟行情"}
          </button>
        </div>
        {error && (
          <div role="alert" className="error-banner">
            {error}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <Plot bars={rows} />
            <p className="muted">
              共 {rows.length} 根分钟线 · 获取于 {fetched} · VWAP按元/股累计计算
            </p>
          </>
        )}
        <div className="divider" />
        <h3>我的观察名单</h3>
        <div className="watch-form">
          <input
            aria-label="观察股票名称"
            placeholder="股票名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="观察股票代码"
            placeholder="600000.SH"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="button"
            disabled={busy || !name.trim()}
            onClick={() => save("watch", { code, name })}
          >
            <Plus size={14} />
            加入观察
          </button>
        </div>
        {ledger.watchlist.map((w) => (
          <div className="list-pair" key={w.code}>
            <button
              className="text-link"
              onClick={() => {
                setCode(w.code);
                setName(w.name);
              }}
            >
              {w.name} · {w.code}
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => save("watch", { ...w, remove: true })}
            >
              移除
            </button>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
