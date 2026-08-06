import { useNavigate } from "react-router-dom";
import { Settings } from "@/components/Settings";

export default function SettingsPage() {
  const navigate = useNavigate();
  return <Settings onBack={() => navigate(-1)} />;
}
