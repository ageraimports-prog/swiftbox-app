import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import DeleteAccountForm from "./DeleteAccountForm";

/**
 * Public account-deletion page — the "web link resource" Google Play's User
 * Data policy requires from every app that allows account creation. It must
 * stay reachable WITHOUT signing in, because people who already uninstalled
 * the app still have to be able to ask.
 *
 * The URL declared in Play Console → App content → Data safety is:
 *   https://app.swiftboxtt.com/delete-account
 */

export const metadata: Metadata = {
  title: "Delete your Swiftbox account",
  description:
    "Request deletion of your Swiftbox account and the personal data held with it.",
  robots: { index: true, follow: true },
};

export default async function DeleteAccountPage() {
  const session = await getSession();

  return (
    <DeleteAccountForm
      defaultName={session?.name ?? ""}
      defaultEmail={session?.email ?? ""}
      defaultAccountNo={session?.ac ?? ""}
      signedIn={Boolean(session)}
    />
  );
}
