"""Run one unattended intraday scan through the private Decision Desk Site.

The Site calculates signals and sends Bark notifications. This process only
orchestrates its existing, authenticated endpoints; it never places orders.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
from logging.handlers import RotatingFileHandler
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


CHINA_TIME = timezone(timedelta(hours=8))
CHINA_SESSIONS = (("09:30", "11:30"), ("13:00", "15:00"))


class ScanError(Exception):
    pass


def post(url: str, token: str, payload: dict, timeout: int = 35) -> dict:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/alerts/scan",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "OAI-Sites-Authorization": f"Bearer {token}",
            "x-scan-key": token,
            "User-Agent": "Mozilla/5.0 (compatible; DecisionDeskScanner/1.0)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        # The response may contain infrastructure HTML; never print the token
        # or an unbounded body into scheduled-task logs.
        raise ScanError(f"站点返回 HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise ScanError(f"无法连接站点：{type(error).__name__}") from error
    if not isinstance(data, dict):
        raise ScanError("站点响应格式无效")
    if data.get("error"):
        raise ScanError(str(data["error"])[:160])
    return data


def in_session(now: datetime) -> bool:
    local = now.astimezone(CHINA_TIME)
    current = local.strftime("%H:%M")
    return local.weekday() < 5 and any(start <= current <= end for start, end in CHINA_SESSIONS)


def run(config: dict, *, check_only: bool = False, now: datetime | None = None) -> dict:
    url, token = config.get("url"), config.get("token")
    if not isinstance(url, str) or not url.startswith("https://") or not isinstance(token, str) or not token:
        raise ScanError("配置缺少 HTTPS 站点地址或服务凭证")
    now = now or datetime.now(CHINA_TIME)
    date = now.astimezone(CHINA_TIME).date().isoformat()
    if not check_only and not in_session(now):
        return {"date": date, "skipped": "非盘中时段"}

    pool = post(url, token, {"action": "pool", "date": date})
    if check_only or pool.get("skipped") or pool.get("reason"):
        return {"date": date, "connection": "ok", "skipped": pool.get("skipped") or pool.get("reason")}
    targets = pool.get("targets")
    if not isinstance(targets, list):
        raise ScanError("选股池响应缺少目标列表")
    if len(targets) > 100:
        raise ScanError("扫描目标异常增多，已暂停本轮")

    results = {"date": date, "targets": len(targets), "sent": 0, "errors": 0, "skipped": 0}
    if not targets:
        return results

    def scan(target: dict) -> dict:
        return post(url, token, {"action": "scan", "date": date, "target": target})

    # Bound concurrency so a full candidate pool does not issue all minute-data
    # requests at once. Server-side alert_events prevents duplicate pushes.
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(scan, target): target for target in targets}
        for future in concurrent.futures.as_completed(futures):
            try:
                answer = future.result()
            except ScanError:
                results["errors"] += 1
                continue
            if answer.get("sent"):
                results["sent"] += 1
            if answer.get("skipped"):
                results["skipped"] += 1
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="短线决策台盘中扫描")
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    parser.add_argument("--check-only", action="store_true", help="只验证私有站点连接，不发送交易提醒")
    args = parser.parse_args()
    logger = logging.getLogger("decision_desk_scanner")
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(args.config.with_name("scanner.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    logger.addHandler(handler)
    try:
        config = json.loads(args.config.read_text(encoding="utf-8-sig"))
        result = run(config, check_only=args.check_only)
        logger.info(json.dumps(result, ensure_ascii=False))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return 0 if result.get("errors", 0) == 0 else 2
    except (OSError, ValueError, ScanError) as error:
        logger.error("扫描失败：%s", error)
        print(f"扫描失败：{error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
