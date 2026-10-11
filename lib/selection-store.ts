import {emptySelectionDay,type SelectionDay} from "./selection";

export async function readSelection(db:D1Database,owner:string,date:string){
  const row=await db.prepare("SELECT payload,revision FROM selection_days WHERE owner=? AND date=?").bind(owner,date).first<{payload:string;revision:number}>();
  return {day:row?JSON.parse(row.payload) as SelectionDay:emptySelectionDay(date),revision:row?.revision??0};
}
// Merge a short, deterministic mutation against the newest revision. Market I/O occurs before this call.
export async function updateSelection(db:D1Database,owner:string,date:string,change:(day:SelectionDay)=>void){
  for(let attempt=0;attempt<5;attempt++){
    const {day,revision}=await readSelection(db,owner,date),previous=JSON.stringify(day);change(day);
    const payload=JSON.stringify(day);
    if(revision&&payload===previous)return {day,revision};
    if(new TextEncoder().encode(payload).length>4000000)throw new Error("候选记录容量已满，请导出归档后扩展存储");
    const result=revision?await db.prepare("UPDATE selection_days SET payload=?,revision=revision+1 WHERE owner=? AND date=? AND revision=?").bind(payload,owner,date,revision).run():await db.prepare("INSERT OR IGNORE INTO selection_days(owner,date,payload,revision) VALUES(?,?,?,1)").bind(owner,date,payload).run();
    if(result.meta.changes)return {day,revision:revision+1};
  }
  throw new Error("CONFLICT");
}
