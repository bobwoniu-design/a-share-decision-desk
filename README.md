# 短线决策台 v0.1

A股人工决策辅助工作台。提供桌面优先的市场演示、持久交易日志、每日复盘、个人统计、手工事件和自选名单。没有交易委托能力。

## 已实现

- 市场演示：板块筛选、核心股联动、分钟回放、累计VWAP和可解释的原型状态规则。
- 真实账本：手工成交/期初持仓、详情更正、软撤销、标准CSV预览导入及去重、CSV导出。按含费移动平均成本核算部分卖出与完整平仓周期。
- 每日复盘：逐日成交/持仓/费用汇总，个人笔记，草稿/确认，历史版本，文本导出。无交易日同样可记录。
- 个人统计：已实现盈亏、已平仓胜率、平均盈亏比、已平仓金额曲线、模式/自评分组。
- 事件与自选：手动来源链接、摘要、核实状态，观察名单。
- 持久化：D1按用户隔离、修订号并发保护、操作日志、JSON备份和空账本恢复；无浏览器存储依赖。
- Tushare服务端历史分钟查询接口与页面：配置密钥后可查询指定股票和日期，页面处理未配置/无权限/无行情/超时。密钥不进入客户端。

## 明确边界

首页市场情绪、板块排名与候选股为演示，不能用于真实交易决策。原型状态规则未做策略有效性验证。没有逐笔主动资金识别。

真实Tushare账户未提供，接口尚未使用用户权限联调。当前仅实现历史分钟单票查询，尚未完成全市场日线同步、实时轮询、真实板块/情绪评分与生产状态引擎。

复盘摘要为规则汇总，不调用AI模型；打开页面时生成，没有无人值守定时任务。新闻需手动录入，未接新闻抓取。尚无截图附件、交易点叠加真实分时、分红送股调整、完整资金流与账户收益率/回撤。盈亏不是账户当日收益。

本地开发库与线上D1库完全独立；本地验收数据不会上传。首次线上使用为空账本。

## 本地运行

需要 Node.js >=22.13，保留 package-lock.json。

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_burly_wolverine.sql
npm run dev
```

只在新本地库执行迁移一次。开发服务默认使用127.0.0.1:5173；自带仅限本地的模拟登录，线上使用平台登录。可在本地 `.dev.vars` 设置 TUSHARE_TOKEN；线上通过Sites密钥配置设置同名值，不要提交密钥文件。`.env.example`仅记录变量名。

## 验证

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/ledger.test.mjs
npm run build
npm start -- --port 8787
node tests/api-smoke.mjs
```

API测试只请求127.0.0.1:8787的本地构建产物，并使用独立模拟用户；不能指向线上。开发模式会清除手工身份头，因此API隔离测试使用本地构建预览。

## 数据接口依据

Tushare官方历史分钟接口 `stk_mins`：https://tushare.pro/document/2?doc_id=370
成交量单位股，成交金额单位元，统一后按累计金额/累计量计算VWAP。接口所需权限需单独核验。

## 目录

- app/client.tsx：主工作台
- components/desk：业务页面与表单
- lib/ledger.ts：账本验证、成本、统计、CSV
- app/api/ledger：个人账本和复盘写入
- app/api/market：Tushare服务端代理
- db/schema.ts、drizzle：持久结构与迁移
- tests：成本与API集成验证
