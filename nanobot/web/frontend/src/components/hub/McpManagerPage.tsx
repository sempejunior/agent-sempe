import { useEffect, useState } from "react";
import { Database, Globe, Loader2, Plug, Wifi } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMcpConfig, type MCPServerConfig } from "@/lib/api";
import { toast } from "@/lib/toast";

interface ServerEntry {
  name: string;
  config: MCPServerConfig;
}

export function McpManagerPage() {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMcpConfig()
      .then((data) => {
        const map = data.mcpServers ?? {};
        const list: ServerEntry[] = Object.entries(map).map(([name, config]) => ({
          name,
          config,
        }));
        setServers(list);
      })
      .catch((e) => toast("error", (e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container-app">
      <PageHeader
        icon={Plug}
        title="APIs conectadas (MCP)"
        subtitle="Servidores MCP que expõem ferramentas customizadas aos agentes"
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Database className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              Nenhum servidor MCP configurado
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              Edite <code className="font-mono text-purple">~/.nanobot/config.yaml</code>{" "}
              para adicionar servidores.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map(({ name, config }) => {
            const isSSE = !!config.url;
            const endpoint = isSSE
              ? config.url
              : [config.command, ...(config.args ?? [])].filter(Boolean).join(" ");
            return (
              <Card key={name}>
                <CardContent className="p-5 pt-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
                      {isSSE ? (
                        <Globe className="w-5 h-5 text-purple" />
                      ) : (
                        <Database className="w-5 h-5 text-purple" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-bold text-base text-text-primary truncate">
                        {name}
                      </h3>
                      <Badge variant="muted" className="mt-1">
                        {isSSE ? "HTTP / SSE" : "stdio"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-text-muted line-clamp-2 mb-4">
                    {endpoint || "-"}
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="success" className="gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      Conectado
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toast("info", `Ping enviado para "${name}" (stub)`)
                      }
                    >
                      <Wifi className="w-4 h-4" />
                      Testar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
