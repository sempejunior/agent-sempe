import { useToastStore } from "@/lib/toast";
import type { Toast } from "@/lib/toast";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: "border-green/20 bg-emerald-50 text-emerald-700",
  error: "border-red/20 bg-red-50 text-red-600",
  info: "border-slate-200 bg-white text-text-primary",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore();
  const Icon = icons[toast.type];
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-toast-in",
        styles[toast.type],
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm flex-1 font-medium">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 hover:opacity-70 cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-auto">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
