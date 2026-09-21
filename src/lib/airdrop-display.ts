/** Deployment gate: enable only after migration 026 is verified on the shared DB. */
export function airdropPackageColumns(): string {
  return process.env.AIRDROP_SCHEMA_READY === "true"
    ? `COALESCE(p.actual_weight,p.weight) AS actual_weight,
       (SELECT a.package_code FROM swiftbox_airdrop_packages a WHERE a.pk_id=p.pk_id AND a.organization_id=p.airdrop_org_id AND a.external_id=p.airdrop_package_id AND a.state='synced' LIMIT 1) AS external_code,
       (SELECT a.mode FROM swiftbox_airdrop_packages a WHERE a.pk_id=p.pk_id AND a.organization_id=p.airdrop_org_id AND a.external_id=p.airdrop_package_id AND a.state='synced' LIMIT 1) AS external_mode`
    : "p.weight AS actual_weight, NULL AS external_code, NULL AS external_mode";
}
