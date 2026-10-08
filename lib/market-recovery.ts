/** Shared error policy: historical recovery is always an explicit change of mode/date. */
export function isIpLimit(message:string){return /40204|IP数量|来源 IP 数量/.test(message);}

export function marketRecovery(message:string,date:string,mode:string,dates:string[]=[]){
  const limited=isIpLimit(message);
  const recoveryDate=limited&&mode==="live"
    ? dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<date).sort().at(-1)??null
    : null;
  return {
    error:limited?"Tushare 来源 IP 数量已达上限（40204），行情数据暂时无法读取。连续重试不能解除此限制。":message,
    code:limited?"TUSHARE_IP_LIMIT":null,
    blocked:limited||/权限|访问频次/.test(message),
    recoveryDate,
  };
}
