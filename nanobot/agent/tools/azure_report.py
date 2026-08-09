#!/usr/bin/env python3
"""
Gerador de Relatório de Desempenho (Azure DevOps) — v2, reutilizável por projeto.

Novidades v2 (além de volume/velocidade/tipos/tamanho):
  - Tempo por estágio do fluxo (Desenvolvendo, Code Review, Testando, ...)
  - Retrabalho (retrocessos de estágio) e reaberturas
  - Defeitos por profissional
  - Lead time vs Cycle time
  - Previsibilidade por sprint (entregas e carryover por iteração)
  - WIP atual e aging por profissional

Uso:
    python3 generate.py --project "MeuProjeto"
    python3 generate.py --project "MeuProjeto" --year 2026 --output ~/rel.html
    python3 generate.py --project "MeuProjeto" --no-flow   # pula análise de revisions (mais rápido)

Org e PAT são lidos de ~/.kiro/settings/mcp.json (servidor "azure-devops").
"""
import asyncio
import base64
import html
import json
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from nanobot.agent.tools.base import Tool

MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
CAT_RANK = {"Proposed":0,"InProgress":1,"Resolved":2,"Completed":3,"Removed":0}
# Defect detection is keyword-based (EN + PT) so it works across companies / process
# templates, instead of a fixed list of one org's custom work item types.
DEFECT_KEYWORDS = ("bug","defect","defeito","falha","incident","incidente",
                   "problem","problema","erro","segur","security","vulnerab")
# Only a fallback: real "done/removed" states are read from the org's state categories.
DONE_STATES_FALLBACK = {"Feito","Closed","Done","Concluído","Concluido","Resolvido",
                        "Removido","Removed","Cancelado","Cancelled"}


def is_defect_type(wt):
    w = (wt or "").lower()
    return any(k in w for k in DEFECT_KEYWORDS)

# ---------------------------------------------------------------- http helpers
def make_api(org, pat_b64):
    base = f"https://dev.azure.com/{org}"
    headers = {"Authorization": f"Basic {pat_b64}", "Content-Type": "application/json"}
    def post(path, body):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode(),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    def get(path):
        req = urllib.request.Request(base + path, headers=headers, method="GET")
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    return base, post, get

# ---------------------------------------------------------------- collect
CLOSED_FIELDS = ["System.Id","System.WorkItemType","System.State","System.AssignedTo",
                 "System.CreatedDate","System.Title","System.IterationPath",
                 "Microsoft.VSTS.Common.ActivatedDate","Microsoft.VSTS.Common.ClosedDate",
                 "Microsoft.VSTS.Common.ActivatedBy","Microsoft.VSTS.Common.ResolvedBy",
                 "Microsoft.VSTS.Common.ClosedBy","Microsoft.VSTS.Scheduling.StoryPoints"]

def wiql_ids(post, project, query):
    res = post(f"/{project}/_apis/wit/wiql?api-version=7.1", {"query": query})
    return [w["id"] for w in res.get("workItems", [])]

def batch_items(post, ids, fields):
    items = []
    for i in range(0, len(ids), 200):
        body = {"ids": ids[i:i+200], "fields": fields, "errorPolicy": "omit"}
        r = post("/_apis/wit/workitemsbatch?api-version=7.1", body)
        items.extend(r.get("value", []))
        time.sleep(0.03)
    return items

def collect_closed(post, project, year):
    q = (f"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]=@project "
         f"AND [Microsoft.VSTS.Common.ClosedDate]>='{year}-01-01T00:00:00Z' "
         f"AND [Microsoft.VSTS.Common.ClosedDate]<'{year+1}-01-01T00:00:00Z' "
         f"ORDER BY [Microsoft.VSTS.Common.ClosedDate] DESC")
    ids = wiql_ids(post, project, q)
    print(f"Itens concluídos em {year}: {len(ids)}", file=sys.stderr)
    return batch_items(post, ids, CLOSED_FIELDS)

def collect_wip(post, project, done_states):
    """WIP = itens que NÃO estão em estados concluídos/removidos (derivados da org)."""
    quoted = ",".join("'" + s.replace("'", "''") + "'" for s in sorted(done_states)) or "''"
    q = ("SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]=@project "
         f"AND [System.State] NOT IN ({quoted})")
    ids = wiql_ids(post, project, q)
    print(f"WIP atual (em andamento): {len(ids)}", file=sys.stderr)
    return batch_items(post, ids, CLOSED_FIELDS)

