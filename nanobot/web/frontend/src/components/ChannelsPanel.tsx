import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelWrapper } from "@/components/ui/panel-wrapper";
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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  Square,
  Save,
  Eye,
  EyeOff,
  X,
  Plus,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

function ChannelIcon({ name }: { name: string }) {
  const label = name.charAt(0).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-sm font-bold text-text-secondary shrink-0">
      {label}
    </div>
  );
}

function StatusBadge({ enabled, running }: { enabled: boolean; running: boolean }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-green-muted text-green">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
        Connected
      </span>
    );
  }
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-yellow-muted text-yellow">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
        Enabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/[0.04] text-text-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
      Disabled
    </span>
  );
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
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
          value ? "bg-green" : "bg-white/[0.1]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </button>
    );
  }

  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
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
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onChange(items.filter((_, j) => j !== i));
              }}
              className="shrink-0 h-10 w-10 text-text-muted hover:text-red"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...items, ""])}
          className="text-text-muted"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add
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
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
    />
  );
}

function ChannelCard({
  channel,
  onRefresh,
}: {
  channel: ChannelInfo;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    for (const field of channel.fields) {
      initial[field.key] = channel.config[field.key] ?? (field.type === "bool" ? false : field.type === "list" ? [] : "");
    }
    initial["enabled"] = channel.enabled;
    setFormData(initial);
    setDirty(false);
  }, [channel]);

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateChannel(channel.name, formData);
      toast("success", `${channel.label} config saved`);
      setDirty(false);
      onRefresh();
    } catch (e) {
      toast("error", `Failed to save: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const handleStart = async () => {
    if (dirty) {
      toast("error", "Save your changes first");
      return;
    }
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
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-colors hover:bg-white/[0.03]">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer"
      >
        <ChannelIcon name={channel.name} />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-text-primary">{channel.label}</div>
          <div className="text-xs text-text-muted mt-0.5 truncate">
            {channel.description}
          </div>
        </div>
        <StatusBadge enabled={channel.enabled} running={channel.running} />
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-text-muted shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
        )}
      </button>

      {/* Expanded config */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Enable channel</span>
            <button
              type="button"
              onClick={() => updateField("enabled", !formData["enabled"])}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                formData["enabled"] ? "bg-green" : "bg-white/[0.1]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  formData["enabled"] ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Fields */}
          {channel.fields.map((field) => (
            <div key={field.key}>
              <label className="flex items-center gap-1.5 text-sm text-text-secondary mb-1.5">
                {field.label}
                {field.required && <span className="text-red text-xs">*</span>}
              </label>
              <FieldInput
                field={field}
                value={formData[field.key]}
                onChange={(val) => updateField(field.key, val)}
              />
              {field.help && (
                <p className="text-xs text-text-muted mt-1">{field.help}</p>
              )}
            </div>
          ))}

          {/* Docs link */}
          {channel.docs_url && (
            <a
              href={channel.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-green/70 hover:text-green transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Setup instructions
            </a>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-white/[0.04]">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex-1"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              {dirty ? "Save" : "Saved"}
            </Button>

            {channel.running ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStop}
                disabled={stopping}
                className="text-red border-red/20 hover:bg-red/10"
              >
                {stopping ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                )}
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStart}
                disabled={starting || dirty || !formData["enabled"]}
                className="text-green border-green/20 hover:bg-green/10"
              >
                {starting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                )}
                Start
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChannelsPanel({ open, onClose }: Props) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChannels = async () => {
    setLoading(true);
    try {
      setChannels(await listChannels());
    } catch (e) {
      toast("error", `Failed to load channels: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadChannels();
  }, [open]);

  const connectedCount = channels.filter((c) => c.running).length;

  return (
    <PanelWrapper open={open} onClose={onClose} title="Channels" icon={Radio}>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Summary */}
        {!loading && channels.length > 0 && (
          <div className="flex items-center gap-2 px-1 pb-2 text-xs text-text-muted">
            <Radio className="w-3.5 h-3.5" />
            {connectedCount > 0
              ? `${connectedCount} channel${connectedCount > 1 ? "s" : ""} connected`
              : "No channels connected"}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-green/30 border-t-green rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Radio className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">No channels available</p>
          </div>
        ) : (
          channels.map((channel) => (
            <ChannelCard
              key={channel.name}
              channel={channel}
              onRefresh={loadChannels}
            />
          ))
        )}
      </div>
    </PanelWrapper>
  );
}
