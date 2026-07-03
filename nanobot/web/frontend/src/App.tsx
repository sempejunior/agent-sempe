import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ui/toast";
import { AuthPage } from "@/components/AuthPage";
import { HubShell } from "@/components/hub/HubShell";
import { ChatArea } from "@/components/ChatArea";
import { CapabilitiesPage } from "@/components/CapabilitiesPage";
import { MemoryPage } from "@/components/MemoryPage";
import { SettingsPage } from "@/components/SettingsPage";
import { PromptsPanel } from "@/components/PromptsPanel";
import { ChannelsPanel } from "@/components/ChannelsPanel";
import { CronPanel } from "@/components/CronPanel";
import { RagPanel } from "@/components/RagPanel";
import { ClientsPage } from "@/components/ClientsPage";
import { AgentsPage } from "@/components/AgentsPage";
import { AgentConfigPage } from "@/components/AgentConfigPage";
import { AgentStudioPage } from "@/components/hub/AgentStudio/AgentStudioPage";
import { McpPage } from "@/components/McpPage";
import { AgentTeamPage } from "@/components/hub/AgentTeamPage";
import { AgentStorePage } from "@/components/hub/AgentStorePage";
import { SkillsCatalogPage } from "@/components/hub/SkillsCatalogPage";
import { AlertsPage } from "@/components/hub/AlertsPage";
import { McpManagerPage } from "@/components/hub/McpManagerPage";
import { DbManagerPage } from "@/components/hub/DbManagerPage";
import { RagManagerPage } from "@/components/hub/RagManagerPage";
import { Store } from "lucide-react";

function MainContent() {
  const activeView = useStore((s) => s.activeView);
  switch (activeView) {
    case "chat":
      return <ChatArea />;
    case "agent-team":
      return <AgentTeamPage />;
    case "agents":
      return <AgentsPage />;
    case "agent-store":
      return <AgentStorePage />;
    case "agent-config":
      return <AgentConfigPage />;
    case "agent-studio":
      return <AgentStudioPage />;
    case "api-connections":
      return <McpPage />;
    case "mcp":
      return <McpManagerPage />;
    case "dbs":
      return <DbManagerPage />;
    case "capabilities":
      return <CapabilitiesPage />;
    case "skills-catalog":
      return <SkillsCatalogPage />;
    case "memory":
      return <MemoryPage />;
    case "settings":
      return <SettingsPage />;
    case "prompts":
      return <PromptsPanel />;
    case "channels":
      return <ChannelsPanel />;
    case "cron":
      return <CronPanel />;
    case "alerts":
      return <AlertsPage />;
    case "rag":
      return <RagPanel />;
    case "rag-manager":
      return <RagManagerPage />;
    case "clients":
      return <ClientsPage />;
    default:
      return <ChatArea />;
  }
}

function App() {
  const { user, authLoading, initAuth } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background gap-4">
        <div className="w-14 h-14 rounded-2xl bg-purple-600 shadow-lg shadow-purple-600/20 flex items-center justify-center animate-pulse">
          <Store className="w-7 h-7 text-white" />
        </div>
        <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        <ToastContainer />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <HubShell>
        <MainContent />
      </HubShell>
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
