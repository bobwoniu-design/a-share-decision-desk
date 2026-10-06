import test from "node:test";
import assert from "node:assert/strict";
import { auditThemeRows, compareThemeMembers } from "../lib/theme-quality.ts";

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
