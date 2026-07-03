import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5 pb-4 border-b border-border">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple to-purple-hover flex items-center justify-center text-white shrink-0 shadow-md shadow-purple/25">
          <Icon className="w-5 h-5" />
        </div>
        <div className="pt-0.5 min-w-0">
          <h1 className="text-[26px] leading-tight font-bold text-text-primary tracking-tight font-display truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-text-secondary mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
