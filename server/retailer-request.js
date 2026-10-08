import {execFile} from 'node:child_process';import{promisify}from'node:util';import{RETAILERS}from'../src/engine/retailers.js';import{requestText}from'./adapters.js';
const execute=promisify(execFile),hosts=new Set(RETAILERS.map(s=>s.domain));
// Fixed audited retailer hosts only. curl uses the platform HTTPS proxy and normal TLS verification.
// This fallback is for environments whose proxy resolves Internet hosts while local DNS cannot.
export async function requestRetailerText(value) {
 const u=new URL(value);if(u.protocol!=='https:' || !hosts.has(u.hostname) || u.username || u.password || u.port && u.port!=='443')throw new Error('Public research destination is outside the fixed retailer registry.');
 try{return await requestText(value);}catch(e){if(!['EAI_AGAIN','ENOTFOUND'].includes(e.code) || !(process.env.HTTPS_PROXY || process.env.https_proxy))throw e;}
 const {stdout}=await execute('curl',['--proto','=https','--silent','--show-error','--max-time','20','--max-filesize','10485760','--user-agent','WineJournalBot/1.0','--write-out','\n%{http_code}',u.href],{maxBuffer:11*1024*1024,timeout:25000});
 const i=stdout.lastIndexOf('\n');return {status:Number(stdout.slice(i+1)),text:stdout.slice(0,i),headers:{}};
}
