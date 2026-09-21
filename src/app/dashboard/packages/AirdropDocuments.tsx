"use client";
import {useState} from "react";
export default function AirdropDocuments({endpoint}:{endpoint:string}) {
 const [documents,setDocuments]=useState<Array<{index:number;name:string}>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="space-y-3"><h3 className="font-semibold">Warehouse documents</h3>
 <p className="text-sm">Downloads up to 4 MB. Contact Swiftbox for larger files.</p>
 <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={async()=>{
   setBusy(true);setError('');try{const response=await fetch(endpoint,{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();setDocuments(result.documents);}catch{setError('Documents could not be retrieved. Please try again.');}finally{setBusy(false);}
 }}>{busy?'Loading…':'Check available documents'}</button>
 {error&&<p role="alert" className="text-sm">{error}</p>}
 {documents?.length===0&&<p className="text-sm">No warehouse documents are attached yet.</p>}
 {documents&&documents.length>0&&<ul className="space-y-2">{documents.map(d=><li key={d.index}><a className="text-sm underline" href={`${endpoint}?document=${d.index}&name=${encodeURIComponent(d.name)}`}>{d.name}</a></li>)}</ul>}
 </section>;
}
