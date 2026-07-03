import { forwardRef } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-xl bg-surface-alt p-1 border border-border",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition-all cursor-pointer",
      "text-text-secondary hover:text-text-primary",
      "data-[state=active]:bg-surface data-[state=active]:text-purple data-[state=active]:shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple/40",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  badge?: number | string;
}

interface TabBarProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}

export function TabBar<T extends string = string>({
  items,
  value,
  onChange,
  className,
}: TabBarProps<T>) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList className={className}>
        {items.map((item) => (
          <TabsTrigger key={item.key} value={item.key}>
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null && item.badge !== "" && (
              <span
                className={cn(
                  "text-[11px] font-bold min-w-[20px] px-1.5 py-0.5 rounded-md text-center",
                  value === item.key
                    ? "bg-purple-muted text-purple-hover"
                    : "bg-surface text-text-muted",
                )}
              >
                {item.badge}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
