import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { previewCronSchedule, type ScheduleBody } from "@/lib/api";

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Preset = "daily" | "weekly" | "monthly" | "interval" | "once" | "advanced";

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: "daily", label: "Todo dia", hint: "Um horário, todos os dias" },
  { id: "weekly", label: "Dias da semana", hint: "Escolha os dias e a hora" },
  { id: "monthly", label: "Dia do mês", hint: "Todo dia 5, por exemplo" },
  { id: "interval", label: "A cada N dias", hint: "Quinzenal, a cada 10 dias…" },
  { id: "once", label: "Uma vez", hint: "Data e hora específicas" },
  { id: "advanced", label: "Avançado", hint: "Expressão cron" },
];

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Turns the visible choices into the schedule body the API accepts. */
function toBody(state: {
  preset: Preset;
  time: string;
  weekdays: number[];
  monthDay: number;
  everyDays: number;
  unit: "days" | "weeks";
  startDate: string;
  onceDate: string;
  onceTime: string;
  expr: string;
}): ScheduleBody {
  const [hour, minute] = state.time.split(":");
  const h = Number(hour) || 0;
  const m = Number(minute) || 0;

  switch (state.preset) {
    case "daily":
      return { kind: "cron", expr: `${m} ${h} * * *`, tz: LOCAL_TZ };
    case "weekly": {
      const days = state.weekdays.length > 0 ? [...state.weekdays].sort() : [1];
      return { kind: "cron", expr: `${m} ${h} * * ${days.join(",")}`, tz: LOCAL_TZ };
    }
    case "monthly":
      return { kind: "cron", expr: `${m} ${h} ${state.monthDay} * *`, tz: LOCAL_TZ };
    case "interval": {
      const days = Math.max(1, state.everyDays) * (state.unit === "weeks" ? 7 : 1);
      const anchor = new Date(`${state.startDate}T${state.time}`);
      return {
        kind: "interval",
        every_days: days,
        at_time: state.time,
        anchor_ms: anchor.getTime(),
        tz: LOCAL_TZ,
      };
    }
    case "once":
      return {
        kind: "at",
        at_ms: new Date(`${state.onceDate}T${state.onceTime}`).getTime(),
      };
    case "advanced":
      return { kind: "cron", expr: state.expr.trim(), tz: LOCAL_TZ };
  }
}

export function ScheduleBuilder({
  onChange,
}: {
  onChange: (body: ScheduleBody) => void;
}) {
  const [preset, setPreset] = useState<Preset>("daily");
  const [time, setTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthDay, setMonthDay] = useState(1);
  const [everyDays, setEveryDays] = useState(15);
  const [unit, setUnit] = useState<"days" | "weeks">("days");
  const [startDate, setStartDate] = useState(todayISO());
  const [onceDate, setOnceDate] = useState(todayISO());
  const [onceTime, setOnceTime] = useState("09:00");
  const [expr, setExpr] = useState("0 9 * * 1-5");

  const [label, setLabel] = useState("");
  const [nextRuns, setNextRuns] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState("");

  const body = useMemo(
    () => toBody({ preset, time, weekdays, monthDay, everyDays, unit, startDate, onceDate, onceTime, expr }),
    [preset, time, weekdays, monthDay, everyDays, unit, startDate, onceDate, onceTime, expr],
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current(body);
    let alive = true;
    previewCronSchedule({ ...body, count: 3 })
      .then((res) => {
        if (!alive) return;
        setLabel(res.label ?? "");
        setNextRuns(res.next_runs ?? []);
        setPreviewError("");
      })
      .catch((e) => {
        if (!alive) return;
        setLabel("");
        setNextRuns([]);
        setPreviewError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [body]);

  const toggleWeekday = (value: number) =>
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );

  return (
    <div className="space-y-4">
      <div>
        <Label>Quando</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                preset === p.id
                  ? "border-purple bg-purple-muted"
                  : "border-border bg-surface hover:border-purple/40",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-semibold",
                  preset === p.id ? "text-purple" : "text-text-primary",
                )}
              >
                {p.label}
              </span>
              <span className="block text-[11px] text-text-muted">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {preset === "weekly" && (
        <div>
          <Label>Dias da semana</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  weekdays.includes(d.value)
                    ? "border-purple bg-purple-muted text-purple"
                    : "border-border bg-surface text-text-secondary hover:border-purple/40",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {preset === "monthly" && (
        <div>
          <Label htmlFor="month-day">Dia do mês</Label>
          <Input
            id="month-day"
            type="number"
            min={1}
            max={28}
            value={monthDay}
            onChange={(e) => setMonthDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1.5 w-28"
          />
          <p className="text-[11px] text-text-muted mt-1">
            Até 28, para cair em todo mês.
          </p>
        </div>
      )}

      {preset === "interval" && (
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="every-n">Repetir a cada</Label>
            <Input
              id="every-n"
              type="number"
              min={1}
              value={everyDays}
              onChange={(e) => setEveryDays(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="unit">Unidade</Label>
            <select
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "days" | "weeks")}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              <option value="days">dias</option>
              <option value="weeks">semanas</option>
            </select>
          </div>
          <div>
            <Label htmlFor="start-date">A partir de</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      )}

      {preset === "once" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="once-date">Data</Label>
            <Input
              id="once-date"
              type="date"
              value={onceDate}
              onChange={(e) => setOnceDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="once-time">Hora</Label>
            <Input
              id="once-time"
              type="time"
              value={onceTime}
              onChange={(e) => setOnceTime(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      )}

      {preset === "advanced" && (
        <div>
          <Label htmlFor="cron-expr">Expressão cron</Label>
          <Input
            id="cron-expr"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="0 9 * * 1-5"
            className="mt-1.5 font-mono"
          />
        </div>
      )}

      {preset !== "once" && preset !== "advanced" && (
        <div>
          <Label htmlFor="time">Horário</Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1.5 w-36"
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-alt p-3">
        {previewError ? (
          <p className="text-sm text-text-secondary">
            Não consegui interpretar esse agendamento: {previewError}
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-text-primary">
              {label || "Definindo…"}
            </p>
            {nextRuns.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {nextRuns.map((ms) => (
                  <Badge key={ms} variant="muted">
                    {new Date(ms).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-[11px] text-text-muted mt-2">
              Fuso: {LOCAL_TZ}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
