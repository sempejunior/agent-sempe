import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
    getSkills, updateSkills, getCustomSkills, deleteCustomSkill, updateCustomSkill,
    getMcpConfig, updateMcpConfig, getBuiltinSkills,
} from "@/lib/api";
import type { BuiltinSkill, CustomSkill, MCPServerConfig } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
    Lock, Pencil, Trash2, Plus, Terminal,
    Search, Globe, MessageSquare, Clock, Brain,
    GitBranch, MousePointer2, FolderOpen, BookOpen, Upload,
    AlertTriangle, Network, X, FileText, Bold, Italic, Code2,
    Sparkles, Check, Code, Monitor, ChevronDown, Wrench, Database
} from "lucide-react";
import { cn } from "@/lib/utils";

type ToolDef = { id: string; name: string; desc: string; icon: typeof Globe; warn?: string; category: string };

const TOOLS: ToolDef[] = [
    { id: "read_file", name: "File Reader", desc: "Read workspace files", icon: Code2, category: "File System" },
    { id: "write_file", name: "File Writer", desc: "Create workspace files", icon: FileText, category: "File System" },
    { id: "edit_file", name: "File Editor", desc: "Modify existing files", icon: Pencil, category: "File System" },
    { id: "list_dir", name: "Directory Listing", desc: "List directory contents", icon: FolderOpen, category: "File System" },
    { id: "exec", name: "Shell", desc: "Run terminal commands", icon: Terminal, warn: "Allows arbitrary command execution", category: "System & Environment" },
    { id: "desktop_click", name: "Desktop Click", desc: "Click on screen elements", icon: MousePointer2, category: "System & Environment" },
    { id: "desktop_screenshot", name: "Desktop Screenshot", desc: "Capture screen", icon: Monitor, category: "System & Environment" },
    { id: "web_search", name: "Web Search", desc: "Search the web via API", icon: Search, category: "Web & Research" },
    { id: "web_reader", name: "Web Reader", desc: "Extract text from URLs", icon: Globe, category: "Web & Research" },
    { id: "messaging", name: "Messaging", desc: "Send proactive messages", icon: MessageSquare, category: "Agent Logic" },
    { id: "skill_creator", name: "Skill Creator", desc: "Learn and save routines", icon: Sparkles, category: "Agent Logic" },
    { id: "subagent", name: "Subagent", desc: "Parallel background agents", icon: GitBranch, category: "Agent Logic" },
    { id: "cron", name: "Scheduled Tasks", desc: "Create and manage cron jobs", icon: Clock, category: "Agent Logic" },
    { id: "memory_save", name: "Memory Save", desc: "Save to long-term memory", icon: Brain, category: "Memory & Context" },
    { id: "memory_search", name: "Memory Search", desc: "Recall past events", icon: BookOpen, category: "Memory & Context" },
    { id: "rag_search", name: "Knowledge Search", desc: "Search document base", icon: Search, category: "Memory & Context" },
    { id: "rag_ingest", name: "Knowledge Ingest", desc: "Add documents to knowledge base", icon: Upload, category: "Memory & Context" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2",
                checked ? "bg-green" : "bg-slate-200",
            )}
        >
            <span
                className={cn(
                    "pointer-events-none absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200",
                    checked ? "translate-x-[25px]" : "translate-x-[3px]",
                )}
            />
        </button>
    );
}

