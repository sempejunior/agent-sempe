import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { getConfig, updateConfig, getProviderConfig, updateProviderConfig } from "@/lib/api";
import type { AgentConfig, ProviderConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
    Settings,
    Save,
    Cpu,
    Eye,
    EyeOff,
    MessageSquareText,
    ChevronDown,
    Check,
    SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LANGUAGES = [
    { value: "", label: "Auto (server default)" },
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

type Tab = "general" | "model" | "advanced";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "general", label: "General", icon: MessageSquareText },
    { id: "model", label: "Model", icon: Cpu },
    { id: "advanced", label: "Advanced", icon: SlidersHorizontal },
];

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <div className="mb-2.5">
            <label className="font-display text-base font-bold text-slate-700">{children}</label>
            {hint && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{hint}</p>}
        </div>
    );
}

function TabGeneral({ config, onChange }: {
    config: AgentConfig;
    onChange: (key: keyof AgentConfig, value: string | number) => void;
}) {
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,450px),1fr))] gap-6 animate-fade-in-up">
            <div className="col-span-full">
                <FieldLabel hint="Tell the agent about yourself, your preferences, or how it should behave.">
                    Custom Instructions
                </FieldLabel>
                <textarea
                    value={config.custom_instructions || ""}
                    onChange={(e) => onChange("custom_instructions", e.target.value)}
                    placeholder={"Example:\n- I'm a backend developer working with Python and FastAPI\n- Always explain your reasoning before acting\n- Prefer concise answers"}
                    rows={6}
                    className="w-full resize-none text-base leading-relaxed bg-white border border-slate-200 rounded-xl p-5 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
                />
            </div>

            <div>
                <FieldLabel hint="Choose the language the agent should use when responding.">
                    Response Language
                </FieldLabel>
                <div className="relative">
                    <select
                        value={config.language || ""}
                        onChange={(e) => onChange("language", e.target.value)}
                        className="w-full h-12 px-4 pr-10 text-base bg-white border border-slate-200 rounded-xl text-slate-900 appearance-none focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors cursor-pointer"
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.value} value={lang.value} className="bg-white text-slate-900">
                                {lang.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
            </div>
        </div>
    );
}

function TabModel({ config, providerConfig, apiKeyInput, apiKeyDirty, showApiKey, onChange, setProviderConfig, setApiKeyInput, setApiKeyDirty, setShowApiKey }: {
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,450px),1fr))] gap-6 items-start animate-fade-in-up">
            <div className="col-span-full">
                <FieldLabel hint="Leave empty to use the server default.">Provider</FieldLabel>
                <div className="flex flex-wrap gap-3">
                    {(["openai", "anthropic", "custom"] as const).map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => {
                                if (providerConfig.name === p) {
                                    setProviderConfig({ name: "", api_key: "", api_base: "" });
                                    setApiKeyInput("");
                                    setApiKeyDirty(true);
                                } else {
                                    setProviderConfig((prev) => ({ ...prev, name: p }));
                                }
                            }}
                            className={cn(
                                "px-6 py-3 rounded-xl text-base font-bold border transition-all cursor-pointer",
                                providerConfig.name === p
                                    ? "bg-gradient-to-b from-green to-green-hover border-transparent text-white shadow-md shadow-green/20"
                                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300",
                            )}
                        >
                            {p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : "Custom"}
                        </button>
                    ))}
                </div>
            </div>

            {providerConfig.name && (
                <>
                    <div>
                        <FieldLabel>API Key</FieldLabel>
                        <div className="relative">
                            <Input
                                type={showApiKey ? "text" : "password"}
                                value={apiKeyInput}
                                onChange={(e) => {
                                    setApiKeyInput(e.target.value);
                                    setApiKeyDirty(true);
                                }}
                                onFocus={() => {
                                    if (!apiKeyDirty && apiKeyInput.includes("\u2022")) {
                                        setApiKeyInput("");
                                        setApiKeyDirty(true);
                                    }
                                }}
                                placeholder="sk-..."
                                className="h-12 text-base px-4 pr-12 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                            />
                            <button
                                type="button"
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1"
                                onClick={() => setShowApiKey((v) => !v)}
                            >
                                {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        {!apiKeyDirty && apiKeyInput && (
                            <p className="text-sm text-slate-400 mt-2">
                                Key is masked. Click the field to enter a new one.
                            </p>
                        )}
                    </div>

                    {providerConfig.name === "custom" && (
                        <div>
                            <FieldLabel hint="OpenAI-compatible endpoint">API Base URL</FieldLabel>
                            <Input
                                value={providerConfig.api_base || ""}
                                onChange={(e) => setProviderConfig((prev) => ({ ...prev, api_base: e.target.value }))}
                                placeholder="https://api.example.com/v1"
                                className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                            />
                        </div>
                    )}
                </>
            )}

            <div>
                <FieldLabel hint="Format: provider/model-name (e.g. openai/gpt-4o-mini)">Model</FieldLabel>
                <Input
                    value={config.model || ""}
                    onChange={(e) => onChange("model", e.target.value)}
                    placeholder="anthropic/claude-sonnet-4-20250514"
                    className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                />
            </div>
        </div>
    );
}

