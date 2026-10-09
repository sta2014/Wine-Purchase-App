import {publicationName} from './critics.js';
export function criticConsensus(reviews,composite) {
  if(!composite.publicationCount)return {score:null,independentCritics:0};
  const groups=new Map();for(const r of composite.evidenceReviews || reviews){const name=publicationName(r.publication || r.critic);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}
  const selected=composite.publications.map(p=>{const all=groups.get(p.name),verified=all.filter(r=>r.verified);const eligible=verified.length?verified:all,final=eligible.filter(r=>r.reviewStage==='final'),rows=final.length?final:eligible;return rows.reduce((n,r)=>n+(r.matchConfidence ?? r.confidence)*(r.verified?1:.6)*(r.reviewStage==='final'?1:r.reviewStage==='barrel'||r.reviewStage==='preliminary'||r.scoreHigh>r.score ? .65 : .85),0)/rows.length;});
  const breadth=Math.min(1,composite.publicationCount/5),agreement=Math.max(0,1-(composite.spread || 0)/15),evidence=selected.reduce((n,v)=>n+v,0)/selected.length;
  return {score:100*breadth*agreement*evidence,independentCritics:composite.publicationCount,breadth,agreement,evidence,method:'100 × min(independent publications/5, 1) × max(0, 1−score spread/15) × mean identity/provenance/stage reliability. Published score level is excluded. Verified evidence takes precedence; final 1, unspecified .85, barrel/range .65; reported provenance .6.'};
}
