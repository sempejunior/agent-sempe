import { useEffect, useState, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import {
  getClient,
  updateClient,
  deleteClient,
  deleteClientIdentity,
  addClientIdentity,
  getClientMemory,
  updateClientLongTermMemory,
  getClientRecentMessages,
  listClientSessions,
  deleteClientSession,
  getClientSessionMessages,
  mergeClients,
  listClients,
} from "@/lib/api";
import type {
  ClientDetail as ClientDetailType,
  ClientIdentity,
  ClientMemoryData,
  ClientSession,
  Client,
  Message,
  RecentMessage,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { relativeTime, getInitials } from "@/lib/format";
import {
  ArrowLeft,
  Search,
  Trash2,
  Edit3,
  Plus,
  User,
  MessageSquare,
  Shield,
  Archive,
  GitMerge,
  X,
  Save,
  Check,
  BookOpen,
  Clock,
  Send,
  Phone,
  Hash,
  Mail,
  Link2,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Bot,
  Maximize2,
} from "lucide-react";

interface ClientDetailProps {
  clientId: string;
}

function channelIcon(channel: string) {
  const n = channel.toLowerCase();
  if (n.includes("telegram")) return <Send className="w-4 h-4 text-[#0088cc]" />;
  if (n.includes("discord")) return <MessageSquare className="w-4 h-4 text-[#5865F2]" />;
  if (n.includes("whatsapp")) return <Phone className="w-4 h-4 text-[#25D366]" />;
  if (n.includes("slack")) return <Hash className="w-4 h-4 text-[#E01E5A]" />;
  if (n.includes("email") || n.includes("mail")) return <Mail className="w-4 h-4 text-amber-500" />;
  return <Link2 className="w-4 h-4 text-slate-400" />;
}

function channelColor(channel: string): string {
  const n = channel.toLowerCase();
  if (n.includes("telegram")) return "border-[#0088cc]/20 bg-[#0088cc]/5";
  if (n.includes("discord")) return "border-[#5865F2]/20 bg-[#5865F2]/5";
  if (n.includes("whatsapp")) return "border-[#25D366]/20 bg-[#25D366]/5";
  if (n.includes("slack")) return "border-[#E01E5A]/20 bg-[#E01E5A]/5";
  if (n.includes("email") || n.includes("mail")) return "border-amber-500/20 bg-amber-500/5";
  return "border-slate-200 bg-slate-50";
}

const CHANNEL_OPTIONS = [
  "telegram",
  "discord",
  "whatsapp",
  "slack",
  "email",
  "web",
];

function IdentitiesSection({
  identities,
  clientId,
  onRefresh,
}: {
  identities: ClientIdentity[];
  clientId: string;
  onRefresh: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newChannel, setNewChannel] = useState("telegram");
  const [newExternalId, setNewExternalId] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<number | null>(null);

  const handleAdd = async () => {
    if (!newExternalId.trim()) {
      toast("error", "ID externo e obrigatorio");
      return;
    }
    setAdding(true);
    try {
      await addClientIdentity(clientId, {
        channel: newChannel,
        external_id: newExternalId.trim(),
        display_name: newDisplayName.trim() || undefined,
      });
      toast("success", "Identidade vinculada");
      setShowAddForm(false);
      setNewExternalId("");
      setNewDisplayName("");
      onRefresh();
    } catch (e) {
      toast("error", `Falha ao vincular: ${(e as Error).message}`);
    }
    setAdding(false);
  };

  const handleUnlink = async (identityId: number) => {
    setConfirmUnlink(null);
    try {
      await deleteClientIdentity(clientId, identityId);
      toast("success", "Identidade desvinculada");
      onRefresh();
    } catch (e) {
      toast("error", `Falha ao desvincular: ${(e as Error).message}`);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
            <Link2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <span className="font-display text-sm font-bold text-slate-900">Identidades</span>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Canais vinculados</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? "Cancelar" : "Vincular canal"}
        </button>
      </div>

      {showAddForm && (
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">Canal</label>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors cursor-pointer"
              >
                {CHANNEL_OPTIONS.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">ID Externo</label>
              <input
                value={newExternalId}
                onChange={(e) => setNewExternalId(e.target.value)}
                placeholder="123456789"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">Nome (opcional)</label>
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Nome no canal"
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={handleAdd}
              disabled={adding || !newExternalId.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Vincular
            </button>
          </div>
        </div>
      )}

      <div className="p-6 space-y-3">
        {identities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Link2 className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">Nenhuma identidade vinculada</p>
          </div>
        ) : (
          identities.map((identity) => (
            <div
              key={identity.id}
              className={cn(
                "group flex items-center gap-4 p-4 rounded-xl border transition-all",
                channelColor(identity.channel),
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-white/80 border border-slate-200/50 flex items-center justify-center shrink-0">
                {channelIcon(identity.channel)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 capitalize">
                    {identity.channel}
                  </span>
                  {identity.verified === 1 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200/50">
                      <ShieldCheck className="w-3 h-3" />
                      Verificado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 font-mono truncate">
                    {identity.external_id}
                  </span>
                  {identity.display_name && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-xs text-slate-400 truncate">{identity.display_name}</span>
                    </>
                  )}
                </div>
              </div>
              {confirmUnlink === identity.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleUnlink(identity.id)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmUnlink(null)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmUnlink(identity.id)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                  title="Desvincular identidade"
                >
                  Desvincular
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: RecentMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm",
            isUser
              ? "bg-emerald-500 text-white rounded-br-md"
              : "bg-white text-slate-800 border border-slate-200 rounded-bl-md",
          )}
        >
          {msg.content}
        </div>
        {msg.timestamp && (
          <span className={cn(
            "text-[10px] font-medium text-slate-400 mt-0.5 block px-1",
            isUser ? "text-right" : "text-left",
          )}>
            {new Date(msg.timestamp).toLocaleString("pt-BR", {
              hour: "2-digit", minute: "2-digit",
              day: "2-digit", month: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

function ChatModal({
  messages,
  onClose,
}: {
  messages: RecentMessage[];
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chronological = messages;
  const filtered = searchQuery.trim()
    ? chronological.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : chronological;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-lg mx-4 h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div className="bg-emerald-600 px-5 py-4 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white">Historico de Conversas</h3>
            <p className="text-xs text-emerald-100">{messages.length} mensagens</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="px-3 py-2 bg-white border-b border-slate-200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar mensagens..."
              className="w-full h-9 pl-9 pr-9 text-sm bg-slate-50 border border-slate-200 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEiIGZpbGw9IiNlMmU4ZjAiIG9wYWNpdHk9Ii4zIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2EpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] scrollbar-thin"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold">
                {searchQuery ? "Nenhum resultado" : "Sem mensagens"}
              </p>
            </div>
          ) : (
            filtered.map((msg, i) => <ChatBubble key={i} msg={msg} />)
          )}
        </div>
      </div>
    </div>
  );
}

function MemorySection({ clientId }: { clientId: string }) {
  const [memData, setMemData] = useState<ClientMemoryData | null>(null);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [longTerm, setLongTerm] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);

  const PREVIEW_COUNT = 4;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mem, msgs] = await Promise.all([
        getClientMemory(clientId),
        getClientRecentMessages(clientId),
      ]);
      setMemData(mem);
      setLongTerm(mem.long_term || "");
      setRecentMessages(msgs);
      setDirty(false);
    } catch (e) {
      toast("error", `Falha ao carregar dados: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClientLongTermMemory(clientId, longTerm);
      setDirty(false);
      setSaved(true);
      toast("success", "Memoria salva");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const previewMessages = recentMessages.slice(-PREVIEW_COUNT);
  const hasMore = recentMessages.length > PREVIEW_COUNT;

  if (loading && !memData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {showChatModal && (
        <ChatModal messages={recentMessages} onClose={() => setShowChatModal(false)} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <span className="font-display text-sm font-bold text-slate-900">Fatos de Longa Duracao</span>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Informacoes permanentes</p>
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
              placeholder={"Insira informacoes permanentes sobre este cliente...\n\nExemplo:\n- Nome completo: Carlos Silva\n- Prefere portugues\n- Cliente VIP"}
              className="w-full min-h-[200px] resize-none text-sm leading-relaxed bg-white border border-slate-200 rounded-xl p-4 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors font-mono"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-bold">
                  <Check className="w-4 h-4" />
                  Salvo
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
                <Clock className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="font-display text-sm font-bold text-slate-900">
                Historico Recente
              </span>
              {recentMessages.length > 0 && (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                  {recentMessages.length}
                </span>
              )}
            </div>
            {recentMessages.length > 0 && (
              <button
                onClick={() => setShowChatModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Ver tudo
              </button>
            )}
          </div>

          <div className="flex-1 p-4 space-y-2 bg-slate-50/50">
            {previewMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Clock className="w-8 h-8 text-slate-300 mb-2" />
                <p className="font-display text-sm font-semibold">Sem historico ainda</p>
              </div>
            ) : (
              <>
                {previewMessages.map((msg, i) => <ChatBubble key={i} msg={msg} />)}
                {hasMore && (
                  <button
                    onClick={() => setShowChatModal(true)}
                    className="w-full py-2.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                  >
                    Ver conversa completa ({recentMessages.length} mensagens)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SessionsSection({ clientId }: { clientId: string }) {
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [expandedSessionKey, setExpandedSessionKey] = useState<string | null>(null);
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listClientSessions(clientId);
      setSessions(data);
    } catch (e) {
      toast("error", `Falha ao carregar sessoes: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = async (sessionKey: string) => {
    setConfirmDeleteKey(null);
    try {
      await deleteClientSession(clientId, sessionKey);
      toast("success", "Sessao removida");
      if (expandedSessionKey === sessionKey) setExpandedSessionKey(null);
      loadSessions();
    } catch (e) {
      toast("error", `Falha ao remover: ${(e as Error).message}`);
    }
  };

  const toggleSession = async (sessionKey: string) => {
    if (expandedSessionKey === sessionKey) {
      setExpandedSessionKey(null);
      return;
    }
    setExpandedSessionKey(sessionKey);
    if (messagesCache[sessionKey]) return;
    setLoadingMessages(sessionKey);
    try {
      const msgs = await getClientSessionMessages(clientId, sessionKey);
      setMessagesCache((prev) => ({ ...prev, [sessionKey]: msgs }));
    } catch (e) {
      toast("error", `Falha ao carregar mensagens: ${(e as Error).message}`);
      setExpandedSessionKey(null);
    }
    setLoadingMessages(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden card-glow">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-left">
            <span className="font-display text-sm font-bold text-slate-900">Sessoes</span>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              {sessions.length} {sessions.length === 1 ? "sessao" : "sessoes"}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="p-6 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold">Nenhuma sessao</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isOpen = expandedSessionKey === session.session_key;
              const msgs = messagesCache[session.session_key];
              const isLoadingMsgs = loadingMessages === session.session_key;

              return (
                <div
                  key={session.session_key}
                  className={cn(
                    "rounded-xl border transition-all",
                    isOpen
                      ? "border-emerald-200 bg-emerald-50/20"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50",
                  )}
                >
                  <div className="group flex items-center gap-4 p-4">
                    <button
                      onClick={() => toggleSession(session.session_key)}
                      className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-slate-900 truncate block font-mono">
                          {session.session_key}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">
                            {session.message_count} {session.message_count === 1 ? "mensagem" : "mensagens"}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-xs text-slate-400">
                            {relativeTime(session.updated_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                    {confirmDeleteKey === session.session_key ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleDelete(session.session_key)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmDeleteKey(null)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteKey(session.session_key)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        title="Remover sessao"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="border-t border-slate-100 pt-3 space-y-2 max-h-96 overflow-y-auto">
                        {isLoadingMsgs ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                          </div>
                        ) : msgs && msgs.length > 0 ? (
                          msgs.map((msg, i) => {
                            const isUser = msg.role === "user";
                            return (
                              <div key={i} className="flex items-start gap-2.5">
                                <div
                                  className={cn(
                                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                    isUser
                                      ? "bg-slate-100 border border-slate-200"
                                      : "bg-emerald-50 border border-emerald-200/60",
                                  )}
                                >
                                  {isUser ? (
                                    <User className="w-3 h-3 text-slate-400" />
                                  ) : (
                                    <Bot className="w-3 h-3 text-emerald-500" />
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    "rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap",
                                    isUser
                                      ? "bg-slate-100 text-slate-800"
                                      : "bg-emerald-50 text-slate-800",
                                  )}
                                >
                                  {msg.content}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-400 text-center py-4">
                            Nenhuma mensagem nesta sessao
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function MergeDialog({
  primaryClient: primary,
  onClose,
  onMerged,
}: {
  primaryClient: ClientDetailType;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<Client[]>([]);
  const [selectedSecondary, setSelectedSecondary] = useState<Client | null>(null);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const res = await listClients({ q: q.trim(), limit: 10 });
      setCandidates(res.clients.filter((c) => c.client_id !== primary.client_id));
    } catch {
      setCandidates([]);
    }
    setSearching(false);
  }, [primary.client_id]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedSecondary(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleMerge = async () => {
    if (!selectedSecondary) return;
    setMerging(true);
    try {
      await mergeClients(primary.client_id, selectedSecondary.client_id);
      toast("success", "Clientes unificados com sucesso");
      onMerged();
      onClose();
    } catch (e) {
      toast("error", `Falha ao unificar: ${(e as Error).message}`);
    }
    setMerging(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg animate-fade-in-scale">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Unificar Clientes</h2>
              <p className="text-xs text-slate-500">Combinar dois perfis em um</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              Cliente Primario (mantido)
            </label>
            <div className="flex items-center gap-3 p-3 bg-emerald-50/50 border border-emerald-200/50 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-white">{getInitials(primary.display_name)}</span>
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">{primary.display_name}</span>
                <span className="text-xs text-slate-500 block font-mono">{primary.client_id}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              Cliente Secundario (sera absorvido)
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar cliente para unificar..."
                style={{ paddingLeft: "2.5rem" }}
                className="w-full h-11 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
              />
            </div>

            {searching && (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            )}

            {!searching && candidates.length > 0 && !selectedSecondary && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.client_id}
                    onClick={() => {
                      setSelectedSecondary(c);
                      setSearchQuery(c.display_name);
                      setCandidates([]);
                    }}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer text-left border-b border-slate-100 last:border-b-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-white">{getInitials(c.display_name)}</span>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-900">{c.display_name}</span>
                      <span className="text-xs text-slate-400 block">{c.channels.join(", ")}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedSecondary && (
              <div className="flex items-center gap-3 p-3 mt-2 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">{getInitials(selectedSecondary.display_name)}</span>
                </div>
                <div className="flex-1">
                  <span className="text-sm font-bold text-slate-900">{selectedSecondary.display_name}</span>
                  <span className="text-xs text-slate-500 block font-mono">{selectedSecondary.client_id}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedSecondary(null);
                    setSearchQuery("");
                  }}
                  className="p-1 rounded-lg hover:bg-amber-100 text-amber-500 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {selectedSecondary && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600">
              <p className="font-bold text-slate-700 mb-2">O que vai acontecer:</p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  Identidades de <strong>{selectedSecondary.display_name}</strong> serao movidas para <strong>{primary.display_name}</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  Memorias e sessoes serao combinadas
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  O perfil de <strong>{selectedSecondary.display_name}</strong> sera removido
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleMerge}
            disabled={!selectedSecondary || merging}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-b from-green to-green-hover rounded-xl hover:shadow-lg hover:shadow-green/25 shadow-sm shadow-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {merging ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitMerge className="w-4 h-4" />
            )}
            Unificar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientDetail({ clientId }: ClientDetailProps) {
  const { setSelectedClientId } = useStore();

  const [client, setClient] = useState<ClientDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  const loadClient = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getClient(clientId);
      setClient(data);
      setNameValue(data.display_name);
    } catch (e) {
      toast("error", `Falha ao carregar cliente: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    loadClient();
  }, [loadClient]);

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await updateClient(clientId, { display_name: nameValue.trim() });
      setEditingName(false);
      toast("success", "Nome atualizado");
      loadClient();
    } catch (e) {
      toast("error", `Falha ao atualizar: ${(e as Error).message}`);
    }
    setSavingName(false);
  };

  const handleStatusChange = async (status: string) => {
    setConfirmBlock(false);
    setConfirmArchive(false);
    try {
      await updateClient(clientId, { status });
      toast("success", `Status alterado para ${status}`);
      loadClient();
    } catch (e) {
      toast("error", `Falha ao alterar status: ${(e as Error).message}`);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteClient(clientId);
      toast("success", "Cliente removido");
      setSelectedClientId(null);
    } catch (e) {
      toast("error", `Falha ao remover: ${(e as Error).message}`);
    }
  };

  if (loading && !client) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-7 h-7 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-slate-400 text-sm">Cliente nao encontrado</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-8 pt-6 pb-2 shrink-0">
        <button
          onClick={() => setSelectedClientId(null)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Clientes
        </button>

        <div className="content-container">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
              <span className="text-xl font-bold text-white">{getInitials(client.display_name)}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") {
                          setEditingName(false);
                          setNameValue(client.display_name);
                        }
                      }}
                      className="h-9 px-3 text-lg font-bold bg-white border border-emerald-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      {savingName ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditingName(false);
                        setNameValue(client.display_name);
                      }}
                      className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="font-display text-2xl font-bold text-slate-900 truncate">
                      {client.display_name}
                    </h1>
                    <button
                      onClick={() => setEditingName(true)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      title="Editar nome"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </>
                )}

                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border",
                    client.status === "active" && "bg-emerald-50 text-emerald-600 border-emerald-200/50",
                    client.status === "blocked" && "bg-red-50 text-red-600 border-red-200/50",
                    client.status === "archived" && "bg-slate-100 text-slate-500 border-slate-200",
                  )}
                >
                  {client.status === "active" ? "ativo" : client.status === "blocked" ? "bloqueado" : "arquivado"}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Desde {new Date(client.first_seen).toLocaleDateString("pt-BR")}
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>{client.total_interactions} interacoes</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>Visto {relativeTime(client.last_seen)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8 pt-4">
        <div className="content-container space-y-6 animate-fade-in-up">
          <IdentitiesSection
            identities={client.identities}
            clientId={clientId}
            onRefresh={loadClient}
          />

          <MemorySection clientId={clientId} />

          <SessionsSection clientId={clientId} />

          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <span className="font-display text-sm font-bold text-slate-900">Acoes</span>
            </div>
            <div className="p-6 flex flex-wrap gap-3">
              {client.status === "active" ? (
                confirmBlock ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStatusChange("blocked")}
                      className="px-4 py-2.5 text-sm font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200/50 transition-colors cursor-pointer"
                    >
                      Confirmar Bloqueio
                    </button>
                    <button
                      onClick={() => setConfirmBlock(false)}
                      className="px-4 py-2.5 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmBlock(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                  >
                    <Shield className="w-4 h-4" />
                    Bloquear Cliente
                  </button>
                )
              ) : client.status === "blocked" ? (
                <button
                  onClick={() => handleStatusChange("active")}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-emerald-50 border border-emerald-200/50 text-emerald-600 hover:bg-emerald-100 transition-all cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  Desbloquear
                </button>
              ) : null}

              {client.status === "active" ? (
                confirmArchive ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStatusChange("archived")}
                      className="px-4 py-2.5 text-sm font-bold rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200/50 transition-colors cursor-pointer"
                    >
                      Confirmar Arquivamento
                    </button>
                    <button
                      onClick={() => setConfirmArchive(false)}
                      className="px-4 py-2.5 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmArchive(true)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 transition-all cursor-pointer"
                  >
                    <Archive className="w-4 h-4" />
                    Arquivar Cliente
                  </button>
                )
              ) : client.status === "archived" ? (
                <button
                  onClick={() => handleStatusChange("active")}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-emerald-50 border border-emerald-200/50 text-emerald-600 hover:bg-emerald-100 transition-all cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  Desarquivar
                </button>
              ) : null}

              <button
                onClick={() => setShowMerge(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 transition-all cursor-pointer"
              >
                <GitMerge className="w-4 h-4" />
                Unificar Clientes
              </button>

              <div className="flex-1" />

              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2.5 text-sm font-bold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer shadow-sm shadow-red-500/20"
                  >
                    Confirmar Exclusao
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-4 py-2.5 text-sm font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Deletar Cliente
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showMerge && (
        <MergeDialog
          primaryClient={client}
          onClose={() => setShowMerge(false)}
          onMerged={loadClient}
        />
      )}
    </div>
  );
}
