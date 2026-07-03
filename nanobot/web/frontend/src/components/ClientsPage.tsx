import { useEffect, useState, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { listClients } from "@/lib/api";
import type { Client } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { relativeTime, getInitials } from "@/lib/format";
import { ClientDetail } from "@/components/ClientDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/hub/PageHeader";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
  Loader2,
} from "lucide-react";

const PAGE_SIZE = 20;

function ChannelBadge({ channel }: { channel: string }) {
  const n = channel.toLowerCase();
  if (n.includes("telegram"))
    return (
      <Badge variant="muted" className="gap-1">
        <Send className="w-3 h-3" />
        Telegram
      </Badge>
    );
  if (n.includes("discord"))
    return (
      <Badge variant="muted" className="gap-1">
        <MessageSquare className="w-3 h-3" />
        Discord
      </Badge>
    );
  if (n.includes("whatsapp"))
    return (
      <Badge variant="muted" className="gap-1">
        <Phone className="w-3 h-3" />
        WhatsApp
      </Badge>
    );
  if (n.includes("slack"))
    return (
      <Badge variant="muted" className="gap-1">
        <Hash className="w-3 h-3" />
        Slack
      </Badge>
    );
  if (n.includes("email") || n.includes("mail"))
    return (
      <Badge variant="muted" className="gap-1">
        <Mail className="w-3 h-3" />
        Email
      </Badge>
    );
  return <Badge variant="muted">{channel}</Badge>;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "blocked", label: "Bloqueados" },
  { value: "archived", label: "Arquivados" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Mais recentes" },
  { value: "first_seen", label: "Primeiro contato" },
  { value: "interactions", label: "Mais interações" },
];

function ClientList() {
  const { setSelectedClientId } = useStore();

  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const loadClients = useCallback(
    async (q: string, status: string, sort: string, offset: number) => {
      setLoading(true);
      try {
        const res = await listClients({
          q: q || undefined,
          status: status && status !== "all" ? status : undefined,
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
    },
    [],
  );

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
  const filterLabel =
    statusFilter && statusFilter !== "all"
      ? STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label.toLowerCase() || ""
      : "";
  const subtitle = filterLabel
    ? `${total} ${statusLabel} ${filterLabel}`
    : `${total} ${statusLabel} cadastrado(s)`;

  return (
    <div className="container-app">
      <PageHeader icon={Users} title="Colaboradores" subtitle={subtitle} />

      <Card className="mb-5">
        <CardContent className="p-4 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDebouncedQuery("");
                  setPage(0);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-surface-alt text-text-muted transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && clients.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              {debouncedQuery ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              {debouncedQuery
                ? "Tente uma busca diferente"
                : "Clientes aparecerão aqui quando interagirem com o agente"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map((client) => (
            <button
              key={client.client_id}
              onClick={() => setSelectedClientId(client.client_id)}
              className="w-full flex items-center gap-4 p-4 bg-surface rounded-2xl border border-border hover:border-border-light hover:shadow-md transition-all cursor-pointer text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-purple">
                  {getInitials(client.display_name)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-bold text-text-primary truncate">
                    {client.display_name}
                  </span>
                  <Badge
                    variant={
                      client.status === "active"
                        ? "success"
                        : client.status === "blocked"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {client.status === "active"
                      ? "ativo"
                      : client.status === "blocked"
                        ? "bloqueado"
                        : "arquivado"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {client.channels.map((ch) => (
                    <ChannelBadge key={ch} channel={ch} />
                  ))}
                </div>
              </div>

              <div className="text-right shrink-0 hidden sm:block">
                <div className="text-xs font-bold text-text-secondary">
                  {client.total_interactions} mensagens
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {relativeTime(client.last_seen)}
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft />
            Anterior
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = i;
              else if (page < 3) pageNum = i;
              else if (page > totalPages - 4) pageNum = totalPages - 5 + i;
              else pageNum = page - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    "w-9 h-9 text-sm font-bold rounded-lg transition-colors cursor-pointer",
                    page === pageNum
                      ? "bg-purple text-white shadow-sm"
                      : "text-text-secondary hover:bg-surface-alt",
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Próximo
            <ChevronRight />
          </Button>
        </div>
      )}
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
