import { useI18n } from "@/i18n";
import { useSearchParams } from "react-router-dom";

export default function SearchPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const query = params.get("q") || "";

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        {t("search.results_count", `${query}`).replace("{{count}}", "0")} — "{query}"
      </h1>
    </div>
  );
}
