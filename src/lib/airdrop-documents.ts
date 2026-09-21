/** Server callers only. Signed URLs never leave these helpers or enter persistence. */
const ORIGIN = "https://cyamkixgahfemkwcjhji.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DocumentConfig = {apiKey:string;organizationId:string;packageId:string};
type DocumentEntry = {name:string;url:string};
const MAX_DOWNLOAD = 4 * 1024 * 1024;

async function boundedBody(response:Response,limit:number):Promise<Uint8Array> {
  const length=Number(response.headers.get("content-length"));
  if(Number.isFinite(length)&&length>limit){await response.body?.cancel();throw new Error("Document exceeds the download limit.");}
  if(!response.body)throw new Error("Document response is empty.");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try {
    for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;
      if(size>limit){await reader.cancel();throw new Error("Document exceeds the download limit.");}chunks.push(item.value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}

async function readDocuments(config:DocumentConfig,fetcher:typeof fetch):Promise<DocumentEntry[]> {
  if(!config.apiKey||!UUID.test(config.organizationId)||!UUID.test(config.packageId))throw new Error("Document connection unavailable.");
  const response=await fetcher(`${ORIGIN}/functions/v1/rest-api/packages/${config.packageId}/documents`,{
    headers:{Authorization:`Bearer ${config.apiKey}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15_000),
  });
  if(!response.ok)throw new Error("Warehouse documents could not be retrieved.");
  const result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await boundedBody(response,256*1024)));
  const expires=Date.parse(result.expires_at);
  if(result.package_id!==config.packageId||!Array.isArray(result.documents)||result.documents.length>100
    ||!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+605_000
    ||!Number.isInteger(result.expires_in)||result.expires_in<1||result.expires_in>600)throw new Error("Invalid warehouse document response.");
  return result.documents.map((item:unknown)=>{
    if(!item||typeof item!=="object")throw new Error("Invalid document metadata.");
    const d=item as Record<string,unknown>;
    if(typeof d.name!=="string"||!d.name.trim()||d.name.length>255||/[\x00-\x1f\x7f]/.test(d.name)||typeof d.url!=="string"||d.url.length>8192)throw new Error("Invalid document metadata.");
    const url=new URL(d.url),path=decodeURIComponent(url.pathname);
    const prefix=`/storage/v1/object/sign/package-documents/${config.organizationId}/${config.packageId}/`;
    if(url.origin!==ORIGIN||url.username||url.password||url.hash||!path.startsWith(prefix)||/[\\%]/.test(path)||path.slice(prefix.length).split('/').some(p=>p==='..'||p==='.'||p==='')||!url.searchParams.get('token'))throw new Error("Invalid document download location.");
    return {name:d.name,url:url.href};
  });
}

export async function listAirdropDocuments(config:DocumentConfig,fetcher:typeof fetch=fetch) {
  return (await readDocuments(config,fetcher)).map(({name},index)=>({name,index}));
}

export async function downloadAirdropDocument(config:DocumentConfig,index:number,name:string,fetcher:typeof fetch=fetch):Promise<Response> {
  if(!Number.isSafeInteger(index)||index<0||index>=100)throw new Error("Invalid document selection.");
  const documents=await readDocuments(config,fetcher),document=documents[index];
  if(!document||document.name!==name)throw new Error("Document selection changed. Refresh the list.");
  // A fresh signed URL is used only for this server-to-server request. Never log it.
  const response=await fetcher(document.url,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error("Document download unavailable.");
  const bytes=await boundedBody(response,MAX_DOWNLOAD);
  const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const safeType=type&&['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(type)?type:'application/octet-stream';
  const safeName=document.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,150)||'document';
  return new Response(bytes as BodyInit,{headers:{'Content-Type':safeType,'Content-Disposition':`attachment; filename="${safeName}"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
}