function TabAdvanced({ config, onChange }: {
    config: AgentConfig;
    onChange: (key: keyof AgentConfig, value: string | number) => void;
}) {
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,350px),1fr))] gap-6 items-start animate-fade-in-up">
            <div>
                <FieldLabel hint="0 = deterministic, 2 = creative">Temperature</FieldLabel>
                <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={config.temperature ?? ""}
                    onChange={(e) => onChange("temperature", parseFloat(e.target.value))}
                    placeholder="0.1"
                    className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                />
            </div>
            <div>
                <FieldLabel hint="Max response length">Max Tokens</FieldLabel>
                <Input
                    type="number"
                    step="1"
                    min="256"
                    value={config.max_tokens ?? ""}
                    onChange={(e) => onChange("max_tokens", parseInt(e.target.value, 10))}
                    placeholder="8192"
                    className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                />
            </div>
            <div>
                <FieldLabel hint="How many tools the agent can call in one turn">Max Tool Iterations</FieldLabel>
                <Input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={config.max_tool_iterations ?? ""}
                    onChange={(e) => onChange("max_tool_iterations", parseInt(e.target.value, 10))}
                    placeholder="40"
                    className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                />
            </div>
            <div>
                <FieldLabel hint="Messages before auto-consolidation into long-term memory. Lower = saves more often.">
                    Memory Window
                </FieldLabel>
                <Input
                    type="number"
                    step="1"
                    min="5"
                    max="200"
                    value={config.memory_window ?? ""}
                    onChange={(e) => onChange("memory_window", parseInt(e.target.value, 10))}
                    placeholder="20"
                    className="h-12 text-base px-4 bg-white border-slate-200 rounded-xl focus:border-emerald-300 focus:ring-emerald-500/10"
                />
            </div>
        </div>
    );
}

export function SettingsPage() {
    const [tab, setTab] = useState<Tab>("general");
    const [config, setConfig] = useState<AgentConfig>({});
    const [providerConfig, setProviderConfig] = useState<ProviderConfig>({ name: "", api_key: "", api_base: "" });
    const [showApiKey, setShowApiKey] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [apiKeyDirty, setApiKeyDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const [res, provRes] = await Promise.all([getConfig(), getProviderConfig()]);
            setConfig(res || {});
            const prov = provRes || { name: "", api_key: "", api_base: "" };
            setProviderConfig(prov);
            setApiKeyInput(prov.api_key || "");
            setShowApiKey(false);
            setApiKeyDirty(false);
        } catch (e) {
            toast("error", `Failed to load settings: ${(e as Error).message}`);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadConfig();
    }, []);

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
            setSaved(true);
            toast("success", "Settings saved");
            setApiKeyDirty(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            toast("error", `Failed to save: ${(e as Error).message}`);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center h-full">
                <div className="w-7 h-7 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Page Header */}
            <div className="px-8 pt-8 pb-4 shrink-0 bg-white z-10 sticky top-0 border-b border-transparent data-[scrolled=true]:border-slate-100 data-[scrolled=true]:shadow-sm transition-all duration-200">
                <div className="content-container">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                                <Settings size={24} className="text-emerald-500" />
                            </div>
                            <div>
                                <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
                                <p className="text-slate-500 text-sm mt-1">Configure your agent's behavior, model, and advanced parameters.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {saved && (
                                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-bold animate-fade-in">
                                    <Check className="w-4 h-4" />
                                    Saved
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={loading || saving}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                            >
                                {saving ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-5 h-5" />
                                )}
                                Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings Card */}
            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden px-8 pb-6 animate-fade-in-up">
                <div className="content-container flex-1 flex flex-col w-full">
                    <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
                        {/* Tab bar */}
                        <div className="flex border-b border-slate-100 px-4 pt-4 gap-2 shrink-0 bg-gradient-to-r from-slate-50 to-white">
                            {TABS.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setTab(id)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-6 py-4 font-display text-base font-bold transition-all cursor-pointer relative rounded-t-xl",
                                        tab === id
                                            ? "text-emerald-600 bg-emerald-50/50"
                                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
                                    )}
                                >
                                    <Icon className="w-5 h-5" />
                                    {label}
                                    {tab === id && (
                                        <span className="absolute bottom-0 left-3 right-3 h-[3px] bg-gradient-to-r from-green to-green-hover rounded-t-full" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="p-6 flex-1 overflow-y-auto">
                            {tab === "general" && (
                                <TabGeneral config={config} onChange={handleChange} />
                            )}
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
                            {tab === "advanced" && (
                                <TabAdvanced config={config} onChange={handleChange} />
                            )}
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
