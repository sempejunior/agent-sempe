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
import { useStore } from "@/lib/store";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/hub/PageHeader";
import {
  BrainCircuit,
  Trash2,
  Save,
  Search,
  X,
  BookOpen,
  Clock,
  Check,
  Loader2,
} from "lucide-react";

export function MemoryPage() {
  const activeAgentId = useStore((s) => s.activeAgentId);
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
      toast("error", `Falha ao carregar memória: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMemory();
  }, [activeAgentId]);

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
      toast("success", "Memória salva");
      setTimeout(() => setSaved(false), 2000);
      loadMemory();
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const handleClearHistory = async () => {
    setConfirmClearAll(false);
    try {
      await clearMemoryHistory();
      toast("success", "Histórico limpo");
      loadMemory();
    } catch (e) {
      toast("error", `Falha ao limpar histórico: ${(e as Error).message}`);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    setConfirmDeleteId(null);
    try {
      await deleteMemoryHistoryEntry(id);
      toast("success", "Entrada removida");
      loadMemory();
      if (searchQuery.trim()) doSearch(searchQuery);
    } catch (e) {
      toast("error", `Falha ao remover: ${(e as Error).message}`);
    }
  };

  const historyEntries = searchResults !== null ? searchResults : data?.history ?? [];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-7 h-7 text-purple animate-spin" />
      </div>
    );
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={BrainCircuit}
        title="Memória do Agente"
        subtitle="Gerencie memórias permanentes e consulte o histórico de conversas."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start">
        <Card>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="w-8 h-8 rounded-xl bg-purple-muted flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-purple" />
            </div>
            <div>
              <span className="font-display text-sm font-bold text-text-primary">
                Core Memory
              </span>
              <p className="text-xs text-text-muted mt-0.5">Regras e fatos permanentes</p>
            </div>
          </div>
          <CardContent className="p-5 pt-5">
            <Textarea
              variant="code"
              value={longTerm}
              onChange={(e) => {
                setLongTerm(e.target.value);
                setDirty(true);
                setSaved(false);
              }}
              placeholder={
                "Instruções permanentes sobre o usuário...\n\nExemplo:\n- Nome do usuário é Carlos\n- Prefere respostas em português\n- Trabalha na PicPay como developer"
              }
              className="min-h-[280px] text-[13px] leading-relaxed p-5"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              {saved && (
                <Badge variant="success" className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Salvo
                </Badge>
              )}
              <Button onClick={handleSaveLongTerm} disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-muted flex items-center justify-center">
                <Clock className="w-4 h-4 text-purple" />
              </div>
              <span className="font-display text-sm font-bold text-text-primary">
                Histórico de conversa
              </span>
              {historyEntries.length > 0 && (
                <Badge variant="muted">{historyEntries.length}</Badge>
              )}
            </div>

            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="danger" onClick={handleClearHistory}>
                  Confirmar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClearAll(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmClearAll(true)}>
                Limpar histórico
              </Button>
            )}
          </div>

          <div className="px-5 pt-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar no histórico..."
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-surface-alt text-text-muted transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="p-5 pt-4 space-y-3">
            {searching && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 text-purple animate-spin" />
              </div>
            )}

            {!searching && historyEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-text-muted">
                <div className="w-14 h-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4">
                  <BrainCircuit className="w-7 h-7 text-text-muted" />
                </div>
                <p className="font-display text-sm font-semibold">
                  {searchQuery ? "Nenhum resultado" : "Sem histórico ainda"}
                </p>
                {!searchQuery && (
                  <p className="text-xs mt-1.5 text-text-muted">
                    Memórias são salvas automaticamente durante a conversa
                  </p>
                )}
              </div>
            )}

            {!searching &&
              historyEntries.map((entry) => (
                <Card
                  key={entry.id}
                  className="group hover:bg-surface-alt/50 hover:border-border-light transition-all"
                >
                  <CardContent className="p-4 pt-4">
                    <p className="text-sm text-text-primary leading-relaxed break-words whitespace-pre-wrap">
                      {entry.content}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs font-mono text-text-muted">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                      {confirmDeleteId === entry.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteEntry(entry.id)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red hover:bg-red-muted"
                          title="Remover entrada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
