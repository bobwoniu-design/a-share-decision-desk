import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNews,profileRows,disclosureCategory,safeLink} from '../lib/research-data.ts';

test('company product rows cannot use a future reporting period in historical view',()=>{
  const result=profileRows([{ts_code:'600418.SH',main_business:'整车制造'}],[
    {ts_code:'600418.SH',end_date:'20260630',bz_item:'整车',bz_sales:12e8},
    {ts_code:'600418.SH',end_date:'20261231',bz_item:'未来产品',bz_sales:99e8},
    {ts_code:'600418.SH',end_date:'20260630',bz_item:'合计',bz_sales:12e8}
  ],'600418.SH','2026-09-30');
  assert.equal(result.period,'2026-06-30');
  assert.deepEqual(result.segments.map(x=>x.name),['整车']);
});
test('news is deduplicated by normalized title and sorted newest first',()=>{
  const rows=[
    {datetime:'2026-09-30 08:00:00',title:'A 公司：订单增长',content:'旧'},
    {datetime:'2026-09-30 08:30:00',title:'A公司:订单增长',content:'新'},
    {datetime:'2026-09-30 07:00:00',title:'政策发布',content:'内容'}
  ];
  const result=normalizeNews(rows,'cls');
  assert.equal(result.length,2);
  assert.equal(result[0].content,'新');
});
test('risk and suspension titles remain distinct and unsafe external links are suppressed',()=>{
  assert.equal(disclosureCategory('关于股票停牌的公告'),'停复牌');
  assert.equal(disclosureCategory('股东减持公告'),'风险');
  assert.equal(safeLink('javascript:alert(1)'),null);
});
