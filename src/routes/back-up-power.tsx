import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/components/site/CatalogPage";
import catBackupPower from "@/assets/cat-backup-power.jpg";
import { backupPowerCategories } from "@/lib/products";

export const Route = createFileRoute("/back-up-power")({
  head: () => ({ meta: [
    { title: "Portable Power Stations — OddGrid" },
    { name: "description", content: "Portable LiFePO4 power stations selected to support solar refrigeration, cooling and essential loads." },
    { property: "og:title", content: "Back-up Power — OddGrid" },
    { property: "og:description", content: "Portable power stations for cooling, connectivity and off-grid essentials." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: BackupPowerPage,
});
function BackupPowerPage() { return <CatalogPage category="back-up-power" title="Back-up power" intro="Portable power stations selected to keep cooling, connectivity and essential equipment running." filters={backupPowerCategories} image={catBackupPower} />; }
