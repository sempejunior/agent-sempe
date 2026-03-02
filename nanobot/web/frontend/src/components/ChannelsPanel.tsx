import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listChannels,
  updateChannel,
  startChannel,
  stopChannel,
} from "@/lib/api";
import type { ChannelInfo, ChannelField } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  Radio,
  ExternalLink,
  Play,
  Square,
  Eye,
  EyeOff,
  X,
  Plus,
  Loader2,
  Send,
  MessageSquare,
  Hash,
  Mail,
  Phone,
  ChevronRight,
  Settings2
} from "lucide-react";

function ChannelIcon({ name }: { name: string }) {
  const n = name.toLowerCase();

  if (n.includes("telegram")) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#0088cc]/10 border border-[#0088cc]/20 flex items-center justify-center shrink-0">
        <Send className="w-5 h-5 text-[#0088cc] -ml-0.5 mt-0.5" />
      </div>
    );
  }
  if (n.includes("discord")) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center shrink-0">
        <MessageSquare className="w-5 h-5 text-[#5865F2]" />
      </div>
    );
  }
  if (n.includes("slack")) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#E01E5A]/10 border border-[#E01E5A]/20 flex items-center justify-center shrink-0">
        <Hash className="w-5 h-5 text-[#E01E5A]" />
      </div>
    );
  }
  if (n.includes("whatsapp")) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center shrink-0">
        <Phone className="w-5 h-5 text-[#25D366]" />
      </div>
    );
  }
  if (n.includes("email") || n.includes("mail")) {
    return (
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
        <Mail className="w-5 h-5 text-amber-500" />
      </div>
    );
  }

  const label = name.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/60 flex items-center justify-center text-base font-bold text-slate-500 shrink-0">
      {label}
    </div>
  );
}

function StatusIndicator({ enabled, running }: { enabled: boolean; running: boolean }) {
  if (running) {
    return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" title="Connected" />;
  }
  if (enabled) {
    return <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" title="Enabled (Not Running)" />;
  }
  return <div className="w-2.5 h-2.5 rounded-full bg-slate-300" title="Disabled" />;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ChannelField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  if (field.type === "bool") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${value ? "bg-emerald-500" : "bg-slate-200"
          }`}
      >
        <span
          className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${value ? "translate-x-[26px]" : "translate-x-[3px]"
            }`}
        />
      </button>
    );
  }

  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={field.placeholder}
              className="flex-1 bg-slate-50/50 border-slate-200 focus:bg-white h-11 rounded-xl shadow-sm text-base"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onChange(items.filter((_, j) => j !== i));
              }}
              className="shrink-0 h-11 w-11 text-slate-400 hover:text-red-500 rounded-xl"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, ""])}
          className="text-slate-500 font-bold border-slate-200 hover:bg-slate-50 rounded-xl"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Item
        </Button>
      </div>
    );
  }

  if (field.type === "password") {
    return (
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="pr-12 bg-slate-50/50 border-slate-200 focus:bg-white h-11 rounded-xl shadow-sm text-base"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    );
  }

  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      value={(value as string) ?? ""}
      onChange={(e) =>
        onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
      }
      placeholder={field.placeholder}
      className="bg-slate-50/50 border-slate-200 focus:bg-white h-11 rounded-xl shadow-sm text-base"
    />
  );
}

