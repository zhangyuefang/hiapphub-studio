import { useI18n } from "@/i18n";

export default function CategoriesPage() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">{t("nav.categories")}</h1>
    </div>
  );
}
