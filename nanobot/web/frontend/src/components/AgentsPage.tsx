import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Briefcase, Copy, FileText, HeartHandshake, MoreVertical, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/api";

type FilterTab = "active" | "draft" | "inactive" | "all";

function agentIcon(agent: Agent) {
  const role = (agent.role || "").toLowerCase();
  if (role.includes("recrut") || role.includes("seleção")) return Briefcase;
  if (role.includes("dp") || role.includes("pessoal") || role.includes("trabalhista")) return FileText;
  if (role.includes("clima") || role.includes("pdi") || role.includes("endomark")) return HeartHandshake;
  return Bot;
}

function AgentStatusToggle({ agent, onToggle }: { agent: Agent; onToggle: () => void }) {
  const isActive = agent.status === "active" || agent.is_default;
  const disabled = agent.is_default;
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "text-[11px] font-bold uppercase tracking-wider transition-colors",
          isActive ? "text-purple-700" : "text-slate-400",
        )}
      >
        {isActive ? "Ativo" : "Inativo"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isActive}
        onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
        disabled={disabled}
        title={disabled ? "Agente padrão — sempre ativo" : isActive ? "Desativar agente" : "Ativar agente"}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:ring-offset-2",
          isActive ? "bg-purple-600" : "bg-slate-300",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:brightness-105",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform",
            isActive ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

function AgentCardMenu({ agent, onDuplicate, onDelete }: {
  agent: Agent;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        title="Ações"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => { setOpen(false); onDuplicate(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </button>
          <button
            type="button"
            disabled={agent.is_default}
            onClick={() => { setOpen(false); onDelete(); }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium",
              agent.is_default
                ? "cursor-not-allowed text-slate-300"
                : "text-red-600 hover:bg-red-50",
            )}
            title={agent.is_default ? "Não é possível excluir o agente padrão" : undefined}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

export function AgentsPage() {
  const { agents, activeAgentId, selectAgent, setActiveView, setEditingAgentId, updateAgent, deleteAgent, duplicateAgent } = useStore();
  const [filter, setFilter] = useState<FilterTab>("active");
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null);

  const counts = useMemo(() => {
    const active = agents.filter((a) => a.status === "active" || a.is_default).length;
    const draft = agents.filter((a) => a.status === "draft").length;
    const inactive = agents.filter((a) => a.status !== "active" && a.status !== "draft" && !a.is_default).length;
    return { active, draft, inactive, all: agents.length };
  }, [agents]);

  const visibleAgents = useMemo(() => {
    if (filter === "all") return agents;
    if (filter === "active") return agents.filter((a) => a.status === "active" || a.is_default);
    if (filter === "draft") return agents.filter((a) => a.status === "draft");
    return agents.filter((a) => a.status !== "active" && a.status !== "draft" && !a.is_default);
  }, [agents, filter]);

  function openConfig(agentId: string) {
    setEditingAgentId(agentId);
    setActiveView("agent-config");
  }

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "active", label: "Ativos", count: counts.active },
    { key: "draft", label: "Rascunhos", count: counts.draft },
    { key: "inactive", label: "Inativos", count: counts.inactive },
    { key: "all", label: "Todos", count: counts.all },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-purple-700">
              <Sparkles className="h-3.5 w-3.5" />
              Catálogo de Agentes
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Seus Agentes</h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-500">
              Só agentes ativos aparecem no seletor do topo. Clique para selecionar · Duplo clique para editar identidade.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveView("agent-create")}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white shadow-md shadow-purple-600/25 hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Agente
          </button>
        </section>

        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold transition-colors",
                filter === tab.key
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {tab.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-mono font-bold",
                filter === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
              <Bot className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-900">Nenhum agente criado ainda</h2>
            <p className="mt-1 text-sm text-slate-500">Crie seu primeiro agente para começar.</p>
            <button
              type="button"
              onClick={() => setActiveView("agent-create")}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-700"
            >
              <Plus className="h-4 w-4" />
              Criar Agente
            </button>
          </div>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleAgents.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
                Nenhum agente {filter === "active" ? "ativo" : filter === "inactive" ? "inativo" : ""} nesta visão.
              </div>
            )}
            {visibleAgents.map((agent) => {
              const selected = agent.agent_id === activeAgentId;
              const isActive = agent.status === "active" || agent.is_default;
              const Icon = agentIcon(agent);
              const tools = agent.tools_enabled ?? [];
              const visibleTools = tools.slice(0, 3);
              const extraTools = tools.length - visibleTools.length;

              return (
                <div
                  key={agent.agent_id}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer",
                    selected ? "border-purple-300 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200",
                    !isActive && "opacity-70 grayscale-[15%]",
                  )}
                  onClick={() => selectAgent(agent.agent_id)}
                  onDoubleClick={() => openConfig(agent.agent_id)}
                >
                  <div className="flex-1 p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-2xl text-purple-700 transition-colors",
                            selected ? "bg-purple-200" : "bg-purple-100 group-hover:bg-purple-150",
                          )}>
                            <Icon className="h-7 w-7" />
                          </div>
                          <span className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white",
                            isActive ? "bg-purple-500" : "bg-slate-300",
                          )} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-[15px] font-black text-slate-950 leading-tight">{agent.name}</h2>
                            {agent.status === "draft" && (
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                                Rascunho
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] font-bold text-purple-700">{agent.role}</p>
                        </div>
                      </div>
                      <AgentCardMenu
                        agent={agent}
                        onDuplicate={() => duplicateAgent(agent.agent_id)}
                        onDelete={() => setConfirmDelete(agent)}
                      />
                    </div>

                    <p className="line-clamp-2 min-h-[40px] text-[13px] font-medium leading-6 text-slate-500">
                      {agent.description || "Agente configurado. Duplo clique para editar prompts, skills e conectores."}
                    </p>

                    {visibleTools.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Ferramentas</p>
                        <div className="flex flex-wrap gap-1">
                          {visibleTools.map((tool) => (
                            <span key={tool} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              <Zap className="h-2.5 w-2.5 text-purple-500" />
                              {tool}
                            </span>
                          ))}
                          {extraTools > 0 && (
                            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-600">
                              +{extraTools}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5">
                    <AgentStatusToggle
                      agent={agent}
                      onToggle={() => updateAgent(agent.agent_id, {
                        status: isActive ? "inactive" : "active",
                      })}
                    />
                    <p className="text-[10px] text-slate-300">
                      Duplo clique para editar
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Excluir agente?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <strong>{confirmDelete.name}</strong> será desativado permanentemente. Skills, canais, memória e cron ficam no histórico mas o agente some do seletor.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const agent = confirmDelete;
                  setConfirmDelete(null);
                  await deleteAgent(agent.agent_id);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
