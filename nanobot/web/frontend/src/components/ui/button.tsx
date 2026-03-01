import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  default:
    "bg-gradient-to-b from-green to-green-hover text-white font-semibold shadow-sm shadow-green/20 hover:shadow-md hover:shadow-green/25 active:shadow-sm",
  ghost:
    "bg-transparent hover:bg-slate-100 text-text-secondary hover:text-text-primary",
  outline:
    "border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-text-primary",
  danger:
    "bg-red-muted text-red hover:bg-red/20",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
  icon: "h-9 w-9 rounded-xl flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/40 focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:pointer-events-none",
          "cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
