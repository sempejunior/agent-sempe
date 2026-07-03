import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "code";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base =
      "w-full rounded-xl px-3.5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 resize-none focus:outline-none";

    const styles =
      variant === "code"
        ? "border border-slate-800 bg-slate-900 text-slate-100 font-mono placeholder:text-slate-500 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/60"
        : "border border-slate-200 bg-slate-50/60 text-slate-900 placeholder:text-slate-400 hover:bg-white focus:bg-white focus:ring-2 focus:ring-purple-500/15 focus:border-purple-300";

    return <textarea ref={ref} className={cn(base, styles, className)} {...props} />;
  },
);
Textarea.displayName = "Textarea";
