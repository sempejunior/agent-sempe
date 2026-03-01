import { useEffect, useState, useRef, useCallback } from "react";
import {
    getMemory,
    updateLongTermMemory,
    clearMemoryHistory,
    deleteMemoryHistoryEntry,
    searchMemory,
} from "@/lib/api";
import type { MemoryData, MemorySearchResult } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
    BrainCircuit,
    Trash2,
    Save,
    Search,
    X,
    BookOpen,
    Clock,
    Check,
} from "lucide-react";

export function MemoryPage() {
    const [data, setData] = useState<MemoryData | null>(null);
    const [loading, setLoading] = useState(false);
    const [longTerm, setLongTerm] = useState("");
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);

    const loadMemory = async () => {
        setLoading(true);
        try {
            const mem = await getMemory();
            setData(mem);
            setLongTerm(mem.long_term || "");
            setDirty(false);
        } catch (e) {
            toast("error", `Failed to load memory: ${(e as Error).message}`);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadMemory();
    }, []);

    const doSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        try {
            const res = await searchMemory(query.trim());
            setSearchResults(res.results);
        } catch {
            setSearchResults(null);
        }
        setSearching(false);
    }, []);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(value), 300);
    };

    const handleSaveLongTerm = async () => {
        setSaving(true);
        try {
            await updateLongTermMemory(longTerm);
            setDirty(false);
            setSaved(true);
            toast("success", "Core memory saved");
            setTimeout(() => setSaved(false), 2000);
            loadMemory();
        } catch (e) {
            toast("error", `Failed to save: ${(e as Error).message}`);
        }
        setSaving(false);
    };

    const handleClearHistory = async () => {
        setConfirmClearAll(false);
        try {
            await clearMemoryHistory();
            toast("success", "History cleared");
            loadMemory();
        } catch (e) {
            toast("error", `Failed to clear history: ${(e as Error).message}`);
        }
    };

    const handleDeleteEntry = async (id: number) => {
        setConfirmDeleteId(null);
        try {
            await deleteMemoryHistoryEntry(id);
            toast("success", "Entry deleted");
            loadMemory();
            if (searchQuery.trim()) doSearch(searchQuery);
        } catch (e) {
            toast("error", `Failed to delete entry: ${(e as Error).message}`);
        }
    };

    const historyEntries = searchResults !== null ? searchResults : (data?.history ?? []);

    if (loading && !data) {
        return (
            <div className="flex-1 flex items-center justify-center h-full">
                <div className="w-7 h-7 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Page Header */}
            <div className="px-8 pt-8 pb-4 shrink-0">
                <div className="content-container">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                            <BrainCircuit size={20} className="text-emerald-500" />
                        </div>
                        <div>
                            <h1 className="font-display text-2xl font-bold text-slate-900">Agent Memory</h1>
                            <p className="text-slate-500 text-sm">Manage core memories and view conversation history.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-y-auto px-8 pb-8">
                <div className="content-container grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-fade-in-up">
                    {/* Card 1: Core Memory */}
                    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                                    <BookOpen className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                    <span className="font-display text-sm font-bold text-slate-900">Core Memory</span>
                                    <p className="text-xs font-medium text-slate-400 mt-0.5">Permanent rules & facts</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            <textarea
                                value={longTerm}
                                onChange={(e) => {
                                    setLongTerm(e.target.value);
                                    setDirty(true);
                                    setSaved(false);
                                }}
                                placeholder={"Enter permanent instructions or facts about the user here...\n\nExample:\n- User's name is Carlos\n- Prefers responses in Portuguese\n- Works at PicPay as a developer"}
                                className="w-full min-h-[250px] resize-none text-base leading-relaxed bg-white border border-slate-200 rounded-xl p-5 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors font-mono"
                            />
                            <div className="flex items-center justify-end gap-3 mt-5">
                                {saved && (
                                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-bold">
                                        <Check className="w-4 h-4" />
                                        Saved
                                    </span>
                                )}
                                <button
                                    onClick={handleSaveLongTerm}
                                    disabled={!dirty || saving}
                                    className="px-6 py-2.5 text-base font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                                >
                                    {saving ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save className="w-5 h-5" />
                                    )}
                                    Save Core Memory
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Conversational History */}
                    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                                    <Clock className="w-4 h-4 text-emerald-500" />
                                </div>
                                <span className="font-display text-sm font-bold text-slate-900">
                                    Conversational History
                                </span>
                                {historyEntries.length > 0 && (
                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                                        {historyEntries.length}
                                    </span>
                                )}
                            </div>

                            {confirmClearAll ? (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleClearHistory}
                                        className="px-4 py-2 text-sm font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                                    >
                                        Confirm Clear
                                    </button>
                                    <button
                                        onClick={() => setConfirmClearAll(false)}
                                        className="px-4 py-2 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmClearAll(true)}
                                    className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                    Clear History
                                </button>
                            )}
                        </div>

                        {/* Search bar */}
                        <div className="px-6 pt-5">
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    placeholder="Search history..."
                                    style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
                                    className="w-full h-12 text-base bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery("");
                                            setSearchResults(null);
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Entries list */}
                        <div className="p-6 pt-4 space-y-3">
                            {searching && (
                                <div className="flex items-center justify-center py-10">
                                    <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                </div>
                            )}

                            {!searching && historyEntries.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/50 flex items-center justify-center mb-4">
                                        <BrainCircuit className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <p className="font-display text-sm font-semibold text-slate-400">
                                        {searchQuery ? "No results found" : "No history recorded yet"}
                                    </p>
                                    {!searchQuery && (
                                        <p className="text-xs mt-1.5 text-slate-300">
                                            Memories are saved automatically as you chat
                                        </p>
                                    )}
                                </div>
                            )}

                            {!searching && historyEntries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="group rounded-xl border border-slate-100 bg-white hover:bg-slate-50/70 hover:border-slate-200 transition-all p-5 card-glow"
                                >
                                    <p className="text-base text-slate-700 leading-relaxed break-words whitespace-pre-wrap">
                                        {entry.content}
                                    </p>
                                    <div className="flex items-center justify-between mt-4">
                                        <span className="text-sm font-medium text-slate-400 font-mono">
                                            {new Date(entry.created_at).toLocaleString()}
                                        </span>
                                        {confirmDeleteId === entry.id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(entry.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                title="Delete entry"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span>Delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
