import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/hub/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  listCronJobs,
  addCronJob,
  deleteCronJob,
  enableCronJob,
  runCronJob,
  listChannels,
  type ChannelInfo,
} from "@/lib/api";
import type { CronJob } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import {
  Calendar,
  Plus,
  Trash2,
  Clock,
  Settings2,
  Play,
  Pause,
  Send,
  Loader2,
} from "lucide-react";

export function CronPanel() {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [activeChannels, setActiveChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"every" | "cron">("every");
  const [intervalValue, setIntervalValue] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<"M" | "H" | "D">("H");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [deliver, setDeliver] = useState(false);
  const [channel, setChannel] = useState("");
  const [to, setTo] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedJobs, fetchedChannels] = await Promise.all([
        listCronJobs(),
        listChannels(),
      ]);
      setJobs(fetchedJobs);
      setActiveChannels(fetchedChannels.filter((c) => c.enabled));
    } catch (e) {
      toast("error", `Falha ao carregar agenda: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [activeAgentId]);

  const resetForm = () => {
    setName("");
    setMessage("");
    setKind("every");
    setIntervalValue("1");
    setIntervalUnit("H");
    setCronExpr("0 9 * * *");
    setDeliver(false);
    setChannel("");
    setTo("");
    setShowForm(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast("error", "Nome e mensagem são obrigatórios");
      return;
    }
    if (deliver && (!channel || !to.trim())) {
      toast("error", "Informe canal e destinatário quando o envio estiver ativo");
      return;
    }

    let every_seconds = 3600;
    if (kind === "every") {
      const val = parseInt(intervalValue, 10);
      if (isNaN(val) || val <= 0) {
        toast("error", "Informe um intervalo válido");
        return;
      }
      if (intervalUnit === "M") every_seconds = val * 60;
      if (intervalUnit === "H") every_seconds = val * 3600;
      if (intervalUnit === "D") every_seconds = val * 86400;
    }

    const tz = kind === "cron" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

    try {
      await addCronJob({
        name: name.trim(),
        message: message.trim(),
        kind,
        tz,
        deliver,
        channel: deliver ? channel : null,
        to: deliver ? to.trim() : null,
        ...(kind === "every" ? { every_seconds } : { expr: cronExpr }),
      });
      toast("success", `Tarefa "${name.trim()}" criada`);
      resetForm();
      loadData();
    } catch (e) {
      toast("error", `Falha ao criar tarefa: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    try {
      await deleteCronJob(id);
      toast("success", "Tarefa excluída");
      loadData();
    } catch (e) {
      toast("error", `Falha ao excluir: ${(e as Error).message}`);
    }
  };

  const handleToggleState = async (id: string, currentlyEnabled: boolean) => {
    try {
      await enableCronJob(id, !currentlyEnabled);
      toast("success", `Tarefa ${!currentlyEnabled ? "retomada" : "pausada"}`);
      loadData();
    } catch (e) {
      toast("error", `Falha ao alterar tarefa: ${(e as Error).message}`);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await runCronJob(id);
      toast("success", "Execução iniciada");
    } catch (e) {
      toast("error", `Falha ao executar: ${(e as Error).message}`);
    }
  };

  const renderSchedule = (job: CronJob) => {
    if (job.schedule_kind === "cron") {
      return (
        <Badge variant="code" className="gap-1.5">
          <Settings2 className="w-3 h-3" />
          {job.schedule_expr}
        </Badge>
      );
    }
    const match = job.schedule_expr.match(/every (\d+)s/);
    if (!match) return <Badge variant="muted">{job.schedule_expr}</Badge>;

    const seconds = parseInt(match[1], 10);
    let readable = "";
    if (seconds % 86400 === 0) {
      const d = seconds / 86400;
      readable = `A cada ${d} dia${d > 1 ? "s" : ""}`;
    } else if (seconds % 3600 === 0) {
      const h = seconds / 3600;
      readable = `A cada ${h} hora${h > 1 ? "s" : ""}`;
    } else if (seconds % 60 === 0) {
      const m = seconds / 60;
      readable = `A cada ${m} minuto${m > 1 ? "s" : ""}`;
    } else {
      readable = `A cada ${seconds} segundos`;
    }

    return (
      <Badge className="gap-1.5">
        <Clock className="w-3 h-3" />
        {readable}
      </Badge>
    );
  };

  return (
    <div className="container-app">
      <PageHeader
        icon={Calendar}
        title="Agenda"
        subtitle="Programe rotinas recorrentes para o agente executar sozinho."
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus />
            Nova tarefa
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-muted border border-purple/20 flex items-center justify-center mx-auto mb-5">
              <Calendar className="w-8 h-8 text-purple" />
            </div>
            <h3 className="font-display text-lg font-bold text-text-primary mb-1.5">
              Nenhuma tarefa agendada
            </h3>
            <p className="text-sm text-text-muted max-w-sm mx-auto">
              Crie automações para executar instruções em horários ou intervalos definidos.
            </p>
            <Button
              onClick={() => setShowForm(true)}
              variant="outline"
              className="mt-6"
            >
              <Plus />
              Criar primeira tarefa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
              {jobs.length} tarefa{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-4 items-start">
            {jobs.map((job) => (
              <Card
                key={job.id}
                className={cn(
                  "transition-all",
                  job.enabled ? "hover:border-border-light hover:shadow-md" : "opacity-60",
                )}
              >
                <CardContent className="p-5 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3
                        className={cn(
                          "font-display text-[15px] font-bold truncate leading-tight mb-2",
                          job.enabled ? "text-text-primary" : "text-text-muted",
                        )}
                      >
                        {job.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderSchedule(job)}
                        {!job.enabled && <Badge variant="warning">Pausada</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRunNow(job.id)}
                        title="Executar agora"
                        className="h-8 w-8 text-text-muted hover:text-purple"
                      >
                        <Play className="fill-current" />
                      </Button>
                      {confirmDeleteId === job.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(job.id)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(job.id)}
                          title="Excluir tarefa"
                          className="h-8 w-8 text-text-muted hover:text-red hover:bg-red-muted"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <p
                      className={cn(
                        "text-sm line-clamp-3 leading-relaxed mb-4 italic",
                        job.enabled ? "text-text-secondary" : "text-text-muted",
                      )}
                    >
                      “{job.message}”
                    </p>

                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleState(job.id, job.enabled)}
                        className={
                          job.enabled
                            ? "text-text-muted hover:text-yellow hover:bg-yellow-muted"
                            : "text-yellow bg-yellow-muted"
                        }
                      >
                        {job.enabled ? <Pause /> : <Play />}
                        {job.enabled ? "Pausar" : "Retomar"}
                      </Button>

                      {job.channel && (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                          <Send className="w-3 h-3" />
                          {job.channel}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => !v && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova tarefa agendada</DialogTitle>
            <DialogDescription>
              Programe uma instrução para o agente executar em intervalos ou horários definidos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="cron-name">
                Nome da tarefa <span className="text-red">*</span>
              </Label>
              <Input
                id="cron-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Resumo diário de emails"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cron-message">
                Instrução para o agente <span className="text-red">*</span>
              </Label>
              <Textarea
                id="cron-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="O que o agente deve fazer? ex: Analise meus e-mails não lidos e resuma."
                rows={4}
              />
            </div>

            <div className="rounded-xl border border-border bg-surface-alt/50 p-4 space-y-3">
              <Label>Tipo de agendamento</Label>
              <div className="flex rounded-xl bg-surface-alt p-1 border border-border">
                <button
                  type="button"
                  onClick={() => setKind("every")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    kind === "every"
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  Intervalo simples
                </button>
                <button
                  type="button"
                  onClick={() => setKind("cron")}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    kind === "cron"
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  Cron avançado
                </button>
              </div>

              {kind === "every" ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted shrink-0">
                    A cada
                  </span>
                  <Input
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(e.target.value)}
                    placeholder="1"
                    type="number"
                    min="1"
                    className="flex-1"
                  />
                  <Select
                    value={intervalUnit}
                    onValueChange={(v) => setIntervalUnit(v as "M" | "H" | "D")}
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Minutos</SelectItem>
                      <SelectItem value="H">Horas</SelectItem>
                      <SelectItem value="D">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="ex: 0 9 * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-text-muted">
                    Sintaxe cron padrão · Timezone:{" "}
                    <span className="font-bold text-text-primary">
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div
              className={cn(
                "rounded-xl border transition-all p-4",
                deliver ? "border-purple/30 bg-purple-muted/30" : "border-border",
              )}
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={deliver}
                  onCheckedChange={(v) => setDeliver(v === true)}
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">
                    Enviar para conector
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Envie a resposta do agente diretamente para um canal externo
                  </p>
                </div>
              </label>

              {deliver && (
                <div className="mt-4 space-y-3 pt-4 border-t border-purple/20">
                  {activeChannels.length === 0 ? (
                    <div className="bg-yellow-muted text-yellow text-xs font-medium p-3 rounded-lg border border-yellow/20">
                      Nenhum conector ativo. Configure Telegram, Slack ou WhatsApp em "Canais" primeiro.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Plataforma</Label>
                        <Select value={channel} onValueChange={setChannel}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma plataforma..." />
                          </SelectTrigger>
                          <SelectContent>
                            {activeChannels.map((c) => (
                              <SelectItem key={c.name} value={c.name}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cron-to">
                          ID do destinatário / Chat ID{" "}
                          <span className="text-red">*</span>
                        </Label>
                        <Input
                          id="cron-to"
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                          placeholder="ex.: @usuario ou -10012345"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit">
                <Plus />
                Criar agenda
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
