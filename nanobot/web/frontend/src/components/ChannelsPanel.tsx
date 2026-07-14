import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/hub/PageHeader";
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
  AlertCircle,
  CheckCircle2,
  Info,
  Save,
  KeyRound,
  Send,
  MessageSquare,
  Hash,
  Mail,
  Phone,
  ChevronRight,
  Settings2,
} from "lucide-react";

type IconMeta = { Icon: typeof Send; tint: string };

function iconMeta(name: string): IconMeta {
  const n = name.toLowerCase();
  if (n.includes("telegram")) return { Icon: Send, tint: "text-[#0088cc]" };
  if (n.includes("discord")) return { Icon: MessageSquare, tint: "text-[#5865F2]" };
  if (n.includes("slack")) return { Icon: Hash, tint: "text-[#E01E5A]" };
  if (n.includes("whatsapp")) return { Icon: Phone, tint: "text-[#25D366]" };
  if (n.includes("email") || n.includes("mail")) return { Icon: Mail, tint: "text-yellow" };
  return { Icon: Radio, tint: "text-purple" };
}

function ChannelIcon({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const { Icon, tint } = iconMeta(name);
  const dim = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const iconDim = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-alt border border-border flex items-center justify-center shrink-0",
        dim,
      )}
    >
      <Icon className={cn(iconDim, tint)} />
    </div>
  );
}

function StatusDot({
  enabled,
  running,
  lastError,
}: {
  enabled: boolean;
  running: boolean;
  lastError?: string | null;
}) {
  let cls = "bg-border";
  let title = "Não configurado";
  if (running) {
    cls = "bg-purple animate-pulse";
    title = "Conectado";
  } else if (lastError) {
    cls = "bg-red";
    title = "Falha";
  } else if (enabled) {
    cls = "bg-yellow";
    title = "Salvo, parado";
  }
  return <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", cls)} title={title} />;
}

