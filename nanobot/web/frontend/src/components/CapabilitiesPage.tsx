import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TabBar } from "@/components/ui/tabs";
import { PageHeader } from "@/components/hub/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getSkills,
  updateSkills,
  getCustomSkills,
  deleteCustomSkill,
  updateCustomSkill,
  getMcpConfig,
  updateMcpConfig,
  getBuiltinSkills,
  getToolsCatalog,
} from "@/lib/api";
import type {
  BuiltinSkill,
  CustomSkill,
  MCPServerConfig,
  ToolCatalogEntry,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import {
  Lock,
  Pencil,
  Trash2,
  Plus,
  Terminal,
  Search,
  Globe,
  Clock,
  Brain,
  FolderOpen,
  AlertTriangle,
  Network,
  FileText,
  Bold,
  Italic,
  Code2,
  Sparkles,
  Check,
  Code,
  ChevronDown,
  Database,
  Save,
  Loader2,
  Blocks,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, typeof Globe> = {
  "Memória & Conhecimento": Brain,
  Skills: Sparkles,
  "Relatórios & Páginas": FileText,
  Integrações: Plug,
  Web: Globe,
  "Dados públicos": Search,
  "Arquivos do agente": FolderOpen,
  Ambiente: Terminal,
  Autonomia: Clock,
};

type ModalState = {
  mode: "view" | "edit" | "create";
  name: string;
  description: string;
  content: string;
} | null;

function SkillModal({
  modal,
  onClose,
  onSave,
  onDelete,
}: {
  modal: NonNullable<ModalState>;
  onClose: () => void;
  onSave: (name: string, content: string, description: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [content, setContent] = useState(modal.content);
  const [name, setName] = useState(modal.name);
  const [description, setDescription] = useState(modal.description);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const readOnly = modal.mode === "view";
  const isCreate = modal.mode === "create";

  const insertMarkdown = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const next =
      content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(next);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + prefix.length;
      ta.selectionEnd = start + prefix.length + selected.length;
    }, 0);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast("error", "Nome da skill é obrigatório");
      return;
    }
    setSaving(true);
    await onSave(name.trim(), content, description.trim());
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          {isCreate ? (
            <>
              <DialogTitle>Nova skill customizada</DialogTitle>
              <div className="space-y-2 pt-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome da skill"
                  autoFocus
                />
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição breve (opcional)"
                />
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2">
                {readOnly && <Lock className="w-4 h-4 text-text-muted" />}
                {modal.name}
              </DialogTitle>
              {modal.description && <DialogDescription>{modal.description}</DialogDescription>}
            </>
          )}
        </DialogHeader>

        {!readOnly && (
          <div className="flex items-center gap-1 border border-border bg-surface-alt rounded-xl px-2 py-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => insertMarkdown("**", "**")}
              title="Negrito"
              className="h-7 w-7"
            >
              <Bold className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => insertMarkdown("*", "*")}
              title="Itálico"
              className="h-7 w-7"
            >
              <Italic className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => insertMarkdown("`", "`")}
              title="Código inline"
              className="h-7 w-7"
            >
              <Code2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => insertMarkdown("```\n", "\n```")}
              title="Bloco de código"
              className="h-7 w-7"
            >
              <FileText className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {readOnly ? (
          <div className="rounded-xl bg-slate-900 p-4 max-h-[400px] overflow-y-auto">
            <pre className="text-sm text-purple-300 font-mono whitespace-pre-wrap leading-relaxed">
              {modal.content || "(vazio)"}
            </pre>
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            variant="code"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[320px] p-4 leading-relaxed"
            placeholder={
              "# Nome da skill\n\nDescreva o que o agente deve fazer quando esta skill for acionada.\n\nUse Markdown para formatar as instruções."
            }
          />
        )}

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {!readOnly && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDelete(true)}
                  className="text-red hover:bg-red-muted"
                >
                  <Trash2 />
                  Excluir
                </Button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function McpServerCard({
  name,
  server,
  onUpdate,
  onDelete,
}: {
  name: string;
  server: MCPServerConfig;
  onUpdate: (s: MCPServerConfig) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSSE = !!server.url;
  const preview = isSSE ? server.url : server.command;

  return (
    <Card>
      <button
        className="w-full flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-alt/50 transition-colors rounded-2xl text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-xl bg-surface-alt border border-border flex items-center justify-center shrink-0">
          <Database className="w-4 h-4 text-text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-primary">{name}</span>
            <Badge variant="muted">{isSSE ? "SSE" : "stdio"}</Badge>
          </div>
          <div className="text-xs text-text-muted mt-0.5 truncate font-mono">
            {preview || "Não configurado"}
          </div>
        </div>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="danger" onClick={onDelete}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="text-text-muted hover:text-red hover:bg-red-muted"
              title="Remover servidor"
            >
              <Trash2 />
            </Button>
          )}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-text-muted transition-transform shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-5 space-y-4">
          {isSSE ? (
            <>
              <div className="space-y-1.5">
                <Label>URL</Label>
                <Input
                  value={server.url || ""}
                  onChange={(e) => onUpdate({ ...server, url: e.target.value })}
                  placeholder="http://localhost:3001/sse"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Headers (JSON)</Label>
                <Input
                  value={JSON.stringify(server.headers || {})}
                  onChange={(e) => {
                    try {
                      onUpdate({ ...server, headers: JSON.parse(e.target.value) });
                    } catch { /* ignore */ }
                  }}
                  placeholder="{}"
                  className="font-mono"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Command</Label>
                <Input
                  value={server.command || ""}
                  onChange={(e) => onUpdate({ ...server, command: e.target.value })}
                  placeholder="npx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Argumentos</Label>
                <Input
                  value={(server.args || []).join(", ")}
                  onChange={(e) =>
                    onUpdate({
                      ...server,
                      args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
                  className="font-mono"
                />
                <p className="text-xs text-text-muted">Separe argumentos por vírgula</p>
              </div>
              <div className="space-y-1.5">
                <Label>Environment (JSON)</Label>
                <Input
                  value={JSON.stringify(server.env || {})}
                  onChange={(e) => {
                    try {
                      onUpdate({ ...server, env: JSON.parse(e.target.value) });
                    } catch { /* ignore */ }
                  }}
                  placeholder="{}"
                  className="font-mono"
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Tool Timeout (segundos)</Label>
            <Input
              type="number"
              value={server.tool_timeout ?? ""}
              onChange={(e) =>
                onUpdate({
                  ...server,
                  tool_timeout: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="30"
              className="w-32"
            />
          </div>
        </div>
      )}
    </Card>
  );
}

type Tab = "tools" | "skills" | "mcp";

export function CapabilitiesPage() {
  const activeAgentId = useStore((s) => s.activeAgentId);
  const [tab, setTab] = useState<Tab>("tools");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    "Sistema de arquivos": true,
    "Sistema & Ambiente": true,
    "Web & Pesquisa": false,
    "Lógica do agente": false,
    "Memória & Contexto": false,
  });

  const [loading, setLoading] = useState(true);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogEntry[]>([]);
  const [builtinSkills, setBuiltinSkills] = useState<BuiltinSkill[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [mcpConfig, setMcpConfig] = useState<Record<string, MCPServerConfig>>({});
  const [mcpDirty, setMcpDirty] = useState(false);
  const [mcpSaving, setMcpSaving] = useState(false);

  const [modal, setModal] = useState<ModalState>(null);
  const [addingServer, setAddingServer] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerType, setNewServerType] = useState<"stdio" | "sse">("stdio");

  useEffect(() => {
    setLoading(true);
    setMcpDirty(false);
    (async () => {
      try {
        const [skillsRes, builtin, custom, mcp, catalog] = await Promise.all([
          getSkills(),
          getBuiltinSkills(),
          getCustomSkills(),
          getMcpConfig(),
          getToolsCatalog(),
        ]);
        setEnabledTools(skillsRes.tools_enabled);
        setToolCatalog(catalog);
        setBuiltinSkills(builtin);
        setCustomSkills(custom);
        const mcpMap: Record<string, MCPServerConfig> = {};
        for (const s of mcp.mcpServers ?? []) {
          const { name, ...rest } = s;
          mcpMap[name] = rest;
        }
        setMcpConfig(mcpMap);
      } catch (e) {
        toast("error", `Falha ao carregar: ${(e as Error).message}`);
      }
      setLoading(false);
    })();
  }, [activeAgentId]);

  const reloadCustomSkills = async () => {
    try {
      setCustomSkills(await getCustomSkills());
    } catch { /* ignore */ }
  };

  const handleToggleTool = async (toolId: string) => {
    const next = enabledTools.includes(toolId)
      ? enabledTools.filter((t) => t !== toolId)
      : [...enabledTools, toolId];
    setEnabledTools(next);
    try {
      await updateSkills(next);
    } catch (e) {
      toast("error", `Falha ao atualizar: ${(e as Error).message}`);
      setEnabledTools(enabledTools);
    }
  };

  const handleSaveSkill = async (name: string, content: string, description: string) => {
    try {
      await updateCustomSkill(name, { content, description: description || undefined });
      toast("success", `Skill "${name}" salva`);
      setModal(null);
      reloadCustomSkills();
    } catch (e) {
      toast("error", `Falha ao salvar skill: ${(e as Error).message}`);
    }
  };

  const handleDeleteSkill = async (name: string) => {
    try {
      await deleteCustomSkill(name);
      toast("success", `Skill "${name}" removida`);
      setModal(null);
      reloadCustomSkills();
    } catch (e) {
      toast("error", `Falha ao excluir: ${(e as Error).message}`);
    }
  };

  const handleSaveMcp = async () => {
    setMcpSaving(true);
    try {
      await updateMcpConfig({
        mcpServers: Object.entries(mcpConfig).map(([name, cfg]) => ({
          name,
          ...cfg,
        })),
      });
      toast("success", "Configuração MCP salva");
      setMcpDirty(false);
    } catch (e) {
      toast("error", `Falha ao salvar MCP: ${(e as Error).message}`);
    }
    setMcpSaving(false);
  };

  const handleAddServer = () => {
    const n = newServerName.trim();
    if (!n) return;
    if (mcpConfig[n]) {
      toast("error", "Já existe um servidor com este nome");
      return;
    }
    const template: MCPServerConfig =
      newServerType === "sse"
        ? { url: "", headers: {} }
        : { command: "", args: [], env: {} };
    setMcpConfig({ ...mcpConfig, [n]: template });
    setMcpDirty(true);
    setAddingServer(false);
    setNewServerName("");
  };

  const handleRemoveServer = (name: string) => {
    const next = { ...mcpConfig };
    delete next[name];
    setMcpConfig(next);
    setMcpDirty(true);
  };

  const groupedTools = toolCatalog.reduce<Record<string, ToolCatalogEntry[]>>(
    (acc, tool) => {
      acc[tool.category] = acc[tool.category] || [];
      acc[tool.category].push(tool);
      return acc;
    },
    {},
  );

  const skillCount = builtinSkills.length + customSkills.length;
  const mcpCount = Object.keys(mcpConfig).length;

  return (
    <div className="container-app">
      <PageHeader
        icon={Blocks}
        title="Capacidades"
        subtitle="Gerencie ferramentas nativas, skills aprendidas e conexões MCP disponíveis para o agente."
        action={
          tab === "mcp" && mcpDirty ? (
            <Button onClick={handleSaveMcp} disabled={mcpSaving}>
              {mcpSaving ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar MCP
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5">
        <TabBar<Tab>
          items={[
            { key: "tools", label: "Ferramentas", badge: toolCatalog.length },
            { key: "skills", label: "Skills", badge: skillCount },
            { key: "mcp", label: "MCP", badge: mcpCount },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : (
        <>
          {tab === "tools" && (
            <div className="space-y-4">
              {Object.entries(groupedTools).map(([category, toolsInGroup]) => {
                const isOpen = openCategories[category] !== false;
                return (
                  <Card key={category}>
                    <button
                      className="w-full flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface-alt/50 transition-colors rounded-2xl text-left"
                      onClick={() =>
                        setOpenCategories({
                          ...openCategories,
                          [category]: !isOpen,
                        })
                      }
                    >
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                          isOpen ? "bg-purple text-white" : "bg-surface-alt text-text-muted",
                        )}
                      >
                        <Blocks className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <h3 className="font-display text-sm font-bold text-text-primary">
                          {category}
                        </h3>
                        <Badge variant="muted">{toolsInGroup.length}</Badge>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-text-muted transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {toolsInGroup.map((tool) => {
                          const Icon = CATEGORY_ICON[tool.category] ?? Blocks;
                          const enabled = enabledTools.includes(tool.id);
                          return (
                            <div
                              key={tool.id}
                              className="flex items-start gap-3 p-4 rounded-xl border border-border bg-surface hover:border-purple/30 transition-colors"
                            >
                              <div className="w-9 h-9 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-purple" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-text-primary truncate">
                                    {tool.label}
                                  </span>
                                  {tool.warn && (
                                    <span title={tool.warn}>
                                      <AlertTriangle className="w-3.5 h-3.5 text-yellow shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-text-muted mt-0.5 leading-relaxed">
                                  {tool.warn || (
                                    <span className="font-mono">{tool.id}</span>
                                  )}
                                </div>
                              </div>
                              {tool.permission ? (
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={() => handleToggleTool(tool.id)}
                                />
                              ) : (
                                <Badge variant="muted" className="shrink-0">
                                  Sempre ativa
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {tab === "skills" && (
            <div className="space-y-5">
              <Card className="border-purple/30 bg-purple-muted/30">
                <CardContent className="p-4 pt-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-purple" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">Skills customizadas</h3>
                      <p className="text-xs text-text-muted mt-0.5 max-w-xl leading-relaxed">
                        Skills são rotinas que o agente pode seguir. O agente aprende via
                        save_skill ou você cria manualmente.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setModal({ mode: "create", name: "", description: "", content: "" })}
                  >
                    <Plus />
                    Nova skill
                  </Button>
                </CardContent>
              </Card>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-3.5 h-3.5 text-text-muted" />
                  <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                    Skills do sistema
                  </h3>
                </div>

                {builtinSkills.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 pt-6 text-sm text-text-muted italic">
                      Nenhuma skill do sistema carregada.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {builtinSkills.map((skill) => (
                      <Card key={skill.name}>
                        <CardContent className="p-4 pt-4 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center shrink-0">
                            <Lock className="w-4 h-4 text-text-muted" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-text-primary truncate">
                              {skill.name}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">
                              {skill.description}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setModal({
                                mode: "view",
                                name: skill.name,
                                description: skill.description,
                                content: skill.content || "(sem conteúdo)",
                              })
                            }
                          >
                            Ver
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Code className="w-3.5 h-3.5 text-purple" />
                  <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                    Aprendidas pelo agente
                  </h3>
                </div>

                {customSkills.length === 0 ? (
                  <Card>
                    <CardContent className="p-10 pt-10 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-2xl bg-purple-muted flex items-center justify-center mb-4">
                        <Sparkles className="w-6 h-6 text-purple" />
                      </div>
                      <p className="text-sm font-bold text-text-primary">
                        Nenhuma skill aprendida ainda
                      </p>
                      <p className="text-xs text-text-muted mt-1 max-w-sm leading-relaxed">
                        Skills são criadas automaticamente conforme o agente aprende, ou podem ser
                        adicionadas manualmente.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {customSkills.map((skill) => (
                      <Card key={skill.name} className="border-purple/20">
                        <CardContent className="p-4 pt-4 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                            <Code className="w-4 h-4 text-purple" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-text-primary truncate">
                              {skill.name}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">
                              {skill.description || "Sem descrição"}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setModal({
                                mode: "edit",
                                name: skill.name,
                                description: skill.description,
                                content: skill.content,
                              })
                            }
                          >
                            <Pencil />
                            Editar
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "mcp" && (
            <div className="space-y-5">
              <Card>
                <CardContent className="p-4 pt-4 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center shrink-0">
                      <Network className="w-4 h-4 text-text-muted" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">
                        Model Context Protocol
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5 max-w-xl leading-relaxed">
                        Conecte o agente a serviços externos e fontes de dados via MCP.
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => setAddingServer(true)}>
                    <Plus />
                    Adicionar servidor
                  </Button>
                </CardContent>
              </Card>

              <Dialog open={addingServer} onOpenChange={(v) => !v && setAddingServer(false)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo servidor MCP</DialogTitle>
                    <DialogDescription>
                      Escolha um nome e o tipo de transporte para o servidor.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Nome do servidor</Label>
                      <Input
                        value={newServerName}
                        onChange={(e) => setNewServerName(e.target.value)}
                        placeholder="ex: filesystem ou my-database"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddServer();
                          if (e.key === "Escape") setAddingServer(false);
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo de transporte</Label>
                      <div className="flex rounded-xl bg-surface-alt border border-border p-1 w-fit">
                        <button
                          type="button"
                          onClick={() => setNewServerType("stdio")}
                          className={cn(
                            "px-5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                            newServerType === "stdio"
                              ? "bg-surface text-text-primary shadow-sm"
                              : "text-text-muted hover:text-text-primary",
                          )}
                        >
                          stdio
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewServerType("sse")}
                          className={cn(
                            "px-5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                            newServerType === "sse"
                              ? "bg-surface text-text-primary shadow-sm"
                              : "text-text-muted hover:text-text-primary",
                          )}
                        >
                          HTTP / SSE
                        </button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setAddingServer(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleAddServer} disabled={!newServerName.trim()}>
                      <Plus />
                      Criar servidor
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {mcpCount === 0 ? (
                <Card>
                  <CardContent className="p-10 pt-10 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
                      <Network className="w-6 h-6 text-text-muted" />
                    </div>
                    <p className="text-sm font-bold text-text-primary">
                      Nenhum servidor MCP configurado
                    </p>
                    <p className="text-xs text-text-muted mt-1 max-w-sm leading-relaxed">
                      Clique em "Adicionar servidor" para conectar protocolos padrão.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {Object.entries(mcpConfig).map(([name, server]) => (
                    <McpServerCard
                      key={name}
                      name={name}
                      server={server}
                      onUpdate={(s) => {
                        setMcpConfig({ ...mcpConfig, [name]: s });
                        setMcpDirty(true);
                      }}
                      onDelete={() => handleRemoveServer(name)}
                    />
                  ))}
                </div>
              )}

              {mcpDirty && (
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveMcp} disabled={mcpSaving}>
                    {mcpSaving ? <Loader2 className="animate-spin" /> : <Check />}
                    Salvar configuração
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal && (
        <SkillModal
          modal={modal}
          onClose={() => setModal(null)}
          onSave={handleSaveSkill}
          onDelete={modal.mode === "edit" ? () => handleDeleteSkill(modal.name) : undefined}
        />
      )}
    </div>
  );
}
