const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const customer=fs.existsSync(path.join(__dirname,'../src/lib/airdrop-documents.ts'));
const {listAirdropDocuments,downloadAirdropDocument}=require(customer?'../src/lib/airdrop-documents.ts':'../lib/airdrop-documents.ts');
const org='62088cce-b679-4725-bf63-8a1f16e7dbab',pkg='11111111-1111-4111-8111-111111111111';
const config={apiKey:'test-secret',organizationId:org,packageId:pkg};
const url='https://cyamkixgahfemkwcjhji.supabase.co/storage/v1/object/sign/package-documents/'+org+'/'+pkg+'/invoice.pdf?token=private-test-token';
const base=()=>({package_id:pkg,expires_in:600,expires_at:new Date(Date.now()+600000).toISOString(),documents:[{name:'invoice.pdf',url}]});
const metadata=data=>async()=>Response.json(data);
(async()=>{
 assert.deepEqual(await listAirdropDocuments(config,metadata(base())),[{name:'invoice.pdf',index:0}]);
 const attacks=[{package_id:org},{expires_at:'2000-01-01'},{expires_in:601},{documents:[{name:'bad',url:'https://evil.example/invoice.pdf?token=x'}]},{documents:[{name:'bad',url:url.replace(org,pkg)}]},{documents:[{name:'bad',url:url.replace('invoice.pdf','%252e%252e/secret')}]},{documents:[{name:'bad',url:url.replace('invoice.pdf','folder%5csecret')}]},{documents:[{name:'bad',url:url.replace('?token=private-test-token','')}]},{documents:[{name:'bad\nname',url}]}];
 for(const attack of attacks)await assert.rejects(()=>listAirdropDocuments(config,metadata({...base(),...attack})));
 let calls=0;
 const download=await downloadAirdropDocument(config,0,'invoice.pdf',async(address,options)=>{
   calls++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
   if(calls===1){assert.equal(options.headers.Authorization,'Bearer test-secret');return Response.json(base());}
   assert.equal(address,url);assert.equal(options.headers,undefined);return new Response('%PDF-test',{headers:{'content-type':'application/pdf','location':url}});
 });
 assert.equal(calls,2);assert.equal(await download.text(),'%PDF-test');
 assert.equal(download.headers.get('location'),null);assert.match(download.headers.get('content-disposition'),/^attachment;/);
 assert.equal(download.headers.get('cache-control'),'private, no-store');assert.equal(download.headers.get('x-content-type-options'),'nosniff');
 await assert.rejects(()=>downloadAirdropDocument(config,0,'other.pdf',metadata(base())));
 await assert.rejects(()=>downloadAirdropDocument(config,-1,'invoice.pdf',metadata(base())));
 calls=0;await assert.rejects(()=>downloadAirdropDocument(config,0,'invoice.pdf',async()=>++calls===1?Response.json(base()):new Response('x',{headers:{'content-length':String(26*1024*1024)}})));
 await assert.rejects(()=>listAirdropDocuments(config,async()=>new Response('x',{headers:{'content-length':String(300*1024)}})));
 let session={id:7},allowed=true,rows=[],providerCalls=0,queries=[];
 const original=Module._load;
 Module._load=function(request,parent,isMain){
   if(request==='@/lib/session')return {getSession:async()=>session};
   if(request==='@/lib/authz-server')return {assertAccess:async()=>({ok:allowed})};
   if(request==='@/lib/packages')return {getPackageById:async()=>allowed?{pk_id:1}:null};
   if(request==='@/lib/airdrop-display')return {airdropSchemaReady:()=>true};
   if(request==='@/lib/db')return {query:async(sql,params)=>{queries.push({sql,params});return rows;}};
   if(request==='@/lib/airdrop-documents')return {listAirdropDocuments:async()=>{providerCalls++;return[{name:'invoice.pdf',index:0}];},downloadAirdropDocument:async()=>{providerCalls++;return new Response('file');}};
   return original.call(this,request,parent,isMain);
 };
 process.env.AIRDROP_SCHEMA_READY='true';process.env.AIRDROP_API_KEY='test';process.env.AIRDROP_ORGANIZATION_ID=org;
 const route=require(customer?'../src/app/api/packages/[id]/airdrop-documents/route.ts':'../app/api/admin/packages/[id]/airdrop-documents/route.ts');
 const get=()=>route.GET(new Request('https://swiftboxtt.com/api/packages/1/airdrop-documents'),{params:Promise.resolve({id:'1'})});
 session=null;allowed=false;assert.equal((await get()).status,customer?401:403);assert.equal(queries.length,0);
 session={id:7};allowed=true;assert.equal((await get()).status,customer?404:200);assert.equal(providerCalls,0);
 if(customer){assert.match(queries[0].sql,/user_id=:userId/);assert.equal(queries[0].params.userId,7);}
 rows=[{airdrop_package_id:pkg,airdrop_org_id:org}];assert.equal((await get()).status,200);assert.equal(providerCalls,1);
 if(customer){rows=[{airdrop_package_id:pkg,airdrop_org_id:pkg}];await get();assert.equal(providerCalls,1);}
 Module._load=original;
 console.log('PASS document privacy, tenant scope, expiry, download limits, attachment headers and '+(customer?'customer ownership':'admin authorization'));
})().catch(error=>{console.error(error);process.exitCode=1;});