def fetch_state_categories(get, project, types):
    """Return (state->category, state->ordinal). Ordinal reflects workflow order
    (the states endpoint returns states in workflow sequence)."""
    smap = {}
    order_list = []
    for t in types:
        try:
            enc = urllib.parse.quote(t)
            d = get(f"/{project}/_apis/wit/workitemtypes/{enc}/states?api-version=7.1")
            for s in d.get("value", []):
                smap.setdefault(s["name"], s.get("category", "InProgress"))
                if s["name"] not in order_list:
                    order_list.append(s["name"])
        except Exception:
            continue
    somap = {name: i for i, name in enumerate(order_list)}
    return smap, somap

def fetch_revisions(base, pat_b64, project, ids, workers=8):
    """Parallel fetch of revisions; returns {id: [(date, state, iteration), ...]}."""
    headers = {"Authorization": f"Basic {pat_b64}"}
    out = {}
    def one(wid):
        url = f"{base}/{project}/_apis/wit/workItems/{wid}/revisions?api-version=7.1&$top=200"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
        except Exception:
            return wid, []
        seq = []
        for rev in d.get("value", []):
            f = rev.get("fields", {})
            dt = pdate(f.get("System.ChangedDate"))
            st = f.get("System.State")
            it = f.get("System.IterationPath")
            if dt and st:
                seq.append((dt, st, it))
        return wid, seq
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for wid, seq in ex.map(one, ids):
            out[wid] = seq
    return out

# ---------------------------------------------------------------- helpers
def pdate(s):
    if not s:
        return None
    s = s.replace("Z","").split(".")[0]
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None

def size_bucket(sp):
    if not sp:
        return None
    if sp <= 2:
        return "P"
    if sp <= 5:
        return "M"
    return "G"

def attribute(f):
    def nm(k):
        v = f.get(k)
        return v.get("displayName") if isinstance(v, dict) else None
    return (nm("System.AssignedTo") or nm("Microsoft.VSTS.Common.ActivatedBy")
            or nm("Microsoft.VSTS.Common.ResolvedBy") or nm("Microsoft.VSTS.Common.ClosedBy")
            or "(Não identificado)")

def short_iter(path):
    if not path or "\\" not in path:
        return "(sem sprint)"
    return path.split("\\")[-1]

# ---------------------------------------------------------------- analysis
def new_person():
    return {"count":0,"sp":0.0,"types":Counter(),"months":Counter(),"sizes":Counter(),
            "cycle":[],"lead":[],"no_est":0,"defects":0,
            "stage_sum":defaultdict(float),"stage_n":defaultdict(int),
            "rework":0,"reopen":0,"carryover":0,"flow_items":0,
            "wip":0,"wip_age":[]}

def process_flow(seq, smap, somap):
    """From a revision sequence compute stage_seconds, rework, reopen, carryover, cycle start."""
    stage_sec = defaultdict(float)
    for i in range(len(seq)-1):
        dur = (seq[i+1][0]-seq[i][0]).total_seconds()
        if dur > 0:
            stage_sec[seq[i][1]] += dur
    # compacted raw-state sequence for rework/reopen via workflow ordinal
    comp = []
    for _, st, _ in seq:
        if not comp or comp[-1] != st:
            comp.append(st)
    rework = reopen = 0
    reached_dev = False
    for i in range(1, len(comp)):
        prev, cur = comp[i-1], comp[i]
        if smap.get(prev) == "InProgress":
            reached_dev = True
        po, co = somap.get(prev), somap.get(cur)
        if po is None or co is None:
            continue
        if co < po and reached_dev:           # retrocedeu no fluxo
            if smap.get(prev) == "Completed":  # voltou depois de concluído
                reopen += 1
            else:                              # retrabalho durante o fluxo
                rework += 1
    # carryover: mudou de iteração ao longo da vida
    citers = []
    for _, _, it in seq:
        if it and (not citers or citers[-1] != it):
            citers.append(it)
    carryover = 1 if len(set(citers)) > 1 else 0
    # cycle start = primeira entrada em InProgress
    cstart = None
    for dt, st, _ in seq:
        if smap.get(st,"InProgress") == "InProgress":
            cstart = dt
            break
    return stage_sec, rework, reopen, carryover, cstart

