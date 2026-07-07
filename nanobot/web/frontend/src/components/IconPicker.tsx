import { useMemo, useState } from "react";
import { Search, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { findIcons, getIcon } from "@/lib/iconCatalog";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (slug: string) => void;
}

export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => findIcons(query), [query]);
  const SelectedIcon = getIcon(value);

  function pick(slug: string) {
    onChange(slug);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface hover:border-purple/40 hover:bg-purple-muted/40 transition-colors px-3 py-2 text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-muted flex items-center justify-center text-purple shrink-0">
            <SelectedIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-text-muted leading-tight">Ícone atual</p>
            <p className="text-sm font-semibold text-text-primary truncate">
              {value || "sparkles"}
            </p>
          </div>
          <Pencil className="w-3.5 h-3.5 text-text-muted ml-2" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Escolher ícone</DialogTitle>
          <DialogDescription>
            Busque por nome ou tema (ex: brain, ponto, jurídico, meta).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ícone"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface-alt max-h-[420px] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="text-center text-xs text-text-muted py-6">
                Nenhum ícone encontrado.
              </p>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1">
                {results.map((opt) => {
                  const Icon = opt.Component;
                  const selected = opt.slug === value;
                  return (
                    <button
                      key={opt.slug}
                      type="button"
                      onClick={() => pick(opt.slug)}
                      title={`${opt.label} — ${opt.tags.join(", ")}`}
                      className={cn(
                        "aspect-square rounded-lg flex items-center justify-center transition-colors border",
                        selected
                          ? "bg-purple text-white border-purple"
                          : "bg-surface border-transparent text-text-secondary hover:border-purple/40 hover:text-purple",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
