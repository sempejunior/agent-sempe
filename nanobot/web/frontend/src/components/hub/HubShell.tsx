import type { ReactNode } from "react";
import { Sparkles, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { HubSidebar } from "./HubSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

export function HubShell({ children }: Props) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const activeAgentId = useStore((s) => s.activeAgentId);
  const agents = useStore((s) => s.agents);
  const systemAgents = useStore((s) => s.systemAgents);
  const setActiveView = useStore((s) => s.setActiveView);
  const activeAgent =
    agents.find((a) => a.agent_id === activeAgentId) ??
    systemAgents.find((a) => a.agent_id === activeAgentId);

  return (
    <div className="flex h-full w-full bg-background">
      <HubSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface/80 backdrop-blur px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {activeAgent ? (
              <Badge className="gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple animate-pulse" />
                Agente ativo: {activeAgent.name}
              </Badge>
            ) : (
              <span className="text-text-muted text-xs">
                Nenhum agente selecionado
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-text-secondary">
                {user.display_name || user.user_id}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8 lg:px-10 min-w-0">
          {children}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setActiveView("chat")}
        title="Assistente Sólides"
        className="fixed bottom-6 left-[13rem] w-12 h-12 rounded-full bg-purple shadow-lg shadow-purple/30 flex items-center justify-center text-white cursor-pointer hover:scale-105 hover:bg-purple-hover transition-all z-30"
      >
        <Sparkles className="w-5 h-5" />
      </button>
    </div>
  );
}
