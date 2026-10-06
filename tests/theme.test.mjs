import test from "node:test";
import assert from "node:assert/strict";
import { auditThemeRows, compareThemeMembers } from "../lib/theme-quality.ts";
import { scoreThemeDays } from "../lib/themes.ts";

const board = "BK1184.DC";
const entry = (date, code) => ({ trade_date: date, ts_code: board, con_code: code, name: code });

test("dated theme members reject duplicates, wrong dates and board mismatches", () => {
  const valid = [entry("20260930", "600418.SH"), entry("20260930", "300413.SZ")];
  assert.equal(auditThemeRows(valid, "2026-09-30", "member", board).usable, true);
  const bad = [...valid, valid[0], entry("20260929", "002436.SZ"), { ...entry("20260930", "600127.SH"), ts_code: "BK9999.DC" }];
  const result = auditThemeRows(bad, "2026-09-30", "member", board);
  assert.equal(result.usable, false);
  assert.deepEqual([result.duplicates, result.wrongDates, result.malformedKeys], [1, 1, 1]);
});

test("member changes compare the dated snapshots without rewriting the earlier set", () => {
  const earlier = [entry("20260929", "600418.SH"), entry("20260929", "300413.SZ")];
  const later = [entry("20260930", "600418.SH"), entry("20260930", "002436.SZ")];
  assert.deepEqual(compareThemeMembers(earlier, later), { earlier: 2, later: 2, added: 1, removed: 1, unchanged: 1 });
  assert.equal(earlier[1].con_code, "300413.SZ");
});

test("theme screening ranks persistence, preserves missing scores, and cannot rewrite an earlier date", () => {
  const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30"];
  const days=dates.map((date,i)=>({date,rows:[
    {ts_code:"BK1001.DC",trade_date:date.replaceAll("-",""),name:"持续强势",pct_change:i===7?-2:3,turnover_rate:8,up_num:80,down_num:20},
    {ts_code:"BK1002.DC",trade_date:date.replaceAll("-",""),name:"持续偏弱",pct_change:i===7?5:-2,turnover_rate:2,up_num:15,down_num:85},
    {ts_code:"BK1003.DC",trade_date:date.replaceAll("-",""),name:"数据缺失",pct_change:null,turnover_rate:null,up_num:null,down_num:null}
  ]}));
  const seventh=scoreThemeDays(days.slice(0,7));
  assert.equal(seventh[0].code,"BK1001.DC");
  assert.equal(seventh[0].label,"主线初筛");
  assert.equal(seventh.find(t=>t.code==="BK1003.DC")?.score,null);
  assert.ok(seventh[0].delta!==null);
  const eighth=scoreThemeDays(days);
  assert.deepEqual(eighth.find(t=>t.code==="BK1001.DC")?.history[6],seventh[0].history[6]);
  const flat=days.slice(0,7).map(d=>({...d,rows:d.rows.map(r=>({...r,pct_change:0,turnover_rate:2,up_num:50,down_num:50}))}));
  assert.equal(scoreThemeDays(flat).some(t=>t.label==="主线初筛"||t.label==="主线候选"),false);
});
