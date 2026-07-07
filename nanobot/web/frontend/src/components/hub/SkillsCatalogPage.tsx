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
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

type ListItem =
  | { kind: "builtin"; skill: BuiltinSkill }
  | { kind: "custom"; skill: CustomSkill };

type Filter = "all" | "mine" | "solides" | "builtin";

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

  const visibleItems = useMemo(
    () => (filter === "all" ? items : items.filter((it) => itemBucket(it) === filter)),
    [items, filter],
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
          (a.metadata as { template_id?: string } | undefined)?.template_id ===
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
        avatar: tpl.name.slice(0, 1),
        tools_enabled: tpl.tools,
        bootstrap: { "AGENTS.md": tpl.system_prompt },
        agent_config: { rag: { enabled: tpl.rag_enabled } },
        metadata: { template_id: SKILL_AUTHOR_TEMPLATE_ID, system: true },
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
        subtitle="Skills são compartilhadas entre todos os seus agentes. Para escolher quais um agente usa, edite o agente."
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
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit">
            <CardContent className="p-3 pt-3">
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
                  Nenhuma skill neste filtro.
                </div>
              ) : (
                <ul className="space-y-1">
                  {visibleItems.map((item) => {
                    const isActive =
                      selected?.kind === item.kind &&
                      selected.skill.name === item.skill.name;
                    const bucket = itemBucket(item);
                    const isCustom = item.kind === "custom";
                    const enabled = !isCustom
                      ? (item.skill as BuiltinSkill).available
                      : (item.skill as CustomSkill).enabled === 1;
                    const Icon =
                      bucket === "builtin" ? Lock : bucket === "solides" ? Building2 : User;
                    const badgeLabel =
                      bucket === "builtin"
                        ? "Built-in"
                        : bucket === "solides"
                          ? "Sólides"
                          : "Minha";
                    return (
                      <li key={`${item.kind}:${item.skill.name}`}>
                        <button
                          type="button"
                          onClick={() => selectItem(item)}
                          className={cn(
                            "w-full text-left flex items-start gap-3 p-3 rounded-xl transition-colors border",
                            isActive
                              ? "border-purple bg-purple-muted"
                              : "border-transparent hover:bg-surface-alt",
                          )}
                        >
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                              bucket === "builtin"
                                ? "bg-surface-alt text-text-muted"
                                : bucket === "solides"
                                  ? "bg-blue-muted text-blue"
                                  : "bg-purple-muted text-purple",
                            )}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-text-primary truncate">
                              {item.skill.name}
                            </p>
                            <p className="text-[11px] text-text-muted line-clamp-2">
                              {item.skill.description || "Sem descrição."}
                            </p>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Badge variant={bucket === "builtin" ? "muted" : "default"}>
                                {badgeLabel}
                              </Badge>
                              {enabled && isCustom && (
                                <Badge variant="success">Ativa</Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0">
            {selected === null ? (
              <Card>
                <CardContent className="p-10 pt-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-purple-muted flex items-center justify-center text-purple mx-auto mb-3">
                    <Wrench className="w-7 h-7" />
                  </div>
                  <h3 className="font-display font-bold text-lg text-text-primary">
                    Selecione uma skill
                  </h3>
                  <p className="text-sm text-text-muted mt-1 max-w-sm mx-auto">
                    Escolha uma skill à esquerda para ver o conteúdo, ou crie uma nova.
                  </p>
                </CardContent>
              </Card>
            ) : selected.kind === "builtin" ? (
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
