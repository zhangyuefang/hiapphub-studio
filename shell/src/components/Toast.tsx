import { useState, useEffect } from "react";

interface ToastData {
  message: string;
  type: "success" | "error" | "info";
}

export function Toast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastData>).detail;
      setToast(detail);
      setTimeout(() => setToast(null), 2500);
    };
    window.addEventListener("hap-toast", handler);
    return () => window.removeEventListener("hap-toast", handler);
  }, []);

  if (!toast) return null;

  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm shadow-lg ${colors[toast.type]} animate-fade-in`}
    >
      {toast.message}
    </div>
  );
}
