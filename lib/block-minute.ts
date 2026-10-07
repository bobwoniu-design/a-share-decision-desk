import type {Bar} from "./market-data";

export type BlockMinuteSample={code:string;name:string;preClose:number;bars:Bar[]};
export type BlockMinutePoint={time:string;level:number|null;coverage:number};

// A descriptive basket of the selected members, not a published sector index.
// Missing minutes remain gaps; the series never carries forward a prior price.
export function equalWeightMinute(samples:BlockMinuteSample[]):BlockMinutePoint[]{
  if(samples.length<3||samples.some(sample=>!Number.isFinite(sample.preClose)||sample.preClose<=0))return [];
  const bySample=samples.map(sample=>new Map(sample.bars.map(bar=>[bar.time,bar])));
  const times=[...new Set(samples.flatMap(sample=>sample.bars.map(bar=>bar.time)))].sort();
  const minimum=Math.max(3,Math.ceil(samples.length*.6));
  return times.map(time=>{
    const returns=bySample.flatMap((bars,index)=>{const bar=bars.get(time);return bar&&bar.close>0?[bar.close/samples[index].preClose]:[];});
    return {time,level:returns.length>=minimum?100*returns.reduce((sum,value)=>sum+value,0)/returns.length:null,coverage:returns.length};
  });
}
