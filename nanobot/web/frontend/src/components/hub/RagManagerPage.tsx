import { useEffect, useState } from "react";
import { BookOpen, Settings, Database, Loader2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { RagConnectModal } from "./RagConnectModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRagConfig, updateRagConfig, type RAGConfig } from "@/lib/api";
import { toast } from "@/lib/toast";

const EMPTY: RAGConfig = { enabled: false, default_backend: "local", backends: {} };

export function RagManagerPage() {
  const [config, setConfig] = useState<RAGConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const c = await getRagConfig();
      setConfig(c);
    } catch {
      setConfig(EMPTY);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleEnabled() {
    if (!config) return;
    const next = { ...config, enabled: !config.enabled };
    try {
      await updateRagConfig(next);
      setConfig(next);
      toast("success", next.enabled ? "RAG ativado" : "RAG desativado");
    } catch (e) {
      toast("error", `Falha: ${(e as Error).message}`);
    }
  }

  async function saveConfig(next: RAGConfig) {
    try {
      await updateRagConfig(next);
      setConfig(next);
      setModalOpen(false);
      toast("success", "Configuração salva");
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
  }

  const current = config?.backends?.[config?.default_backend ?? ""] ?? null;

  const action = (
    <Button onClick={() => setModalOpen(true)}>
      <Settings className="w-4 h-4" />
      Configurar backend
    </Button>
  );

  return (
    <div className="container-app">
      <PageHeader
        icon={BookOpen}
        title="Bases RAG / FAQ"
        subtitle="Gerenciador visual das bases de conhecimento que alimentam seus agentes"
        action={action}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : config?.enabled && current ? (
        <Card>
          <CardContent className="p-6 pt-6 flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-muted flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-purple" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-bold text-base text-text-primary">
                  Backend: {current.type}
                </h3>
                <Badge variant="success">Ativa</Badge>
              </div>
              <p className="text-sm text-text-secondary mt-1 truncate">
                {current.api_url || "URL não configurada"}
              </p>
              {current.collection && (
                <p className="text-xs text-text-muted mt-0.5">
                  Coleção:{" "}
                  <span className="font-mono text-text-secondary">
                    {current.collection}
                  </span>
                </p>
              )}
            </div>
            <Button variant="ghost" onClick={toggleEnabled}>
              Desativar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-muted flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-purple" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              RAG desativado
            </p>
            <p className="text-sm mt-1.5 text-text-muted mb-5">
              Ative para conectar bases de conhecimento aos agentes.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Settings className="w-4 h-4" />
              Configurar backend
            </Button>
          </CardContent>
        </Card>
      )}

      {config && (
        <RagConnectModal
          open={modalOpen}
          initial={config}
          onCancel={() => setModalOpen(false)}
          onSave={saveConfig}
        />
      )}
    </div>
  );
}
