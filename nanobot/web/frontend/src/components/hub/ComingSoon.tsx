import { Construction } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-16 h-16 rounded-2xl bg-purple-muted flex items-center justify-center text-purple mb-4">
        <Construction className="w-7 h-7" />
      </div>
      <h2 className="font-display font-bold text-xl text-text-primary">{title}</h2>
      {description && (
        <p className="text-sm text-text-secondary mt-2 max-w-md">{description}</p>
      )}
      <span className="mt-4 text-[10px] font-bold uppercase tracking-wider text-purple bg-purple-muted px-3 py-1 rounded-full">
        Em breve
      </span>
    </div>
  );
}