def analyze(items, smap, somap, revmap):
    people = defaultdict(new_person)
    proj_types, pm_count, pm_sp, all_cycle, all_lead = Counter(), Counter(), Counter(), [], []
    sprint = defaultdict(lambda: {"count":0,"sp":0.0,"carryover":0})
    total_rework = total_reopen = total_flow = 0
    for it in items:
        f = it["fields"]
        wid = it["id"]
        who = attribute(f)
        wt = f.get("System.WorkItemType","?")
        sp = f.get("Microsoft.VSTS.Scheduling.StoryPoints")
        closed = pdate(f.get("Microsoft.VSTS.Common.ClosedDate"))
        created = pdate(f.get("System.CreatedDate"))
        start = pdate(f.get("Microsoft.VSTS.Common.ActivatedDate")) or created
        sp_iter = short_iter(f.get("System.IterationPath"))
        p = people[who]
        p["count"] += 1
        p["types"][wt] += 1
        proj_types[wt] += 1
        if sp:
            p["sp"] += sp
        else:
            p["no_est"] += 1
        if is_defect_type(wt):
            p["defects"] += 1
        if closed:
            mk = (closed.year, closed.month)
            p["months"][mk] += 1
            pm_count[mk] += 1
            if sp:
                pm_sp[mk] += sp
            sprint[sp_iter]["count"] += 1
            if sp:
                sprint[sp_iter]["sp"] += sp
        sb = size_bucket(sp)
        if sb:
            p["sizes"][sb] += 1
        # lead time (criação -> conclusão)
        if closed and created and closed >= created:
            ld = (closed-created).total_seconds()/86400
            if ld <= 400:
                p["lead"].append(ld)
                all_lead.append(ld)
        # flow (revisions)
        seq = revmap.get(wid) if revmap else None
        if seq:
            stage_sec, rw, ro, co, cstart = process_flow(seq, smap, somap)
            p["flow_items"] += 1
            total_flow += 1
            for st, sec in stage_sec.items():
                if smap.get(st,"InProgress") == "InProgress":
                    p["stage_sum"][st] += sec
                    p["stage_n"][st] += 1
            p["rework"] += rw
            p["reopen"] += ro
            p["carryover"] += co
            total_rework += rw
            total_reopen += ro
            if co:
                sprint[sp_iter]["carryover"] += 1
            cyc_start = cstart or start
            if closed and cyc_start and closed >= cyc_start:
                cy = (closed-cyc_start).total_seconds()/86400
                if cy <= 400:
                    p["cycle"].append(cy)
                    all_cycle.append(cy)
        else:
            if closed and start and closed >= start:
                cy = (closed-start).total_seconds()/86400
                if cy <= 400:
                    p["cycle"].append(cy)
                    all_cycle.append(cy)
    return dict(people=people, proj_types=proj_types, pm_count=pm_count, pm_sp=pm_sp,
                all_cycle=all_cycle, all_lead=all_lead, sprint=sprint,
                total_rework=total_rework, total_reopen=total_reopen, total_flow=total_flow)

def analyze_wip(items):
    now = datetime.now()
    wip = defaultdict(lambda: {"count":0,"ages":[],"states":Counter()})
    for it in items:
        f = it["fields"]
        def nm(k):
            v = f.get(k)
            return v.get("displayName") if isinstance(v,dict) else None
        who = nm("System.AssignedTo") or nm("Microsoft.VSTS.Common.ActivatedBy") or "(Não atribuído)"
        start = pdate(f.get("Microsoft.VSTS.Common.ActivatedDate")) or pdate(f.get("System.CreatedDate"))
        w = wip[who]
        w["count"] += 1
        w["states"][f.get("System.State","?")] += 1
        if start:
            age = (now-start).total_seconds()/86400
            if age >= 0:
                w["ages"].append(age)
    return wip

# ---------------------------------------------------------------- render
def avg(values):
    return round(statistics.mean(values),1) if values else 0

def med(values):
    return round(statistics.median(values),1) if values else 0

def esc(s):
    return html.escape(str(s))

def slug(s):
    return "p-" + "".join(c.lower() if c.isalnum() else "-" for c in s).strip("-")

def bars(counter, total, color="#4f8cff", limit=None, unit=""):
    items = counter.most_common(limit) if limit else sorted(counter.items(), key=lambda kv:-kv[1])
    mx = max(counter.values()) if counter and max(counter.values())>0 else 1
    rows = []
    for label, val in items:
        pct = round(100*val/mx)
        share = f"{round(100*val/total)}%" if total else ""
        vtxt = f"{val}{unit}" + (f" · {share}" if share and not unit else "")
        rows.append(
            f'<div class="bar-row"><span class="bar-label">{esc(label)}</span>'
            f'<span class="bar-track"><span class="bar-fill" style="width:{pct}%;background:{color}"></span></span>'
            f'<span class="bar-val">{vtxt}</span></div>')
    return "".join(rows)

def month_bars(months_counter, year):
    mx = max(months_counter.values()) if months_counter else 1
    cells = []
    for m in range(1, 13):
        v = months_counter.get((year, m), 0)
        h = round(100*v/mx) if mx else 0
        cells.append(
            f'<div class="mb-col"><div class="mb-bar-wrap"><div class="mb-bar" style="height:{h}%"></div></div>'
            f'<div class="mb-val">{v or ""}</div><div class="mb-lbl">{MES[m-1]}</div></div>')
    return f'<div class="month-chart">{"".join(cells)}</div>'

