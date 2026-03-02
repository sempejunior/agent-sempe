import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ui/toast";
import { AuthPage } from "@/components/AuthPage";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { CapabilitiesPage } from "@/components/CapabilitiesPage";
import { MemoryPage } from "@/components/MemoryPage";
import { SettingsPage } from "@/components/SettingsPage";
import { PromptsPanel } from "@/components/PromptsPanel";
import { ChannelsPanel } from "@/components/ChannelsPanel";
import { CronPanel } from "@/components/CronPanel";
import { RagPanel } from "@/components/RagPanel";
import { ClientsPage } from "@/components/ClientsPage";
import { Cpu } from "lucide-react";

function MainContent() {
  const { activeView } = useStore();
  switch (activeView) {
    case "capabilities":
      return <CapabilitiesPage />;
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
    case "rag":
      return <RagPanel />;
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
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-green shadow-lg shadow-emerald-500/20 flex items-center justify-center animate-pulse">
          <Cpu className="w-7 h-7 text-white" />
        </div>
        <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
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
      <div className="flex h-full bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 bg-grid">
          <MainContent />
        </main>
      </div>
      <ToastContainer />
    </ErrorBoundary>
  );
}

export default App;
