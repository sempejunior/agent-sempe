import { useEffect, useState, useRef } from "react";
import { getPrompts, updatePrompts } from "@/lib/api";
import type { PromptSection } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
    Sparkles,
    Save,
    Check,
    ChevronDown,
    Lock,
    Loader2,
    Bold,
    Italic,
    Heading,
    List,
    ListOrdered,
    Code,
    Link,
} from "lucide-react";

export function PromptsPanel() {
    const [sections, setSections] = useState<PromptSection[]>([]);
    const [extensions, setExtensions] = useState<Record<string, string>>({});
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);

    const loadPrompts = async () => {
        setLoading(true);
        try {
            const data = await getPrompts();
            setSections(data);
            const exts: Record<string, string> = {};
            for (const s of data) {
                exts[s.filename] = s.extension;
            }
            setExtensions(exts);
            setDirty(false);
        } catch (e) {
            toast("error", `Failed to load prompts: ${(e as Error).message}`);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadPrompts();
    }, []);

    const handleExtensionChange = (filename: string, value: string) => {
        setExtensions((prev) => ({ ...prev, [filename]: value }));
        setDirty(true);
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = sections.map((s) => ({
                filename: s.filename,
                extension: extensions[s.filename] || "",
            }));
            await updatePrompts(payload);
            toast("success", "Agent prompts saved");
            setDirty(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            toast("error", `Failed to save: ${(e as Error).message}`);
        }
        setSaving(false);
    };

    const activeSection = sections[selectedIdx];
    const activeExtension = activeSection ? (extensions[activeSection.filename] || "") : "";

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertMarkdown = (prefix: string, suffix: string = "") => {
        const ta = textareaRef.current;
        if (!ta || !activeSection) return;

        const currentVal = extensions[activeSection.filename] || "";
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = currentVal.substring(start, end);
        const newText = currentVal.substring(0, start) + prefix + selected + suffix + currentVal.substring(end);

        handleExtensionChange(activeSection.filename, newText);

        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 0);
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Page Header */}
            <div className="px-8 pt-8 pb-4 shrink-0">
                <div className="content-container flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center shrink-0">
                            <Sparkles className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="font-display text-2xl font-bold text-slate-900">Agent Prompts</h1>
                            <p className="text-sm text-slate-500 mt-1">
                                Customize how your agent behaves. Select a section to view its core rules and append your own.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {saved && (
                            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg">
                                <Check className="w-4 h-4" />
                                Saved
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!dirty || saving || loading}
                            className="px-6 py-3 text-sm font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                        >
                            {saving ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Save className="w-5 h-5" />
                            )}
                            Save Prompts
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 flex flex-col">
                <div className="content-container flex-1 flex flex-col">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        </div>
                    ) : sections.length > 0 ? (
                        <div className="flex-1 flex flex-col animate-fade-in-up">
                            {/* Selector */}
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Prompt Section</label>
                                <div className="relative">
                                    <select
                                        value={selectedIdx}
                                        onChange={(e) => setSelectedIdx(Number(e.target.value))}
                                        className="w-full h-12 px-4 pr-10 text-base bg-white border border-slate-200 rounded-xl text-slate-900 appearance-none focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors cursor-pointer font-medium shadow-sm"
                                    >
                                        {sections.map((sec, i) => (
                                            <option key={sec.filename} value={i}>
                                                {sec.label} — {sec.description}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Editor Area */}
                            <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden">
                                <div className="p-8 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                                            <Lock className="w-4 h-4 text-slate-400" /> System Prompt (Read-only)
                                        </h3>
                                    </div>
                                    <div className="p-5 rounded-2xl bg-slate-900 text-slate-300 text-base font-mono leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto shadow-inner">
                                        {activeSection.base || "(empty)"}
                                    </div>
                                </div>
                                <div className="p-8 flex-1 flex flex-col min-h-[350px]">
                                    <label className="block text-base font-bold text-emerald-700 mb-4">
                                        {activeSection.hint}
                                    </label>

                                    {/* Markdown Toolbar */}
                                    <div className="flex items-center gap-1 p-2 bg-slate-100 rounded-t-xl border border-b-0 border-slate-200 shrink-0">
                                        <button onClick={() => insertMarkdown("**", "**")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Bold">
                                            <Bold className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => insertMarkdown("_", "_")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Italic">
                                            <Italic className="w-4 h-4" />
                                        </button>
                                        <div className="w-px h-5 bg-slate-300 mx-2" />
                                        <button onClick={() => insertMarkdown("### ")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Heading">
                                            <Heading className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => insertMarkdown("- ")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Bullet List">
                                            <List className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => insertMarkdown("1. ")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Numbered List">
                                            <ListOrdered className="w-4 h-4" />
                                        </button>
                                        <div className="w-px h-5 bg-slate-300 mx-2" />
                                        <button onClick={() => insertMarkdown("`", "`")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Inline Code">
                                            <Code className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => insertMarkdown("[", "](url)")} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer" title="Link">
                                            <Link className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <textarea
                                        ref={textareaRef}
                                        value={activeExtension}
                                        onChange={(e) => handleExtensionChange(activeSection.filename, e.target.value)}
                                        placeholder={`Write your instructions here... Example:\n- ${activeSection.label === "Soul" ? "You are a friendly assistant. Always be warm and empathetic." : activeSection.label === "Behavior" ? "Always check our internal docs before answering customer questions." : "I'm Carlos, CTO at Acme Corp."}`}
                                        className="flex-1 w-full resize-none text-base font-mono leading-relaxed bg-slate-50 border border-slate-200 rounded-b-xl p-5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

        </div>
    );
}
