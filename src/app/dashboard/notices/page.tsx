import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { markReceivedNoticeRead } from "./actions";

export const dynamic = "force-dynamic";
type Notice = {pk_id:number;wr:string;commodities:string;date:string;status:string;sent_at:string};
export default async function NoticesPage(){
 const session=await getSession();if(!session)redirect("/login");
 const notices=await query<Notice>(`SELECT n.pk_id,p.wr,p.commodities,p.date,n.status,n.sent_at FROM swiftbox_package_status_notices n JOIN mod_packages p ON p.pk_id=n.pk_id WHERE p.user_id=:user AND n.kind='received_app' ORDER BY n.sent_at DESC,n.pk_id DESC LIMIT 100`,{user:session.id});
 return <div className="space-y-4"><h1 className="sb-disp text-xl text-mist">Notices</h1>{!notices.length&&<p className="text-muted-dark">No notices yet.</p>}{notices.map(n=><article key={n.pk_id} className="rounded-lg border border-mist/10 bg-ink-2 p-4"><p className="font-semibold text-mist">Package received {n.status==='unread'&&<span className="ml-2 rounded-full bg-green px-2 py-0.5 text-xs text-ink">New</span>}</p><p className="mt-1 text-sm text-muted-dark">{n.wr} · {n.commodities} · received {String(n.date).slice(0,10)}</p><div className="mt-3 flex items-center gap-4"><Link href={`/dashboard/packages/${n.pk_id}`} className="text-green underline">View package</Link>{n.status==='unread'&&<form action={markReceivedNoticeRead}><input type="hidden" name="pkId" value={n.pk_id}/><button className="text-mist underline" type="submit">Mark read</button></form>}</div></article>)}</div>;
}
