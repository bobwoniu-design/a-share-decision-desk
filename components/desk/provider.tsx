"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { blankLedger, type Ledger, type Trade } from "@/lib/ledger";
type Audit = {
  revision: number;
  action: string;
  detail: string;
  created_at: string;
};
type LedgerResponse = {
  ledger: Ledger;
  revision: number;
  audit: Audit[];
  error?: string;
  message?: string;
  auditDetail?: string;
};
type Desk = {
  ledger: Ledger;
  revision: number;
  loading: boolean;
  error: string;
  audit: Audit[];
  trade: Trade | null | undefined;
  setTrade: (t: Trade | null | undefined) => void;
  save: (action: string, data: unknown) => Promise<boolean>;
  refresh: () => Promise<void>;
  busy: boolean;
};
const Context = createContext<Desk>(null!);
export const useDesk = () => useContext(Context);
export function DeskProvider({ children }: { children: ReactNode }) {
  const [ledger, setLedger] = useState(blankLedger),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [audit, setAudit] = useState<Audit[]>([]),
    [trade, setTrade] = useState<Trade | null | undefined>(undefined),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/ledger", { cache: "no-store" });
      const d = (await r.json()) as LedgerResponse;
      if (!r.ok) throw new Error(d.error);
      setLedger(d.ledger);
      setRevision(d.revision);
      setAudit(d.audit);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function save(action: string, data: unknown) {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, action, data }),
      });
      const d = (await r.json()) as LedgerResponse;
      if (!r.ok) throw new Error(d.error);
      setLedger(d.ledger);
      setRevision(d.revision);
      setError("");
      setAudit((a) =>
        [
          {
            revision: d.revision,
            action,
            detail: d.auditDetail || d.message || action,
            created_at: new Date().toISOString(),
          },
          ...a,
        ].slice(0, 30),
      );
      toast.success(d.message || "已保存");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.all([
      context.registerTool(
        {
          name: "read_trading_ledger",
          title: "读取交易账本",
          description:
            "读取当前用户的真实成交、持仓所需账本及每日复盘；不会修改记录。",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw new Error("无需输入参数");
            const response = await fetch("/api/ledger");
            const data = (await response.json()) as LedgerResponse;
            if (!response.ok) throw new Error(data.error);
            return data;
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: "read_theme_data_health",
          title: "读取题材数据核验",
          description: "读取指定交易日的东财概念目录与历史成分覆盖检查；不会修改记录，也不会返回数据源密钥。",
          inputSchema: {
            type: "object",
            properties: { date: { type: "string", description: "交易日，格式 YYYY-MM-DD" } },
            required: ["date"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: { date: string }) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date ?? "")) throw new Error("交易日期无效");
            const response = await fetch(`/api/market/themes/health?date=${input.date}`, { cache: "no-store" });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error ?? "题材数据核验失败");
            return data;
          },
        },
        { signal: lifecycle.signal },
      ),
    ]).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  return (
    <Context.Provider
      value={{
        ledger,
        revision,
        loading,
        error,
        audit,
        trade,
        setTrade,
        save,
        refresh,
        busy,
      }}
    >
      {children}
      <Toaster theme="dark" position="bottom-right" />
    </Context.Provider>
  );
}
