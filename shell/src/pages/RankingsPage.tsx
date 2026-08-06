import { useI18n } from "@/i18n";

export default function RankingsPage() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">{t("nav.rankings")}</h1>
    </div>
  );
}
