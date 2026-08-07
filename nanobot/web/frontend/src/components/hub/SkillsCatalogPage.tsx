import { useEffect, useMemo, useState } from "react";
import {
  Wrench,
  Loader2,
  Plus,
  MessageSquarePlus,
  Save,
  Trash2,
  Lock,
  Building2,
  User,
  Search,
  Sparkles,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  getBuiltinSkills,
  getCustomSkills,
  updateCustomSkill,
  deleteCustomSkill,
  type BuiltinSkill,
  type CustomSkill,
} from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Agent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

type ListItem =
  | { kind: "builtin"; skill: BuiltinSkill }
  | { kind: "custom"; skill: CustomSkill };

type Filter = "all" | "mine" | "solides" | "builtin";

/** Which agents actually see this skill.
 *
 *  A null ``skills_enabled`` is an open list and sees everything; any list is an
 *  explicit choice. Used by the detail panel and by the list, so "nobody uses
 *  this" means the same thing in both places. */
function agentsUsing(skillName: string, agents: Agent[]): Agent[] {
  return agents.filter((agent) => {
    const list = agent.agent_config?.skills_enabled;
    return list == null || list.includes(skillName);
  });
}

function itemBucket(item: ListItem): "mine" | "solides" | "builtin" {
  if (item.kind === "builtin") {
    return item.skill.template_id ? "solides" : "builtin";
  }
  return item.skill.origin === "solides" ? "solides" : "mine";
}

interface DraftState {
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  always_active: boolean;
  isNew: boolean;
  originalName: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  description: "",
  content: "",
  enabled: true,
  always_active: false,
  isNew: true,
  originalName: "",
};

const SKILL_TEMPLATE = `# Descrição curta

Explique quando esta skill deve ser acionada.

## Passos

1. Primeiro faça …
2. Depois valide …
3. Se der erro, escalone …

## Regras

- Nunca envie …
- Sempre confirme antes de …
`;

const SKILL_AUTHOR_TEMPLATE_ID = "skill_author";

