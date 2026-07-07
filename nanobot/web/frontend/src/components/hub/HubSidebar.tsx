import type { LucideIcon } from "lucide-react";
import {
  MessageSquare,
  Users,
  Store,
  Sparkles,
  Wrench,
  Bell,
  Send,
  Plug,
  Database,
  BookOpen,
  UserCog,
  ClipboardList,
  Settings,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { View } from "@/lib/store";

interface SidebarItem {
  key: View;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeTone?: "purple" | "green" | "orange" | "muted";
  soon?: boolean;
}

interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

function useSections(): SidebarSection[] {
  const agents = useStore((s) => s.agents);
  const agentsCount = agents.length;

  return [
    {
      label: "Conversar",
      items: [{ key: "chat", label: "Chat", icon: MessageSquare }],
    },
    {
      label: "Força de Trabalho Digital",
      items: [
        {
          key: "agent-team",
          label: "Meus Agentes",
          icon: Users,
          badge: String(agentsCount || ""),
          badgeTone: "purple",
        },
        { key: "agent-store", label: "Agent Store", icon: Store },
        { key: "agent-studio", label: "Criar Agente", icon: Sparkles },
        { key: "skills-catalog", label: "Minhas Skills", icon: Wrench },
        { key: "alerts", label: "Alertas Agênticos", icon: Bell, badgeTone: "orange" },
      ],
    },
    {
      label: "Integrações",
      items: [
        { key: "channels", label: "Canais de Comunicação", icon: Send },
        { key: "integrations", label: "MCPs & APIs", icon: Plug },
        { key: "rag-manager", label: "Bases de Conhecimento", icon: BookOpen },
        { key: "dbs", label: "Bancos de Dados", icon: Database, soon: true },
      ],
    },
    {
      label: "Pessoas",
      items: [
        { key: "clients", label: "Pessoas", icon: UserCog },
        { key: "capabilities", label: "Admissões", icon: ClipboardList, soon: true },
      ],
    },
    {
      label: "Sistema",
      items: [{ key: "settings", label: "Configurações", icon: Settings }],
    },
  ];
}

function toneClasses(tone?: "purple" | "green" | "orange" | "muted"): string {
  switch (tone) {
    case "green":
      return "bg-green-100 text-green-700";
    case "orange":
      return "bg-yellow-muted text-yellow";
    case "muted":
      return "bg-surface-alt text-text-muted";
    default:
      return "bg-purple-muted text-purple";
  }
}

export function HubSidebar() {
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const sections = useSections();

  return (
    <aside className="w-60 h-full bg-[#fafafb] border-r border-border flex flex-col shrink-0">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/solides-logo.webp"
            alt="Sólides"
            className="h-6 max-w-[110px] w-auto object-contain shrink-0"
          />
          <div className="leading-tight border-l border-border pl-3 min-w-0">
            <div className="font-display font-bold text-[13px] text-text-primary truncate">
              Agent Hub
            </div>
            <div className="text-[10px] text-text-muted font-medium">v2.5</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => (
          <div key={section.label} className="mb-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-5 pt-3 pb-1.5">
              {section.label}
            </div>
            <ul>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.key;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => setActiveView(item.key)}
                      disabled={item.soon}
                      className={[
                        "w-full flex items-center gap-2.5 px-5 py-2 text-sm text-left transition-colors border-l-2",
                        isActive
                          ? "bg-purple-muted text-purple-hover font-semibold border-purple"
                          : "text-text-secondary hover:bg-surface-alt border-transparent",
                        item.soon ? "opacity-50 cursor-not-allowed" : "",
                      ].join(" ")}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 truncate min-w-0">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${toneClasses(item.badgeTone)}`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.soon && (
                        <span className="shrink-0 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-text-muted">
                          Em breve
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="w-2 h-2 rounded-full bg-purple animate-pulse" />
          <span>Sólides Orquestrador ativo</span>
        </div>
      </div>
    </aside>
  );
}