def stage_bars(p):
    if not p["stage_n"]:
        return '<p class="note">Sem histórico de fluxo para estes itens.</p>'
    avgdays = {st: (p["stage_sum"][st]/p["stage_n"][st]/86400) for st in p["stage_n"]}
    c = Counter({st: round(d,1) for st,d in avgdays.items()})
    return f'<div class="bars">{bars(c, 0, "#a07bff", unit="d")}</div>'

def render(project, year, analysis, wip, with_flow):
    people = analysis["people"]
    proj_types = analysis["proj_types"]
    pm_count = analysis["pm_count"]
    all_cycle = analysis["all_cycle"]
    all_lead = analysis["all_lead"]
    sprint = analysis["sprint"]
    total = sum(p["count"] for p in people.values())
    total_sp = sum(p["sp"] for p in people.values())
    assigned = sorted([(n,p) for n,p in people.items() if n != "(Não identificado)"],
                      key=lambda kv:-kv[1]["count"])
    peak = max(pm_count, key=lambda k:pm_count[k]) if pm_count else (year,1)
    top_vol = assigned[0] if assigned else None
    top_sp = max(assigned, key=lambda kv:kv[1]["sp"]) if assigned else None
    rework_rate = round(100*analysis["total_rework"]/analysis["total_flow"]) if analysis["total_flow"] else 0
    total_defects = sum(p["defects"] for p in people.values())
    total_wip = sum(w["count"] for w in wip.values())
    gen = datetime.now().strftime("%d/%m/%Y %H:%M")
    parts = []
    add = parts.append

    # nav
    nav = ['<a href="#overview" class="nav-link">📊 Visão Geral</a>',
           '<a href="#ranking" class="nav-link">🏆 Ranking</a>',
           '<a href="#sprints" class="nav-link">🗓️ Sprints</a>',
           '<a href="#wip" class="nav-link">🔧 WIP atual</a>',
           '<div class="nav-sep">Profissionais</div>']
    for n,_ in assigned:
        nav.append(f'<a href="#{slug(n)}" class="nav-link">{esc(n)}</a>')
    nav_html = "".join(nav)

    # overview
    add(f'<section id="overview"><h1>Relatório de Desempenho — {esc(project)} {year}</h1>')
    add(f'<p class="subtitle">Complemento à AVD · itens concluídos no Azure DevOps · gerado em {gen}</p>')
    add('<div class="cards">')
    cards = [("Itens concluídos", total), ("Story Points", round(total_sp)),
             ("Profissionais", len(assigned)),
             ("Lead time médio", f"{avg(all_lead)}d"),
             ("Cycle time médio", f"{avg(all_cycle)}d")]
    if with_flow:
        cards.append(("Retrabalho", f"{rework_rate}%"))
    cards += [("Defeitos", total_defects), ("WIP atual", total_wip)]
    for label, val in cards:
        add(f'<div class="card"><div class="card-val">{val}</div><div class="card-lbl">{label}</div></div>')
    add('</div>')
    add('<div class="panel"><h3>Destaques</h3><ul class="highlights">')
    if pm_count:
        add(f'<li>📈 Pico de entregas em <b>{MES[peak[1]-1]}/{peak[0]}</b> ({pm_count[peak]} itens).</li>')
    if top_vol:
        add(f'<li>🏆 Maior volume: <b>{esc(top_vol[0])}</b> ({top_vol[1]["count"]} itens).</li>')
    if top_sp:
        add(f'<li>💪 Mais Story Points: <b>{esc(top_sp[0])}</b> ({round(top_sp[1]["sp"])} SP).</li>')
    add(f'<li>⏱️ Lead time mediano {med(all_lead)}d · cycle time mediano {med(all_cycle)}d (tempo na fila = lead − cycle).</li>')
    if with_flow:
        add(f'<li>🔁 Retrabalho médio do time: <b>{rework_rate}%</b> dos itens voltaram de estágio.</li>')
    add('</ul></div>')
    add('<div class="panel"><h3>Velocidade mensal (itens concluídos)</h3>'+month_bars(pm_count, year)+'</div>')
    add('<div class="panel"><h3>Distribuição por tipo de trabalho</h3>'
      f'<div class="bars">{bars(proj_types, total, "#22c3a6")}</div></div>')
    add('</section>')

    # ranking
    add('<section id="ranking"><h2>🏆 Ranking de produtividade</h2>')
    add('<p class="note">Atribuição por autoria real (Responsável → quem ativou → quem resolveu).</p>')
    head = '<th>#</th><th>Profissional</th><th>Itens</th><th>SP</th><th>Lead</th><th>Cycle</th>'
    if with_flow:
        head += '<th>Retrabalho</th>'
    head += '<th>Defeitos</th>'
    add(f'<table class="rank"><thead><tr>{head}</tr></thead><tbody>')
    for i,(n,p) in enumerate(assigned,1):
        rw = f'<td>{round(100*p["rework"]/p["flow_items"]) if p["flow_items"] else 0}%</td>' if with_flow else ''
        add(f'<tr><td>{i}</td><td><a href="#{slug(n)}">{esc(n)}</a></td><td>{p["count"]}</td>'
          f'<td>{round(p["sp"])}</td><td>{avg(p["lead"])}d</td><td>{avg(p["cycle"])}d</td>{rw}'
          f'<td>{p["defects"]}</td></tr>')
    add('</tbody></table></section>')

    # sprints
    add('<section id="sprints"><h2>🗓️ Previsibilidade por sprint</h2>')
    add('<p class="note">Itens e Story Points concluídos por iteração, e <b>carryover</b> (itens que mudaram de sprint ao longo da vida = arrastaram).</p>')
    add('<table class="rank"><thead><tr><th>Sprint</th><th>Itens entregues</th><th>Story Points</th><th>Carryover</th></tr></thead><tbody>')
    def iter_key(k):
        return (0,int("".join(filter(str.isdigit,k)) or 0)) if any(c.isdigit() for c in k) else (1,0)
    for it in sorted(sprint, key=iter_key):
        s = sprint[it]
        add(f'<tr><td>{esc(it)}</td><td>{s["count"]}</td><td>{round(s["sp"])}</td><td>{s["carryover"]}</td></tr>')
    add('</tbody></table></section>')

    # wip
    add('<section id="wip"><h2>🔧 WIP atual (trabalho em andamento)</h2>')
    add(f'<p class="note">Fotografia de hoje: {total_wip} itens em andamento. Muito WIP por pessoa ou itens muito antigos (aging alto) indicam dispersão ou bloqueios.</p>')
    add('<table class="rank"><thead><tr><th>Profissional</th><th>Itens em andamento</th><th>Idade média</th><th>Mais antigo</th></tr></thead><tbody>')
    for n in sorted(wip, key=lambda k:-wip[k]["count"]):
        w = wip[n]
        add(f'<tr><td>{esc(n)}</td><td>{w["count"]}</td><td>{avg(w["ages"])}d</td><td>{round(max(w["ages"])) if w["ages"] else 0}d</td></tr>')
    add('</tbody></table></section>')

    # per professional
    for n,p in assigned:
        add(f'<section id="{slug(n)}" class="prof"><h2>{esc(n)}</h2>')
        add('<div class="cards small">')
        pcards = [("Itens", p["count"]), ("Story Points", round(p["sp"])),
                  ("Lead", f'{avg(p["lead"])}d'), ("Cycle", f'{avg(p["cycle"])}d'),
                  ("Defeitos", p["defects"])]
        if with_flow:
            pcards.append(("Retrabalho", f'{round(100*p["rework"]/p["flow_items"]) if p["flow_items"] else 0}%'))
        wcount = wip.get(n,{}).get("count",0)
        pcards.append(("WIP atual", wcount))
        for label, val in pcards:
            add(f'<div class="card"><div class="card-val">{val}</div><div class="card-lbl">{label}</div></div>')
        add('</div>')
        add('<div class="grid2">')
        add(f'<div class="panel"><h3>Tipos de trabalho</h3><div class="bars">{bars(p["types"], p["count"], "#4f8cff")}</div></div>')
        sz = p["sizes"]
        sizebars = (f'<div class="bars">{bars(Counter({"Pequena (≤2 SP)":sz.get("P",0),"Média (3-5 SP)":sz.get("M",0),"Grande (≥8 SP)":sz.get("G",0)}), sum(sz.values()) or 1, "#f0a93b")}</div>'
                    if sum(sz.values()) else '<p class="note">Sem itens estimados.</p>')
        add(f'<div class="panel"><h3>Tamanho das entregas</h3>{sizebars}</div>')
        add('</div>')
        if with_flow:
            add('<div class="grid2">')
            add(f'<div class="panel"><h3>Tempo médio por estágio do fluxo</h3>{stage_bars(p)}</div>')
            rwpct = round(100*p["rework"]/p["flow_items"]) if p["flow_items"] else 0
            add('<div class="panel"><h3>Qualidade & fluxo</h3><div class="bars">'
              f'<div class="bar-row"><span class="bar-label">Retrabalho</span><span class="bar-track"><span class="bar-fill" style="width:{min(rwpct,100)}%;background:#e0556b"></span></span><span class="bar-val">{rwpct}%</span></div>'
              f'<div class="kv">Itens com retrocesso: <b>{p["rework"]}</b> · Reaberturas pós-conclusão: <b>{p["reopen"]}</b></div>'
              f'<div class="kv">Carryover (mudou de sprint): <b>{p["carryover"]}</b></div>'
              f'<div class="kv">Lead time médio: <b>{avg(p["lead"])}d</b> · Cycle time médio: <b>{avg(p["cycle"])}d</b> · fila ≈ <b>{round(avg(p["lead"])-avg(p["cycle"]),1)}d</b></div>'
              '</div></div>')
            add('</div>')
        add(f'<div class="panel"><h3>Ritmo mensal</h3>{month_bars(p["months"], year)}</div>')
        add('</section>')

    if "(Não identificado)" in people:
        ua = people["(Não identificado)"]
        add(f'<section><p class="note">Obs.: {ua["count"]} itens não puderam ser atribuídos.</p></section>')

    add('<section id="metodo"><h2>Notas metodológicas</h2><ul class="note">'
      '<li><b>Itens concluídos</b>: <code>ClosedDate</code> no ano.</li>'
      '<li><b>Atribuição</b>: Responsável → ActivatedBy → ResolvedBy → ClosedBy (Responsável é limpo após a entrega).</li>'
      '<li><b>Lead time</b>: criação→conclusão. <b>Cycle time</b>: 1ª entrada em "InProgress"→conclusão. A diferença ≈ tempo na fila.</li>'
      '<li><b>Tempo por estágio</b>: média de dias que os itens da pessoa passaram em cada estado "InProgress" (Desenvolvendo, Code Review, Testando...), via histórico de revisões.</li>'
      '<li><b>Retrabalho</b>: itens que retrocederam de categoria (ex.: de Teste/Review de volta para Desenvolvimento). <b>Reabertura</b>: saiu de "Concluído".</li>'
      '<li><b>Carryover</b>: item cuja iteração mudou ao longo da vida (arrastou entre sprints).</li>'
      '<li><b>Defeitos</b>: itens cujo tipo contém termos como bug/defeito/falha/incidente/problema/segurança.</li>'
      '<li>Código/PRs estão no GitLab — métricas de commit/review de PR não vêm do Azure. Volume ≠ complexidade/qualidade; use com o contexto da AVD.</li>'
      '</ul></section>')

    body = "".join(parts)
    return PAGE.replace("{{NAV}}", nav_html).replace("{{BODY}}", body).replace("{{TITLE}}", esc(f"{project} {year}"))

