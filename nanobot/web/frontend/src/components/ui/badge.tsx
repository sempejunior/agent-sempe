import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-purple-muted text-purple-hover",
        solid: "bg-purple text-white",
        outline: "border border-border text-text-secondary bg-surface",
        success: "bg-emerald-50 text-emerald-700 border border-emerald-100",
        warning: "bg-yellow-muted text-yellow border border-yellow/20",
        danger: "bg-red-muted text-red border border-red/20",
        muted: "bg-surface-alt text-text-secondary",
        code: "bg-surface-alt text-text-secondary font-mono text-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
