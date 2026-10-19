import { airdropReceivedAtSql } from "./auto-transit-core";
import {query} from "./db";

/**
 * Deployment gate: enable only after migration 026 is verified on the shared DB.
 * `external_received_at` is Airdrop's exact receive time (ISO, from the synced
 * snapshot) — the input to the 5 pm In Transit rule (auto-transit-core.ts).
 */
export async function airdropPackageColumns(): Promise<string> {
  let manifestReady=false;
  if(process.env.AIRDROP_SCHEMA_READY==="true"){
    const rows=await query<{n:number}>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='swiftbox_airdrop_manifest_links'");
    manifestReady=Number(rows[0]?.n)===1;
  }
  return process.env.AIRDROP_SCHEMA_READY === "true"
    ? `(SELECT a.package_code FROM swiftbox_airdrop_packages a WHERE a.pk_id=p.pk_id AND a.organization_id=p.airdrop_org_id AND a.external_id=p.airdrop_package_id AND a.state='synced' LIMIT 1) AS external_code,
       (SELECT a.mode FROM swiftbox_airdrop_packages a WHERE a.pk_id=p.pk_id AND a.organization_id=p.airdrop_org_id AND a.external_id=p.airdrop_package_id AND a.state='synced' LIMIT 1) AS external_mode,
       (SELECT ${airdropReceivedAtSql("a",manifestReady)} FROM swiftbox_airdrop_packages a WHERE a.pk_id=p.pk_id AND a.organization_id=p.airdrop_org_id AND a.external_id=p.airdrop_package_id AND a.state='synced' LIMIT 1) AS external_received_at`
    : "NULL AS external_code, NULL AS external_mode, NULL AS external_received_at";
}
