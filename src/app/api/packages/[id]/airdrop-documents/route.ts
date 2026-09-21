import {NextResponse} from "next/server";
import {getSession} from "@/lib/session";
import {query} from "@/lib/db";
import {listAirdropDocuments,downloadAirdropDocument} from "@/lib/airdrop-documents";
export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getSession();
 if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const id=Number((await params).id);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Not found'},{status:404});
 if(process.env.AIRDROP_SCHEMA_READY!=='true'||!process.env.AIRDROP_API_KEY)return NextResponse.json({error:'Document connection unavailable'},{status:503});
 try{
   // Ownership is checked before any provider request; foreign IDs reveal nothing.
   const row=(await query<{airdrop_package_id:string|null;airdrop_org_id:string|null}>(
     'SELECT airdrop_package_id,airdrop_org_id FROM mod_packages WHERE pk_id=:id AND user_id=:userId LIMIT 1',
     {id,userId:session.id}))[0];
   if(!row)return NextResponse.json({error:'Not found'},{status:404});
   if(!row.airdrop_package_id||!row.airdrop_org_id||row.airdrop_org_id!==process.env.AIRDROP_ORGANIZATION_ID)return NextResponse.json({documents:[]},{headers:{'Cache-Control':'private, no-store'}});
   const config={apiKey:process.env.AIRDROP_API_KEY,organizationId:row.airdrop_org_id,packageId:row.airdrop_package_id};
   const search=new URL(request.url).searchParams;
   if(search.has('document'))return await downloadAirdropDocument(config,Number(search.get('document')),search.get('name')??'');
   return NextResponse.json({documents:await listAirdropDocuments(config)},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Documents could not be retrieved. Please refresh and try again.'},{status:502});}
}
