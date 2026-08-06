import { useI18n } from "@/i18n";

export default function DiscoverPage() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">{t("nav.discover")}</h1>
      <p className="text-[var(--fs-text-secondary)] text-sm">{t("discover.featured")}</p>
    </div>
  );
}
