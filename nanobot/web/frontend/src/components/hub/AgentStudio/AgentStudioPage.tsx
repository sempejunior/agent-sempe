import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  BookOpen,
  Wrench,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Save,
  FilePlus,
  Loader2,
  Plug,
  Zap,
  ExternalLink,
} from "lucide-react";
import { useStore, type WizardStep } from "@/lib/store";
import { PageHeader } from "../PageHeader";
import { Stepper } from "./Stepper";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  getCustomSkills,
  getMcpConfig,
  type Agent,
  type AgentConfig,
  type AgentTemplate,
  type CustomSkill,
  type MCPServer,
} from "@/lib/api";

interface BuiltinTool {
  id: string;
  name: string;
  cat: string;
  warn?: boolean;
}

const BUILTIN_TOOLS: BuiltinTool[] = [
  { id: "save_memory", name: "Salvar memória", cat: "Memória" },
  { id: "search_memory", name: "Buscar memória", cat: "Memória" },
  { id: "rag_search", name: "Consultar base RAG", cat: "Memória" },
  { id: "rag_ingest", name: "Adicionar à base RAG", cat: "Memória" },
  { id: "web_search", name: "Pesquisar na web", cat: "Web" },
  { id: "web_fetch", name: "Ler URL", cat: "Web" },
  { id: "message", name: "Enviar mensagens proativas", cat: "Automação" },
  { id: "cron", name: "Agendar tarefas", cat: "Automação" },
  { id: "save_mcp_server", name: "Cadastrar MCP", cat: "Automação" },
  { id: "read_file", name: "Ler arquivo", cat: "Arquivos" },
  { id: "write_file", name: "Escrever arquivo", cat: "Arquivos" },
  { id: "edit_file", name: "Editar arquivo", cat: "Arquivos" },
  { id: "list_dir", name: "Listar pasta", cat: "Arquivos" },
  { id: "exec", name: "Executar shell", cat: "Sistema", warn: true },
  { id: "computer", name: "Controlar desktop", cat: "Sistema", warn: true },
  { id: "browser", name: "Controlar navegador", cat: "Sistema", warn: true },
];

