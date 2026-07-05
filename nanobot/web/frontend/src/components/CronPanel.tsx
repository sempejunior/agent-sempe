import { useEffect, useMemo, useState } from "react";
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
  previewCronSchedule,
  getBuiltinSkills,
  getCustomSkills,
  type ChannelInfo,
  type CronSchedulePayload,
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
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";

type Preset = "once" | "daily" | "weekly" | "monthly" | "interval" | "advanced";

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: "once", label: "Uma vez", hint: "Data e hora específicas" },
  { id: "daily", label: "Todo dia", hint: "Diariamente em um horário" },
  { id: "weekly", label: "Semanal", hint: "Um ou mais dias da semana" },
  { id: "monthly", label: "Mensal", hint: "Dia fixo do mês" },
  { id: "interval", label: "A cada N", hint: "Intervalo repetido" },
  { id: "advanced", label: "Avançado", hint: "Expressão cron completa" },
];

const WEEKDAYS = [
  { i: 0, s: "Dom" },
  { i: 1, s: "Seg" },
  { i: 2, s: "Ter" },
  { i: 3, s: "Qua" },
  { i: 4, s: "Qui" },
  { i: 5, s: "Sex" },
  { i: 6, s: "Sáb" },
];

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function nowLocalDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowPlusMinutesTimeStr(min: number): string {
  const d = new Date(Date.now() + min * 60_000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildSchedule(state: {
  preset: Preset;
  timeHM: string;
  daysOfWeek: number[];
  monthDay: number;
  onceDate: string;
  onceTime: string;
  intervalValue: number;
  intervalUnit: "M" | "H" | "D" | "W";
  cronExpr: string;
}): CronSchedulePayload | null {
  const [hStr, mStr] = state.timeHM.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const validTime = !isNaN(h) && !isNaN(m) && h >= 0 && h < 24 && m >= 0 && m < 60;

  switch (state.preset) {
    case "once": {
      if (!state.onceDate) return null;
      const [dh, dm] = state.onceTime.split(":");
      const ts = new Date(`${state.onceDate}T${dh || "09"}:${dm || "00"}:00`).getTime();
      if (isNaN(ts)) return null;
      return { kind: "at", at_ms: ts };
    }
    case "daily":
      if (!validTime) return null;
      return { kind: "cron", expr: `${m} ${h} * * *`, tz: LOCAL_TZ };
    case "weekly":
      if (!validTime || state.daysOfWeek.length === 0) return null;
      return {
        kind: "cron",
        expr: `${m} ${h} * * ${[...state.daysOfWeek].sort().join(",")}`,
        tz: LOCAL_TZ,
      };
    case "monthly":
      if (!validTime || state.monthDay < 1 || state.monthDay > 31) return null;
      return { kind: "cron", expr: `${m} ${h} ${state.monthDay} * *`, tz: LOCAL_TZ };
    case "interval": {
      if (!state.intervalValue || state.intervalValue <= 0) return null;
      const mult = { M: 60, H: 3600, D: 86400, W: 604800 }[state.intervalUnit];
      return { kind: "every", every_seconds: state.intervalValue * mult };
    }
    case "advanced":
      if (!state.cronExpr.trim()) return null;
      return { kind: "cron", expr: state.cronExpr.trim(), tz: LOCAL_TZ };
  }
}

function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = ms - now;
  const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const abs = d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diff < 60_000 && diff > -60_000) return `agora (${abs})`;
  if (Math.abs(diff) < 3600_000) {
    const mins = Math.round(diff / 60_000);
    return `${rel.format(mins, "minute")} · ${abs}`;
  }
  if (Math.abs(diff) < 86_400_000) {
    const hrs = Math.round(diff / 3_600_000);
    return `${rel.format(hrs, "hour")} · ${abs}`;
  }
  const days = Math.round(diff / 86_400_000);
  return `${rel.format(days, "day")} · ${abs}`;
}

