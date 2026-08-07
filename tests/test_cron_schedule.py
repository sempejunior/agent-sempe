"""Testes do agendamento por intervalo ancorado e da descrição em português."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from nanobot.cron.describe import describe_schedule
from nanobot.cron.service import _validate_schedule_for_add, compute_next_runs
from nanobot.cron.types import CronSchedule

SP = ZoneInfo("America/Sao_Paulo")
NY = ZoneInfo("America/New_York")


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _locals(runs: list[int], tz=SP) -> list[datetime]:
    return [datetime.fromtimestamp(r / 1000, tz) for r in runs]


def _interval(days: int, at_time: str, anchor: datetime, tz: str = "America/Sao_Paulo"):
    return CronSchedule(kind="interval", every_days=days, at_time=at_time,
                        anchor_ms=_ms(anchor), tz=tz)


def test_every_15_days_keeps_the_cadence_and_the_hour():
    anchor = datetime(2026, 8, 6, 9, 0, tzinfo=SP)
    now = datetime(2026, 8, 6, 10, 0, tzinfo=SP)

    runs = _locals(compute_next_runs(_interval(15, "09:00", anchor), 4, _ms(now)))

    assert [r.date().isoformat() for r in runs] == [
        "2026-08-21", "2026-09-05", "2026-09-20", "2026-10-05",
    ]
    assert {(r.hour, r.minute) for r in runs} == {(9, 0)}


def test_anchor_in_the_past_aligns_to_the_cadence():
    anchor = datetime(2026, 1, 1, 8, 30, tzinfo=SP)
    now = datetime(2026, 8, 6, 12, 0, tzinfo=SP)

    runs = _locals(compute_next_runs(_interval(10, "08:30", anchor), 2, _ms(now)))

    assert all(r > now for r in runs)
    assert (runs[1] - runs[0]).days == 10
    assert (runs[0].date() - anchor.date()).days % 10 == 0


def test_occurrence_today_before_the_hour_is_still_returned():
    anchor = datetime(2026, 8, 6, 18, 0, tzinfo=SP)
    now = datetime(2026, 8, 6, 9, 0, tzinfo=SP)

    runs = _locals(compute_next_runs(_interval(7, "18:00", anchor), 1, _ms(now)))

    assert runs[0] == datetime(2026, 8, 6, 18, 0, tzinfo=SP)


def test_occurrence_today_after_the_hour_moves_to_the_next_cycle():
    anchor = datetime(2026, 8, 6, 8, 0, tzinfo=SP)
    now = datetime(2026, 8, 6, 9, 0, tzinfo=SP)

    runs = _locals(compute_next_runs(_interval(7, "08:00", anchor), 1, _ms(now)))

    assert runs[0].date().isoformat() == "2026-08-13"


def test_daylight_saving_does_not_shift_the_clock_time():
    anchor = datetime(2026, 2, 4, 9, 0, tzinfo=NY)
    now = datetime(2026, 2, 4, 10, 0, tzinfo=NY)

    runs = _locals(compute_next_runs(_interval(7, "09:00", anchor, "America/New_York"),
                                     8, _ms(now)), NY)

    assert {(r.hour, r.minute) for r in runs} == {(9, 0)}
    assert any(r.month == 3 and r.day > 8 for r in runs)


def test_interval_without_time_uses_the_anchor_hour():
    anchor = datetime(2026, 8, 6, 14, 45, tzinfo=SP)
    now = datetime(2026, 8, 6, 15, 0, tzinfo=SP)

    sched = CronSchedule(kind="interval", every_days=3, anchor_ms=_ms(anchor),
                         tz="America/Sao_Paulo")
    runs = _locals(compute_next_runs(sched, 1, _ms(now)))

    assert (runs[0].hour, runs[0].minute) == (14, 45)


def test_interval_needs_a_positive_day_count():
    with pytest.raises(ValueError, match="every_days"):
        _validate_schedule_for_add(CronSchedule(kind="interval", every_days=0))


def test_interval_rejects_a_malformed_time():
    with pytest.raises(ValueError, match="at_time"):
        _validate_schedule_for_add(
            CronSchedule(kind="interval", every_days=7, at_time="9h da manhã"),
        )


def test_interval_accepts_a_timezone():
    _validate_schedule_for_add(
        CronSchedule(kind="interval", every_days=15, at_time="09:00",
                     tz="America/Sao_Paulo"),
    )


@pytest.mark.parametrize(("schedule", "expected"), [
    (CronSchedule(kind="interval", every_days=15, at_time="09:00"), "a cada 15 dias às 9h"),
    (CronSchedule(kind="interval", every_days=14, at_time="08:30"), "a cada 2 semanas às 8h30"),
    (CronSchedule(kind="interval", every_days=7, at_time="18:00"), "toda semana às 18h"),
    (CronSchedule(kind="interval", every_days=1, at_time="07:05"), "todo dia às 7h05"),
    (CronSchedule(kind="cron", expr="0 9 * * *"), "todo dia às 9h"),
    (CronSchedule(kind="cron", expr="30 9 * * 1,4"), "segunda e quinta às 9h30"),
    (CronSchedule(kind="cron", expr="0 8 * * 5"), "toda sexta às 8h"),
    (CronSchedule(kind="cron", expr="0 10 15 * *"), "todo dia 15 do mês às 10h"),
    (CronSchedule(kind="cron", expr="0 18 * * 1-5"), "de segunda a sexta às 18h"),
    (CronSchedule(kind="cron", expr="0 9 * * 0,6"), "no fim de semana às 9h"),
    (CronSchedule(kind="cron", expr="0 9 * * 1-7"), "todo dia às 9h"),
    (CronSchedule(kind="cron", expr="0 9 * * 7"), "todo domingo às 9h"),
    (CronSchedule(kind="cron", expr="0 9 * * 6"), "todo sábado às 9h"),
    (CronSchedule(kind="cron", expr="15 7 * * 2-4"), "terça, quarta e quinta às 7h15"),
    (CronSchedule(kind="every", every_ms=3600_000), "a cada 1 hora"),
    (CronSchedule(kind="every", every_ms=1_800_000), "a cada 30 minutos"),
])
def test_describe_schedule_reads_like_portuguese(schedule, expected):
    assert describe_schedule(schedule) == expected


def test_describe_falls_back_to_the_expression_when_unusual():
    assert describe_schedule(CronSchedule(kind="cron", expr="*/7 3 * 2 *")) == "*/7 3 * 2 *"
