import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/hub/PageHeader";
import { TabBar } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  getConfig,
  updateConfig,
  getProviderConfig,
  updateProviderConfig,
  getWebSearchConfig,
  updateWebSearchConfig,
} from "@/lib/api";
import type { AgentConfig, ProviderConfig, WebSearchConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import {
  Save,
  Cpu,
  Eye,
  EyeOff,
  MessageSquareText,
  Check,
  SlidersHorizontal,
  Loader2,
  Settings,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { value: "auto", label: "Auto (padrão do servidor)" },
  { value: "Português (Brasil)", label: "Português (Brasil)" },
  { value: "English", label: "English" },
  { value: "Español", label: "Español" },
  { value: "Français", label: "Français" },
  { value: "Deutsch", label: "Deutsch" },
  { value: "Italiano", label: "Italiano" },
  { value: "日本語", label: "日本語" },
  { value: "中文", label: "中文" },
  { value: "한국어", label: "한국어" },
];

type Tab = "general" | "model" | "tools" | "advanced";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "general", label: "Geral", icon: MessageSquareText },
  { id: "model", label: "Modelo", icon: Cpu },
  { id: "tools", label: "Ferramentas", icon: Search },
  { id: "advanced", label: "Avançado", icon: SlidersHorizontal },
];

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

function TabGeneral({
  config,
  onChange,
}: {
  config: AgentConfig;
  onChange: (key: keyof AgentConfig, value: string | number) => void;
}) {
  return (
    <div className="space-y-5">
      <Field
        label="Instruções personalizadas"
        hint="Conte ao agente sobre você, suas preferências ou como ele deve se comportar."
      >
        <Textarea
          variant="code"
          value={config.custom_instructions || ""}
          onChange={(e) => onChange("custom_instructions", e.target.value)}
          placeholder={
            "Exemplo:\n- Sou desenvolvedor backend usando Python e FastAPI\n- Sempre explique seu raciocínio antes de agir\n- Prefira respostas concisas"
          }
          rows={7}
          className="p-4 leading-relaxed text-[13px]"
        />
      </Field>

      <Field
        label="Idioma da resposta"
        hint="Escolha o idioma que o agente deve usar ao responder."
      >
        <Select
          value={config.language || "auto"}
          onValueChange={(v) => onChange("language", v === "auto" ? "" : v)}
        >
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function TabModel({
  config,
  providerConfig,
  apiKeyInput,
  apiKeyDirty,
  showApiKey,
  onChange,
  setProviderConfig,
  setApiKeyInput,
  setApiKeyDirty,
  setShowApiKey,
}: {
  config: AgentConfig;
  providerConfig: ProviderConfig;
  apiKeyInput: string;
  apiKeyDirty: boolean;
  showApiKey: boolean;
  onChange: (key: keyof AgentConfig, value: string | number) => void;
  setProviderConfig: React.Dispatch<React.SetStateAction<ProviderConfig>>;
  setApiKeyInput: (v: string) => void;
  setApiKeyDirty: (v: boolean) => void;
  setShowApiKey: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Provedor" hint="Deixe vazio para usar o padrão do servidor.">
        <div className="flex flex-wrap gap-2">
          {(["openai", "anthropic", "custom"] as const).map((p) => {
            const active = providerConfig.name === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (active) {
                    setProviderConfig({ name: "", api_key: "", api_base: "" });
                    setApiKeyInput("");
                    setApiKeyDirty(true);
                  } else {
                    setProviderConfig((prev) => ({ ...prev, name: p }));
                  }
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer",
                  active
                    ? "bg-purple border-purple text-white shadow-sm"
                    : "bg-surface border-border text-text-secondary hover:border-purple/40 hover:text-purple",
                )}
              >
                {p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : "Custom"}
              </button>
            );
          })}
        </div>
      </Field>

      {providerConfig.name && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="API Key" htmlFor="apiKey">
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setApiKeyDirty(true);
                }}
                onFocus={() => {
                  if (!apiKeyDirty && apiKeyInput.includes("•")) {
                    setApiKeyInput("");
                    setApiKeyDirty(true);
                  }
                }}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
                onClick={() => setShowApiKey((v) => !v)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!apiKeyDirty && apiKeyInput && (
              <p className="text-xs text-text-muted">
                Chave mascarada. Use o olho para ver o final salvo ou clique no campo para inserir uma nova.
              </p>
            )}
          </Field>

          {providerConfig.name === "custom" && (
            <Field label="API Base URL" hint="Endpoint compatível com OpenAI" htmlFor="apiBase">
              <Input
                id="apiBase"
                value={providerConfig.api_base || ""}
                onChange={(e) =>
                  setProviderConfig((prev) => ({ ...prev, api_base: e.target.value }))
                }
                placeholder="https://api.example.com/v1"
              />
            </Field>
          )}
        </div>
      )}

      <Field
        label="Modelo"
        hint="Formato: provider/model-name (ex: openai/gpt-4o-mini)"
        htmlFor="model"
      >
        <Input
          id="model"
          value={config.model || ""}
          onChange={(e) => onChange("model", e.target.value)}
          placeholder="anthropic/claude-sonnet-4-20250514"
        />
      </Field>
    </div>
  );
}