const CHANNELS = [
  { id: "telegram", label: "Telegram" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
  { id: "whatsapp", label: "WhatsApp" },
];

const STEPS = [
  { key: 1, label: "Template" },
  { key: 2, label: "Identidade" },
  { key: 3, label: "Personalidade" },
  { key: 4, label: "Capacidades" },
  { key: 5, label: "Canais" },
];

const MAX_STEP: WizardStep = 5;

export function AgentStudioPage() {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const wizardStep = useStore((s) => s.wizardStep);
  const wizardDraft = useStore((s) => s.wizardDraft);
  const setWizardStep = useStore((s) => s.setWizardStep);
  const updateWizardDraft = useStore((s) => s.updateWizardDraft);
  const resetWizard = useStore((s) => s.resetWizard);
  const setActiveView = useStore((s) => s.setActiveView);
  const editingAgentId = useStore((s) => s.editingAgentId);
  const setEditingAgentId = useStore((s) => s.setEditingAgentId);
  const agents = useStore((s) => s.agents);
  const createAgent = useStore((s) => s.createAgent);
  const updateAgent = useStore((s) => s.updateAgent);

  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);

  useEffect(() => {
    if (templates.length === 0) loadTemplates();
  }, [templates.length, loadTemplates]);

  useEffect(() => {
    getCustomSkills()
      .then(setCustomSkills)
      .catch(() => setCustomSkills([]));
    getMcpConfig()
      .then((d) => setMcpServers(d.mcpServers ?? []))
      .catch(() => setMcpServers([]));
  }, [editingAgentId]);

  useEffect(() => {
    if (!editingAgentId) return;
    const agent = agents.find((a) => a.agent_id === editingAgentId);
    if (!agent) return;
    const bootstrap = agent.bootstrap ?? {};
    const cfg = agent.agent_config ?? {};
    const enabledChannels = Object.entries(agent.channel_configs ?? {})
      .filter(([, v]) => (v as { enabled?: boolean } | undefined)?.enabled)
      .map(([k]) => k);
    updateWizardDraft({
      template_id: "existing",
      name: agent.name,
      role: agent.role,
      description: agent.description,
      avatar: agent.avatar,
      persona: bootstrap["SOUL.md"] ?? "",
      guidelines: bootstrap["AGENTS.md"] ?? "",
      rag_enabled: Boolean(cfg.rag?.enabled),
      tools: agent.tools_enabled ?? [],
      skills:
        cfg.skills_enabled === null || cfg.skills_enabled === undefined
          ? customSkills.map((s) => s.name)
          : cfg.skills_enabled,
      mcps:
        cfg.mcp_servers_enabled === null || cfg.mcp_servers_enabled === undefined
          ? mcpServers.map((s) => s.name)
          : cfg.mcp_servers_enabled,
      channels: enabledChannels,
    });
    setWizardStep(2);
  }, [editingAgentId, agents, customSkills, mcpServers, updateWizardDraft, setWizardStep]);

  useEffect(() => {
    if (editingAgentId) return;
    updateWizardDraft({
      skills: customSkills.map((s) => s.name),
      mcps: mcpServers.map((s) => s.name),
    });
  }, [customSkills, mcpServers, editingAgentId, updateWizardDraft]);

  const editingAgent = useMemo(
    () => (editingAgentId ? agents.find((a) => a.agent_id === editingAgentId) : null),
    [editingAgentId, agents],
  );

  const headerTitle = editingAgent ? `Editar ${editingAgent.name}` : "Novo agente";
  const headerSubtitle = editingAgent
    ? "Ajuste identidade, personalidade, capacidades e canais deste agente."
    : "5 passos: escolher template, definir identidade, personalidade, capacidades e onde ele atua.";

  const canGoNext = (() => {
    if (wizardStep === 1) return Boolean(wizardDraft.template_id);
    if (wizardStep === 2) return wizardDraft.name.trim().length > 0;
    return true;
  })();

  function handleSelectTemplate(t: AgentTemplate | null) {
    if (t) {
      updateWizardDraft({
        template_id: t.id,
        name: t.name,
        role: t.role,
        description: t.description,
        avatar: t.icon,
        persona: "",
        guidelines: t.system_prompt,
        tools: t.tools,
        rag_enabled: t.rag_enabled,
      });
    } else {
      updateWizardDraft({
        template_id: "blank",
        name: "",
        role: "",
        description: "",
        avatar: "",
        persona: "",
        guidelines: "",
        tools: [],
        skills: [],
        rag_enabled: false,
      });
    }
    setWizardStep(2);
  }

  function toggleTool(id: string) {
    const has = wizardDraft.tools.includes(id);
    updateWizardDraft({
      tools: has ? wizardDraft.tools.filter((t) => t !== id) : [...wizardDraft.tools, id],
    });
  }

  function toggleSkill(name: string) {
    const has = wizardDraft.skills.includes(name);
    updateWizardDraft({
      skills: has
        ? wizardDraft.skills.filter((s) => s !== name)
        : [...wizardDraft.skills, name],
    });
  }

  function toggleMcp(name: string) {
    const has = wizardDraft.mcps.includes(name);
    updateWizardDraft({
      mcps: has
        ? wizardDraft.mcps.filter((m) => m !== name)
        : [...wizardDraft.mcps, name],
    });
  }

  function toggleChannel(id: string) {
    const has = wizardDraft.channels.includes(id);
    updateWizardDraft({
      channels: has
        ? wizardDraft.channels.filter((c) => c !== id)
        : [...wizardDraft.channels, id],
    });
  }

  function handleNext() {
    if (wizardStep === 2 && !wizardDraft.name.trim()) {
      setNameError("Informe um nome para o agente");
      return;
    }
    setNameError(null);
    if (wizardStep < MAX_STEP) setWizardStep((wizardStep + 1) as WizardStep);
  }

  function handleBack() {
    if (wizardStep > 1) setWizardStep((wizardStep - 1) as WizardStep);
  }

  async function handleSave() {
    if (!wizardDraft.name.trim()) {
      setWizardStep(2);
      setNameError("Informe um nome para o agente");
      return;
    }
    setSaving(true);
    const bootstrap: Record<string, string> = {};
    if (wizardDraft.persona.trim()) bootstrap["SOUL.md"] = wizardDraft.persona.trim();
    if (wizardDraft.guidelines.trim()) bootstrap["AGENTS.md"] = wizardDraft.guidelines.trim();

    const existingChannelConfigs =
      (editingAgent?.channel_configs as Record<string, { enabled?: boolean } | undefined>) ?? {};
    const knownChannels = new Set<string>([
      ...Object.keys(existingChannelConfigs),
      ...CHANNELS.map((c) => c.id),
    ]);
    const channelConfigs: Record<string, unknown> = {};
    for (const name of knownChannels) {
      const prev = existingChannelConfigs[name] ?? {};
      channelConfigs[name] = {
        ...prev,
        enabled: wizardDraft.channels.includes(name),
      };
    }

    const existingConfig = editingAgent?.agent_config ?? {};
    const nextConfig: AgentConfig = {
      ...existingConfig,
      rag: { ...(existingConfig.rag ?? {}), enabled: wizardDraft.rag_enabled },
      skills_enabled: wizardDraft.skills,
      mcp_servers_enabled: wizardDraft.mcps,
    };

    const payload: Partial<Agent> = {
      name: wizardDraft.name.trim(),
      role: wizardDraft.role,
      description: wizardDraft.description,
      avatar: wizardDraft.avatar || wizardDraft.name.trim().slice(0, 1),
      tools_enabled: wizardDraft.tools,
      agent_config: nextConfig,
      bootstrap,
      channel_configs: channelConfigs,
    };
    try {
      if (editingAgentId) {
        await updateAgent(editingAgentId, payload);
      } else {
        await createAgent({ ...payload, status: "active" });
      }
      resetWizard();
      setEditingAgentId(null);
      setActiveView("agent-team");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-app">
      <PageHeader icon={Sparkles} title={headerTitle} subtitle={headerSubtitle} />

      <Card className="mb-5">
        <CardContent className="p-6 pt-6">
          <Stepper
            steps={STEPS}
            current={wizardStep}
            onJump={(n) => setWizardStep(n as WizardStep)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 pt-6">
          {wizardStep === 1 && (
            <StepTemplate
              templates={templates}
              selectedId={wizardDraft.template_id}
              onSelect={handleSelectTemplate}
            />
          )}

          {wizardStep === 2 && (
            <StepIdentity
              draft={wizardDraft}
              onChange={updateWizardDraft}
              nameError={nameError}
            />
          )}

          {wizardStep === 3 && (
            <StepPersonality
              persona={wizardDraft.persona}
              guidelines={wizardDraft.guidelines}
              onChange={updateWizardDraft}
            />
          )}

          {wizardStep === 4 && (
            <StepCapabilities
              tools={wizardDraft.tools}
              skills={wizardDraft.skills}
              mcps={wizardDraft.mcps}
              customSkills={customSkills}
              mcpServers={mcpServers}
              ragEnabled={wizardDraft.rag_enabled}
              onToggleTool={toggleTool}
              onToggleSkill={toggleSkill}
              onToggleMcp={toggleMcp}
              onToggleRag={(v) => updateWizardDraft({ rag_enabled: v })}
              onOpenSkills={() => setActiveView("skills-catalog")}
              onOpenMcps={() => setActiveView("mcp")}
            />
          )}

          {wizardStep === 5 && (
            <StepChannels
              selected={wizardDraft.channels}
              onToggle={toggleChannel}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-5">
        <Button variant="ghost" onClick={handleBack} disabled={wizardStep === 1}>
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </Button>

        {wizardStep < MAX_STEP ? (
          <Button onClick={handleNext} disabled={!canGoNext}>
            Próximo
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Salvando…" : "Salvar agente"}
          </Button>
        )}
      </div>
    </div>
  );
}

interface StepTemplateProps {
  templates: AgentTemplate[];
  selectedId: string | null;
  onSelect: (t: AgentTemplate | null) => void;
}

function TemplateCard({
  active,
  onClick,
  icon,
  title,
  role,
  description,
  chips,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  role: string;
  description: string;
  chips?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-5 rounded-2xl border bg-surface transition-all cursor-pointer flex flex-col gap-3",
        active
          ? "border-purple ring-2 ring-purple/20"
          : "border-border hover:border-purple/40",
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-purple-muted flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-display font-bold text-base text-text-primary leading-tight">
          {title}
        </h3>
        <p className="text-xs font-semibold text-purple mt-0.5">{role}</p>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary line-clamp-3">
          {description}
        </p>
      </div>
      {chips && <div className="flex flex-wrap gap-1.5">{chips}</div>}
    </button>
  );
}

function StepTemplate({ templates, selectedId, onSelect }: StepTemplateProps) {
  return (
    <div>
      <h2 className="font-display font-bold text-lg text-text-primary">
        Escolha um ponto de partida
      </h2>
      <p className="text-sm text-text-muted mt-1">
        Templates já vêm com identidade, personalidade e capacidades pré-configuradas.
        Você pode ajustar tudo nos próximos passos.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-6">
        <TemplateCard
          active={selectedId === "blank"}
          onClick={() => onSelect(null)}
          icon={<FilePlus className="w-6 h-6 text-purple" />}
          title="Do zero"
          role="Em branco"
          description="Comece sem template e configure cada detalhe manualmente."
        />

        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            active={selectedId === t.id}
            onClick={() => onSelect(t)}
            icon={<Sparkles className="w-6 h-6 text-purple" />}
            title={t.name}
            role={t.role}
            description={t.description}
            chips={
              <>
                {t.rag_enabled && (
                  <Badge variant="muted" className="gap-1">
                    <BookOpen className="w-3 h-3" /> RAG
                  </Badge>
                )}
                {t.tools.slice(0, 3).map((tool) => (
                  <Badge key={tool} variant="code" className="gap-1">
                    <Wrench className="w-3 h-3" /> {tool}
                  </Badge>
                ))}
                {t.tools.length > 3 && (
                  <Badge variant="muted">+{t.tools.length - 3}</Badge>
                )}
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}

interface StepIdentityProps {
  draft: {
    name: string;
    role: string;
    description: string;
    avatar: string;
  };
  onChange: (
    patch: Partial<{ name: string; role: string; description: string; avatar: string }>,
  ) => void;
  nameError: string | null;
}

function StepIdentity({ draft, onChange, nameError }: StepIdentityProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Quem é este agente
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Nome, papel e uma descrição curta — o que aparece no card e no cabeçalho do
          chat. Personalidade e regras vêm no próximo passo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            Nome <span className="text-purple">*</span>
          </Label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ex.: Sofia — SDR Sólides"
            className={cn(nameError && "border-red focus-visible:ring-red/30")}
          />
          {nameError && <p className="text-xs text-red mt-1">{nameError}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Papel</Label>
          <Input
            value={draft.role}
            onChange={(e) => onChange({ role: e.target.value })}
            placeholder="Ex.: SDR B2B"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[8rem_1fr]">
        <div className="space-y-1.5">
          <Label>Avatar</Label>
          <Input
            value={draft.avatar}
            onChange={(e) => onChange({ avatar: e.target.value })}
            placeholder="S"
            maxLength={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={2}
            placeholder="Resuma em 1-2 linhas o que este agente faz."
          />
        </div>
      </div>
    </div>
  );
}

interface StepPersonalityProps {
  persona: string;
  guidelines: string;
  onChange: (patch: { persona?: string; guidelines?: string }) => void;
}

function StepPersonality({ persona, guidelines, onChange }: StepPersonalityProps) {
  const [showGuidelines, setShowGuidelines] = useState(guidelines.trim().length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Personalidade
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Como o agente se comunica e o que ele deve evitar. Você pode refinar depois
          conversando com ele.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Como este agente se comunica</Label>
        <Textarea
          value={persona}
          onChange={(e) => onChange({ persona: e.target.value })}
          rows={6}
          placeholder="Ex.: Cordial, direta ao ponto, usa emojis com moderação. Trata quem chega como colega, evita jargão técnico e sempre confirma antes de agir em ações irreversíveis."
        />
        <p className="text-[11px] text-text-muted">
          Tom, estilo, jeito de falar. Somado à personalidade padrão do Sólides
          Orquestrador.
        </p>
      </div>

      {!showGuidelines ? (
        <button
          type="button"
          onClick={() => setShowGuidelines(true)}
          className="text-sm font-semibold text-purple hover:text-purple-hover"
        >
          + Adicionar regras específicas (opcional)
        </button>
      ) : (
        <div className="space-y-1.5">
          <Label>Regras e limites específicos</Label>
          <Textarea
            value={guidelines}
            onChange={(e) => onChange({ guidelines: e.target.value })}
            rows={5}
            placeholder="Ex.: Nunca prometa prazos sem confirmar com o gestor. Escalona para humano quando o cliente pede reembolso. Não discute concorrentes."
          />
          <p className="text-[11px] text-text-muted">
            Regras rígidas de comportamento — quando escalona, o que evita, políticas.
          </p>
        </div>
      )}
    </div>
  );
}

interface StepCapabilitiesProps {
  tools: string[];
  skills: string[];
  mcps: string[];
  customSkills: CustomSkill[];
  mcpServers: MCPServer[];
  ragEnabled: boolean;
  onToggleTool: (id: string) => void;
  onToggleSkill: (name: string) => void;
  onToggleMcp: (name: string) => void;
  onToggleRag: (v: boolean) => void;
  onOpenSkills: () => void;
  onOpenMcps: () => void;
}

function StepCapabilities({
  tools,
  skills,
  mcps,
  customSkills,
  mcpServers,
  ragEnabled,
  onToggleTool,
  onToggleSkill,
  onToggleMcp,
  onToggleRag,
  onOpenSkills,
  onOpenMcps,
}: StepCapabilitiesProps) {
  const grouped = BUILTIN_TOOLS.reduce<Record<string, BuiltinTool[]>>(
    (acc, tool) => {
      (acc[tool.cat] ??= []).push(tool);
      return acc;
    },
    {},
  );

  const activeToolsCount = tools.length;
  const activeSkillsCount = skills.length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          O que este agente sabe fazer
        </h2>
        <p className="text-sm text-text-muted mt-1">
          <span className="font-semibold text-text-primary">{activeToolsCount}</span>{" "}
          ferramentas ·{" "}
          <span className="font-semibold text-text-primary">{activeSkillsCount}</span>{" "}
          skills ativas
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-border bg-surface">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-muted flex items-center justify-center text-purple shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">
              Consulta a base de conhecimento (RAG)
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Ativa consulta a documentos e FAQs próprios ao responder. Configure a
              base em <span className="font-semibold">Bases RAG / FAQ</span>.
            </p>
          </div>
        </div>
        <Switch checked={ragEnabled} onCheckedChange={onToggleRag} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Ferramentas
            </h3>
            <p className="text-[11px] text-text-muted">
              Capacidades nativas do sistema.
            </p>
          </div>
        </div>
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, catTools]) => (
            <div key={cat}>
              <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                {cat}
              </p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {catTools.map((tool) => {
                  const checked = tools.includes(tool.id);
                  return (
                    <label
                      key={tool.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                        checked
                          ? "border-purple bg-purple-muted"
                          : "border-border bg-surface hover:border-purple/40",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onToggleTool(tool.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {tool.name}
                        </p>
                        <p className="text-[11px] text-text-muted font-mono truncate">
                          {tool.id}
                        </p>
                      </div>
                      {tool.warn && (
                        <AlertTriangle
                          className="w-4 h-4 text-yellow shrink-0"
                          aria-label="Use com cuidado"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Skills
            </h3>
            <p className="text-[11px] text-text-muted">
              Procedimentos customizados que amarram ferramentas em rotinas.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenSkills}>
            <Zap className="w-4 h-4" />
            Minhas Skills
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>

        {customSkills.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-6 text-center">
            <p className="text-sm text-text-secondary">
              Você ainda não tem skills customizadas.
            </p>
            <p className="text-xs text-text-muted mt-1">
              Crie skills conversando com o agente ou pela página{" "}
              <span className="font-semibold">Minhas Skills</span> — elas podem usar
              APIs conectadas (MCPs) para automatizar tarefas específicas.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button size="sm" variant="subtle" onClick={onOpenSkills}>
                <Zap className="w-4 h-4" /> Criar skill
              </Button>
              <Button size="sm" variant="ghost" onClick={onOpenMcps}>
                <Plug className="w-4 h-4" /> Conectar API (MCP)
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {customSkills.map((s) => {
              const checked = skills.includes(s.name);
              return (
                <label
                  key={s.name}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    checked
                      ? "border-purple bg-purple-muted"
                      : "border-border bg-surface hover:border-purple/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleSkill(s.name)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {s.name}
                    </p>
                    {s.description && (
                      <p className="text-[11px] text-text-muted line-clamp-2 mt-0.5">
                        {s.description}
                      </p>
                    )}
                    {s.always_active === 1 && (
                      <Badge variant="muted" className="mt-1.5">
                        Sempre ativa
                      </Badge>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">
              APIs conectadas (MCPs)
            </h3>
            <p className="text-[11px] text-text-muted">
              Servidores MCP que este agente pode invocar.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenMcps}>
            <Plug className="w-4 h-4" />
            Meus MCPs
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>

        {mcpServers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-6 text-center">
            <p className="text-sm text-text-secondary">
              Você ainda não conectou nenhum MCP.
            </p>
            <p className="text-xs text-text-muted mt-1">
              Conecte APIs externas em{" "}
              <span className="font-semibold">APIs conectadas (MCP)</span> para
              disponibilizar ferramentas customizadas.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button size="sm" variant="subtle" onClick={onOpenMcps}>
                <Plug className="w-4 h-4" /> Conectar MCP
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {mcpServers.map((server) => {
              const checked = mcps.includes(server.name);
              const isSSE = !!server.url;
              const endpoint = isSSE
                ? server.url
                : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
              return (
                <label
                  key={server.name}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    checked
                      ? "border-purple bg-purple-muted"
                      : "border-border bg-surface hover:border-purple/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleMcp(server.name)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {server.name}
                    </p>
                    <p className="text-[11px] text-text-muted font-mono truncate mt-0.5">
                      {endpoint || (isSSE ? "URL não configurada" : "sem comando")}
                    </p>
                    <Badge variant="muted" className="mt-1.5">
                      {isSSE ? "HTTP / SSE" : "stdio"}
                    </Badge>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

interface StepChannelsProps {
  selected: string[];
  onToggle: (id: string) => void;
}

function StepChannels({ selected, onToggle }: StepChannelsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Onde este agente atua
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Marque os canais onde o agente pode receber mensagens. Tokens e webhooks
          são configurados em <span className="font-semibold">WhatsApp / Canais</span>{" "}
          depois.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {CHANNELS.map((ch) => {
          const checked = selected.includes(ch.id);
          return (
            <label
              key={ch.id}
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors",
                checked
                  ? "border-purple bg-purple-muted"
                  : "border-border bg-surface hover:border-purple/40",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(ch.id)}
              />
              <span className="text-sm font-semibold text-text-primary">
                {ch.label}
              </span>
            </label>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-surface-alt p-4 text-xs text-text-secondary">
        Ao salvar, o agente é criado com status ativo. Modelo LLM, temperatura e
        janelas de memória ficam em{" "}
        <span className="font-semibold">Configurações do agente</span> após criar.
      </div>
    </div>
  );
}
