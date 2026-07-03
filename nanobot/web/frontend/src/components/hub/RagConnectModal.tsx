import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { RAGConfig, RAGBackendConfig } from "@/lib/api";

interface Props {
  open: boolean;
  initial: RAGConfig;
  onCancel: () => void;
  onSave: (next: RAGConfig) => Promise<void>;
}

const BACKEND_OPTIONS = ["local", "pinecone", "qdrant", "weaviate"] as const;
type BackendType = (typeof BACKEND_OPTIONS)[number];

function emptyBackend(type: BackendType): RAGBackendConfig {
  return {
    type,
    api_url: "",
    api_key: "",
    headers: {},
    collection: "",
    search_path: "",
    ingest_path: "",
    delete_path: "",
    timeout: 30,
  };
}

export function RagConnectModal({ open, initial, onCancel, onSave }: Props) {
  const currentKey = initial.default_backend || "local";
  const currentBackend = initial.backends?.[currentKey];
  const [backendType, setBackendType] = useState<BackendType>(
    (currentBackend?.type as BackendType) || "local",
  );
  const [apiUrl, setApiUrl] = useState(currentBackend?.api_url ?? "");
  const [apiKey, setApiKey] = useState(currentBackend?.api_key ?? "");
  const [collection, setCollection] = useState(currentBackend?.collection ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const base = currentBackend ?? emptyBackend(backendType);
    const nextBackend: RAGBackendConfig = {
      ...base,
      type: backendType,
      api_url: apiUrl,
      api_key: apiKey,
      collection,
    };
    const next: RAGConfig = {
      enabled: true,
      default_backend: backendType,
      backends: { ...(initial.backends ?? {}), [backendType]: nextBackend },
    };
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Configurar backend RAG</DialogTitle>
            <DialogDescription>
              Escolha o provider e informe os dados de conexão. A base de
              conhecimento fica disponível para todos os agentes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Backend</Label>
              <Select
                value={backendType}
                onValueChange={(v) => setBackendType(v as BackendType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKEND_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Index / Collection</Label>
              <Input
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="documents"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
