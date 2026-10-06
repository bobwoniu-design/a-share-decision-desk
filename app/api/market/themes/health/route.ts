import { validDate } from "@/lib/market-data";
import { auditThemeRows, compareThemeMembers } from "@/lib/theme-quality";
import { marketDates, MarketError, tushare } from "@/lib/tushare";

export const dynamic = "force-dynamic";

// Owner-private read-only diagnostic. It returns source coverage, never the Site token.
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!validDate(date)) return Response.json({ error: "日期无效" }, { status: 400 });
  try {
    const calendar = await marketDates(date, 2);
    if (calendar.dates.length < 2 || calendar.dates.at(-1) !== date)
      return Response.json({ error: "所选日期不是已确认交易日" }, { status: 422 });
    const previousDate = calendar.dates[0], currentKey = date.replaceAll("-", ""), previousKey = previousDate.replaceAll("-", "");
    // DC's dated member snapshots can support historical reconstruction. THS members are latest-only.
    const catalog = await Promise.allSettled([currentKey, previousKey].map(trade_date =>
      tushare("dc_index", { trade_date, idx_type: "概念板块" },
        "ts_code,trade_date,name,leading_code,pct_change,turnover_rate,up_num,down_num,idx_type", 5000, 86400000)));
    const failures = catalog.map((result, i) => result.status === "rejected"
      ? { date: i ? previousDate : date, reason: result.reason instanceof MarketError ? result.reason.message : "概念目录读取失败" }
      : null).filter(x => x !== null);
    if (failures.length) return Response.json({ status: "unavailable", source: "Tushare dc_index / dc_member", date, previousDate, failures,
      checkedAt: new Date().toISOString(), note: "未用当前成分替代历史成分；题材主线排名暂不开放。" }, { headers: { "Cache-Control": "private, no-store" } });
    const current = catalog[0].status === "fulfilled" ? catalog[0].value : null;
    const previous = catalog[1].status === "fulfilled" ? catalog[1].value : null;
    if (!current || !previous) throw new MarketError("概念目录读取异常");
    const currentQuality = auditThemeRows(current.rows, date, "index");
    const previousQuality = auditThemeRows(previous.rows, previousDate, "index");
    const types = (rows: typeof current.rows) => Object.fromEntries([...new Set(rows.map(row => String(row.idx_type ?? "未知")))].map(type => [type, rows.filter(row => String(row.idx_type ?? "未知") === type).length]));
    const prevCodes = new Set(previous.rows.map(row => String(row.ts_code)));
    const candidate = current.rows.find(row => row.name === "人形机器人" && prevCodes.has(String(row.ts_code)))
      ?? current.rows.find(row => prevCodes.has(String(row.ts_code)));
    if (!candidate || !currentQuality.usable || !previousQuality.usable)
      return Response.json({ status: "invalid", source: "Tushare dc_index / dc_member", date, previousDate,
        catalog: { current: currentQuality, previous: previousQuality, types: { current: types(current.rows), previous: types(previous.rows) } }, checkedAt: new Date().toISOString(),
        note: "目录为空或有重复、日期、代码问题，成员及主线判断暂停。" }, { headers: { "Cache-Control": "private, no-store" } });
    const board = String(candidate.ts_code);
    const members = await Promise.allSettled([currentKey, previousKey].map(trade_date =>
      tushare("dc_member", { ts_code: board, trade_date }, "trade_date,ts_code,con_code,name", 5000, 86400000)));
    const memberFailures = members.map((result, i) => result.status === "rejected"
      ? { date: i ? previousDate : date, reason: result.reason instanceof MarketError ? result.reason.message : "概念成员读取失败" }
      : null).filter(x => x !== null);
    if (memberFailures.length) return Response.json({ status: "unavailable", source: "Tushare dc_index / dc_member", date, previousDate,
      catalog: { current: currentQuality, previous: previousQuality, types: { current: types(current.rows), previous: types(previous.rows) } }, sample: { code: board, name: candidate.name }, failures: memberFailures,
      checkedAt: new Date().toISOString(), note: "概念目录可用，但历史成员不可用；不能用最新成分回填历史。" }, { headers: { "Cache-Control": "private, no-store" } });
    const currentMembers = members[0].status === "fulfilled" ? members[0].value : null;
    const previousMembers = members[1].status === "fulfilled" ? members[1].value : null;
    if (!currentMembers || !previousMembers) throw new MarketError("概念成员读取异常");
    const currentMemberQuality = auditThemeRows(currentMembers.rows, date, "member", board);
    const previousMemberQuality = auditThemeRows(previousMembers.rows, previousDate, "member", board);
    return Response.json({ status: currentMemberQuality.usable && previousMemberQuality.usable ? "ready" : "invalid",
      source: "Tushare dc_index / dc_member", date, previousDate, checkedAt: new Date().toISOString(),
      catalog: { current: currentQuality, previous: previousQuality, types: { current: types(current.rows), previous: types(previous.rows) }, fetchedAt: [current.fetchedAt, previous.fetchedAt] },
      sample: { code: board, name: String(candidate.name), current: currentMemberQuality, previous: previousMemberQuality,
        indexType: String(candidate.idx_type ?? "未知"), indexUp: Number(candidate.up_num ?? 0), indexDown: Number(candidate.down_num ?? 0),
        change: compareThemeMembers(previousMembers.rows, currentMembers.rows), fetchedAt: [currentMembers.fetchedAt, previousMembers.fetchedAt],
        exampleCodes: currentMembers.rows.slice(0, 5).map(row => String(row.con_code)) },
      note: "trade_date 是数据归属日，不能据此认定盘中公布时间；盘中判断只能使用当时已观察到的成分版本。" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof MarketError ? error.message : "题材数据核验失败" }, { status: 502 });
  }
}
