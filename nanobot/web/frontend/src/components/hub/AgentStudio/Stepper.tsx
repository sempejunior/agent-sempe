import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  key: number;
  label: string;
}

interface Props {
  steps: Step[];
  current: number;
  onJump?: (n: number) => void;
}

export function Stepper({ steps, current, onJump }: Props) {
  return (
    <div className="flex items-center w-full">
      {steps.map((step, idx) => {
        const isActive = step.key === current;
        const isDone = step.key < current;
        const clickable = onJump && (isDone || isActive);
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onJump?.(step.key)}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border transition-colors",
                  isActive && "bg-purple text-white border-purple shadow-sm",
                  isDone && "bg-purple-muted text-purple border-purple/30",
                  !isActive && !isDone && "bg-surface text-text-muted border-border",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : step.key}
              </button>
              <span
                className={cn(
                  "text-xs font-semibold whitespace-nowrap",
                  isActive
                    ? "text-purple"
                    : isDone
                      ? "text-text-primary"
                      : "text-text-muted",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 mb-6 rounded-full",
                  isDone ? "bg-purple/40" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
