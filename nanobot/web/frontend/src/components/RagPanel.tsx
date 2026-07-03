import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/hub/PageHeader";
import { getRagConfig, updateRagConfig } from "@/lib/api";
import type { RAGConfig, RAGBackendConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import {
  Database,
  Plus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  HardDrive,
  Globe,
  Check,
  Star,
  ChevronDown,
  ChevronUp,
  Search,
  FileUp,
  Zap,
  Cloud,
  Server,
  Link,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOCAL_BACKEND: RAGBackendConfig = {
  type: "sqlite_fts",
  api_url: "",
  api_key: "",
  headers: {},
  collection: "default",
  search_path: "/search",
  ingest_path: "/ingest",
  delete_path: "/delete",
  timeout: 30,
};

const HTTP_BACKEND: RAGBackendConfig = {
  type: "http",
  api_url: "",
  api_key: "",
  headers: {},
  collection: "default",
  search_path: "/search",
  ingest_path: "/ingest",
  delete_path: "/delete",
  timeout: 30,
};

const DEFAULT_CONFIG: RAGConfig = {
  enabled: false,
  default_backend: "local",
  backends: {},
};

function EmptyState({
  onAdd,
}: {
  onAdd: (type: "local" | "http", name: string, url?: string) => void;
}) {
  const providers = [
    { id: "local", name: "SQLite FTS", type: "local", desc: "Built-in, sem setup", icon: HardDrive, url: "" },
    { id: "pinecone", name: "Pinecone", type: "http", desc: "Vector DB gerenciado", icon: Cloud, url: "https://api.pinecone.io" },
    { id: "qdrant", name: "Qdrant", type: "http", desc: "Vector DB open-source", icon: Database, url: "" },
    { id: "weaviate", name: "Weaviate", type: "http", desc: "AI-native database", icon: Globe, url: "" },
    { id: "milvus", name: "Milvus", type: "http", desc: "Escalável e distribuído", icon: Server, url: "" },
    { id: "mongodb", name: "MongoDB", type: "http", desc: "Atlas Vector Search", icon: Database, url: "" },
    { id: "custom_http", name: "Custom HTTP", type: "http", desc: "Qualquer API compatível", icon: Link, url: "" },
  ];

  return (
    <Card>
      <CardContent className="p-8 pt-8">
        <div className="flex flex-col items-center pb-2">
          <div className="w-14 h-14 rounded-2xl bg-purple-muted border border-purple/20 flex items-center justify-center mb-5">
            <Database className="w-7 h-7 text-purple" />
          </div>
          <h3 className="font-display text-lg font-bold text-text-primary mb-1.5">
            Escolha um provedor
          </h3>
          <p className="text-sm text-text-muted text-center leading-relaxed max-w-md mb-8">
            Dê acesso a documentos, FAQs e materiais de referência. Escolha um provedor de busca para começar.
          </p>

          <div className="w-full grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => onAdd(p.type as "local" | "http", p.id, p.url)}
                className="group rounded-2xl border border-border bg-surface hover:border-purple/40 hover:bg-purple-muted/30 transition-all p-4 text-left cursor-pointer flex items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-muted flex items-center justify-center shrink-0 mt-0.5">
                  <p.icon className="w-5 h-5 text-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-text-primary">{p.name}</span>
                    {p.type === "local" && (
                      <Badge variant="muted" className="text-[9px]">Default</Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed truncate">{p.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LocalCard({
  name,
  isDefault,
  onRemove,
  onSetDefault,
}: {
  name: string;
  isDefault: boolean;
  onRemove: () => void;
  onSetDefault: () => void;
}) {
  return (
    <Card className="border-purple/30">
      <CardContent className="p-4 pt-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-purple-muted flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text-primary">{name}</span>
              {isDefault && (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <Star className="w-2.5 h-2.5" />
                  Default
                </Badge>
              )}
            </div>
            <div className="text-xs text-text-muted mt-0.5">SQLite FTS5 — built-in, sem setup</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isDefault && (
              <Button size="sm" variant="ghost" onClick={onSetDefault} title="Definir como default">
                <Star className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Default</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="text-text-muted hover:text-red hover:bg-red-muted"
              title="Remover"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Remover</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HttpCard({
  name,
  backend,
  isDefault,
  onUpdate,
  onRemove,
  onSetDefault,
}: {
  name: string;
  backend: RAGBackendConfig;
  isDefault: boolean;
  onUpdate: (b: RAGBackendConfig) => void;
  onRemove: () => void;
  onSetDefault: () => void;
}) {
  const [expanded, setExpanded] = useState(!backend.api_url);
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const hasUrl = !!backend.api_url;

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-alt/50 transition-colors rounded-2xl"
      >
        <div className="w-11 h-11 rounded-2xl bg-surface-alt border border-border flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-text-muted" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-primary">{name}</span>
            {isDefault && (
              <Badge variant="success" className="gap-1 text-[10px]">
                <Star className="w-2.5 h-2.5" />
                Default
              </Badge>
            )}
          </div>
          <div className="text-xs text-text-muted mt-0.5 truncate">
            {hasUrl ? backend.api_url : "Não configurado — clique para configurar"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("w-2 h-2 rounded-full", hasUrl ? "bg-purple" : "bg-yellow")} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-5 space-y-5">
          <div>
            <label className="text-xs font-bold text-text-primary mb-1.5 block uppercase tracking-wide">
              API URL
            </label>
            <Input
              value={backend.api_url}
              onChange={(e) => onUpdate({ ...backend, api_url: e.target.value })}
              placeholder="https://api.pinecone.io"
            />
            <p className="text-xs text-text-muted mt-1.5">URL base do seu vector database</p>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary mb-1.5 block uppercase tracking-wide">
              API Key
            </label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={backend.api_key}
                onChange={(e) => onUpdate({ ...backend, api_key: e.target.value })}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary mb-1.5 block uppercase tracking-wide">
              Collection
            </label>
            <Input
              value={backend.collection}
              onChange={(e) => onUpdate({ ...backend, collection: e.target.value })}
              placeholder="default"
            />
          </div>

          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-text-secondary hover:text-purple transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", advanced && "rotate-180")} />
                Configurações avançadas
              </span>
            </button>
            {advanced && (
              <div className="p-4 border-t border-border space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-text-secondary mb-1 block uppercase tracking-wide">
                      Search Path
                    </label>
                    <Input
                      value={backend.search_path}
                      onChange={(e) => onUpdate({ ...backend, search_path: e.target.value })}
                      placeholder="/search"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-text-secondary mb-1 block uppercase tracking-wide">
                      Ingest Path
                    </label>
                    <Input
                      value={backend.ingest_path}
                      onChange={(e) => onUpdate({ ...backend, ingest_path: e.target.value })}
                      placeholder="/ingest"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-text-secondary mb-1 block uppercase tracking-wide">
                      Delete Path
                    </label>
                    <Input
                      value={backend.delete_path}
                      onChange={(e) => onUpdate({ ...backend, delete_path: e.target.value })}
                      placeholder="/delete"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-text-secondary mb-1 block uppercase tracking-wide">
                      Timeout (s)
                    </label>
                    <Input
                      type="number"
                      value={backend.timeout}
                      onChange={(e) => onUpdate({ ...backend, timeout: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t border-border">
            {!isDefault && (
              <Button size="sm" variant="ghost" onClick={onSetDefault}>
                <Star className="w-3.5 h-3.5" />
                Definir como default
              </Button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="text-text-muted hover:text-red hover:bg-red-muted"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover backend
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddBackendRow({ onAdd }: { onAdd: (type: "local" | "http", name: string) => void }) {
  const [mode, setMode] = useState<"idle" | "local" | "http">("idle");
  const [name, setName] = useState("");

  if (mode === "idle") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setMode("local");
            setName("");
          }}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-text-muted hover:text-purple border border-dashed border-border hover:border-purple/40 rounded-xl py-3 transition-all cursor-pointer hover:bg-purple-muted/30"
        >
          <HardDrive className="w-4 h-4" />
          Adicionar local
        </button>
        <button
          onClick={() => {
            setMode("http");
            setName("");
          }}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-text-muted hover:text-text-primary border border-dashed border-border hover:border-border-light rounded-xl py-3 transition-all cursor-pointer hover:bg-surface-alt"
        >
          <Globe className="w-4 h-4" />
          Adicionar externo
        </button>
      </div>
    );
  }

  const isLocal = mode === "local";
  const placeholder = isLocal ? "ex: local-docs" : "ex: pinecone, weaviate";

  return (
    <Card className={isLocal ? "border-purple/30 bg-purple-muted/30" : ""}>
      <CardContent className="p-4 pt-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-text-secondary uppercase tracking-wide">
          {isLocal ? (
            <HardDrive className="w-3.5 h-3.5 text-purple" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-text-muted" />
          )}
          Novo backend {isLocal ? "local" : "externo"}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onAdd(mode, name.trim());
              if (e.key === "Escape") setMode("idle");
            }}
          />
          <Button
            onClick={() => {
              if (name.trim()) {
                onAdd(mode, name.trim());
                setMode("idle");
                setName("");
              }
            }}
            disabled={!name.trim()}
          >
            <Plus />
            Adicionar
          </Button>
          <Button variant="ghost" onClick={() => setMode("idle")}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HowItWorks() {
  const steps = [
    { icon: FileUp, title: "Ingest", desc: "Cole documentos ou peça ao agente para salvar conteúdo com rag_ingest" },
    { icon: Search, title: "Busca", desc: "O agente consulta automaticamente a base quando relevante" },
    { icon: Zap, title: "Resposta", desc: "Respostas fundamentadas em documentos, com referências às fontes" },
  ];
  return (
    <Card>
      <CardContent className="p-6 pt-6">
        <div className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-5 pb-2 border-b border-border">
          Como funciona
        </div>
        <div className="space-y-5">
          {steps.map((s) => (
            <div key={s.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-purple" />
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary">{s.title}</div>
                <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RagPanel() {
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const activeAgentId = useStore((s) => s.activeAgentId);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRagConfig();
      setConfig(data);
      setDirty(false);
    } catch (e) {
      toast("error", `Falha ao carregar RAG: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [activeAgentId]);

  const update = (partial: Partial<RAGConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRagConfig(config);
      toast("success", "Configuração RAG salva");
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const backendCount = Object.keys(config.backends).length;
  const hasBackends = backendCount > 0;

  const addBackend = (type: "local" | "http", name: string, url?: string) => {
    const template =
      type === "local" ? { ...LOCAL_BACKEND } : { ...HTTP_BACKEND, api_url: url || "" };
    const isFirst = !hasBackends;
    update({
      backends: { ...config.backends, [name]: template },
      ...(isFirst ? { enabled: true, default_backend: name } : {}),
    });
  };

  const removeBackend = (name: string) => {
    const next = { ...config.backends };
    delete next[name];
    const updates: Partial<RAGConfig> = { backends: next };
    if (config.default_backend === name) {
      updates.default_backend = Object.keys(next)[0] || "local";
    }
    if (Object.keys(next).length === 0) {
      updates.enabled = false;
    }
    update(updates);
  };

  return (
    <div className="container-app">
      <PageHeader
        icon={Database}
        title="Bases RAG / FAQ"
        subtitle="Conecte fontes de documento para o agente consultar conhecimento interno."
        action={
          hasBackends ? (
            <div className="flex items-center gap-3">
              {saved && (
                <Badge variant="success" className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Salvo
                </Badge>
              )}
              <Button onClick={handleSave} disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : !hasBackends ? (
        <div className="space-y-5">
          <EmptyState onAdd={addBackend} />
          <HowItWorks />
        </div>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-5 pt-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      config.enabled ? "bg-purple animate-pulse" : "bg-border-light",
                    )}
                  />
                  <div>
                    <div className="text-sm font-bold text-text-primary">
                      {config.enabled ? "Base de conhecimento ativa" : "Base de conhecimento inativa"}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {config.enabled
                        ? `${backendCount} backend${backendCount > 1 ? "s" : ""} configurado(s)`
                        : "Ative para permitir busca em documentos"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center p-1 rounded-xl bg-surface-alt border border-border shrink-0">
                  <button
                    type="button"
                    onClick={() => update({ enabled: false })}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                      !config.enabled
                        ? "bg-surface text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    Inativa
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ enabled: true })}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                      config.enabled
                        ? "bg-purple text-white shadow-sm"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    Ativa
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                    Backends
                  </span>
                  <span className="text-[11px] text-text-muted">{backendCount} configurado(s)</span>
                </div>

                {Object.entries(config.backends).map(([name, backend]) =>
                  backend.type === "sqlite_fts" ? (
                    <LocalCard
                      key={name}
                      name={name}
                      isDefault={config.default_backend === name}
                      onRemove={() => removeBackend(name)}
                      onSetDefault={() => update({ default_backend: name })}
                    />
                  ) : (
                    <HttpCard
                      key={name}
                      name={name}
                      backend={backend}
                      isDefault={config.default_backend === name}
                      onUpdate={(b) =>
                        update({ backends: { ...config.backends, [name]: b } })
                      }
                      onRemove={() => removeBackend(name)}
                      onSetDefault={() => update({ default_backend: name })}
                    />
                  ),
                )}

                <AddBackendRow onAdd={addBackend} />
              </div>
            </CardContent>
          </Card>

          <HowItWorks />
        </div>
      )}
    </div>
  );
}
