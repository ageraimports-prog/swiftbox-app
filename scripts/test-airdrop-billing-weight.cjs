const assert=require('node:assert/strict');
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const display=require('../src/lib/airdrop-display.ts');
let session={id:7};
let row={pk_id:1,wr:'WR1',external_code:'EVI000001',external_mode:'air',actual_weight:2.4,weight:3,pk_type:1,pcs:1,ship_id:null,ship_status:null};
const queries=[],original=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='@/lib/session')return {getSession:async()=>session};
  if(request==='@/lib/airdrop-display')return display;
  if(request==='@/lib/db')return {query:async(sql,params)=>{queries.push({sql,params});return [row];}};
  return original.call(this,request,parent,isMain);
};
(async()=>{
 const list=require('../src/app/api/packages/route.ts');
 const detail=require('../src/app/api/packages/[id]/route.ts');
 for(const ready of ['true','false']){
  process.env.AIRDROP_SCHEMA_READY=ready;
  for(const weight of [3,6]){
   row={...row,weight};
   const listed=(await (await list.GET()).json()).packages[0];
   const single=(await (await detail.GET(new Request('https://example.test/api/packages/1'),{params:Promise.resolve({id:'1'})})).json()).package;
   for(const p of [listed,single]){
    assert.equal(p.weight,weight);assert.equal(p.billableWeight,weight);
    assert.equal('actual_weight' in p,false);assert.equal('actualWeight' in p,false);
   }
  }
 }
 for(const q of queries){assert.doesNotMatch(q.sql,/actual_weight/);assert.match(q.sql,/p.user_id = :userId/);assert.equal(q.params.userId,7);}
 session=null;assert.equal((await list.GET()).status,401);
 assert.equal((await detail.GET(new Request('https://example.test/api/packages/1'),{params:Promise.resolve({id:'1'})})).status,401);
 console.log('Customer package APIs show billing weight only; ownership and authentication retained.');
})().catch(e=>{console.error(e);process.exitCode=1;});