function TabTools({
  webSearch,
  webSearchDirty,
  showWebSearchKey,
  setWebSearch,
  setWebSearchDirty,
  setShowWebSearchKey,
}: {
  webSearch: WebSearchConfig;
  webSearchDirty: boolean;
  showWebSearchKey: boolean;
  setWebSearch: React.Dispatch<React.SetStateAction<WebSearchConfig>>;
  setWebSearchDirty: (v: boolean) => void;
  setShowWebSearchKey: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display font-bold text-base text-text-primary">
          Web Search (Brave)
        </h3>
        <p className="text-sm text-text-muted mt-1">
          Chave para o agente pesquisar na web via <span className="font-semibold">Brave Search API</span>.
          Sem chave, a ferramenta <code>web_search</code> retorna erro. Crie uma em{" "}
          <a
            href="https://brave.com/search/api/"
            target="_blank"
            rel="noreferrer"
            className="text-purple hover:underline"
          >
            brave.com/search/api
          </a>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Brave Search API Key" htmlFor="braveKey">
          <div className="relative">
            <Input
              id="braveKey"
              type={showWebSearchKey ? "text" : "password"}
              value={webSearch.api_key}
              onChange={(e) => {
                setWebSearch((prev) => ({ ...prev, api_key: e.target.value }));
                setWebSearchDirty(true);
              }}
              onFocus={() => {
                if (!webSearchDirty && webSearch.api_key.includes("*")) {
                  setWebSearch((prev) => ({ ...prev, api_key: "" }));
                  setWebSearchDirty(true);
                }
              }}
              placeholder="BSA..."
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
              onClick={() => setShowWebSearchKey((v) => !v)}
            >
              {showWebSearchKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {!webSearchDirty && webSearch.api_key && (
            <p className="text-xs text-text-muted">
              Chave mascarada. Clique no campo para inserir uma nova.
            </p>
          )}
        </Field>

        <Field
          label="Máximo de resultados"
          hint="Quantos resultados o agente considera por busca (1–10)"
          htmlFor="wsMaxResults"
        >
          <Input
            id="wsMaxResults"
            type="number"
            min="1"
            max="10"
            step="1"
            value={webSearch.max_results}
            onChange={(e) => {
              setWebSearch((prev) => ({
                ...prev,
                max_results: parseInt(e.target.value, 10) || 5,
              }));
              setWebSearchDirty(true);
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function TabAdvanced({
  config,
  onChange,
}: {
  config: AgentConfig;
  onChange: (key: keyof AgentConfig, value: string | number) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Field label="Temperature" hint="0 = determinístico · 2 = criativo" htmlFor="temperature">
        <Input
          id="temperature"
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={config.temperature ?? ""}
          onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
          placeholder="0.1"
        />
      </Field>
      <Field label="Max Tokens" hint="Tamanho máximo da resposta" htmlFor="maxTokens">
        <Input
          id="maxTokens"
          type="number"
          step="1"
          min="256"
          value={config.max_tokens ?? ""}
          onChange={(e) => onChange("max_tokens", parseInt(e.target.value, 10))}
          placeholder="8192"
        />
      </Field>
      <Field
        label="Max Tool Iterations"
        hint="Quantas ferramentas o agente pode chamar por turno"
        htmlFor="maxTools"
      >
        <Input
          id="maxTools"
          type="number"
          step="1"
          min="1"
          max="100"
          value={config.max_tool_iterations ?? ""}
          onChange={(e) => onChange("max_tool_iterations", parseInt(e.target.value, 10))}
          placeholder="40"
        />
      </Field>
      <Field
        label="Memory Window"
        hint="Mensagens antes de consolidar em memória de longo prazo"
        htmlFor="memoryWindow"
      >
        <Input
          id="memoryWindow"
          type="number"
          step="1"
          min="5"
          max="200"
          value={config.memory_window ?? ""}
          onChange={(e) => onChange("memory_window", parseInt(e.target.value, 10))}
          placeholder="20"
        />
      </Field>
    </div>
  );
}

export function SettingsPage() {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [tab, setTab] = useState<Tab>("general");
  const [config, setConfig] = useState<AgentConfig>({});
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({
    name: "",
    api_key: "",
    api_base: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [webSearch, setWebSearch] = useState<WebSearchConfig>({
    provider: "brave",
    api_key: "",
    max_results: 5,
  });
  const [webSearchDirty, setWebSearchDirty] = useState(false);
  const [showWebSearchKey, setShowWebSearchKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [res, provRes, wsRes] = await Promise.all([
        getConfig(),
        getProviderConfig(),
        getWebSearchConfig(),
      ]);
      setConfig(res || {});
      const prov = provRes || { name: "", api_key: "", api_base: "" };
      setProviderConfig(prov);
      setApiKeyInput(prov.api_key || "");
      setShowApiKey(false);
      setApiKeyDirty(false);
      setWebSearch({
        provider: wsRes?.provider || "brave",
        api_key: wsRes?.api_key || "",
        max_results: wsRes?.max_results ?? 5,
      });
      setWebSearchDirty(false);
      setShowWebSearchKey(false);
    } catch (e) {
      toast("error", `Falha ao carregar: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfig();
  }, [activeAgentId]);

  const handleChange = (key: keyof AgentConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateConfig(config);
      const provPayload = { ...providerConfig };
      if (apiKeyDirty) {
        provPayload.api_key = apiKeyInput;
      }
      await updateProviderConfig(provPayload);
      const wsPayload: WebSearchConfig = { ...webSearch };
      if (!webSearchDirty) {
        wsPayload.api_key = webSearch.api_key;
      }
      await updateWebSearchConfig(wsPayload);
      setSaved(true);
      toast("success", "Configurações salvas");
      setApiKeyDirty(false);
      setWebSearchDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-purple animate-spin" />
      </div>
    );
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Ajuste comportamento, provedor/modelo e parâmetros avançados do agente."
        action={
          <div className="flex items-center gap-3">
            {saved && (
              <Badge variant="success" className="gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Salvo
              </Badge>
            )}
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSave} className="space-y-5">
        <TabBar<Tab>
          items={TABS.map((t) => ({ key: t.id, label: t.label }))}
          value={tab}
          onChange={setTab}
        />

        <Card>
          <CardContent className="p-6 pt-6">
            {tab === "general" && <TabGeneral config={config} onChange={handleChange} />}
            {tab === "model" && (
              <TabModel
                config={config}
                providerConfig={providerConfig}
                apiKeyInput={apiKeyInput}
                apiKeyDirty={apiKeyDirty}
                showApiKey={showApiKey}
                onChange={handleChange}
                setProviderConfig={setProviderConfig}
                setApiKeyInput={setApiKeyInput}
                setApiKeyDirty={setApiKeyDirty}
                setShowApiKey={setShowApiKey}
              />
            )}
            {tab === "tools" && (
              <TabTools
                webSearch={webSearch}
                webSearchDirty={webSearchDirty}
                showWebSearchKey={showWebSearchKey}
                setWebSearch={setWebSearch}
                setWebSearchDirty={setWebSearchDirty}
                setShowWebSearchKey={setShowWebSearchKey}
              />
            )}
            {tab === "advanced" && <TabAdvanced config={config} onChange={handleChange} />}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
