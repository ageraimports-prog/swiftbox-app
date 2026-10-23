"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { execute } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function markReceivedNoticeRead(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const pkId = Number(form.get("pkId"));
  if (!Number.isSafeInteger(pkId) || pkId < 1) throw new Error("Invalid package notice.");
  await execute(`UPDATE swiftbox_package_status_notices n JOIN mod_packages p ON p.pk_id=n.pk_id SET n.status='read' WHERE n.pk_id=:pk AND n.kind='received_app' AND n.status='unread' AND p.user_id=:user`, {pk:pkId,user:session.id});
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/notices");
}