PAGE = """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório {{TITLE}}</title>
<style>
:root{--bg:#0f1420;--panel:#161d2e;--card:#1c2538;--line:#26304a;--txt:#e6ebf5;--mut:#93a0bd;--acc:#4f8cff}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--txt)}
.layout{display:flex;min-height:100vh}
.sidebar{width:260px;background:#0c111c;border-right:1px solid var(--line);position:fixed;top:0;bottom:0;overflow-y:auto;padding:20px 0}
.sidebar .brand{padding:0 20px 16px;font-weight:700;font-size:15px;color:var(--acc);border-bottom:1px solid var(--line);margin-bottom:10px}
.nav-link{display:block;padding:9px 20px;color:var(--mut);text-decoration:none;font-size:14px;border-left:3px solid transparent}
.nav-link:hover{background:#131a2a;color:var(--txt)}
.nav-sep{padding:14px 20px 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5b6a8c}
.content{margin-left:260px;padding:36px 48px;max-width:1100px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:21px;margin:0 0 14px;border-bottom:1px solid var(--line);padding-bottom:8px}
h3{font-size:15px;margin:0 0 14px;color:var(--mut)}
.subtitle{color:var(--mut);margin:0 0 26px;font-size:13px}
section{margin-bottom:46px;scroll-margin-top:20px}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.cards.small .card{min-width:110px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;min-width:140px;flex:1}
.card-val{font-size:24px;font-weight:700}.card-lbl{color:var(--mut);font-size:12px;margin-top:4px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:18px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:820px){.grid2{grid-template-columns:1fr}.content{margin-left:0;padding:20px}.sidebar{display:none}}
.bar-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:13px}
.bar-label{width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{flex:1;background:#0e1422;border-radius:6px;height:14px;overflow:hidden}
.bar-fill{display:block;height:100%;border-radius:6px}
.bar-val{width:90px;text-align:right;color:var(--mut)}
.kv{font-size:13px;color:var(--mut);margin:8px 0}
.kv b{color:var(--txt)}
.highlights{margin:0;padding-left:18px;line-height:1.9}
.month-chart{display:flex;gap:8px;align-items:flex-end;height:150px;padding-top:10px}
.mb-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.mb-bar-wrap{flex:1;width:60%;display:flex;align-items:flex-end}
.mb-bar{width:100%;background:linear-gradient(180deg,#4f8cff,#2b5fd0);border-radius:5px 5px 0 0;min-height:2px}
.mb-val{font-size:11px;color:var(--mut);margin-top:4px}.mb-lbl{font-size:10px;color:#5b6a8c}
table.rank{width:100%;border-collapse:collapse;font-size:14px}
table.rank th,table.rank td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}
table.rank th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
table.rank tr:hover{background:#131a2a}
table.rank a{color:var(--acc);text-decoration:none}
.note{color:var(--mut);font-size:13px;line-height:1.7}
code{background:#0e1422;padding:1px 5px;border-radius:4px;font-size:12px}
.prof h2{color:#fff}
</style></head><body>
<div class="layout">
<nav class="sidebar"><div class="brand">📈 Relatório AVD</div>{{NAV}}</nav>
<main class="content">{{BODY}}</main>
</div>
</body></html>"""