export function CronPanel() {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [activeChannels, setActiveChannels] = useState<ChannelInfo[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [skillHint, setSkillHint] = useState("");

  const [preset, setPreset] = useState<Preset>("daily");
  const [timeHM, setTimeHM] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [monthDay, setMonthDay] = useState(1);
  const [onceDate, setOnceDate] = useState(nowLocalDateStr());
  const [onceTime, setOnceTime] = useState(nowPlusMinutesTimeStr(5));
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<"M" | "H" | "D" | "W">("H");
  const [cronExpr, setCronExpr] = useState("0 9 * * *");

  const [deliver, setDeliver] = useState(false);
  const [channel, setChannel] = useState("");
  const [to, setTo] = useState("");

  const [previewRuns, setPreviewRuns] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState<string>("");

  const schedule = useMemo(
    () =>
      buildSchedule({
        preset, timeHM, daysOfWeek, monthDay, onceDate, onceTime,
        intervalValue, intervalUnit, cronExpr,
      }),
    [preset, timeHM, daysOfWeek, monthDay, onceDate, onceTime, intervalValue, intervalUnit, cronExpr],
  );

  useEffect(() => {
    if (!showForm) return;
    if (!schedule) {
      setPreviewRuns([]);
      setPreviewError("Preencha os campos para ver as próximas execuções");
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { next_runs } = await previewCronSchedule(schedule, 5);
        if (cancelled) return;
        setPreviewRuns(next_runs || []);
        setPreviewError(next_runs?.length ? "" : "Nenhuma execução futura para esta configuração");
      } catch (e) {
        if (cancelled) return;
        setPreviewRuns([]);
        setPreviewError((e as Error).message);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [schedule, showForm]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedJobs, fetchedChannels, builtin, custom] = await Promise.all([
        listCronJobs(),
        listChannels(),
        getBuiltinSkills().catch(() => []),
        getCustomSkills().catch(() => []),
      ]);
      setJobs(fetchedJobs);
      setActiveChannels(fetchedChannels.filter((c) => c.enabled));
      const names = new Set<string>();
      builtin.forEach((s) => names.add(s.name));
      custom.forEach((s) => names.add(s.name));
      setSkillNames([...names].sort());
    } catch (e) {
      toast("error", `Falha ao carregar agenda: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [activeAgentId]);

  const resetForm = () => {
    setName("");
    setMessage("");
    setSkillHint("");
    setPreset("daily");
    setTimeHM("09:00");
    setDaysOfWeek([1]);
    setMonthDay(1);
    setOnceDate(nowLocalDateStr());
    setOnceTime(nowPlusMinutesTimeStr(5));
    setIntervalValue(1);
    setIntervalUnit("H");
    setCronExpr("0 9 * * *");
    setDeliver(false);
    setChannel("");
    setTo("");
    setPreviewRuns([]);
    setPreviewError("");
    setShowForm(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast("error", "Nome e instrução são obrigatórios");
      return;
    }
    if (!schedule) {
      toast("error", "Configuração de agendamento inválida");
      return;
    }
    if (deliver && (!channel || !to.trim())) {
      toast("error", "Informe canal e destinatário quando o envio estiver ativo");
      return;
    }

    const finalMessage = skillHint
      ? `${message.trim()}\n\n(Se relevante, use a skill: ${skillHint}.)`
      : message.trim();

    try {
      await addCronJob({
        name: name.trim(),
        message: finalMessage,
        ...schedule,
        deliver,
        channel: deliver ? channel : null,
        to: deliver ? to.trim() : null,
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
      setTimeout(loadData, 1500);
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
    if (job.schedule_kind === "at") {
      return (
        <Badge className="gap-1.5">
          <Calendar className="w-3 h-3" />
          Uma vez
        </Badge>
      );
    }
    const match = job.schedule_expr.match(/every (\d+)s/);
    if (!match) return <Badge variant="muted">{job.schedule_expr}</Badge>;

    const seconds = parseInt(match[1], 10);
    let readable = "";
    if (seconds % 604800 === 0) {
      const w = seconds / 604800;
      readable = `A cada ${w} semana${w > 1 ? "s" : ""}`;
    } else if (seconds % 86400 === 0) {
      const d = seconds / 86400;
      readable = `A cada ${d} dia${d > 1 ? "s" : ""}`;
    } else if (seconds % 3600 === 0) {
      const h = seconds / 3600;
      readable = `A cada ${h} hora${h > 1 ? "s" : ""}`;
    } else if (seconds % 60 === 0) {
      const mm = seconds / 60;
      readable = `A cada ${mm} minuto${mm > 1 ? "s" : ""}`;
    } else {
      readable = `A cada ${seconds}s`;
    }

    return (
      <Badge className="gap-1.5">
        <Clock className="w-3 h-3" />
        {readable}
      </Badge>
    );
  };

  const toggleDow = (i: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
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
                        {job.last_status === "ok" && (
                          <Badge variant="muted" className="gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green" />
                            Última: ok
                          </Badge>
                        )}
                        {job.last_status === "error" && (
                          <Badge variant="danger" className="gap-1">
                            <XCircle className="w-3 h-3" />
                            Última: erro
                          </Badge>
                        )}
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
                          <Button size="sm" variant="danger" onClick={() => handleDelete(job.id)}>
                            Confirmar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
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
                        "text-sm line-clamp-3 leading-relaxed mb-3 italic",
                        job.enabled ? "text-text-secondary" : "text-text-muted",
                      )}
                    >
                      "{job.message}"
                    </p>

                    {job.enabled && job.next_runs && job.next_runs.length > 0 && (
                      <div className="text-[11px] text-text-muted mb-3 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Próxima: <span className="text-text-secondary font-medium">{fmtWhen(job.next_runs[0])}</span>
                      </div>
                    )}

                    {job.last_error && (
                      <div className="text-[11px] text-red bg-red-muted/40 border border-red/20 rounded p-2 mb-3 line-clamp-2">
                        {job.last_error}
                      </div>
                    )}

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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova tarefa agendada</DialogTitle>
            <DialogDescription>
              Configure quando executar, o que o agente deve fazer e para onde entregar o resultado.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="cron-name">
                Nome <span className="text-red">*</span>
              </Label>
              <Input
                id="cron-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Relatório diário 18h"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cron-message">
                O que o agente deve fazer? <span className="text-red">*</span>
              </Label>
              <Textarea
                id="cron-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="ex: Verifique quem entra de férias hoje e amanhã. Se houver, me mande um resumo."
                rows={3}
              />
            </div>

            {skillNames.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple" />
                  Skill sugerida (opcional)
                </Label>
                <Select value={skillHint || "none"} onValueChange={(v) => setSkillHint(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {skillNames.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-text-muted">
                  Adiciona um lembrete ao agente para usar essa skill. Ele decide se aplica.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-surface-alt/40 p-4 space-y-4">
              <Label>Quando executar</Label>

              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "text-left rounded-lg border p-2.5 transition-all cursor-pointer",
                      preset === p.id
                        ? "border-purple bg-purple-muted/60 shadow-sm"
                        : "border-border hover:border-border-light bg-surface",
                    )}
                  >
                    <div className={cn(
                      "text-xs font-bold",
                      preset === p.id ? "text-purple" : "text-text-primary",
                    )}>{p.label}</div>
                    <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{p.hint}</div>
                  </button>
                ))}
              </div>

              {preset === "once" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora</Label>
                    <Input type="time" value={onceTime} onChange={(e) => setOnceTime(e.target.value)} />
                  </div>
                </div>
              )}

              {preset === "daily" && (
                <div className="space-y-1">
                  <Label className="text-xs">Hora</Label>
                  <Input type="time" value={timeHM} onChange={(e) => setTimeHM(e.target.value)} className="w-40" />
                </div>
              )}

              {preset === "weekly" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Dias da semana</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {WEEKDAYS.map((w) => (
                        <button
                          key={w.i}
                          type="button"
                          onClick={() => toggleDow(w.i)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                            daysOfWeek.includes(w.i)
                              ? "border-purple bg-purple text-white"
                              : "border-border bg-surface text-text-muted hover:border-border-light hover:text-text-primary",
                          )}
                        >
                          {w.s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora</Label>
                    <Input type="time" value={timeHM} onChange={(e) => setTimeHM(e.target.value)} className="w-40" />
                  </div>
                </div>
              )}

              {preset === "monthly" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Dia do mês</Label>
                    <Input
                      type="number" min={1} max={31}
                      value={monthDay}
                      onChange={(e) => setMonthDay(parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora</Label>
                    <Input type="time" value={timeHM} onChange={(e) => setTimeHM(e.target.value)} />
                  </div>
                </div>
              )}

              {preset === "interval" && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">A cada</Label>
                    <Input
                      type="number" min={1}
                      value={intervalValue}
                      onChange={(e) => setIntervalValue(parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div className="w-40 space-y-1">
                    <Label className="text-xs">&nbsp;</Label>
                    <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as "M" | "H" | "D" | "W")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Minutos</SelectItem>
                        <SelectItem value="H">Horas</SelectItem>
                        <SelectItem value="D">Dias</SelectItem>
                        <SelectItem value="W">Semanas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {preset === "advanced" && (
                <div className="space-y-1">
                  <Label className="text-xs">Expressão cron</Label>
                  <Input
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="ex: 0 9 * * 1-5"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-text-muted">
                    Formato: <span className="font-mono">min hora dia mês diaSem</span>
                  </p>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
                  Próximas execuções · {LOCAL_TZ}
                </div>
                {previewError ? (
                  <div className="text-xs text-text-muted italic">{previewError}</div>
                ) : previewRuns.length === 0 ? (
                  <div className="text-xs text-text-muted italic">Calculando…</div>
                ) : (
                  <ul className="space-y-1">
                    {previewRuns.map((ms, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-center gap-2">
                        <span className="text-text-muted font-mono w-4">{i + 1}.</span>
                        {fmtWhen(ms)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border transition-all p-4",
                deliver ? "border-purple/30 bg-purple-muted/30" : "border-border",
              )}
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={deliver} onCheckedChange={(v) => setDeliver(v === true)} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">Enviar para conector</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Envie a resposta do agente para um canal externo (Telegram, Slack, etc)
                  </p>
                </div>
              </label>

              {deliver && (
                <div className="mt-4 space-y-3 pt-4 border-t border-purple/20">
                  {activeChannels.length === 0 ? (
                    <div className="bg-yellow-muted text-yellow text-xs font-medium p-3 rounded-lg border border-yellow/20">
                      Nenhum conector ativo. Configure em "Canais" primeiro.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label>Plataforma</Label>
                        <Select value={channel} onValueChange={setChannel}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {activeChannels.map((c) => (
                              <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cron-to">
                          Destinatário / Chat ID <span className="text-red">*</span>
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
              <Button type="submit" disabled={!schedule}>
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
