import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none",
    "transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:opacity-50 disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ),
  {
    variants: {
      variant: {
        default:
          "bg-purple text-white font-semibold shadow-sm shadow-purple/25 hover:bg-purple-hover active:brightness-95 cursor-pointer",
        ghost:
          "bg-transparent hover:bg-surface-alt text-text-secondary hover:text-text-primary cursor-pointer",
        outline:
          "border border-border bg-surface hover:bg-surface-alt hover:border-border-light text-text-primary cursor-pointer",
        secondary:
          "bg-surface-alt text-text-primary hover:bg-surface-hover cursor-pointer",
        danger:
          "bg-red text-white font-semibold hover:brightness-110 cursor-pointer",
        subtle:
          "bg-purple-muted text-purple-hover hover:brightness-95 cursor-pointer",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm rounded-xl [&_svg]:size-4",
        lg: "h-11 px-5 text-sm rounded-xl [&_svg]:size-4",
        xl: "h-12 px-6 text-base rounded-xl [&_svg]:size-5",
        icon: "h-9 w-9 rounded-xl [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