# ---------------------------------------------------------------- report entry
def generate_report(org, pat_b64, project, year=None, with_flow=True, workers=8):
    """Run the full analysis for a project/year. Returns (html_or_None, summary_dict)."""
    year = year or datetime.now(timezone.utc).year
    base, post, get = make_api(org, pat_b64)
    items = collect_closed(post, project, year)
    if not items:
        return None, {"project": project, "year": year, "itens_concluidos": 0,
                      "wip_total": 0, "pessoas": 0, "por_pessoa": {}}
    # Read the org's REAL state categories (adapts to any workflow) to derive which
    # states mean done/removed — instead of hardcoding one company's state names.
    types = {it["fields"].get("System.WorkItemType") for it in items
             if it["fields"].get("System.WorkItemType")}
    smap, somap = fetch_state_categories(get, project, list(types))
    done_states = {n for n, c in smap.items() if c in ("Completed", "Removed")} \
        or set(DONE_STATES_FALLBACK)
    wip_items = collect_wip(post, project, done_states)
    revmap = {}
    if with_flow:
        ids = [it["id"] for it in items]
        revmap = fetch_revisions(base, pat_b64, project, ids, workers=workers)
    analysis = analyze(items, smap, somap, revmap)
    wip = analyze_wip(wip_items)
    page = render(project, year, analysis, wip, with_flow)
    # Organized structured data the AI can reshape into any view/report.
    people = {}
    for name, p in analysis["people"].items():
        if name == "(Não identificado)":
            continue
        people[name] = {
            "itens": p["count"], "story_points": round(p["sp"], 1),
            "defeitos": p["defects"], "sem_estimativa": p.get("no_est", 0),
            "lead_mediano_d": med(p["lead"]), "cycle_mediano_d": med(p["cycle"]),
            "lead_medio_d": avg(p["lead"]), "cycle_medio_d": avg(p["cycle"]),
            "retrabalho": p["rework"], "reaberturas": p["reopen"],
            "carryover": p.get("carryover", 0),
            "tamanhos": dict(p.get("sizes", {})), "tipos": dict(p["types"]),
            "meses": {f"{y}-{m:02d}": v for (y, m), v in sorted(p["months"].items())},
            "etapas_dias": {st: round(p["stage_sum"][st] / p["stage_n"][st] / 86400, 1)
                            for st in p["stage_n"]},
        }
    sprints = {k: {"itens": v["count"], "story_points": round(v["sp"], 1),
                   "carryover": v["carryover"]} for k, v in analysis["sprint"].items()}
    wip_por_pessoa = {n: {"itens": w["count"], "estados": dict(w["states"]),
                          "idade_media_d": avg(w["ages"]),
                          "mais_antigo_d": round(max(w["ages"])) if w["ages"] else 0}
                      for n, w in wip.items()}
    por_mes = {f"{y}-{m:02d}": {"itens": c, "story_points": round(analysis["pm_sp"].get((y, m), 0), 1)}
               for (y, m), c in sorted(analysis["pm_count"].items())}
    summary = {
        "project": project, "year": year,
        "itens_concluidos": len(items), "wip_total": len(wip_items),
        "pessoas": len(people), "estados_concluidos": sorted(done_states),
        "tipos_projeto": dict(analysis["proj_types"]),
        "por_pessoa": people, "por_sprint": sprints, "por_mes": por_mes,
        "wip_por_pessoa": wip_por_pessoa,
    }
    return page, summary


