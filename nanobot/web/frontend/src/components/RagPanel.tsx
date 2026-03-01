import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRagConfig, updateRagConfig } from "@/lib/api";
import type { RAGConfig, RAGBackendConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
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
  Link
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

function EmptyState({ onAdd }: { onAdd: (type: "local" | "http", name: string, url?: string) => void }) {
  const providers = [
    { id: "local", name: "SQLite FTS", type: "local", desc: "Built-in, zero setup", icon: HardDrive, color: "text-emerald-500", bg: "bg-emerald-50", url: "" },
    { id: "pinecone", name: "Pinecone", type: "http", desc: "Managed cloud vector DB", icon: Cloud, color: "text-blue-500", bg: "bg-blue-50", url: "https://api.pinecone.io" },
    { id: "qdrant", name: "Qdrant", type: "http", desc: "Open-source vector DB", icon: Database, color: "text-rose-500", bg: "bg-rose-50", url: "" },
    { id: "weaviate", name: "Weaviate", type: "http", desc: "AI-native database", icon: Globe, color: "text-emerald-600", bg: "bg-emerald-50", url: "" },
    { id: "milvus", name: "Milvus", type: "http", desc: "Highly scalable", icon: Server, color: "text-indigo-500", bg: "bg-indigo-50", url: "" },
    { id: "mongodb", name: "MongoDB", type: "http", desc: "Atlas Vector Search", icon: Database, color: "text-green-600", bg: "bg-green-50", url: "" },
    { id: "custom_http", name: "Custom HTTP", type: "http", desc: "Any compatible API", icon: Link, color: "text-slate-500", bg: "bg-slate-50", url: "" },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8">
      <div className="flex flex-col items-center pt-4 pb-2">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center mb-5">
          <Database className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="font-display text-xl font-bold text-slate-900 mb-1.5">Knowledge Base</h3>
        <p className="text-sm text-slate-500 text-center leading-relaxed max-w-md mb-8">
          Give your agent access to documents, FAQs, and reference material.
          Choose a vector database provider to get started.
        </p>

        <div className="w-full grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-4">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => onAdd(p.type as "local" | "http", p.id, p.url)}
              className="group rounded-2xl border border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30 transition-all duration-200 p-4 text-left cursor-pointer card-glow flex items-start gap-3.5"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5", p.bg)}>
                <p.icon className={cn("w-5 h-5", p.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                  {p.type === "local" && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed truncate">
                  {p.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
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
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-emerald-200/60 overflow-hidden card-glow">
      <div className="flex items-center gap-4 px-6 py-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200/60 flex items-center justify-center shrink-0">
          <HardDrive className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-slate-900">{name}</span>
            {isDefault && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
          </div>
          <div className="text-sm text-slate-500 mt-1">SQLite FTS5 - built-in, no setup needed</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDefault && (
            <button
              onClick={onSetDefault}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-emerald-600 px-3 py-2 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer"
              title="Set as default"
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Set Default</span>
            </button>
          )}
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-red-500 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Remove</span>
          </button>
        </div>
      </div>
    </div>
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
  const hasUrl = !!backend.api_url;

  return (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden card-glow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-6 py-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/60 flex items-center justify-center shrink-0">
          <Globe className="w-6 h-6 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-slate-900">{name}</span>
            {isDefault && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
          </div>
          <div className="text-sm text-slate-500 mt-1 truncate">
            {hasUrl ? backend.api_url : "Not configured - click to set up"}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasUrl ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-6 py-6 space-y-6 animate-fade-in">
          <div>
            <label className="text-base font-bold text-slate-700 mb-2.5 block">API URL</label>
            <Input
              value={backend.api_url}
              onChange={(e) => onUpdate({ ...backend, api_url: e.target.value })}
              placeholder="https://api.pinecone.io"
              className="h-11 text-base px-4 bg-slate-50/50"
            />
            <p className="text-sm font-medium text-slate-400 mt-2">Base URL of your vector database API</p>
          </div>

          <div>
            <label className="text-base font-bold text-slate-700 mb-2.5 block">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={backend.api_key}
                onChange={(e) => onUpdate({ ...backend, api_key: e.target.value })}
                placeholder="sk-..."
                className="h-11 text-base px-4 bg-slate-50/50 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-base font-bold text-slate-700 mb-2.5 block">Collection</label>
            <Input
              value={backend.collection}
              onChange={(e) => onUpdate({ ...backend, collection: e.target.value })}
              placeholder="default"
              className="h-11 text-base px-4 bg-slate-50/50"
            />
          </div>

          <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/30">
            <summary className="text-sm font-bold text-slate-600 cursor-pointer hover:text-emerald-600 transition-colors flex items-center gap-2 select-none">
              <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
              Advanced settings
            </summary>
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Search Path</label>
                  <Input
                    value={backend.search_path}
                    onChange={(e) => onUpdate({ ...backend, search_path: e.target.value })}
                    placeholder="/search"
                    className="h-10 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Ingest Path</label>
                  <Input
                    value={backend.ingest_path}
                    onChange={(e) => onUpdate({ ...backend, ingest_path: e.target.value })}
                    placeholder="/ingest"
                    className="h-10 text-sm bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Delete Path</label>
                  <Input
                    value={backend.delete_path}
                    onChange={(e) => onUpdate({ ...backend, delete_path: e.target.value })}
                    placeholder="/delete"
                    className="h-10 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Timeout (s)</label>
                  <Input
                    type="number"
                    value={backend.timeout}
                    onChange={(e) => onUpdate({ ...backend, timeout: Number(e.target.value) })}
                    className="h-10 text-sm bg-white"
                  />
                </div>
              </div>
            </div>
          </details>

          <div className="flex gap-4 pt-5 border-t border-slate-100">
            {!isDefault && (
              <button
                onClick={onSetDefault}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 px-4 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <Star className="w-4 h-4" />
                Set as default
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={onRemove}
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-red-500 px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Remove Backend
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddBackendRow({ onAdd }: { onAdd: (type: "local" | "http", name: string) => void }) {
  const [mode, setMode] = useState<"idle" | "local" | "http">("idle");
  const [name, setName] = useState("");

  if (mode === "idle") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => { setMode("local"); setName(""); }}
          className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-emerald-600 border border-dashed border-slate-200 hover:border-emerald-300 rounded-2xl py-4 transition-all cursor-pointer hover:bg-emerald-50/30"
        >
          <HardDrive className="w-4 h-4" />
          Add Local
        </button>
        <button
          onClick={() => { setMode("http"); setName(""); }}
          className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-dashed border-slate-200 hover:border-slate-300 rounded-2xl py-4 transition-all cursor-pointer hover:bg-slate-50"
        >
          <Globe className="w-4 h-4" />
          Add External
        </button>
      </div>
    );
  }

  const isLocal = mode === "local";
  const placeholder = isLocal ? "e.g. local-docs" : "e.g. pinecone, weaviate";

  return (
    <div className={`rounded-3xl border p-5 space-y-4 ${isLocal ? "border-emerald-200/60 bg-emerald-50/50" : "border-slate-200 bg-slate-50/50"}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
        {isLocal ? <HardDrive className="w-4 h-4 text-emerald-500" /> : <Globe className="w-4 h-4" />}
        New {isLocal ? "local" : "external"} backend
      </div>
      <div className="flex items-center gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-11 text-base bg-white"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onAdd(mode, name.trim());
            if (e.key === "Escape") setMode("idle");
          }}
        />
        <Button
          size="lg"
          variant={isLocal ? "default" : "outline"}
          onClick={() => {
            if (name.trim()) {
              onAdd(mode, name.trim());
              setMode("idle");
              setName("");
            }
          }}
          className="h-11 px-6 font-bold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => setMode("idle")}
          className="h-11 px-4 font-bold text-slate-500 hover:text-slate-700"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 p-8">
      <div className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">How it works</div>
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shrink-0 mt-0.5">
            <FileUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">Ingest</div>
            <div className="text-sm font-medium text-slate-500 mt-1 leading-relaxed">
              Paste documents or tell the agent to save content with <code className="text-xs px-1.5 py-0.5 rounded-md bg-slate-100 text-emerald-600 font-mono">rag_ingest</code>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shrink-0 mt-0.5">
            <Search className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">Search</div>
            <div className="text-sm font-medium text-slate-500 mt-1 leading-relaxed">
              The agent automatically searches your knowledge base when relevant
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shrink-0 mt-0.5">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">Answer</div>
            <div className="text-sm font-medium text-slate-500 mt-1 leading-relaxed">
              Responses are grounded in your documents with source references
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RagPanel() {
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRagConfig();
      setConfig(data);
      setDirty(false);
    } catch (e) {
      toast("error", `Failed to load RAG config: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (partial: Partial<RAGConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRagConfig(config);
      toast("success", "RAG configuration saved");
      setDirty(false);
    } catch (e) {
      toast("error", `Failed to save: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const backendCount = Object.keys(config.backends).length;
  const hasBackends = backendCount > 0;

  const addBackend = (type: "local" | "http", name: string, url?: string) => {
    const template = type === "local" ? { ...LOCAL_BACKEND } : { ...HTTP_BACKEND, api_url: url || "" };
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
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-8 pt-8 pb-6 shrink-0 bg-white z-10 sticky top-0 border-b border-transparent data-[scrolled=true]:border-slate-100 data-[scrolled=true]:shadow-sm transition-all duration-200">
        <div className="content-container-wide">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                <Database className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-slate-900">Knowledge Base</h1>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  Connect document sources so the agent can search and reference your knowledge
                </p>
              </div>
            </div>

            {hasBackends && (
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all cursor-pointer",
                  dirty
                    ? "text-white bg-gradient-to-b from-green to-green-hover hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20"
                    : "text-slate-400 bg-slate-100 opacity-50 cursor-not-allowed hidden md:flex"
                )}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Save Changes
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="content-container-wide space-y-6 animate-fade-in-up">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : !hasBackends ? (
            <>
              <EmptyState
                onAdd={addBackend}
              />
              <HowItWorks />
            </>
          ) : (
            <>
              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 px-6 py-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-3.5 h-3.5 rounded-full ${config.enabled ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" : "bg-slate-300"}`} />
                    <div>
                      <div className="text-lg font-bold text-slate-900 leading-none">
                        {config.enabled ? "Knowledge Base Active" : "Knowledge Base Disabled"}
                      </div>
                      <div className="text-sm font-medium text-slate-500 mt-1.5">
                        {config.enabled
                          ? `${backendCount} backend${backendCount > 1 ? "s" : ""} - agent can construct and search RAG queries`
                          : "Enable to let the agent search your local and external documents"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center p-1.5 rounded-xl bg-slate-100/80 border border-slate-200/60 shrink-0">
                    <button
                      type="button"
                      onClick={() => update({ enabled: false })}
                      className={cn(
                        "px-5 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center",
                        !config.enabled ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      )}
                    >
                      Disabled
                    </button>
                    <button
                      type="button"
                      onClick={() => update({ enabled: true })}
                      className={cn(
                        "px-5 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center",
                        config.enabled ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      )}
                    >
                      Active
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-xs font-medium text-slate-400">Backends</span>
                    <span className="text-[11px] text-slate-400">{backendCount} configured</span>
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
                        onUpdate={(b) => update({ backends: { ...config.backends, [name]: b } })}
                        onRemove={() => removeBackend(name)}
                        onSetDefault={() => update({ default_backend: name })}
                      />
                    ),
                  )}

                  <AddBackendRow onAdd={addBackend} />
                </div>
              </div>

              <HowItWorks />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
