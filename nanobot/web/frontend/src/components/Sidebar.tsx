import { useEffect, useState, useMemo } from "react";
import { useStore, type View } from "@/lib/store";
import { getSkills, countActiveClients } from "@/lib/api";
import {
  Cpu,
  MessageSquare,
  Sparkles,
  Zap,
  Database,
  BrainCircuit,
  Users,
  Radio,
  Calendar,
  Settings,
  Plus,
  Search,
  Trash2,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  key: View | "new-chat";
  label: string;
  icon: typeof Cpu;
  badge?: number;
}

const WORKPLACE_NAV: NavItem[] = [
  { key: "new-chat", label: "New Chat", icon: MessageSquare },
  { key: "prompts", label: "Agent Prompts", icon: Sparkles },
  { key: "capabilities", label: "Capabilities", icon: Zap },
  { key: "rag", label: "Knowledge (RAG)", icon: Database },
  { key: "memory", label: "Memory", icon: BrainCircuit },
  { key: "clients", label: "Clients", icon: Users },
];

const SYSTEM_NAV: NavItem[] = [
  { key: "channels", label: "Channels", icon: Radio },
  { key: "cron", label: "Scheduler", icon: Calendar },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const {
    user,
    sessions,
    activeSessionKey,
    activeView,
    sidebarOpen,
    loadSessions,
    selectSession,
    newChat,
    removeSession,
    logout,
    toggleSidebar,
    setActiveView,
  } = useStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [toolCount, setToolCount] = useState(0);
  const [clientCount, setClientCount] = useState(0);

  useEffect(() => {
    loadSessions();
    getSkills().then((s) => setToolCount(s.tools_enabled.length)).catch(() => { });
    countActiveClients().then(setClientCount).catch(() => {});
  }, [loadSessions]);

  const filteredSessions = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    if (!searchTerm) return sorted;
    const q = searchTerm.toLowerCase();
    return sorted.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchTerm]);

  const handleNavClick = (key: string) => {
    if (key === "new-chat") {
      newChat();
    } else {
      setActiveView(key as View);
    }
  };

  const isNavActive = (key: string) => {
    if (key === "new-chat") return activeView === "chat" && !activeSessionKey;
    return activeView === key;
  };

  const userInitials = useMemo(() => {
    const name = user?.display_name || user?.user_id || "";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }, [user]);

  const navItems = useMemo(() => {
    return WORKPLACE_NAV.map((item) => {
      if (item.key === "capabilities" && toolCount > 0) return { ...item, badge: toolCount };
      if (item.key === "clients" && clientCount > 0) return { ...item, badge: clientCount };
      return item;
    });
  }, [toolCount, clientCount]);

  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    const active = isNavActive(item.key);
    return (
      <button
        key={item.key}
        onClick={() => handleNavClick(item.key)}
        className={cn(
          "w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer group/nav",
          active
            ? "bg-gradient-to-r from-emerald-50 to-emerald-50/50 text-emerald-600 font-bold shadow-sm shadow-emerald-500/5"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-semibold",
        )}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              "w-8 h-8 rounded-[10px] flex items-center justify-center transition-all",
              active
                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                : "bg-transparent text-slate-400 group-hover/nav:text-slate-500",
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm">{item.label}</span>
        </div>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              "text-[10px] min-w-[20px] px-1.5 py-0.5 rounded-md font-bold text-center",
              active
                ? "bg-emerald-100 text-emerald-600"
                : "bg-slate-100 text-slate-400",
            )}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "fixed md:relative z-50 md:z-auto",
          "flex flex-col h-full w-72 bg-white border-r border-slate-100",
          "transition-transform duration-200 ease-in-out",
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0 md:w-0 md:border-0 md:overflow-hidden",
        )}
      >
        {/* Logo / Header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-green shadow-lg shadow-emerald-500/25 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-xl text-slate-900 leading-tight tracking-tight">
                Agent Semp&eacute;
              </h1>
              <span className="text-[11px] uppercase font-bold tracking-widest text-emerald-500">
                v2.0 Evolved
              </span>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workplace Section */}
        <nav className="px-3 pb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-3.5">
            Workplace
          </h2>
          <div className="space-y-1">
            {navItems.map(renderNavItem)}
          </div>
        </nav>

        {/* System Section */}
        <nav className="px-3 pb-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-3.5">
            System
          </h2>
          <div className="space-y-1">
            {SYSTEM_NAV.map(renderNavItem)}
          </div>
        </nav>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Chat History Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Your Chats
          </h2>
          <button
            onClick={newChat}
            title="New Chat"
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Search */}
        {sessions.length > 3 && (
          <div className="px-4 mb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search chats..."
                style={{ paddingLeft: "2.25rem", paddingRight: "0.75rem" }}
                className="w-full h-10 text-sm bg-slate-50 border border-slate-100 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30 transition-all"
              />
            </div>
          </div>
        )}

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {filteredSessions.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm font-medium">
              {searchTerm ? "No matching chats" : "No conversations yet"}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                key={session.session_key}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                  "transition-all duration-150 text-sm",
                  activeSessionKey === session.session_key && activeView === "chat"
                    ? "bg-emerald-50 text-emerald-700 font-bold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 font-medium",
                )}
                onClick={() => selectSession(session.session_key)}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-40" />
                <span className="flex-1 truncate">{session.title}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-50 hover:text-red-500 transition-all cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(session.session_key);
                  }}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Footer */}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center shrink-0 border border-emerald-200/50">
              <span className="text-sm font-bold text-emerald-600">{userInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-800 truncate leading-tight mb-0.5">
                {user?.display_name || user?.user_id}
              </div>
              <div className="text-xs text-slate-500 truncate leading-tight">
                {user?.email || user?.user_id}
              </div>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="shrink-0 p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
