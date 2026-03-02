import { useEffect, useState, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { listClients } from "@/lib/api";
import type { Client } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { relativeTime, getInitials } from "@/lib/format";
import { ClientDetail } from "@/components/ClientDetail";
import {
  Users,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Send,
  Phone,
  Hash,
  Mail,
  Filter,
  ArrowUpDown,
} from "lucide-react";

const PAGE_SIZE = 20;

function ChannelBadge({ channel }: { channel: string }) {
  const n = channel.toLowerCase();

  if (n.includes("telegram")) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#0088cc]/10 text-[#0088cc] border border-[#0088cc]/20">
        <Send className="w-3 h-3" />
        Telegram
      </span>
    );
  }
  if (n.includes("discord")) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20">
        <MessageSquare className="w-3 h-3" />
        Discord
      </span>
    );
  }
  if (n.includes("whatsapp")) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20">
        <Phone className="w-3 h-3" />
        WhatsApp
      </span>
    );
  }
  if (n.includes("slack")) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#E01E5A]/10 text-[#E01E5A] border border-[#E01E5A]/20">
        <Hash className="w-3 h-3" />
        Slack
      </span>
    );
  }
  if (n.includes("email") || n.includes("mail")) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">
        <Mail className="w-3 h-3" />
        Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
      {channel}
    </span>
  );
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "blocked", label: "Bloqueados" },
  { value: "archived", label: "Arquivados" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Mais recentes" },
  { value: "first_seen", label: "Primeiro contato" },
  { value: "interactions", label: "Mais interacoes" },
];

function ClientList() {
  const { setSelectedClientId } = useStore();

  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const loadClients = useCallback(async (q: string, status: string, sort: string, offset: number) => {
    setLoading(true);
    try {
      const res = await listClients({
        q: q || undefined,
        status: status || undefined,
        sort,
        limit: PAGE_SIZE,
        offset,
      });
      setClients(res.clients);
      setTotal(res.total);
    } catch (e) {
      toast("error", `Falha ao carregar clientes: ${(e as Error).message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClients(debouncedQuery, statusFilter, sortBy, page * PAGE_SIZE);
  }, [debouncedQuery, statusFilter, sortBy, page, loadClients]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setPage(0);
    }, 300);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusLabel = total === 1 ? "cliente" : "clientes";
  const filterLabel = statusFilter
    ? STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label.toLowerCase() || ""
    : "";
  const subtitle = filterLabel
    ? `${total} ${statusLabel} ${filterLabel}`
    : `${total} ${statusLabel}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-8 pt-8 pb-4 shrink-0">
        <div className="content-container">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50 flex items-center justify-center">
              <Users size={20} className="text-emerald-500" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">Clientes</h1>
              <p className="text-slate-500 text-sm">{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pb-4 shrink-0">
        <div className="content-container flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nome..."
              style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
              className="w-full h-11 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                  setPage(0);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
                className="h-11 pl-8 pr-8 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors cursor-pointer appearance-none"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(0);
                }}
                className="h-11 pl-8 pr-8 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10 transition-colors cursor-pointer appearance-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="content-container animate-fade-in-up">
          {loading && clients.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-[3px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : clients.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-12 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/50 flex items-center justify-center mb-5">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-display text-base font-bold text-slate-900">
                {debouncedQuery ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
              </p>
              <p className="text-sm mt-1.5 text-slate-500 font-medium">
                {debouncedQuery
                  ? "Tente uma busca diferente"
                  : "Clientes aparecerao aqui quando interagirem com o agente"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.map((client) => (
                <button
                  key={client.client_id}
                  onClick={() => setSelectedClientId(client.client_id)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgb(0,0,0,0.02)] border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all cursor-pointer text-left group card-glow"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
                    <span className="text-sm font-bold text-white">
                      {getInitials(client.display_name)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {client.display_name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                          client.status === "active" && "bg-emerald-50 text-emerald-600 border border-emerald-200/50",
                          client.status === "blocked" && "bg-red-50 text-red-600 border border-red-200/50",
                          client.status === "archived" && "bg-slate-100 text-slate-500 border border-slate-200",
                        )}
                      >
                        {client.status === "active" ? "ativo" : client.status === "blocked" ? "bloqueado" : "arquivado"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {client.channels.map((ch) => (
                        <ChannelBadge key={ch} channel={ch} />
                      ))}
                    </div>
                  </div>

                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-xs font-bold text-slate-500">
                      {client.total_interactions} mensagens
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {relativeTime(client.last_seen)}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-9 h-9 text-sm font-bold rounded-lg transition-colors cursor-pointer",
                        page === pageNum
                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                          : "text-slate-500 hover:bg-slate-100",
                      )}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Proximo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const { selectedClientId } = useStore();

  if (selectedClientId) {
    return <ClientDetail clientId={selectedClientId} />;
  }

  return <ClientList />;
}
