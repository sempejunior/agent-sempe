import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-sm text-slate-900",
          "placeholder:text-slate-400",
          "hover:bg-white focus:bg-white",
          "focus:outline-none focus:ring-2 focus:ring-purple-500/15 focus:border-purple-300",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-all duration-200",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
