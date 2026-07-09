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
  Search,
  X,
  ChevronDown,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import { useStore, type WizardStep } from "@/lib/store";
import { PageHeader } from "../PageHeader";
import { IconPicker } from "@/components/IconPicker";
import { getIcon } from "@/lib/iconCatalog";
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
  getAgentTemplateDetail,
  getBuiltinSkills,
  getCustomSkills,
  getMcpConfig,
  listIntegrations,
  getAgentEmbed,
  enableAgentEmbed,
  disableAgentEmbed,
  type Agent,
  type AgentConfig,
  type AgentEmbedState,
  type AgentTemplate,
  type BuiltinSkill,
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
  { id: "publish_page", name: "Gerador de página", cat: "Relatórios & Páginas" },
  { id: "publish_report", name: "Relatório estruturado", cat: "Relatórios & Páginas" },
  { id: "azure_devops_report", name: "Relatório Azure DevOps", cat: "Relatórios & Páginas" },
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
  { key: 3, label: "Instruções" },
  { key: 4, label: "Ferramentas" },
  { key: 5, label: "Skills & Conhecimento" },
  { key: 6, label: "Canais" },
];

const MAX_STEP: WizardStep = 6;

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
  const [builtinSkills, setBuiltinSkills] = useState<BuiltinSkill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [activeIntegrations, setActiveIntegrations] = useState<Set<string>>(new Set());
  const recommendedSkills = useMemo(
    () => templates.find((t) => t.id === wizardDraft.template_id)?.recommended_skills ?? [],
    [templates, wizardDraft.template_id],
  );

  useEffect(() => {
    if (templates.length === 0) loadTemplates();
  }, [templates.length, loadTemplates]);

  useEffect(() => {
    getCustomSkills()
      .then(setCustomSkills)
      .catch(() => setCustomSkills([]));
    getBuiltinSkills()
      .then(setBuiltinSkills)
      .catch(() => setBuiltinSkills([]));
    getMcpConfig()
      .then((d) => setMcpServers(d.mcpServers ?? []))
      .catch(() => setMcpServers([]));
    listIntegrations()
      .then((list) =>
        setActiveIntegrations(
          new Set(
            list
              .filter((i) => i.enabled && i.system_integration_id)
              .map((i) => i.system_integration_id as string),
          ),
        ),
      )
      .catch(() => setActiveIntegrations(new Set()));
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
    updateWizardDraft({ mcps: mcpServers.map((s) => s.name) });
  }, [mcpServers, editingAgentId, updateWizardDraft]);

  const editingAgent = useMemo(
    () => (editingAgentId ? agents.find((a) => a.agent_id === editingAgentId) : null),
    [editingAgentId, agents],
  );

  const headerTitle = editingAgent ? `Editar ${editingAgent.name}` : "Novo agente";
  const headerSubtitle = editingAgent
    ? "Ajuste identidade, personalidade, capacidades e canais deste agente."
    : "6 passos: escolher template, definir identidade, personalidade, ferramentas, skills e onde ele atua.";

  const canGoNext = (() => {
    if (wizardStep === 1) return Boolean(wizardDraft.template_id);
    if (wizardStep === 2) return wizardDraft.name.trim().length > 0;
    return true;
  })();

  async function handleSelectTemplate(t: AgentTemplate | null) {
    if (t) {
      updateWizardDraft({
        template_id: t.id,
        name: t.name,
        role: t.role,
        description: t.description,
        avatar: t.icon,
        persona: t.system_prompt,
        guidelines: t.guardrails || "",
        tools: t.tools,
        rag_enabled: t.rag_enabled,
        starter_prompts: t.starter_prompts,
      });
      try {
        const detail = await getAgentTemplateDetail(t.id);
        updateWizardDraft({
          skills: Array.from(
            new Set([
              ...detail.skills.map((s) => s.name),
              ...(detail.recommended_skills ?? []),
            ]),
          ),
        });
      } catch {
        // detail is a hint; keep skills from customSkills sync effect
      }
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
        starter_prompts: [],
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
      avatar: wizardDraft.avatar || "sparkles",
      tools_enabled: wizardDraft.tools,
      agent_config: nextConfig,
      bootstrap,
      channel_configs: channelConfigs,
    };
    try {
      if (editingAgentId) {
        await updateAgent(editingAgentId, payload);
      } else {
        const templateId = wizardDraft.template_id ?? "custom";
        const createPayload: Partial<Agent> = {
          ...payload,
          status: "active",
          metadata: {
            ...(payload.metadata ?? {}),
            template: templateId === "existing" ? "custom" : templateId,
          },
        };
        await createAgent(createPayload);
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
            <StepTools
              tools={wizardDraft.tools}
              onToggleTool={toggleTool}
            />
          )}

          {wizardStep === 5 && (
            <StepKnowledge
              skills={wizardDraft.skills}
              mcps={wizardDraft.mcps}
              customSkills={customSkills}
              builtinSkills={builtinSkills}
              activeIntegrations={activeIntegrations}
              recommendedSkills={recommendedSkills}
              mcpServers={mcpServers}
              ragEnabled={wizardDraft.rag_enabled}
              onToggleSkill={toggleSkill}
              onToggleMcp={toggleMcp}
              onToggleRag={(v) => updateWizardDraft({ rag_enabled: v })}
              onOpenSkills={() => setActiveView("skills-catalog")}
              onOpenMcps={() => setActiveView("mcp")}
            />
          )}

          {wizardStep === 6 && (
            <StepChannels
              selected={wizardDraft.channels}
              onToggle={toggleChannel}
              agentId={editingAgentId}
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

        {templates.filter((t) => t.id !== "blank").map((t) => {
          const TplIcon = getIcon(t.icon);
          return (
          <TemplateCard
            key={t.id}
            active={selectedId === t.id}
            onClick={() => onSelect(t)}
            icon={<TplIcon className="w-6 h-6 text-purple" />}
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
          );
        })}
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
    starter_prompts: string[];
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
          chat. As instruções que definem o comportamento vêm no próximo passo.
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

      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          placeholder="Resuma em 1-2 linhas o que este agente faz."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Ícone</Label>
        <IconPicker
          value={draft.avatar}
          onChange={(slug) => onChange({ avatar: slug })}
        />
      </div>

      {draft.starter_prompts.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div>
            <Label className="text-xs text-text-muted">Prompts sugeridos</Label>
            <p className="text-xs text-text-muted mt-0.5">
              Aparecerão como atalhos no chat inicial para orientar o cliente.
            </p>
          </div>
          <ul className="space-y-1.5">
            {draft.starter_prompts.map((p, i) => (
              <li
                key={i}
                className="text-sm text-text-secondary bg-surface-muted rounded-lg px-3 py-2 border border-border"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
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
  const [personaExpanded, setPersonaExpanded] = useState(false);
  const [guidelinesExpanded, setGuidelinesExpanded] = useState(false);

  const personaChars = persona.length;
  const guidelinesChars = guidelines.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Instruções do agente
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Como o agente age, o que priorizar e o que nunca fazer. Se você escolheu
          um template, já veio um rascunho pronto — ajuste conforme sua realidade.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">
            Instruções principais <span className="text-purple">*</span>
          </Label>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span>{personaChars.toLocaleString("pt-BR")} caracteres</span>
            <button
              type="button"
              onClick={() => setPersonaExpanded((v) => !v)}
              className="text-purple hover:text-purple-hover font-semibold"
            >
              {personaExpanded ? "Recolher" : "Expandir"}
            </button>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Papel, objetivo, tom de voz, como se apresentar, o que priorizar.
          Equivale ao prompt do sistema.
        </p>
        <Textarea
          variant="code"
          value={persona}
          onChange={(e) => onChange({ persona: e.target.value })}
          rows={personaExpanded ? 32 : 16}
          className="leading-relaxed text-[13px] p-4"
          placeholder={`Ex.: Você é a Ana, assistente de DP da empresa.

- Ajuda colaboradores com dúvidas sobre folha, férias e benefícios.
- Responde de forma cordial e direta, sempre em português do Brasil.
- Cita a política interna quando aplicável.
- Escalona para o RH humano quando o pedido envolve exceção.`}
        />
      </div>

      {!showGuidelines ? (
        <button
          type="button"
          onClick={() => setShowGuidelines(true)}
          className="text-sm font-semibold text-purple hover:text-purple-hover"
        >
          + Adicionar regras e limites (opcional)
        </button>
      ) : (
        <div className="space-y-2 border-t border-border pt-5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">
              Regras e limites{" "}
              <span className="text-text-muted font-normal">(opcional)</span>
            </Label>
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
              <span>{guidelinesChars.toLocaleString("pt-BR")} caracteres</span>
              <button
                type="button"
                onClick={() => setGuidelinesExpanded((v) => !v)}
                className="text-purple hover:text-purple-hover font-semibold"
              >
                {guidelinesExpanded ? "Recolher" : "Expandir"}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Restrições rígidas — o que nunca fazer, quando escalonar. Fica em
            bloco separado para receber peso extra.
          </p>
          <Textarea
            variant="code"
            value={guidelines}
            onChange={(e) => onChange({ guidelines: e.target.value })}
            rows={guidelinesExpanded ? 24 : 10}
            className="leading-relaxed text-[13px] p-4"
            placeholder={`Ex.:
- Nunca prometa prazo sem confirmar com o gestor.
- Escalonar para humano quando pedir reembolso.
- Não discutir concorrentes.`}
          />
        </div>
      )}
    </div>
  );
}

interface SkillEntry {
  name: string;
  description: string;
  category: string;
  always: boolean;
  origin: "system" | "user";
  importance?: "core" | "complementary";
  provides?: string;
  requiredIntegrations?: string[];
}

interface SkillsPickerProps {
  skills: string[];
  customSkills: CustomSkill[];
  builtinSkills: BuiltinSkill[];
  activeIntegrations: Set<string>;
  recommendedSkills: string[];
  onToggleSkill: (name: string) => void;
  onOpenSkills: () => void;
}

function SkillsPicker({
  skills,
  customSkills,
  builtinSkills,
  activeIntegrations,
  recommendedSkills,
  onToggleSkill,
  onOpenSkills,
}: SkillsPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const missingDeps = (s: SkillEntry) =>
    (s.requiredIntegrations ?? []).length > 0 &&
    !s.requiredIntegrations!.some((id) => activeIntegrations.has(id));

  const allSkills = useMemo<SkillEntry[]>(() => {
    const customNames = new Set(customSkills.map((s) => s.name));
    const system: SkillEntry[] = builtinSkills
      .filter((s) => !customNames.has(s.name))
      .filter((s) => (s.category || "").toLowerCase() !== "sistema")
      .map((s) => ({
        name: s.name,
        description: s.description ?? "",
        category: s.category || "Geral",
        always: !!s.always,
        origin: "system" as const,
        importance: s.importance,
        provides: s.provides,
        requiredIntegrations: s.required_integrations ?? [],
      }));
    const user: SkillEntry[] = customSkills.map((s) => ({
      name: s.name,
      description: s.description ?? "",
      category: "Suas skills",
      always: s.always_active === 1,
      origin: "user" as const,
    }));
    return [...system, ...user];
  }, [builtinSkills, customSkills]);

  const byName = useMemo(() => {
    const map = new Map<string, SkillEntry>();
    for (const s of allSkills) map.set(s.name, s);
    return map;
  }, [allSkills]);

  const categoryOrder = [
    "Comportamental", "R&S", "T&D", "Ponto", "DP", "Jurídico",
    "Engajamento", "Onboarding", "Geral", "Suas skills",
  ];
  const categories = useMemo(() => {
    const set = new Set(allSkills.map((s) => s.category));
    return Array.from(set).sort(
      (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
    );
  }, [allSkills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allSkills
      .filter((s) => (category === "all" ? true : s.category === category))
      .filter((s) =>
        q.length === 0
          ? true
          : s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const catDiff =
          categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
        if (catDiff !== 0) return catDiff;
        return a.name.localeCompare(b.name);
      });
  }, [allSkills, query, category]);

  const enabled = skills
    .map((n) => byName.get(n))
    .filter((s): s is SkillEntry => !!s);

  const recommendedSet = useMemo(() => new Set(recommendedSkills), [recommendedSkills]);
  const recommended = filtered.filter((s) => recommendedSet.has(s.name));
  const others = filtered.filter((s) => !recommendedSet.has(s.name));

  const renderRow = (s: SkillEntry) => {
    const checked = skills.includes(s.name);
    const blocked = missingDeps(s);
    const isRec = recommendedSet.has(s.name);
    return (
      <li key={s.name}>
        <label
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 transition-colors",
            blocked
              ? "opacity-60 cursor-not-allowed"
              : "cursor-pointer hover:bg-surface",
            checked && !blocked && "bg-purple-muted/40",
          )}
        >
          <Checkbox
            checked={checked && !blocked}
            disabled={blocked}
            onCheckedChange={() => !blocked && onToggleSkill(s.name)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-text-primary truncate">{s.name}</p>
              {isRec && (
                <Badge variant="default" className="shrink-0 text-[10px]">
                  Recomendada
                </Badge>
              )}
              <Badge variant="muted" className="shrink-0 text-[10px]">
                {s.category}
              </Badge>
              {s.importance === "complementary" && (
                <Badge variant="muted" className="shrink-0 text-[10px]">
                  Complementar
                </Badge>
              )}
              {s.always && (
                <Badge variant="muted" className="shrink-0 text-[10px]">
                  Sempre ativa
                </Badge>
              )}
              {blocked && (
                <Badge variant="default" className="shrink-0 text-[10px]">
                  requer {s.requiredIntegrations!.join(" ou ")} (inativa)
                </Badge>
              )}
            </div>
            {(s.provides || s.description) && (
              <p className="text-[11px] text-text-muted truncate mt-0.5">
                {s.provides ? `Oferece: ${s.provides}` : s.description}
              </p>
            )}
          </div>
        </label>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
            Habilitadas neste agente ({enabled.length})
          </p>
          {enabled.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => enabled.forEach((s) => onToggleSkill(s.name))}
            >
              Limpar tudo
            </Button>
          )}
        </div>
        {enabled.length === 0 ? (
          <p className="text-xs text-text-muted">
            Nenhuma skill habilitada. Busque abaixo para adicionar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {enabled.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => onToggleSkill(s.name)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-muted text-purple hover:bg-purple/20 transition-colors"
                title={s.description}
              >
                <span className="truncate max-w-[200px]">{s.name}</span>
                <span className="text-[10px] opacity-70">· {s.category}</span>
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar skill por nome ou descrição"
            className="pl-9"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:border-purple sm:w-56"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={onOpenSkills}>
          <Zap className="w-4 h-4" /> Nova skill
        </Button>
      </div>

      {recommended.length > 0 && (
        <div className="rounded-2xl border border-purple/40 bg-purple-muted/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-purple/30">
            <p className="text-[11px] font-bold text-purple uppercase tracking-wider">
              Recomendadas para este agente ({recommended.length})
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Skills sugeridas para este template — já vêm marcadas.
            </p>
          </div>
          <ul className="divide-y divide-border">{recommended.map(renderRow)}</ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface-alt max-h-[420px] overflow-y-auto">
        {recommended.length > 0 && others.length > 0 && (
          <div className="px-3 py-2 border-b border-border sticky top-0 bg-surface-alt">
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Outras skills
            </p>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-text-muted">
              Nenhuma skill encontrada.
            </p>
          </div>
        ) : others.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-text-muted">
              Nenhuma outra skill nesta busca.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">{others.map(renderRow)}</ul>
        )}
      </div>
    </div>
  );
}

interface StepToolsProps {
  tools: string[];
  onToggleTool: (id: string) => void;
}

function StepTools({ tools, onToggleTool }: StepToolsProps) {
  const grouped = BUILTIN_TOOLS.reduce<Record<string, BuiltinTool[]>>(
    (acc, tool) => {
      (acc[tool.cat] ??= []).push(tool);
      return acc;
    },
    {},
  );
  const cats = Object.keys(grouped);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(cats.map((c) => [c, true])),
  );

  const toggleCat = (c: string) => setOpen((prev) => ({ ...prev, [c]: !prev[c] }));
  const allOpen = cats.every((c) => open[c]);
  const setAll = (v: boolean) =>
    setOpen(Object.fromEntries(cats.map((c) => [c, v])));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Ferramentas
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Ações brutas que o agente pode executar: clicar, ler arquivo, buscar na
          web, salvar memória. No próximo passo você amarra essas ações em{" "}
          <span className="font-semibold text-text-primary">skills</span>{" "}
          (procedimentos) que orientam quando e como usá-las.
        </p>
        <p className="text-sm text-text-muted mt-2">
          <span className="font-semibold text-text-primary">{tools.length}</span>{" "}
          ferramentas ativas de {BUILTIN_TOOLS.length}
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={() => setAll(!allOpen)}>
          {allOpen ? "Recolher tudo" : "Expandir tudo"}
        </Button>
      </div>

      <div className="space-y-3">
        {cats.map((cat) => {
          const catTools = grouped[cat];
          const activeCount = catTools.filter((t) => tools.includes(t.id)).length;
          const isOpen = open[cat];
          return (
            <div
              key={cat}
              className="rounded-2xl border border-border bg-surface overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-alt transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-text-muted transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                  />
                  <span className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    {cat}
                  </span>
                  <Badge variant="muted" className="text-[10px]">
                    {activeCount}/{catTools.length}
                  </Badge>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {catTools.map((tool) => {
                    const checked = tools.includes(tool.id);
                    return (
                      <label
                        key={tool.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                          checked
                            ? "border-purple bg-purple-muted"
                            : "border-border bg-surface-alt hover:border-purple/40",
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StepKnowledgeProps {
  skills: string[];
  mcps: string[];
  customSkills: CustomSkill[];
  builtinSkills: BuiltinSkill[];
  activeIntegrations: Set<string>;
  recommendedSkills: string[];
  mcpServers: MCPServer[];
  ragEnabled: boolean;
  onToggleSkill: (name: string) => void;
  onToggleMcp: (name: string) => void;
  onToggleRag: (v: boolean) => void;
  onOpenSkills: () => void;
  onOpenMcps: () => void;
}

function StepKnowledge({
  skills,
  mcps,
  customSkills,
  builtinSkills,
  activeIntegrations,
  recommendedSkills,
  mcpServers,
  ragEnabled,
  onToggleSkill,
  onToggleMcp,
  onToggleRag,
  onOpenSkills,
  onOpenMcps,
}: StepKnowledgeProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Skills & Conhecimento
        </h2>
        <p className="text-sm text-text-muted mt-1">
          <span className="font-semibold text-text-primary">Skills</span> são
          procedimentos em markdown que ensinam o agente a executar rotinas
          (ex.: "aprovar ponto", "triar currículo") usando as ferramentas do
          passo anterior. A <span className="font-semibold text-text-primary">base RAG</span>{" "}
          consulta seus documentos ao responder. <span className="font-semibold text-text-primary">MCPs</span>{" "}
          conectam APIs externas como novas ferramentas.
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

        <SkillsPicker
          skills={skills}
          customSkills={customSkills}
          builtinSkills={builtinSkills}
          activeIntegrations={activeIntegrations}
          recommendedSkills={recommendedSkills}
          onToggleSkill={onToggleSkill}
          onOpenSkills={onOpenSkills}
        />
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
  agentId: string | null;
}

function StepChannels({ selected, onToggle, agentId }: StepChannelsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-bold text-lg text-text-primary">
          Onde este agente atua
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Marque os canais onde o agente pode receber mensagens. Tokens e webhooks
          são configurados em <span className="font-semibold">Canais de Comunicação</span>{" "}
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

      <EmbedWidgetSection agentId={agentId} />

      <div className="rounded-2xl border border-border bg-surface-alt p-4 text-xs text-text-secondary">
        Ao salvar, o agente é criado com status ativo. Modelo LLM, temperatura e
        janelas de memória ficam em{" "}
        <span className="font-semibold">Configurações do agente</span> após criar.
      </div>
    </div>
  );
}

interface EmbedWidgetSectionProps {
  agentId: string | null;
}

function EmbedWidgetSection({ agentId }: EmbedWidgetSectionProps) {
  const [state, setState] = useState<AgentEmbedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setState(null);
      return;
    }
    let alive = true;
    setLoading(true);
    getAgentEmbed(agentId)
      .then((s) => {
        if (alive) setState(s);
      })
      .catch((e) => {
        if (alive) setError(e?.message || "Falha ao carregar");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [agentId]);

  if (!agentId) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-4 text-xs text-text-secondary">
        <div className="flex items-center gap-2 font-semibold text-text-primary text-sm">
          <Globe className="w-4 h-4" />
          Publicar como widget no seu site
        </div>
        <p className="mt-1">
          Salve o agente primeiro para gerar o código de incorporação (iframe).
        </p>
      </div>
    );
  }

  const enabled = !!state?.enabled;

  const handleToggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = enabled
        ? await disableAgentEmbed(agentId)
        : await enableAgentEmbed(agentId);
      setState(next);
    } catch (e) {
      setError((e as Error)?.message || "Falha ao atualizar");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!state?.snippet) return;
    try {
      await navigator.clipboard.writeText(state.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Não foi possível copiar. Copie manualmente.");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-semibold text-text-primary text-sm">
            <Globe className="w-4 h-4" />
            Publicar como widget no seu site
          </div>
          <p className="text-xs text-text-muted mt-1">
            Gera um link público e um trecho{" "}
            <code className="font-mono">&lt;iframe&gt;</code> para incorporar o
            chat deste agente em qualquer página.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={loading}
        />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {enabled && state && (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Link público</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={state.url} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(state.url, "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                Abrir
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Código para incorporar</Label>
            <Textarea
              readOnly
              value={state.snippet}
              rows={4}
              className="font-mono text-xs mt-1"
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar snippet
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-text-muted">
            Qualquer pessoa com o link poderá conversar com este agente. Desative
            para revogar o acesso.
          </p>
        </div>
      )}
    </div>
  );
}