function SectionGroup({
    title,
    count,
    icon: Icon,
    isOpen,
    onToggle,
    children,
}: {
    title: string;
    count: number;
    icon: any;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className={cn(
            "rounded-3xl mb-8 transition-all duration-300 overflow-hidden",
            isOpen
                ? "border border-slate-300 shadow-md"
                : "bg-white border border-slate-200 shadow-sm hover:border-slate-300"
        )}>
            <div
                className={cn(
                    "flex items-center gap-5 p-6 cursor-pointer transition-colors relative z-10",
                    isOpen ? "bg-white border-b border-slate-200 shadow-sm" : "hover:bg-slate-50"
                )}
                onClick={onToggle}
            >
                <div className={cn(
                    "w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-300",
                    isOpen ? "bg-emerald-500 border-emerald-600 shadow-md shadow-emerald-500/20" : "bg-slate-50 border-slate-200"
                )}>
                    <Icon className={cn(
                        "w-7 h-7 transition-colors",
                        isOpen ? "text-white" : "text-slate-500"
                    )} />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-slate-900 font-display flex items-center gap-3">
                        {title}
                        <span className={cn(
                            "text-sm px-3 py-1 rounded-full font-bold",
                            isOpen ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-500"
                        )}>
                            {count}
                        </span>
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <button className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 pointer-events-none",
                        isOpen ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
                    )}>
                        <ChevronDown className={cn("w-6 h-6 transition-transform duration-300", isOpen && "rotate-180")} />
                    </button>
                </div>
            </div>
            {isOpen && (
                <div className="p-12 bg-slate-100/80 shadow-inner">
                    {children}
                </div>
            )}
        </div>
    );
}

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
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const readOnly = modal.mode === "view";
    const isCreate = modal.mode === "create";

    const insertMarkdown = (prefix: string, suffix: string) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = content.substring(start, end);
        const next = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
        setContent(next);
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = start + prefix.length;
            ta.selectionEnd = start + prefix.length + selected.length;
        }, 0);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast("error", "Skill name is required");
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

            <div
                className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl animate-fade-in-scale overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                        readOnly
                            ? "bg-slate-50 border border-slate-200"
                            : "bg-emerald-50 border border-emerald-100",
                    )}>
                        {readOnly ? <Lock className="w-5 h-5 text-slate-400" /> : <Code className="w-5 h-5 text-emerald-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        {isCreate ? (
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Skill name"
                                className="text-base font-semibold text-slate-900 bg-transparent border-none outline-none placeholder:text-slate-300 w-full"
                                autoFocus
                            />
                        ) : (
                            <div className="text-base font-semibold text-slate-900">{modal.name}</div>
                        )}
                        {isCreate ? (
                            <input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief description (optional)"
                                className="text-sm text-slate-400 bg-transparent border-none outline-none placeholder:text-slate-300 w-full mt-1"
                            />
                        ) : (
                            modal.description && (
                                <div className="text-sm text-slate-400 mt-1 truncate">{modal.description}</div>
                            )
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                {!readOnly && (
                    <div className="flex items-center gap-1.5 px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <button
                            type="button"
                            onClick={() => insertMarkdown("**", "**")}
                            className="p-2.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Bold"
                        >
                            <Bold className="w-4.5 h-4.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertMarkdown("*", "*")}
                            className="p-2.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Italic"
                        >
                            <Italic className="w-4.5 h-4.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertMarkdown("`", "`")}
                            className="p-2.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Inline code"
                        >
                            <Code2 className="w-4.5 h-4.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => insertMarkdown("```\n", "\n```")}
                            className="p-2.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Code block"
                        >
                            <FileText className="w-4.5 h-4.5" />
                        </button>
                    </div>
                )}

                {/* Editor area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {readOnly ? (
                        <div className="rounded-xl bg-slate-900 p-6 min-h-[300px]">
                            <pre className="text-sm text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed">
                                {modal.content || "(empty)"}
                            </pre>
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full min-h-[350px] bg-slate-900 text-emerald-300 font-mono text-sm p-6 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed placeholder:text-slate-600"
                            placeholder={"# Skill Name\n\nDescribe what the agent should do when this skill is triggered.\n\nUse Markdown to format instructions."}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        {!readOnly && onDelete && (
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 font-medium cursor-pointer px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 text-base font-medium text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {readOnly ? "Fechar" : "Cancelar"}
                        </button>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 text-base font-semibold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                Salvar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
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
    const isSSE = !!server.url;
    const preview = isSSE ? server.url : server.command;

    return (
        <div className="rounded-3xl border border-slate-100 bg-white shadow-[0_4px_12px_rgb(0,0,0,0.03)] overflow-hidden card-glow">
            <div
                className="flex items-center gap-5 px-8 py-6 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <Database className="w-7 h-7 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-900">{name}</span>
                        <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500">
                            {isSSE ? "SSE" : "stdio"}
                        </span>
                    </div>
                    <div className="text-sm text-slate-500 mt-1.5 truncate font-mono">
                        {preview || "Not configured"}
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-3.5 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                >
                    <Trash2 className="w-6 h-6" />
                </button>
            </div>

            {expanded && (
                <div className="border-t border-slate-100 px-8 py-8 space-y-6 animate-fade-in bg-slate-50/30">
                    {isSSE ? (
                        <>
                            <div>
                                <label className="text-sm font-medium text-slate-500 mb-2 block">URL</label>
                                <Input
                                    value={server.url || ""}
                                    onChange={(e) => onUpdate({ ...server, url: e.target.value })}
                                    placeholder="http://localhost:3001/sse"
                                    className="text-base h-11"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-500 mb-2 block">Headers (JSON)</label>
                                <Input
                                    value={JSON.stringify(server.headers || {})}
                                    onChange={(e) => {
                                        try { onUpdate({ ...server, headers: JSON.parse(e.target.value) }); } catch { /* ignore */ }
                                    }}
                                    placeholder='{}'
                                    className="font-mono text-sm h-11"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="text-sm font-medium text-slate-500 mb-2 block">Command</label>
                                <Input
                                    value={server.command || ""}
                                    onChange={(e) => onUpdate({ ...server, command: e.target.value })}
                                    placeholder="npx"
                                    className="text-base h-11"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-500 mb-2 block">Arguments</label>
                                <Input
                                    value={(server.args || []).join(", ")}
                                    onChange={(e) => onUpdate({ ...server, args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                                    placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
                                    className="font-mono text-sm h-11"
                                />
                                <p className="text-xs text-slate-400 mt-1.5">Comma-separated arguments</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-500 mb-2 block">Environment (JSON)</label>
                                <Input
                                    value={JSON.stringify(server.env || {})}
                                    onChange={(e) => {
                                        try { onUpdate({ ...server, env: JSON.parse(e.target.value) }); } catch { /* ignore */ }
                                    }}
                                    placeholder='{}'
                                    className="font-mono text-sm h-11"
                                />
                            </div>
                        </>
                    )}
                    <div>
                        <label className="text-sm font-medium text-slate-500 mb-2 block">Tool Timeout (seconds)</label>
                        <Input
                            type="number"
                            value={server.tool_timeout ?? ""}
                            onChange={(e) => onUpdate({ ...server, tool_timeout: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder="30"
                            className="w-32 h-11"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

type Tab = "tools" | "skills" | "mcp";

export function CapabilitiesPage() {
    const [tab, setTab] = useState<Tab>("tools");
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
        "File System": true,
        "System & Environment": true,
        "Web & Research": false,
        "Agent Logic": false,
        "Memory & Context": false,
    });

    const [loading, setLoading] = useState(true);
    const [enabledTools, setEnabledTools] = useState<string[]>([]);
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
        (async () => {
            try {
                const [skillsRes, builtin, custom, mcp] = await Promise.all([
                    getSkills(), getBuiltinSkills(), getCustomSkills(), getMcpConfig(),
                ]);
                setEnabledTools(skillsRes.tools_enabled);
                setBuiltinSkills(builtin);
                setCustomSkills(custom);
                setMcpConfig(mcp.mcpServers || {});
            } catch (e) {
                toast("error", `Failed to load: ${(e as Error).message}`);
            }
            setLoading(false);
        })();
    }, []);

    const reloadCustomSkills = async () => {
        try { setCustomSkills(await getCustomSkills()); } catch { /* ignore */ }
    };

    const handleToggleTool = async (toolId: string) => {
        const next = enabledTools.includes(toolId)
            ? enabledTools.filter((t) => t !== toolId)
            : [...enabledTools, toolId];
        setEnabledTools(next);
        try {
            await updateSkills(next);
        } catch (e) {
            toast("error", `Failed to update: ${(e as Error).message}`);
            setEnabledTools(enabledTools);
        }
    };

    const handleSaveSkill = async (name: string, content: string, description: string) => {
        try {
            await updateCustomSkill(name, { content, description: description || undefined });
            toast("success", `Skill "${name}" saved`);
            setModal(null);
            reloadCustomSkills();
        } catch (e) {
            toast("error", `Failed to save skill: ${(e as Error).message}`);
        }
    };

    const handleDeleteSkill = async (name: string) => {
        try {
            await deleteCustomSkill(name);
            toast("success", `Skill "${name}" deleted`);
            setModal(null);
            reloadCustomSkills();
        } catch (e) {
            toast("error", `Failed to delete: ${(e as Error).message}`);
        }
    };

    const handleSaveMcp = async () => {
        setMcpSaving(true);
        try {
            await updateMcpConfig({ mcpServers: mcpConfig });
            toast("success", "MCP configuration saved");
            setMcpDirty(false);
        } catch (e) {
            toast("error", `Failed to save MCP config: ${(e as Error).message}`);
        }
        setMcpSaving(false);
    };

    const handleAddServer = () => {
        const n = newServerName.trim();
        if (!n) return;
        if (mcpConfig[n]) {
            toast("error", "Server name already exists");
            return;
        }
        const template: MCPServerConfig = newServerType === "sse"
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

    const groupedTools = TOOLS.reduce<Record<string, ToolDef[]>>((acc, tool) => {
        acc[tool.category] = acc[tool.category] || [];
        acc[tool.category].push(tool);
        return acc;
    }, {});

    const skillCount = builtinSkills.length + customSkills.length;
    const mcpCount = Object.keys(mcpConfig).length;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-8 pt-8 pb-0 shrink-0 border-b border-slate-200">
                <div className="content-container-wide">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shrink-0">
                            <Sparkles className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="font-display text-2xl font-bold text-slate-900">
                                Agent Capabilities
                            </h1>
                            <p className="text-base text-slate-500 mt-1">
                                Manage built-in tools, learned skills, and external MCP connections.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 px-2">
                        <button
                            onClick={() => setTab("tools")}
                            className={cn(
                                "pb-3 text-base font-semibold border-b-2 transition-all shrink-0 cursor-pointer",
                                tab === "tools"
                                    ? "border-emerald-500 text-emerald-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <span className="flex items-center gap-2">
                                Built-in Tools
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    tab === "tools" ? "bg-emerald-100" : "bg-slate-100"
                                )}>{TOOLS.length}</span>
                            </span>
                        </button>
                        <button
                            onClick={() => setTab("skills")}
                            className={cn(
                                "pb-3 text-base font-semibold border-b-2 transition-all shrink-0 cursor-pointer",
                                tab === "skills"
                                    ? "border-emerald-500 text-emerald-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <span className="flex items-center gap-2">
                                Skills & Logic
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    tab === "skills" ? "bg-emerald-100" : "bg-slate-100"
                                )}>{skillCount}</span>
                            </span>
                        </button>
                        <button
                            onClick={() => setTab("mcp")}
                            className={cn(
                                "pb-3 text-base font-semibold border-b-2 transition-all shrink-0 cursor-pointer",
                                tab === "mcp"
                                    ? "border-emerald-500 text-emerald-600"
                                    : "border-transparent text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <span className="flex items-center gap-2">
                                MCP Servers
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    tab === "mcp" ? "bg-emerald-100" : "bg-slate-100"
                                )}>{mcpCount}</span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-8 bg-slate-50/30">
                <div className="content-container-wide">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="animate-fade-in space-y-8">
                            {/* ───── Tools Tab ───── */}
                            {tab === "tools" && (
                                <div className="space-y-8">
                                    <div className="mb-8">
                                        <p className="text-lg text-slate-600 font-medium">Native tools built into the agent.</p>
                                    </div>
                                    {Object.entries(groupedTools).map(([category, toolsInGroup]) => (
                                        <SectionGroup
                                            key={category}
                                            title={category}
                                            count={toolsInGroup.length}
                                            icon={Wrench}
                                            isOpen={openCategories[category] !== false}
                                            onToggle={() => setOpenCategories({ ...openCategories, [category]: !openCategories[category] })}
                                        >
                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-6">
                                                {toolsInGroup.map((tool) => {
                                                    const Icon = tool.icon;
                                                    const enabled = enabledTools.includes(tool.id);
                                                    return (
                                                        <div
                                                            key={tool.id}
                                                            className="flex items-start gap-5 p-6 bg-white rounded-3xl border border-slate-200 shadow-[0_4px_12px_rgb(0,0,0,0.03)] hover:border-emerald-300/50 transition-colors card-glow"
                                                        >
                                                            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                                                <Icon className="w-7 h-7 text-emerald-600" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-lg font-bold text-slate-900 truncate">{tool.name}</span>
                                                                    {tool.warn && (
                                                                        <span title={tool.warn}>
                                                                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-sm text-slate-500 mt-1.5 leading-relaxed">{tool.desc}</div>
                                                            </div>
                                                            <Toggle checked={enabled} onChange={() => handleToggleTool(tool.id)} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </SectionGroup>
                                    ))}
                                </div>
                            )}

                            {/* ───── Skills Tab ───── */}
                            {tab === "skills" && (
                                <div className="space-y-12 animate-fade-in">
                                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <Sparkles className="w-5 h-5 text-emerald-600" />
                                                Skill Creation
                                            </h3>
                                            <p className="text-sm text-slate-600 mt-1 max-w-xl">
                                                Skills are logic routines your agent can follow. You can let the agent learn them naturally via the 'skill_creator' tool, or define them manually here.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setModal({ mode: "create", name: "", description: "", content: "" })}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-b from-green to-green-hover text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-green/20 transition-all cursor-pointer"
                                        >
                                            <Plus className="w-4 h-4" /> Add Custom Skill
                                        </button>
                                    </div>

                                    {/* System Skills */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-6">
                                            <Lock className="w-5 h-5 text-slate-400" />
                                            <h3 className="text-base font-bold text-slate-700 uppercase tracking-widest">
                                                System Built-in Skills
                                            </h3>
                                        </div>

                                        {builtinSkills.length === 0 ? (
                                            <p className="text-base text-slate-400 italic bg-white p-8 rounded-3xl border border-slate-200">No system skills loaded.</p>
                                        ) : (
                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,450px),1fr))] gap-6">
                                                {builtinSkills.map((skill) => (
                                                    <div
                                                        key={skill.name}
                                                        className="flex items-center gap-5 p-6 bg-white rounded-3xl border border-slate-200 shadow-[0_4px_12px_rgb(0,0,0,0.03)]"
                                                    >
                                                        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                                            <Lock className="w-7 h-7 text-slate-400" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-lg font-bold text-slate-900 truncate">{skill.name}</div>
                                                            <div className="text-sm text-slate-500 mt-1.5 truncate">{skill.description}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => setModal({
                                                                mode: "view",
                                                                name: skill.name,
                                                                description: skill.description,
                                                                content: skill.content || "(no content)",
                                                            })}
                                                            className="text-base text-emerald-600 hover:text-emerald-700 font-bold cursor-pointer shrink-0 px-5 py-2.5 hover:bg-emerald-50 rounded-xl transition-colors"
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Learned Skills */}
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-6">
                                            <Code className="w-5 h-5 text-emerald-500" />
                                            <h3 className="text-base font-bold text-slate-700 uppercase tracking-widest">
                                                Learned by Agent
                                            </h3>
                                        </div>

                                        {customSkills.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                                <Sparkles className="w-10 h-10 text-emerald-300 mb-4" />
                                                <p className="text-lg text-slate-600 font-bold">No learned skills yet</p>
                                                <p className="text-sm text-slate-500 mt-2 max-w-sm text-center leading-relaxed">
                                                    Skills are created automatically as the agent learns, or can be added manually.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,450px),1fr))] gap-6">
                                                {customSkills.map((skill) => (
                                                    <div
                                                        key={skill.name}
                                                        className="flex items-center gap-5 p-6 bg-white rounded-3xl border border-emerald-200/50 shadow-[0_4px_12px_rgb(0,0,0,0.03)] hover:border-emerald-300 transition-colors"
                                                    >
                                                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                                            <Code className="w-7 h-7 text-emerald-500" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-lg font-bold text-slate-900 truncate">{skill.name}</div>
                                                            <div className="text-sm text-slate-500 mt-1.5 truncate">
                                                                {skill.description || "No description"}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => setModal({
                                                                mode: "edit",
                                                                name: skill.name,
                                                                description: skill.description,
                                                                content: skill.content,
                                                            })}
                                                            className="flex items-center gap-2 text-base text-slate-500 hover:text-emerald-600 font-bold cursor-pointer px-5 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors shrink-0"
                                                        >
                                                            <Pencil className="w-5 h-5" />
                                                            Edit
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ───── MCP Servers Tab ───── */}
                            {tab === "mcp" && (
                                <div className="space-y-8 animate-fade-in">
                                    <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-2xl p-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <Network className="w-5 h-5 text-slate-600" />
                                                Connect External Contexts
                                            </h3>
                                            <p className="text-sm text-slate-600 mt-1 max-w-xl">
                                                Model Context Protocol (MCP) servers allow your agent to integrate securely with external services and data sources.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setAddingServer(true)}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-b from-green to-green-hover text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow-green/20 transition-all cursor-pointer"
                                        >
                                            <Plus className="w-4 h-4" /> Add Server
                                        </button>
                                    </div>

                                    {addingServer && (
                                        <div className="rounded-2xl border-2 border-emerald-200 bg-white p-6 shadow-sm animate-fade-in-up">
                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="text-base font-bold text-slate-900">Configure New MCP Server</h4>
                                                <button onClick={() => { setAddingServer(false); setNewServerName(""); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
                                                    <X className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,450px),1fr))] gap-6">
                                                <div>
                                                    <label className="text-sm font-semibold text-slate-700 mb-2 block">Server Name</label>
                                                    <Input
                                                        value={newServerName}
                                                        onChange={(e) => setNewServerName(e.target.value)}
                                                        placeholder="e.g. filesystem or my-database"
                                                        className="h-12 text-base"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") handleAddServer();
                                                            if (e.key === "Escape") setAddingServer(false);
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-sm font-semibold text-slate-700 mb-2 block">Transport Type</label>
                                                    <div className="flex rounded-xl bg-slate-50 border border-slate-200 p-1.5 w-fit">
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewServerType("stdio")}
                                                            className={cn(
                                                                "px-6 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer",
                                                                newServerType === "stdio"
                                                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                                                                    : "text-slate-500 hover:text-slate-700",
                                                            )}
                                                        >
                                                            stdio
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewServerType("sse")}
                                                            className={cn(
                                                                "px-6 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer",
                                                                newServerType === "sse"
                                                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                                                                    : "text-slate-500 hover:text-slate-700",
                                                            )}
                                                        >
                                                            HTTP / SSE
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
                                                <button
                                                    onClick={() => { setAddingServer(false); setNewServerName(""); }}
                                                    className="px-5 py-2.5 text-base font-medium text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleAddServer}
                                                    disabled={!newServerName.trim()}
                                                    className="px-6 py-2.5 text-base font-semibold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                                                >
                                                    Create Server
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {mcpCount === 0 && !addingServer ? (
                                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                                            <Network className="w-10 h-10 text-slate-300 mb-4" />
                                            <p className="text-lg font-bold text-slate-600">No MCP servers configured.</p>
                                            <p className="text-sm text-slate-500 mt-2 max-w-sm text-center leading-relaxed">
                                                Click "Add Server" to connect standard protocols.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-5">
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
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

            {/* MCP Save Footer */}
            {tab === "mcp" && mcpDirty && (
                <div className="border-t border-slate-200 px-8 py-5 bg-white shrink-0 shadow-[0_-4px_20px_rgb(0,0,0,0.05)]">
                    <div className="content-container-wide flex justify-end">
                        <button
                            onClick={handleSaveMcp}
                            disabled={mcpSaving}
                            className="flex items-center gap-2 px-8 py-3 text-base font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 cursor-pointer"
                        >
                            {mcpSaving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Check className="w-5 h-5" />
                            )}
                            Save Configuration
                        </button>
                    </div>
                </div>
            )}

            {/* Skill Modal */}
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
