import type { Row } from "./market-data";

const themeCode = /^BK\d+\.DC$/;
const stockCode = /^\d{6}\.(SH|SZ|BJ)$/;

export function auditThemeRows(rows: Row[], date: string, kind: "index" | "member", board?: string) {
  const expectedDate = date.replaceAll("-", "");
  const seen = new Set<string>();
  let duplicates = 0, wrongDates = 0, malformedKeys = 0, missingNames = 0;
  for (const row of rows) {
    const code = String(row.ts_code ?? "");
    const member = String(row.con_code ?? "");
    const key = kind === "index" ? code : `${code}/${member}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
    if (String(row.trade_date ?? "") !== expectedDate) wrongDates++;
    if (!themeCode.test(code) || (board && code !== board) || (kind === "member" && !stockCode.test(member))) malformedKeys++;
    if (!String(row.name ?? "").trim()) missingNames++;
  }
  return { rows: rows.length, uniqueKeys: seen.size, duplicates, wrongDates, malformedKeys, missingNames,
    usable: rows.length > 0 && duplicates === 0 && wrongDates === 0 && malformedKeys === 0 && missingNames === 0 };
}

export function compareThemeMembers(earlier: Row[], later: Row[]) {
  const previous = new Set(earlier.map(row => String(row.con_code)));
  const current = new Set(later.map(row => String(row.con_code)));
  return {
    earlier: previous.size, later: current.size,
    added: [...current].filter(code => !previous.has(code)).length,
    removed: [...previous].filter(code => !current.has(code)).length,
    unchanged: [...current].filter(code => previous.has(code)).length,
  };
}