class AzureReportTool(Tool):
    """Deterministic Azure DevOps delivery analysis for a project/year.

    Does the heavy analytics an LLM cannot do call-by-call: closed-in-year WIQL,
    authorship via the AssignedTo -> ActivatedBy -> ResolvedBy -> ClosedBy chain,
    and per-item revision flow metrics (lead/cycle, rework, reopening, carryover).
    Publishes the report page to the served reports dir and returns its link plus
    a per-person summary that PDI/report skills can reason over.
    """

    def __init__(self, *, user_id, integration_repo, credential_repo, workspace,
                 public_url: str | None = None):
        self._user_id = user_id
        self._integration_repo = integration_repo
        self._credential_repo = credential_repo
        self._reports_dir = Path(workspace) / "reports"
        self._public_url = (public_url or "").rstrip("/")

    @property
    def name(self) -> str:
        return "azure_devops_report"

    @property
    def description(self) -> str:
        return (
            "Analisa a ENTREGA de um projeto do Azure DevOps em um ano: itens concluídos, "
            "atribuídos pela cadeia de autoria (AssignedTo -> ActivatedBy -> ResolvedBy -> "
            "ClosedBy), com lead/cycle time, retrabalho, defeitos, por pessoa, por sprint e "
            "por mês. Publica uma página de relatório e retorna o link + um resumo por "
            "pessoa (use esse resumo como fonte de entrega para montar PDIs). Requer a "
            "integração Azure DevOps configurada. Passe o nome do projeto (a organização "
            "tem muitos)."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "project": {"type": "string",
                            "description": "Nome do projeto no Azure DevOps (ex.: MeuProjeto)."},
                "year": {"type": "integer", "description": "Ano analisado. Default: ano atual."},
                "no_flow": {"type": "boolean",
                            "description": "Pula métricas de fluxo (revisions) — mais rápido."},
            },
            "required": ["project"],
        }

    async def _resolve_cred(self) -> dict | None:
        from nanobot.utils.crypto import decrypt
        for slug in ("mcp_azure_devops", "azure_devops"):
            row = await self._integration_repo.get_integration(self._user_id, slug)
            if row and row.get("credential_id"):
                cred = await self._credential_repo.get_credential(
                    self._user_id, row["credential_id"])
                if cred and cred.get("secret_cipher"):
                    try:
                        return json.loads(decrypt(cred["secret_cipher"]))
                    except (ValueError, TypeError):
                        return None
        return None

    async def execute(self, **kwargs: Any) -> str:
        project = str(kwargs.get("project", "")).strip()
        if not project:
            return "Error: informe o 'project' (nome do projeto no Azure DevOps)."
        year = kwargs.get("year")
        with_flow = not bool(kwargs.get("no_flow"))
        cred = await self._resolve_cred()
        if not cred or not cred.get("pat") or not cred.get("organization"):
            return "Error: integração Azure DevOps não configurada (organização + PAT)."
        org = cred["organization"]
        pat_b64 = base64.b64encode(f":{cred['pat']}".encode()).decode()
        try:
            page, summary = await asyncio.to_thread(
                generate_report, org, pat_b64, project, year, with_flow)
        except Exception as e:
            return f"Error ao analisar o projeto '{project}': {e}"
        if not page:
            return (f"Nenhum item concluído encontrado no projeto '{project}' em "
                    f"{summary.get('year')}. Confirme o nome do projeto — a organização "
                    f"tem muitos projetos.")
        token = uuid.uuid4().hex
        self._reports_dir.mkdir(parents=True, exist_ok=True)
        (self._reports_dir / f"{token}.html").write_text(page, encoding="utf-8")
        data = {k: summary[k] for k in
                ("por_pessoa", "por_sprint", "por_mes", "wip_por_pessoa", "tipos_projeto",
                 "estados_concluidos")}
        link = f"{self._public_url}/r/{token}" if self._public_url else f"/r/{token}"
        return (
            f"Relatório do projeto '{project}' ({summary['year']}) publicado.\n"
            f"Link: {link}\n"
            f"Entregue ao usuário como link markdown, ex.: [Abrir relatório]({link})\n"
            f"{summary['itens_concluidos']} itens concluídos · {summary['pessoas']} pessoas · "
            f"{summary['wip_total']} em WIP.\n\n"
            f"Dados organizados (reorganize/monte a visão que o usuário pedir a partir daqui):\n"
            + json.dumps(data, ensure_ascii=False)
        )
