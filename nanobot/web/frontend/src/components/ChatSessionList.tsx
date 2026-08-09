import { useMemo, useState } from "react";
import { Bot, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { relativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const ALL_AGENTS = "all";

/** O histórico de todas as conversas, de todos os agentes.
 *
 *  A conversa pertence ao agente que a conduziu, então abrir uma seleciona ele.
 *  Escopar a lista pelo agente selecionado esconderia a maior parte do próprio
 *  histórico da pessoa atrás de um dropdown.
 */
export function ChatSessionList() {
  const [collapsed, setCollapsed] = useState(false);
  const [agentFilter, setAgentFilter] = useState(ALL_AGENTS);
  const sessions = useStore((s) => s.sessions);
  const activeSessionKey = useStore((s) => s.activeSessionKey);
  const loadingSessions = useStore((s) => s.loadingSessions);
  const selectSession = useStore((s) => s.selectSession);
  const removeSession = useStore((s) => s.removeSession);
  const newChat = useStore((s) => s.newChat);

  const agents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of sessions) seen.set(s.agent_id, s.agent_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const visible = useMemo(
    () =>
      agentFilter === ALL_AGENTS
        ? sessions
        : sessions.filter((s) => s.agent_id === agentFilter),
    [sessions, agentFilter],
  );

  async function discard(key: string) {
    try {
      await removeSession(key);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 h-full border-r border-border bg-surface-alt/40 flex flex-col items-center gap-1 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={`Mostrar histórico (${sessions.length})`}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => newChat()}
          title="Nova conversa"
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 h-full border-r border-border bg-surface-alt/40 flex flex-col">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => newChat()}>
            <MessageSquarePlus />
            Nova conversa
          </Button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Ocultar histórico"
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {agents.length > 1 && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS}>Todos os agentes</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-xs text-text-muted text-center">
            {loadingSessions
              ? "Carregando histórico..."
              : "Suas conversas aparecem aqui."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((session) => {
              const isActive = session.session_key === activeSessionKey;
              return (
                <li key={session.session_key} className="group relative">
                  <button
                    type="button"
                    onClick={() => selectSession(session.session_key, session.agent_id)}
                    className={cn(
                      "w-full text-left rounded-xl px-3 py-2 pr-9 transition-colors",
                      isActive
                        ? "bg-purple-muted text-purple-hover"
                        : "hover:bg-surface-alt text-text-secondary",
                    )}
                  >
                    <span className="block text-sm truncate">{session.title}</span>
                    <span className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5">
                      <Bot className="w-3 h-3 shrink-0" />
                      <span className="truncate">{session.agent_name}</span>
                    </span>
                    <span className="block text-[11px] text-text-muted">
                      {relativeTime(session.updated_at)} · {session.message_count} mensagens
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => discard(session.session_key)}
                    title="Excluir conversa"
                    className="absolute right-2 top-2.5 p-1 rounded-lg text-text-muted opacity-0 group-hover:opacity-100 hover:text-red hover:bg-surface transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
