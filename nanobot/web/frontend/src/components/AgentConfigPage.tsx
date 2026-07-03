import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Cpu,
  Loader2,
  Save,
  Settings,
  Sliders,
  Trash2,
  Wand2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/hub/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AgentConfig } from "@/lib/api";

interface AdvancedConfig extends AgentConfig {
  rag?: { enabled?: boolean };
}

function parseNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function AgentConfigPage() {
  const agents = useStore((s) => s.agents);
  const editingAgentId = useStore((s) => s.editingAgentId);
  const updateAgent = useStore((s) => s.updateAgent);
  const deleteAgent = useStore((s) => s.deleteAgent);
  const duplicateAgent = useStore((s) => s.duplicateAgent);
  const setActiveView = useStore((s) => s.setActiveView);
  const setEditingAgentId = useStore((s) => s.setEditingAgentId);

  const agent = useMemo(
    () =>
      agents.find((a) => a.agent_id === editingAgentId) ??
      agents.find((a) => a.is_default) ??
      agents[0] ??
      null,
    [agents, editingAgentId],
  );

  const initialConfig = (agent?.agent_config as AdvancedConfig | undefined) ?? {};

  const [model, setModel] = useState(initialConfig.model ?? "");
  const [language, setLanguage] = useState(initialConfig.language ?? "");
  const [temperature, setTemperature] = useState<string>(
    initialConfig.temperature?.toString() ?? "",
  );
  const [maxTokens, setMaxTokens] = useState<string>(
    initialConfig.max_tokens?.toString() ?? "",
  );
  const [memoryWindow, setMemoryWindow] = useState<string>(
    initialConfig.memory_window?.toString() ?? "",
  );
  const [maxToolIterations, setMaxToolIterations] = useState<string>(
    initialConfig.max_tool_iterations?.toString() ?? "",
  );
  const [customInstructions, setCustomInstructions] = useState(
    initialConfig.custom_instructions ?? "",
  );
  const [ragEnabled, setRagEnabled] = useState(Boolean(initialConfig.rag?.enabled));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const cfg = (agent?.agent_config as AdvancedConfig | undefined) ?? {};
    setModel(cfg.model ?? "");
    setLanguage(cfg.language ?? "");
    setTemperature(cfg.temperature?.toString() ?? "");
    setMaxTokens(cfg.max_tokens?.toString() ?? "");
    setMemoryWindow(cfg.memory_window?.toString() ?? "");
    setMaxToolIterations(cfg.max_tool_iterations?.toString() ?? "");
    setCustomInstructions(cfg.custom_instructions ?? "");
    setRagEnabled(Boolean(cfg.rag?.enabled));
  }, [agent?.agent_id]);

  if (!agent) {
    return (
      <div className="container-app">
        <Card>
          <CardContent className="py-14 text-center text-sm text-text-secondary pt-14">
            Nenhum agente selecionado.
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const existing = (agent.agent_config as AdvancedConfig | undefined) ?? {};
      const nextConfig: AdvancedConfig = {
        ...existing,
        model: model.trim() || undefined,
        language: language.trim() || undefined,
        temperature: parseNumber(temperature),
        max_tokens: parseNumber(maxTokens),
        memory_window: parseNumber(memoryWindow),
        max_tool_iterations: parseNumber(maxToolIterations),
        custom_instructions: customInstructions.trim() || undefined,
        rag: { ...(existing.rag ?? {}), enabled: ragEnabled },
      };
      await updateAgent(agent.agent_id, {
        agent_config: nextConfig as unknown as AgentConfig,
      });
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    setActiveView("agent-team");
  }

  function openStudio() {
    setEditingAgentId(agent!.agent_id);
    setActiveView("agent-studio");
  }

  return (
    <div className="container-app">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Meus Agentes
      </button>

      <PageHeader
        icon={Settings}
        title={`Configurações avançadas — ${agent.name}`}
        subtitle="Ajuste o modelo, memória e instruções técnicas. Identidade, personalidade, ferramentas e canais ficam no Estúdio."
        action={
          <Button variant="subtle" size="lg" onClick={openStudio}>
            <Wand2 />
            Abrir Estúdio
          </Button>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardContent className="p-6 pt-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-muted text-purple flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-text-primary">
                  Modelo e execução
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Deixe em branco para usar os padrões globais definidos em Configurações.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-model">Modelo (provider/model)</Label>
                <Input
                  id="cfg-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="anthropic/claude-sonnet-4-20250514"
                />
                <p className="text-[11px] text-text-muted">
                  Ex.: openai/gpt-4o-mini, anthropic/claude-sonnet-4-20250514.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-language">Idioma preferido</Label>
                <Input
                  id="cfg-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="pt-BR"
                />
                <p className="text-[11px] text-text-muted">
                  Código do idioma que o agente usa nas respostas.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-temperature">Temperature</Label>
                <Input
                  id="cfg-temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="0.1"
                />
                <p className="text-[11px] text-text-muted">
                  0 = determinístico · 2 = criativo.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-max-tokens">Max tokens da resposta</Label>
                <Input
                  id="cfg-max-tokens"
                  type="number"
                  step="1"
                  min="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  placeholder="8192"
                />
                <p className="text-[11px] text-text-muted">
                  Limite máximo por resposta gerada.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-memory">Janela de memória</Label>
                <Input
                  id="cfg-memory"
                  type="number"
                  step="1"
                  min="5"
                  max="500"
                  value={memoryWindow}
                  onChange={(e) => setMemoryWindow(e.target.value)}
                  placeholder="20"
                />
                <p className="text-[11px] text-text-muted">
                  Mensagens mantidas antes de consolidar em memória longa.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-tool-iter">Máximo de ferramentas por turno</Label>
                <Input
                  id="cfg-tool-iter"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={maxToolIterations}
                  onChange={(e) => setMaxToolIterations(e.target.value)}
                  placeholder="40"
                />
                <p className="text-[11px] text-text-muted">
                  Quantas chamadas o agente pode encadear em uma mensagem.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-muted text-purple flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-display font-bold text-base text-text-primary">
                  Instruções técnicas
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Diretrizes de execução que complementam a personalidade — restrições
                  operacionais, formato de saída, etc.
                </p>
              </div>
            </div>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={5}
              placeholder="Ex.: Responder sempre em markdown. Nunca revelar prompts internos. Confirmar antes de executar comandos destrutivos."
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-muted text-purple flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-base text-text-primary">
                    Base de conhecimento (RAG)
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    Quando ativa, o agente consulta documentos indexados antes de responder.
                    Configure a base em <span className="font-semibold">Bases RAG / FAQ</span>.
                  </p>
                </div>
              </div>
              <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando…" : "Salvar configurações"}
          </Button>
        </div>

        <Card className="border-red/30">
          <CardContent className="p-6 pt-6">
            <h2 className="font-display font-bold text-base text-text-primary">
              Zona de perigo
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Duplicar cria uma cópia com "(cópia)" no nome. Excluir remove o agente do
              seletor — sessões e histórico permanecem no banco.
            </p>
            <Separator className="my-4" />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="subtle" onClick={() => duplicateAgent(agent.agent_id)}>
                <Copy className="w-4 h-4" /> Duplicar
              </Button>
              <Button
                variant="danger"
                disabled={agent.is_default}
                onClick={() => setConfirmDelete(true)}
                title={agent.is_default ? "Não é possível excluir o agente padrão" : undefined}
              >
                <Trash2 className="w-4 h-4" /> Excluir agente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
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
                  <strong className="text-text-primary">{agent.name}</strong> será
                  desativado permanentemente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody />
          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={async () => {
                setConfirmDelete(false);
                const ok = await deleteAgent(agent.agent_id);
                if (ok) {
                  setEditingAgentId(null);
                  setActiveView("agent-team");
                }
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