function StartChannelDialog({
  channelLabel,
  onStart,
  onDismiss,
}: {
  channelLabel: string;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4 p-8 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/50 flex items-center justify-center">
            <Play className="w-5 h-5 text-emerald-600 fill-current" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Start {channelLabel}?</h3>
        </div>
        <p className="text-sm text-slate-500 font-medium mb-6">
          Configuration saved successfully. Would you like to start the channel now?
        </p>
        <div className="flex items-center gap-3 justify-end">
          <Button
            onClick={onDismiss}
            className="px-5 h-10 text-slate-600 bg-slate-100 hover:bg-slate-200 border-none rounded-xl font-bold transition-all"
          >
            Later
          </Button>
          <Button
            onClick={onStart}
            className="px-5 h-10 text-white bg-emerald-600 hover:bg-emerald-700 border-none rounded-xl font-bold shadow-md transition-all"
          >
            <Play className="w-4 h-4 mr-1.5 fill-current" />
            Start Now
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChannelDetail({
  channel,
  onRefresh,
}: {
  channel: ChannelInfo;
  onRefresh: () => void;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const isEnabled = (formData["enabled"] as boolean) ?? channel.enabled;

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    for (const field of channel.fields) {
      initial[field.key] = channel.config[field.key] ?? (field.type === "bool" ? false : field.type === "list" ? [] : "");
    }
    initial["enabled"] = channel.enabled;
    setFormData(initial);
    setDirty(false);
    setShowStartDialog(false);
  }, [channel]);

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateChannel(channel.name, formData);
      setDirty(false);
      if (isEnabled && !channel.running) {
        setShowStartDialog(true);
      } else {
        toast("success", `${channel.label} config saved`);
      }
      onRefresh();
    } catch (e) {
      toast("error", `Failed to save: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const handleStart = async () => {
    setShowStartDialog(false);
    setStarting(true);
    try {
      await startChannel(channel.name);
      toast("success", `${channel.label} is starting...`);
      setTimeout(onRefresh, 2000);
    } catch (e) {
      toast("error", `Failed to start: ${(e as Error).message}`);
    }
    setStarting(false);
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopChannel(channel.name);
      toast("success", `${channel.label} stopped`);
      onRefresh();
    } catch (e) {
      toast("error", `Failed to stop: ${(e as Error).message}`);
    }
    setStopping(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 border border-slate-200 rounded-3xl overflow-hidden shadow-sm animate-fade-in">
      {showStartDialog && (
        <StartChannelDialog
          channelLabel={channel.label}
          onStart={handleStart}
          onDismiss={() => setShowStartDialog(false)}
        />
      )}

      {/* Detail Header */}
      <div className="flex items-center gap-5 px-8 pt-8 pb-6 bg-white border-b border-slate-200">
        <ChannelIcon name={channel.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{channel.label}</h2>
            {channel.running ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </span>
            ) : isEnabled ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Enabled
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {channel.description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => updateField("enabled", !isEnabled)}
          className={cn(
            "relative w-14 h-7 rounded-full transition-all duration-300 cursor-pointer shrink-0 shadow-inner",
            isEnabled
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-emerald-200"
              : "bg-slate-200",
          )}
          title={isEnabled ? "Disable channel" : "Enable channel"}
        >
          <span
            className={cn(
              "absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all duration-300",
              isEnabled ? "translate-x-[31px]" : "translate-x-[3px]",
            )}
          />
        </button>
      </div>

      {/* Detail Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        <div className="space-y-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgb(0,0,0,0.02)]">
          {channel.fields.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-4">No configuration needed for this channel.</div>
          ) : (
            channel.fields.map((field) => (
              <div key={field.key}>
                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-2">
                  {field.label}
                  {field.required && <span className="text-red-500 text-xs">*</span>}
                </label>
                <div className="w-full">
                  <FieldInput
                    field={field}
                    value={formData[field.key]}
                    onChange={(val) => updateField(field.key, val)}
                  />
                  {field.help && (
                    <p className="text-xs font-medium text-slate-400 mt-2 leading-relaxed">{field.help}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Footer */}
      <div className="bg-white border-t border-slate-200 p-6 flex flex-col xl:flex-row items-center justify-between gap-5">
        {channel.docs_url ? (
          <a
            href={channel.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Setup instructions
          </a>
        ) : <div className="hidden xl:block" />}

        <div className="flex items-center gap-3 w-full xl:w-auto">
          {channel.running && (
            <Button
              onClick={handleStop}
              disabled={stopping}
              className="flex-1 xl:flex-none bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl px-6 h-12 shadow-sm transition-all font-bold"
            >
              {stopping ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Square className="w-4 h-4 mr-2 fill-current" />
              )}
              Stop Channel
            </Button>
          )}

          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex-1 xl:flex-none px-8 h-12 text-white bg-slate-900 hover:bg-slate-800 border-none rounded-xl shadow-md font-bold transition-all disabled:opacity-50"
          >
            {saving || starting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              dirty ? "Save Config" : "Saved"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChannelsPanel() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannelName, setSelectedChannelName] = useState<string | null>(null);

  const loadChannels = async () => {
    setLoading(true);
    try {
      const data = await listChannels();
      setChannels(data);
      if (data.length > 0 && !selectedChannelName) {
        setSelectedChannelName(data[0].name);
      }
    } catch (e) {
      toast("error", `Failed to load channels: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const connectedCount = channels.filter((c) => c.running).length;
  const selectedChannel = channels.find(c => c.name === selectedChannelName);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header Area */}
      <div className="px-8 pt-8 pb-6 shrink-0">
        <div className="content-container-wide">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
              <Radio className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Channels</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm font-medium text-slate-500">
                  Connect your agent to messaging platforms
                </p>
                {channels.length > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      {connectedCount} Active
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden px-8 pb-8">
        <div className="content-container-wide h-full">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : channels.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 h-full flex items-center justify-center">
              <div className="flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center mb-5">
                  <Radio className="w-8 h-8 text-emerald-500 opacity-60" />
                </div>
                <p className="text-base font-bold text-slate-900">No channels available</p>
                <p className="text-sm mt-1.5 text-slate-500 font-medium">Add connection plugins to see them here.</p>
              </div>
            </div>
          ) : (
            <div className="flex h-full gap-8 animate-fade-in-up">
              {/* Master List (Left Sidebar) */}
              <div className="w-80 shrink-0 flex flex-col h-full bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100/80 bg-slate-50/50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Available Channels
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
                  {channels.map((channel) => {
                    const isActive = selectedChannelName === channel.name;
                    return (
                      <button
                        key={channel.name}
                        onClick={() => setSelectedChannelName(channel.name)}
                        className={cn(
                          "w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all cursor-pointer text-left border",
                          isActive
                            ? "bg-slate-900 border-slate-900 shadow-md transform scale-[1.02]"
                            : "bg-transparent border-transparent hover:bg-slate-50 hover:border-slate-200"
                        )}
                      >
                        <div className={cn(
                          "transition-transform",
                          isActive ? "scale-90 opacity-90 brightness-200 grayscale" : "scale-100"
                        )}>
                          <ChannelIcon name={channel.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-sm font-bold truncate leading-tight",
                            isActive ? "text-white" : "text-slate-900"
                          )}>
                            {channel.label}
                          </div>
                        </div>
                        <StatusIndicator enabled={channel.enabled} running={channel.running} />
                        <ChevronRight className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          isActive ? "text-slate-400" : "text-transparent"
                        )} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail View (Right Panel) */}
              <div className="flex-1 h-full min-w-0">
                {selectedChannel ? (
                  <ChannelDetail channel={selectedChannel} onRefresh={loadChannels} />
                ) : (
                  <div className="h-full bg-slate-50/50 border border-slate-200 rounded-3xl flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">Select a channel to configure</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
