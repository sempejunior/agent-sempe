import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "./PageHeader";
import { AgentCard } from "./AgentCard";
import { listAgentsWithMetrics, type Agent, type AgentMetrics } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { TabBar } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type FilterTab = "active" | "draft" | "inactive" | "all";

export function AgentTeamPage() {
  const agents = useStore((s) => s.agents);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const selectAgent = useStore((s) => s.selectAgent);
  const setActiveView = useStore((s) => s.setActiveView);
  const setEditingAgentId = useStore((s) => s.setEditingAgentId);
  const updateAgent = useStore((s) => s.updateAgent);
  const deleteAgent = useStore((s) => s.deleteAgent);
  const duplicateAgent = useStore((s) => s.duplicateAgent);
  const resetWizard = useStore((s) => s.resetWizard);

  const [filter, setFilter] = useState<FilterTab>("active");
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null);
  const [metricsMap, setMetricsMap] = useState<Record<string, AgentMetrics>>({});

  useEffect(() => {
    listAgentsWithMetrics()
      .then((list) => {
        const m: Record<string, AgentMetrics> = {};
        for (const a of list) if (a.metrics) m[a.agent_id] = a.metrics;
        setMetricsMap(m);
      })
      .catch(() => {});
  }, [agents.length]);

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

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "active", label: "Ativos", count: counts.active },
    { key: "draft", label: "Rascunhos", count: counts.draft },
    { key: "inactive", label: "Inativos", count: counts.inactive },
    { key: "all", label: "Todos", count: counts.all },
  ];

  function openStudio(newAgent: boolean, agentId?: string) {
    if (newAgent) {
      resetWizard();
      setEditingAgentId(null);
    } else if (agentId) {
      setEditingAgentId(agentId);
    }
    setActiveView("agent-studio");
  }

  function openAdvanced(agentId: string) {
    setEditingAgentId(agentId);
    setActiveView("agent-config");
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={Users}
        title="Minha Equipe Digital"
        subtitle="Cada agente é um colaborador especializado. Ative, edite, duplique ou converse."
        action={
          <Button size="lg" onClick={() => openStudio(true)}>
            <Plus />
            Criar Novo Agente
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <TabBar
          value={filter}
          onChange={setFilter}
          items={tabs.map((t) => ({ key: t.key, label: t.label, badge: t.count }))}
        />
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center px-6 pt-20">
            <div className="w-16 h-16 rounded-2xl bg-purple-muted flex items-center justify-center text-purple mb-4">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="font-display font-bold text-lg text-text-primary">
              Sua equipe digital está vazia
            </h3>
            <p className="text-sm text-text-secondary mt-1 max-w-sm">
              Crie seu primeiro agente para começar. Você pode partir de um template pronto ou do zero.
            </p>
            <Button size="lg" className="mt-6" onClick={() => openStudio(true)}>
              <Plus /> Criar Agente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleAgents.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-14 text-center text-sm text-text-secondary pt-14">
                Nenhum agente nesta visão.
              </CardContent>
            </Card>
          )}
          {visibleAgents.map((agent) => {
            const isActive = agent.agent_id === activeAgentId;
            const enabled = agent.status === "active" || agent.is_default;
            return (
              <div key={agent.agent_id} className="min-w-0">
                <AgentCard
                  agent={agent}
                  metrics={metricsMap[agent.agent_id]}
                  isActive={isActive}
                  onSelect={() =>
                    selectAgent(agent.agent_id).then(() =>
                      toast("info", `Agente ativo: ${agent.name}`),
                    )
                  }
                  onEdit={() => openStudio(false, agent.agent_id)}
                  onAdvanced={() => openAdvanced(agent.agent_id)}
                  onDuplicate={() => duplicateAgent(agent.agent_id)}
                  onDelete={() => setConfirmDelete(agent)}
                  onToggleStatus={() =>
                    updateAgent(agent.agent_id, { status: enabled ? "inactive" : "active" })
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-muted text-red flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle>Excluir agente?</DialogTitle>
                <DialogDescription className="mt-1">
                  <strong className="text-text-primary">{confirmDelete?.name}</strong>{" "}
                  será desativado permanentemente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody />
          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={async () => {
                const agent = confirmDelete;
                setConfirmDelete(null);
                if (agent) await deleteAgent(agent.agent_id);
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