function ChannelStatusBadge({ channel }: { channel: ChannelInfo }) {
  if (channel.running) {
    return (
      <Badge variant="success" className="gap-1.5">
        <CheckCircle2 className="w-3 h-3" />
        Conectado
      </Badge>
    );
  }
  if (channel.last_error) {
    return (
      <Badge variant="danger" className="gap-1.5">
        <AlertCircle className="w-3 h-3" />
        Falhou
      </Badge>
    );
  }
  if (channel.enabled) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <Info className="w-3 h-3" />
        Salvo, parado
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1.5">
      <KeyRound className="w-3 h-3" />
      Precisa configurar
    </Badge>
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
    return <Switch checked={!!value} onCheckedChange={onChange} />;
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
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="w-4 h-4" />
          Adicionar item
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
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

function StartConfirmDialog({
  open,
  channelLabel,
  onStart,
  onDismiss,
}: {
  open: boolean;
  channelLabel: string;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar {channelLabel}?</DialogTitle>
          <DialogDescription>
            As credenciais foram salvas. Iniciar o conector testa a conexão: o
            backend vai contatar {channelLabel} e avisar se o token ou
            configuração for rejeitado.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Depois
          </Button>
          <Button onClick={onStart}>
            <Play className="w-4 h-4" />
            Iniciar conector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const missingRequiredFields = channel.fields
    .filter((field) => field.required && !formData[field.key])
    .map((field) => field.label);
  const canSave = dirty && !saving && missingRequiredFields.length === 0;

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    for (const field of channel.fields) {
      initial[field.key] =
        channel.config[field.key] ??
        (field.type === "bool" ? false : field.type === "list" ? [] : "");
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
    if (missingRequiredFields.length > 0) {
      toast(
        "error",
        `Preencha os campos obrigatórios: ${missingRequiredFields.join(", ")}`,
      );
      return;
    }
    setSaving(true);
    try {
      await updateChannel(channel.name, formData);
      setDirty(false);
      if (isEnabled && !channel.running) {
        setShowStartDialog(true);
      } else {
        toast("success", `${channel.label} salvo`);
      }
      onRefresh();
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const handleStart = async () => {
    setShowStartDialog(false);
    setStarting(true);
    try {
      await startChannel(channel.name);
      toast("success", `${channel.label} conectado`);
      setTimeout(onRefresh, 2000);
    } catch (e) {
      toast("error", `Falha ao iniciar: ${(e as Error).message}`);
      onRefresh();
    }
    setStarting(false);
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopChannel(channel.name);
      toast("success", `${channel.label} parado`);
      onRefresh();
    } catch (e) {
      toast("error", `Falha ao parar: ${(e as Error).message}`);
    }
    setStopping(false);
  };

  return (
    <div className="flex flex-col h-full">
      <StartConfirmDialog
        open={showStartDialog}
        channelLabel={channel.label}
        onStart={handleStart}
        onDismiss={() => setShowStartDialog(false)}
      />

      <Card className="mb-4">
        <CardContent className="p-5 pt-5 flex items-center gap-4">
          <ChannelIcon name={channel.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {channel.label}
              </h2>
              <ChannelStatusBadge channel={channel} />
            </div>
            <p className="text-sm text-text-muted mt-1">{channel.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-text-secondary">
              {isEnabled ? "Ativo" : "Inativo"}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={(v) => updateField("enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {channel.last_error && (
          <Card className="border-red/30 bg-red-muted">
            <CardContent className="p-4 pt-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-red" />
              <div className="text-sm">
                <div className="font-bold text-red">Conexão falhou</div>
                <p className="mt-1 text-text-secondary leading-relaxed">
                  {channel.last_error}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5 pt-5">
            <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  Credenciais e opções
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  Salvar grava a configuração. Iniciar testa a conexão.
                </p>
              </div>
              {missingRequiredFields.length > 0 && (
                <Badge variant="warning">
                  Faltando: {missingRequiredFields.join(", ")}
                </Badge>
              )}
            </div>

            {channel.fields.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                Este conector não exige configuração.
              </p>
            ) : (
              <div className="space-y-4">
                {channel.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>
                      {field.label}
                      {field.required && (
                        <span className="text-red ml-0.5">*</span>
                      )}
                    </Label>
                    <FieldInput
                      field={field}
                      value={formData[field.key]}
                      onChange={(val) => updateField(field.key, val)}
                    />
                    {field.help && (
                      <p className="text-xs text-text-muted leading-relaxed">
                        {field.help}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {channel.setup_steps?.length ? (
          <Card>
            <CardContent className="p-5 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-text-muted" />
                <h3 className="text-sm font-bold text-text-primary">
                  Como conectar
                </h3>
              </div>
              <ol className="space-y-2">
                {channel.setup_steps.map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-3 text-sm text-text-secondary leading-relaxed"
                  >
                    <span className="w-5 h-5 rounded-full bg-purple-muted text-purple text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
        {channel.docs_url ? (
          <a
            href={channel.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-purple transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Instruções
          </a>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {channel.running && (
            <Button variant="danger" onClick={handleStop} disabled={stopping}>
              {stopping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Parar
            </Button>
          )}
          {!channel.running && isEnabled && (
            <Button
              onClick={handleStart}
              disabled={starting || dirty || missingRequiredFields.length > 0}
              title={dirty ? "Salve antes de iniciar" : undefined}
            >
              {starting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Iniciar
            </Button>
          )}
          <Button onClick={handleSave} disabled={!canSave} variant="secondary">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {dirty ? "Salvar" : "Salvo"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChannelsPanel() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChannelName, setSelectedChannelName] = useState<string | null>(
    null,
  );

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listChannels();
      setChannels(data);
      setSelectedChannelName((current) => current ?? data[0]?.name ?? null);
    } catch (e) {
      toast("error", `Falha ao carregar conectores: ${(e as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const connectedCount = channels.filter((c) => c.running).length;
  const failedCount = channels.filter((c) => c.last_error).length;
  const selectedChannel = channels.find((c) => c.name === selectedChannelName);

  const subtitle =
    channels.length === 0
      ? "Configure credenciais dos conectores. Varios agentes podem usar o mesmo canal — o usuario final escolhe com quem falar."
      : `${connectedCount} conectado(s)${failedCount > 0 ? ` · ${failedCount} com falha` : ""} · canais compartilhados entre agentes`;

  return (
    <div className="container-app">
      <PageHeader icon={Radio} title="Meus canais" subtitle={subtitle} />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Radio className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              Nenhum conector disponível
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              Adicione plugins de conexão para aparecerem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          <Card>
            <CardContent className="p-2 pt-2 space-y-1">
              {channels.map((channel) => {
                const isActive = selectedChannelName === channel.name;
                return (
                  <button
                    key={channel.name}
                    onClick={() => setSelectedChannelName(channel.name)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors cursor-pointer text-left border",
                      isActive
                        ? "bg-purple-muted border-purple/20"
                        : "bg-transparent border-transparent hover:bg-surface-alt",
                    )}
                  >
                    <ChannelIcon name={channel.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "text-sm font-bold truncate leading-tight",
                          isActive ? "text-purple" : "text-text-primary",
                        )}
                      >
                        {channel.label}
                      </div>
                      <div className="text-[11px] text-text-muted truncate mt-0.5">
                        {channel.running
                          ? "Conectado"
                          : channel.last_error
                            ? "Falha"
                            : channel.enabled
                              ? "Pronto"
                              : "Configurar"}
                      </div>
                    </div>
                    <StatusDot
                      enabled={channel.enabled}
                      running={channel.running}
                      lastError={channel.last_error}
                    />
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        isActive ? "text-purple" : "text-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="min-w-0">
            {selectedChannel ? (
              <ChannelDetail channel={selectedChannel} onRefresh={loadChannels} />
            ) : (
              <Card>
                <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
                  <Settings2 className="w-8 h-8 text-text-muted mb-3" />
                  <p className="text-sm text-text-muted">
                    Selecione um conector para configurar
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
