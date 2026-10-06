import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: "请登录后访问行情" }, { status: 401 });
  const token = (env as unknown as { TUSHARE_TOKEN?: string }).TUSHARE_TOKEN;
  const url = new URL(request.url);
  if (url.searchParams.has("status"))
    return Response.json({
      configured: !!token,
      source: "Tushare",
      mode: "手动查询历史分钟",
    });
  if (!token)
    return Response.json(
      {
        error:
          "尚未配置 Tushare Token。请在部署环境的密钥配置中设置 TUSHARE_TOKEN；不要填入网页或聊天。",
      },
      { status: 503 },
    );
  const code = url.searchParams.get("code"),
    date = url.searchParams.get("date");
  if (
    !code ||
    !/^\d{6}\.(SH|SZ|BJ)$/.test(code) ||
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return Response.json({ error: "证券代码或日期格式无效" }, { status: 400 });
  try {
    const result = await fetch("https://api.tushare.pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_name: "stk_mins",
        token,
        params: {
          ts_code: code,
          freq: "1min",
          start_date: date + " 09:00:00",
          end_date: date + " 15:30:00",
        },
        fields: "ts_code,trade_time,open,high,low,close,vol,amount",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!result.ok) throw new Error("upstream");
    const json = (await result.json()) as {
      code: number;
      data?: { fields: string[]; items: unknown[][] };
    };
    if (json.code !== 0)
      return Response.json(
        {
          error: "Tushare 未返回行情，请核验历史分钟权限、账户限额和证券代码。",
        },
        { status: 502 },
      );
    const fields = json.data?.fields || [];
    const rows = (json.data?.items || [])
      .map((item) => Object.fromEntries(fields.map((f, i) => [f, item[i]])))
      .sort((a, b) => String(a.trade_time).localeCompare(String(b.trade_time)));
    return Response.json(
      {
        rows,
        source: "Tushare stk_mins",
        fetchedAt: new Date().toISOString(),
        date,
        code,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "行情请求未完成，请稍后重试" },
      { status: 502 },
    );
  }
}