export function SkillsCatalogPage() {
  const setActiveView = useStore((s) => s.setActiveView);
  const systemAgents = useStore((s) => s.systemAgents);
  const agents = useStore((s) => s.agents);
  const loadAgents = useStore((s) => s.loadAgents);
  const updateAgent = useStore((s) => s.updateAgent);
  const templates = useStore((s) => s.templates);
  const selectAgent = useStore((s) => s.selectAgent);
  const createAgent = useStore((s) => s.createAgent);
  const loadTemplates = useStore((s) => s.loadTemplates);

  const [startingChat, setStartingChat] = useState(false);

  const [builtin, setBuiltin] = useState<BuiltinSkill[]>([]);
  const [custom, setCustom] = useState<CustomSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ListItem | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, [agents.length, loadAgents]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [b, c] = await Promise.all([
        getBuiltinSkills().catch(() => []),
        getCustomSkills().catch(() => []),
      ]);
      if (cancelled) return;
      setBuiltin(b);
      setCustom(c);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const customNames = new Set(custom.map((s) => s.name));
    return [
      ...custom.map<ListItem>((s) => ({ kind: "custom", skill: s })),
      ...builtin
        .filter((s) => !customNames.has(s.name))
        .map<ListItem>((s) => ({ kind: "builtin", skill: s })),
    ];
  }, [builtin, custom]);

  const counts = useMemo(() => {
    const c = { all: items.length, mine: 0, solides: 0, builtin: 0 };
    for (const it of items) c[itemBucket(it)]++;
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && itemBucket(it) !== filter) return false;
      if (!term) return true;
      return (
        it.skill.name.toLowerCase().includes(term) ||
        (it.skill.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [items, filter, query]);

  /** Groups only when nothing is narrowing the list — with a filter or a search
   *  term the headers would just repeat what the user already asked for. */
  const groups = useMemo(() => {
    const labels: Record<string, string> = {
      mine: "Minhas",
      solides: "Sólides",
      builtin: "Da ferramenta",
    };
    if (filter !== "all" || query.trim()) {
      return [{ key: "flat", label: "", items: visibleItems }];
    }
    return (["mine", "solides", "builtin"] as const)
      .map((key) => ({
        key,
        label: labels[key],
        items: visibleItems.filter((it) => itemBucket(it) === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [visibleItems, filter, query]);

  /** Skills that exist and reach no agent. Saving a skill does not enable it
   *  anywhere, so created and in-use are different things.
   *
   *  Only yours and the Sólides ones: most platform builtins are unused on
   *  purpose (nobody needs `tmux` enabled), and listing them would bury the
   *  signal that matters — a skill you wrote that nothing runs. */
  const orphans = useMemo(
    () => (agents.length === 0 ? [] : items.filter(
      (it) => itemBucket(it) !== "builtin"
        && agentsUsing(it.skill.name, agents).length === 0,
    )),
    [items, agents],
  );

  function selectItem(item: ListItem) {
    setSelected(item);
    if (item.kind === "custom") {
      setDraft({
        name: item.skill.name,
        description: item.skill.description ?? "",
        content: item.skill.content ?? "",
        enabled: item.skill.enabled === 1,
        always_active: item.skill.always_active === 1,
        isNew: false,
        originalName: item.skill.name,
      });
    } else {
      setDraft(null);
    }
  }

  function openCreate() {
    setCreateName("");
    setCreateNameError(null);
    setCreateOpen(true);
  }

  function confirmCreate() {
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateNameError("Informe um nome");
      return;
    }
    if (custom.some((s) => s.name === trimmed) || builtin.some((s) => s.name === trimmed)) {
      setCreateNameError("Já existe uma skill com esse nome");
      return;
    }
    const newDraft: DraftState = {
      ...EMPTY_DRAFT,
      name: trimmed,
      originalName: trimmed,
      content: SKILL_TEMPLATE,
    };
    setDraft(newDraft);
    setSelected({
      kind: "custom",
      skill: {
        name: trimmed,
        description: "",
        content: SKILL_TEMPLATE,
        always_active: 0,
        enabled: 1,
      },
    });
    setCreateOpen(false);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateCustomSkill(draft.name, {
        content: draft.content,
        description: draft.description,
        always_active: draft.always_active ? 1 : 0,
        enabled: draft.enabled ? 1 : 0,
      });
      const previousOrigin =
        selected?.kind === "custom" ? selected.skill.origin : undefined;
      const saved: CustomSkill = {
        name: draft.name,
        description: draft.description,
        content: draft.content,
        always_active: draft.always_active ? 1 : 0,
        enabled: draft.enabled ? 1 : 0,
        origin: previousOrigin,
      };
      setCustom((prev) => {
        const idx = prev.findIndex((s) => s.name === draft.originalName);
        if (idx === -1) return [saved, ...prev];
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
      setDraft({ ...draft, isNew: false, originalName: draft.name });
      setSelected({ kind: "custom", skill: saved });
      toast("success", `Skill "${draft.name}" salva`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft || draft.isNew) return;
    setConfirmDelete(false);
    await deleteCustomSkill(draft.originalName);
    setCustom((prev) => prev.filter((s) => s.name !== draft.originalName));
    setSelected(null);
    setDraft(null);
    toast("success", "Skill excluída");
  }

  async function openChat() {
    if (startingChat) return;
    setStartingChat(true);
    try {
      const existing = systemAgents.find(
        (a) =>
          (a.metadata as { template?: string } | undefined)?.template ===
          SKILL_AUTHOR_TEMPLATE_ID,
      );
      if (existing) {
        await selectAgent(existing.agent_id);
        setActiveView("chat");
        return;
      }

      let tpl = templates.find((t) => t.id === SKILL_AUTHOR_TEMPLATE_ID);
      if (!tpl) {
        await loadTemplates();
        tpl = useStore
          .getState()
          .templates.find((t) => t.id === SKILL_AUTHOR_TEMPLATE_ID);
      }
      if (!tpl) {
        toast("error", "Template do Criador de Skills não encontrado.");
        return;
      }

      const created = await createAgent({
        name: tpl.name,
        role: tpl.role,
        description: tpl.description,
        metadata: { template: SKILL_AUTHOR_TEMPLATE_ID, system: true },
        status: "active",
      });
      if (!created) {
        toast("error", "Não foi possível criar o Criador de Skills.");
        return;
      }
      await selectAgent(created.agent_id);
      setActiveView("chat");
    } finally {
      setStartingChat(false);
    }
  }

  const isDirty =
    draft !== null &&
    (draft.isNew ||
      draft.description !== (selected?.kind === "custom" ? selected.skill.description : "") ||
      draft.content !== (selected?.kind === "custom" ? selected.skill.content : "") ||
      draft.enabled !== (selected?.kind === "custom" ? selected.skill.enabled === 1 : true) ||
      draft.always_active !==
        (selected?.kind === "custom" ? selected.skill.always_active === 1 : false));

  return (
    <div className="container-app">
      <PageHeader
        icon={Wrench}
        title="Minhas skills"
        subtitle="Uma skill existe para o usuário e vale nos agentes em que você habilitar. Abra uma para ver o conteúdo e escolher quem a usa."
        action={
          <div className="flex items-center gap-2">
            <Button variant="subtle" onClick={openChat} disabled={startingChat}>
              {startingChat ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquarePlus />
              )}
              Criar via conversa
            </Button>
            <Button onClick={openCreate}>
              <Plus />
              Nova skill
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr] lg:items-start">
          <Card className="lg:sticky lg:top-4">
            <CardContent className="p-3 pt-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome ou descrição"
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <FilterChips filter={filter} setFilter={setFilter} counts={counts} />
              {items.length === 0 ? (
                <div className="text-center py-8 px-2">
                  <div className="w-12 h-12 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mx-auto mb-3">
                    <Wrench className="w-6 h-6 text-text-muted" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">
                    Nenhuma skill ainda
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Crie a primeira ou peça pro agente montar.
                  </p>
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="text-center py-8 px-2 text-xs text-text-muted">
                  {query.trim()
                    ? `Nada encontrado para "${query.trim()}".`
                    : "Nenhuma skill neste filtro."}
                </div>
              ) : (
                <div className="max-h-[calc(100vh-19rem)] overflow-y-auto -mr-1 pr-1">
                  {groups.map((group) => (
                    <div key={group.key}>
                      {group.label && (
                        <p className="px-1 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          {group.label} · {group.items.length}
                        </p>
                      )}
                      <ul>
                        {group.items.map((item) => (
                          <li key={`${item.kind}:${item.skill.name}`}>
                            <SkillRow
                              item={item}
                              active={
                                selected?.kind === item.kind &&
                                selected.skill.name === item.skill.name
                              }
                              unused={
                                agents.length > 0 &&
                                itemBucket(item) !== "builtin" &&
                                agentsUsing(item.skill.name, agents).length === 0
                              }
                              onSelect={() => selectItem(item)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0">
            {selected === null ? (
              <SkillsOverview
                counts={counts}
                orphans={orphans}
                onSelect={selectItem}
                onCreate={openCreate}
                onChat={openChat}
                startingChat={startingChat}
              />
            ) : (
              <div className="space-y-5">
                {selected.kind === "builtin" ? (
                  <BuiltinView skill={selected.skill} />
                ) : draft ? (
                  <CustomEditor
                    draft={draft}
                    setDraft={setDraft}
                    isDirty={isDirty}
                    saving={saving}
                    onSave={handleSave}
                    onDelete={() => setConfirmDelete(true)}
                  />
                ) : null}
                {!draft?.isNew && (
                  <SkillAgentsPanel
                    skillName={selected.skill.name}
                    agents={agents}
                    onToggle={async (agent, enabled) => {
                      const list = agent.agent_config?.skills_enabled ?? [];
                      const next = enabled
                        ? [...list, selected.skill.name]
                        : list.filter((n) => n !== selected.skill.name);
                      await updateAgent(agent.agent_id, {
                        agent_config: { skills_enabled: next },
                      });
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova skill</DialogTitle>
            <DialogDescription>
              Dê um nome curto e único. Você poderá descrever e escrever o passo a passo
              a seguir.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <Label htmlFor="new-skill-name">Nome da skill</Label>
            <Input
              id="new-skill-name"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                if (createNameError) setCreateNameError(null);
              }}
              placeholder="ex.: validar_tarefa_azure"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCreate();
              }}
            />
            {createNameError && (
              <p className="text-xs text-red">{createNameError}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmCreate}>
              <Plus className="w-4 h-4" /> Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-muted text-red flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle>Excluir skill?</DialogTitle>
                <DialogDescription className="mt-1">
                  <strong className="text-text-primary">{draft?.originalName}</strong>{" "}
                  será removida permanentemente.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SkillAgentsPanelProps {
  skillName: string;
  agents: Agent[];
  onToggle: (agent: Agent, enabled: boolean) => Promise<void>;
}

function SkillAgentsPanel({ skillName, agents, onToggle }: SkillAgentsPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);

  function seesSkill(agent: Agent): boolean {
    const list = agent.agent_config?.skills_enabled;
    if (list == null) return true;
    return list.includes(skillName);
  }

  const usedBy = agents.filter(seesSkill);

  async function toggle(agent: Agent, enabled: boolean) {
    setBusy(agent.agent_id);
    try {
      await onToggle(agent, enabled);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent className="p-5 pt-5 space-y-3">
        <div>
          <h3 className="font-display font-bold text-text-primary">Quem usa esta skill</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Uma skill só chega ao modelo nos agentes em que está habilitada.
          </p>
        </div>

        {agents.length === 0 ? (
          <p className="text-sm text-text-muted">Você ainda não tem agentes.</p>
        ) : (
          <>
            {usedBy.length === 0 && (
              <div className="flex items-start gap-2.5 rounded-xl bg-yellow-muted p-3">
                <AlertTriangle className="w-4 h-4 text-yellow shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-text-secondary">
                  Esta skill ainda não é usada por nenhum agente. Habilite abaixo no agente
                  que deve executá-la.
                </p>
              </div>
            )}
            <ul className="space-y-1.5">
              {agents.map((agent) => {
                const open = agent.agent_config?.skills_enabled == null;
                const on = seesSkill(agent);
                return (
                  <li
                    key={agent.agent_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-surface-alt text-text-muted flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {agent.name}
                        </p>
                        <p className="text-[11px] text-text-muted truncate">
                          {open ? "Usa todas as skills disponíveis" : agent.role || "Agente"}
                        </p>
                      </div>
                    </div>
                    {busy === agent.agent_id ? (
                      <Loader2 className="w-4 h-4 text-purple animate-spin shrink-0" />
                    ) : (
                      <Switch
                        checked={on}
                        disabled={open}
                        onCheckedChange={(v) => toggle(agent, v)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface SkillsOverviewProps {
  counts: { all: number; mine: number; solides: number; builtin: number };
  orphans: ListItem[];
  onSelect: (item: ListItem) => void;
  onCreate: () => void;
  onChat: () => void;
  startingChat: boolean;
}

/** What fills the right column before a skill is picked.
 *
 *  It used to be a small "select a skill" card in the middle of a large empty
 *  area. The space is better spent on the one thing this screen can tell you and
 *  the list cannot: which skills exist but reach no agent — saving a skill does
 *  not enable it anywhere, so created and in-use are different things. */
function SkillsOverview({
  counts,
  orphans,
  onSelect,
  onCreate,
  onChat,
  startingChat,
}: SkillsOverviewProps) {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-6 pt-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-purple-muted flex items-center justify-center text-purple shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-lg text-text-primary">
                Skills são o que seus agentes sabem fazer
              </h3>
              <p className="text-sm text-text-muted mt-1">
                Cada skill é um procedimento em Markdown. O agente vê o nome e a
                descrição sempre, e lê o conteúdo quando decide usar — então a
                descrição é o que faz ele escolher a skill certa.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <Button onClick={onCreate}>
                  <Plus /> Nova skill
                </Button>
                <Button variant="subtle" onClick={onChat} disabled={startingChat}>
                  {startingChat ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MessageSquarePlus />
                  )}
                  Criar via conversa
                </Button>
              </div>
            </div>
          </div>

          <Separator className="my-5" />

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Suas", value: counts.mine, hint: "criadas por você ou pelo agente" },
              { label: "Sólides", value: counts.solides, hint: "vêm com os templates" },
              { label: "Da ferramenta", value: counts.builtin, hint: "embutidas na plataforma" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border p-3">
                <p className="font-display font-bold text-2xl text-text-primary leading-none">
                  {stat.value}
                </p>
                <p className="text-xs font-semibold text-text-primary mt-1.5">
                  {stat.label}
                </p>
                <p className="text-[11px] text-text-muted leading-tight">{stat.hint}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {orphans.length > 0 && (
        <Card>
          <CardContent className="p-5 pt-5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow" />
              <h3 className="font-display font-bold text-text-primary">
                {orphans.length === 1
                  ? "1 skill que nenhum agente usa"
                  : `${orphans.length} skills que nenhum agente usa`}
              </h3>
            </div>
            <p className="text-xs text-text-muted mt-1 mb-3">
              Salvar uma skill não a habilita em ninguém. Abra e escolha em quais
              agentes ela deve valer.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orphans.slice(0, 12).map((item) => (
                <button
                  key={`${item.kind}:${item.skill.name}`}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-purple hover:text-purple transition-colors"
                >
                  {item.skill.name}
                </button>
              ))}
              {orphans.length > 12 && (
                <span className="px-2 py-1 text-xs text-text-muted">
                  e mais {orphans.length - 12}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SkillRowProps {
  item: ListItem;
  active: boolean;
  unused: boolean;
  onSelect: () => void;
}

/** One line per skill.
 *
 *  Compact on purpose: with 40+ skills the old two-line rows made the column
 *  taller than the page, so the editor scrolled out of sight. And only the
 *  exceptions get a badge — an "Ativa" tag on every row carries no information;
 *  "nenhum agente usa" does. */
function SkillRow({ item, active, unused, onSelect }: SkillRowProps) {
  const bucket = itemBucket(item);
  const isCustom = item.kind === "custom";
  const disabled = isCustom
    ? (item.skill as CustomSkill).enabled !== 1
    : !(item.skill as BuiltinSkill).available;
  const Icon = bucket === "builtin" ? Lock : bucket === "solides" ? Building2 : User;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={item.skill.description || item.skill.name}
      className={cn(
        "w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors border",
        active
          ? "border-purple bg-purple-muted"
          : "border-transparent hover:bg-surface-alt",
      )}
    >
      <div
        className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
          bucket === "builtin"
            ? "bg-surface-alt text-text-muted"
            : bucket === "solides"
              ? "bg-blue-muted text-blue"
              : "bg-purple-muted text-purple",
        )}
      >
        <Icon className="w-3 h-3" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-text-primary truncate leading-tight">
          {item.skill.name}
        </p>
        <p className="text-[11px] text-text-muted truncate leading-tight">
          {item.skill.description || "Sem descrição."}
        </p>
      </div>
      {disabled && <Badge variant="muted">Desligada</Badge>}
      {!disabled && unused && (
        <span
          title="Nenhum agente usa esta skill"
          className="w-1.5 h-1.5 rounded-full bg-yellow shrink-0"
        />
      )}
    </button>
  );
}

interface FilterChipsProps {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: { all: number; mine: number; solides: number; builtin: number };
}

function FilterChips({ filter, setFilter, counts }: FilterChipsProps) {
  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "mine", label: "Minhas" },
    { id: "solides", label: "Sólides" },
    { id: "builtin", label: "Ferramenta" },
  ];
  return (
    <div className="flex items-center gap-1 mb-2 p-0.5 rounded-lg bg-surface-alt">
      {chips.map((c) => {
        const active = filter === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={cn(
              "flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap text-center",
              active
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {c.label}
            <span className="ml-1 opacity-60">{counts[c.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function BuiltinView({ skill }: { skill: BuiltinSkill }) {
  return (
    <Card>
      <CardContent className="p-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg text-text-primary">
              {skill.name}
            </h2>
            <p className="text-sm text-text-secondary mt-1 max-w-2xl">
              {skill.description || "Sem descrição."}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge variant="muted">Built-in</Badge>
              {skill.always && <Badge>Sempre ativa</Badge>}
              {skill.available ? (
                <Badge variant="success">Disponível</Badge>
              ) : (
                <Badge variant="warning">Indisponível</Badge>
              )}
            </div>
          </div>
          <div className="text-text-muted flex items-center gap-1 text-xs">
            <Lock className="w-3.5 h-3.5" /> Somente leitura
          </div>
        </div>
        <Separator className="my-5" />
        <Label className="mb-1.5 block">Conteúdo</Label>
        <pre className="rounded-xl border border-border bg-surface-alt p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto max-h-[520px]">
          {skill.content || "(sem conteúdo)"}
        </pre>
      </CardContent>
    </Card>
  );
}

interface CustomEditorProps {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
}

function CustomEditor({ draft, setDraft, isDirty, saving, onSave, onDelete }: CustomEditorProps) {
  return (
    <Card>
      <CardContent className="p-6 pt-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-lg text-text-primary truncate">
              {draft.name}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {draft.isNew
                ? "Nova skill — preencha e salve para ativar."
                : "Editando skill customizada."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!draft.isNew && (
              <Button variant="danger" onClick={onDelete}>
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
            )}
            <Button onClick={onSave} disabled={saving || !isDirty}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-3 flex items-start gap-3">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">Ativa</p>
              <p className="text-[11px] text-text-muted">
                Quando desligada, o agente ignora esta skill.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border p-3 flex items-start gap-3">
            <Switch
              checked={draft.always_active}
              onCheckedChange={(v) => setDraft({ ...draft, always_active: v })}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">Sempre no contexto</p>
              <p className="text-[11px] text-text-muted">
                Injeta o conteúdo em toda mensagem, não apenas quando relevante.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skill-description">Descrição</Label>
          <Input
            id="skill-description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Quando esta skill deve ser acionada?"
          />
          <p className="text-[11px] text-text-muted">
            Uma linha explicando quando o agente deve usar esta skill.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skill-content">Conteúdo (markdown)</Label>
          <Textarea
            id="skill-content"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={18}
            className="font-mono text-[13px] leading-relaxed"
            placeholder={SKILL_TEMPLATE}
          />
          <p className="text-[11px] text-text-muted">
            Escreva o passo a passo. Referencie ferramentas ou APIs conectadas (MCPs) que
            esta skill utiliza.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
