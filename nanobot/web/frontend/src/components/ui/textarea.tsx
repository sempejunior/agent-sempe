import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-text-primary",
          "placeholder:text-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-green/15 focus:border-green/40",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-all duration-200 resize-none",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
