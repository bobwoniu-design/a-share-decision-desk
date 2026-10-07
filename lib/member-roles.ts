import type { CoreStock } from "./decision-engine";
import type { SectorGroup, SectorMember } from "./sectors";

export type MemberRole = { label: string; reason: string };

/** These are dated, rule-based candidates, not an assertion of trading leadership. */
export function memberRoles(group: SectorGroup, member: SectorMember, cores: CoreStock[] = []): MemberRole[] {
  const quote = member.quote;
  if (!quote || /^(\*?ST|S\*?ST|退)/i.test(member.name)) return [];

  const roles: MemberRole[] = [];
  if (member.leaderRank === 1 && member.limit === "U" && (member.height ?? 0) >= 2) {
    roles.push({ label: "龙头候选", reason: `当日板块连板高度与涨幅排序第一，${member.height} 板；真实题材地位仍需人工核实` });
  } else if (member.leaderRank === 1 && quote.pct > 0) {
    roles.push({ label: "领涨候选", reason: "当日板块涨幅、板数与成交额排序第一；尚不足以判定龙头" });
  }

  const quoted = group.members.filter(m => m.quote && !/^(\*?ST|S\*?ST|退)/i.test(m.name));
  const maxAmount = Math.max(0, ...quoted.map(m => m.quote!.amount));
  const share = group.amountYi > 0 ? quote.amount / (group.amountYi * 1e8) : 0;
  if (group.traded >= 3 && quote.pct >= 0 && quote.amount === maxAmount && share >= .1) {
    roles.push({ label: "容量中军候选", reason: `板块成交额第一，占板块约 ${(share * 100).toFixed(1)}%；仅代表资金承载，不代表主动买入` });
  }

  const core = cores.find(c => c.code === member.code);
  if (core?.roles.includes("趋势核心候选")) {
    roles.push({ label: "趋势核心候选", reason: `行业近5日累计 ${core.return5?.toFixed(1) ?? "—"}%，为当日同板块趋势表现靠前成员` });
  }
  if (core?.roles.includes("弹性核心候选")) {
    roles.push({ label: "弹性核心候选", reason: `弹性板块股票，当日上涨 ${quote.pct.toFixed(2)}%；需继续核对成交与持续性` });
  }
  if (core?.roles.includes("补涨候选")) {
    roles.push({ label: "补涨候选", reason: `近5日累计 ${core.return5?.toFixed(1) ?? "—"}% 低于趋势核心，当日涨幅高于板块均值；先后关系仍需复核` });
  }
  return roles;
}
