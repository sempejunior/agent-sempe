import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plug,
  Plus,
  Trash2,
} from "lucide-react";
import { getMcpConfig, updateMcpConfig } from "@/lib/api";
import type { MCPAuthType, MCPServer, MCPServerConfig } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/hub/PageHeader";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ServerEntry = { name: string; server: MCPServerConfig };

const AUTH_LABELS: Record<MCPAuthType, string> = {
  none: "Sem autenticação",
  bearer: "Bearer Token",
  api_key: "API Key (header customizado)",
  basic: "Basic Auth (usuário + senha)",
};

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10 font-mono"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ServerCard({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: ServerEntry;
  onUpdate: (s: MCPServerConfig) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [headersOpen, setHeadersOpen] = useState(false);
  const { name, server } = entry;
  const isSSE = !!server.url;
  const authType: MCPAuthType = (server.auth_type as MCPAuthType) || "none";
  const preview = isSSE
    ? server.url
    : `${server.command ?? ""} ${(server.args ?? []).join(" ")}`.trim();

  return (
    <Card>
      <CardContent className="p-0 pt-0">
        <div
          className="flex cursor-pointer items-center gap-4 p-4 hover:bg-surface-alt transition-colors rounded-t-2xl"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="w-10 h-10 rounded-xl bg-purple-muted flex items-center justify-center shrink-0">
            {isSSE ? (
              <Globe className="w-5 h-5 text-purple" />
            ) : (
              <Database className="w-5 h-5 text-purple" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-text-primary">{name}</span>
              <Badge variant="muted">{isSSE ? "HTTP / SSE" : "stdio"}</Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
              {preview || "Não configurado"}
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" onClick={onDelete}>
                Remover
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              title="Remover servidor"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-text-muted transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>

        {expanded && (
          <div className="space-y-4 border-t border-border p-5">
            {isSSE ? (
              <>
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input
                    value={server.url || ""}
                    onChange={(e) => onUpdate({ ...server, url: e.target.value })}
                    placeholder="https://mcp.exemplo.com/sse"
                  />
                </div>

                <div className="rounded-2xl border border-border bg-surface-alt p-4 space-y-4">
                  <h4 className="text-sm font-bold text-text-primary">Autenticação</h4>

                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select
                      value={authType}
                      onValueChange={(v) =>
                        onUpdate({ ...server, auth_type: v as MCPAuthType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(AUTH_LABELS) as MCPAuthType[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {AUTH_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {authType === "bearer" && (
                    <div className="space-y-1.5">
                      <Label>Bearer Token</Label>
                      <SecretInput
                        value={server.auth_token || ""}
                        onChange={(v) => onUpdate({ ...server, auth_token: v })}
                        placeholder="ey..."
                      />
                      <p className="text-xs text-text-muted">
                        Enviado como <code>Authorization: Bearer &lt;token&gt;</code>.
                      </p>
                    </div>
                  )}

                  {authType === "api_key" && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Nome do Header</Label>
                        <Input
                          value={server.auth_header_name || "Authorization"}
                          onChange={(e) =>
                            onUpdate({ ...server, auth_header_name: e.target.value })
                          }
                          placeholder="X-API-Key"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Valor / Token</Label>
                        <SecretInput
                          value={server.auth_token || ""}
                          onChange={(v) => onUpdate({ ...server, auth_token: v })}
                          placeholder="chave-secreta"
                        />
                      </div>
                    </>
                  )}

                  {authType === "basic" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Usuário</Label>
                        <Input
                          value={server.auth_username || ""}
                          onChange={(e) =>
                            onUpdate({ ...server, auth_username: e.target.value })
                          }
                          placeholder="usuario"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Senha</Label>
                        <SecretInput
                          value={server.auth_password || ""}
                          onChange={(v) => onUpdate({ ...server, auth_password: v })}
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border">
                  <button
                    type="button"
                    onClick={() => setHeadersOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
                  >
                    <span className="text-xs font-bold uppercase tracking-wide text-text-muted">
                      Headers adicionais (avançado)
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-text-muted transition-transform",
                        headersOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {headersOpen && (
                    <div className="border-t border-border px-4 py-3 space-y-1.5">
                      <Input
                        value={JSON.stringify(server.headers || {})}
                        onChange={(e) => {
                          try {
                            onUpdate({
                              ...server,
                              headers: JSON.parse(e.target.value),
                            });
                          } catch {
                            /* ignore */
                          }
                        }}
                        placeholder="{}"
                        className="font-mono"
                      />
                      <p className="text-xs text-text-muted">
                        JSON válido. Combinado com o header de autenticação.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Comando</Label>
                  <Input
                    value={server.command || ""}
                    onChange={(e) => onUpdate({ ...server, command: e.target.value })}
                    placeholder="npx"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Argumentos (separados por vírgula)</Label>
                  <Input
                    value={(server.args || []).join(", ")}
                    onChange={(e) =>
                      onUpdate({
                        ...server,
                        args: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="-y, @modelcontextprotocol/server-filesystem, /tmp"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Variáveis de ambiente (JSON)</Label>
                  <Input
                    value={JSON.stringify(server.env || {})}
                    onChange={(e) => {
                      try {
                        onUpdate({ ...server, env: JSON.parse(e.target.value) });
                      } catch {
                        /* ignore */
                      }
                    }}
                    placeholder="{}"
                    className="font-mono"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Timeout de ferramentas (segundos)</Label>
              <Input
                type="number"
                value={server.tool_timeout ?? ""}
                onChange={(e) =>
                  onUpdate({
                    ...server,
                    tool_timeout: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="30"
                className="w-32"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function McpPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"stdio" | "sse">("stdio");

  useEffect(() => {
    setLoading(true);
    setDirty(false);
    getMcpConfig()
      .then((d) => setServers(d.mcpServers ?? []))
      .catch(() => toast("error", "Erro ao carregar configuração MCP"))
      .finally(() => setLoading(false));
  }, []);

  function updateServer(name: string, config: MCPServerConfig) {
    setServers((prev) =>
      prev.map((s) => (s.name === name ? { ...s, ...config } : s)),
    );
    setDirty(true);
  }

  function removeServer(name: string) {
    setServers((prev) => prev.filter((s) => s.name !== name));
    setDirty(true);
  }

  function addServer() {
    const n = newName.trim();
    if (!n) return;
    if (servers.some((s) => s.name === n)) {
      toast("error", "Já existe um servidor com esse nome");
      return;
    }
    const template: MCPServer =
      newType === "sse"
        ? { name: n, url: "", headers: {} }
        : { name: n, command: "", args: [], env: {} };
    setServers((prev) => [...prev, template]);
    setDirty(true);
    setAdding(false);
    setNewName("");
  }

  async function save() {
    setSaving(true);
    try {
      await updateMcpConfig({ mcpServers: servers });
      toast("success", "Configuração salva");
      setDirty(false);
    } catch (e) {
      toast("error", `Erro ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  }

  const entries: ServerEntry[] = servers.map((s) => {
    const { name, ...rest } = s;
    return { name, server: rest };
  });

  const action = (
    <div className="flex items-center gap-2">
      {dirty && (
        <Button onClick={save} disabled={saving} variant="secondary">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Salvar
        </Button>
      )}
      <Button onClick={() => setAdding(true)}>
        <Plus className="w-4 h-4" />
        Conectar servidor
      </Button>
    </div>
  );

  return (
    <div className="container-app">
      <PageHeader
        icon={Plug}
        title="APIs conectadas (MCP)"
        subtitle="MCPs são compartilhados entre todos os seus agentes. Para escolher quais um agente usa, edite o agente."
        action={action}
      />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo servidor MCP</DialogTitle>
            <DialogDescription>
              Dê um nome e escolha o tipo de transporte. Você pode configurar os
              detalhes depois de criar.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do servidor</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: meu-sistema-rh"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") addServer();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de transporte</Label>
              <div className="flex gap-2">
                {(["stdio", "sse"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType(t)}
                    className={cn(
                      "flex-1 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors cursor-pointer",
                      newType === t
                        ? "bg-purple border-purple text-white"
                        : "bg-surface border-border text-text-secondary hover:bg-surface-alt",
                    )}
                  >
                    {t === "sse" ? "HTTP / SSE" : "stdio"}
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button onClick={addServer} disabled={!newName.trim()}>
              Criar servidor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Database className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              Nenhum servidor MCP configurado
            </p>
            <p className="text-sm mt-1.5 text-text-muted mb-5">
              Conecte serviços externos para que os agentes possam usá-los.
            </p>
            <Button onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" />
              Conectar servidor MCP
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <ServerCard
              key={entry.name}
              entry={entry}
              onUpdate={(s) => updateServer(entry.name, s)}
              onDelete={() => removeServer(entry.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
