"""Human description of a schedule, in pt-BR.

One place turns a schedule into the sentence a person reads — "toda segunda e
quinta às 9h". The API serves it so the UI never has to interpret a cron
expression, and the agent uses the same text when it lists jobs.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from nanobot.cron.types import CronSchedule

_WEEKDAYS = {
    0: "domingo", 1: "segunda", 2: "terça", 3: "quarta",
    4: "quinta", 5: "sexta", 6: "sábado", 7: "domingo",
}
_MONTHS = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
           "agosto", "setembro", "outubro", "novembro", "dezembro")


def _tz(schedule: CronSchedule):
    if schedule.tz:
        try:
            return ZoneInfo(schedule.tz)
        except Exception:
            pass
    return datetime.now().astimezone().tzinfo


def _clock(hour: str, minute: str) -> str:
    """'9' + '0' -> '9h'; '9' + '30' -> '9h30'."""
    try:
        h, m = int(hour), int(minute)
    except ValueError:
        return f"{hour}:{minute}"
    return f"{h}h" if m == 0 else f"{h}h{m:02d}"


def _duration(total_seconds: int) -> str:
    for size, one, many in ((86400, "dia", "dias"), (3600, "hora", "horas"),
                            (60, "minuto", "minutos")):
        if total_seconds >= size and total_seconds % size == 0:
            value = total_seconds // size
            return f"{value} {one if value == 1 else many}"
    return f"{total_seconds} segundos"


def _join(parts: list[str]) -> str:
    if len(parts) <= 1:
        return "".join(parts)
    return ", ".join(parts[:-1]) + " e " + parts[-1]


def _weekday_numbers(dow: str) -> list[int] | None:
    """Expand a cron day-of-week field ('1,4' or '1-5') into weekday numbers."""
    numbers: set[int] = set()
    for token in dow.split(","):
        start, sep, end = token.partition("-")
        try:
            if sep:
                first, last = int(start), int(end)
                if first > last:
                    return None
                numbers.update(range(first, last + 1))
            else:
                numbers.add(int(start))
        except ValueError:
            return None
    if not numbers or any(n < 0 or n > 7 for n in numbers):
        return None
    return sorted({0 if n == 7 else n for n in numbers})


def _describe_weekdays(days: list[int]) -> str:
    if days == [1, 2, 3, 4, 5]:
        return "de segunda a sexta"
    if days == [0, 6]:
        return "no fim de semana"
    if len(days) == 7:
        return "todo dia"
    names = [_WEEKDAYS[d] for d in days]
    if len(names) == 1:
        article = "todo" if days[0] in (0, 6) else "toda"
        return f"{article} {names[0]}"
    return _join(names)


def _describe_cron(expr: str) -> str | None:
    """Describe the calendar shapes the UI can build; None for anything else."""
    fields = expr.split()
    if len(fields) != 5:
        return None
    minute, hour, dom, month, dow = fields
    if not minute.isdigit() or not hour.isdigit() or month != "*":
        return None
    at = f"às {_clock(hour, minute)}"

    if dom == "*" and dow == "*":
        return f"todo dia {at}"
    if dom == "*" and dow != "*":
        days = _weekday_numbers(dow)
        if days is None:
            return None
        return f"{_describe_weekdays(days)} {at}"
    if dow == "*" and dom.isdigit():
        return f"todo dia {int(dom)} do mês {at}"
    return None


def describe_schedule(schedule: CronSchedule) -> str:
    """A sentence a person can read, or the raw expression when unknown."""
    if schedule.kind == "at":
        if not schedule.at_ms:
            return "sem data definida"
        when = datetime.fromtimestamp(schedule.at_ms / 1000, _tz(schedule))
        return (f"uma vez, em {when.day} de {_MONTHS[when.month - 1]} de {when.year} "
                f"às {_clock(str(when.hour), str(when.minute))}")

    if schedule.kind == "every":
        if not schedule.every_ms:
            return "intervalo não definido"
        return f"a cada {_duration(schedule.every_ms // 1000)}"

    if schedule.kind == "interval":
        if not schedule.every_days:
            return "intervalo não definido"
        days = schedule.every_days
        if days == 1:
            cadence = "todo dia"
        elif days == 7:
            cadence = "toda semana"
        elif days % 7 == 0:
            cadence = f"a cada {days // 7} semanas"
        else:
            cadence = f"a cada {days} dias"
        if not schedule.at_time:
            return cadence
        hour, _, minute = schedule.at_time.partition(":")
        return f"{cadence} às {_clock(hour, minute or '0')}"

    if schedule.kind == "cron" and schedule.expr:
        return _describe_cron(schedule.expr) or schedule.expr

    return "agendamento inválido"
