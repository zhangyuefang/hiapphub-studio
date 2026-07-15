import { useI18n } from "../i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        🔍
      </span>
      <input
        type="text"
        placeholder={t("app.search")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
        style={{
          background: "var(--fs-bg-secondary)",
          borderColor: "var(--fs-border)",
          color: "var(--fs-text)",
        }}
      />
    </div>
  );
}
