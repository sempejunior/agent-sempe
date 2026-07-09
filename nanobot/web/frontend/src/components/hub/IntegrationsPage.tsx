import { useEffect, useMemo, useState } from "react";
import { Loader2, Plug, Plus, Key, Trash2, ExternalLink, Power, Pencil } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getIntegrationsCatalog,
  listIntegrations,
  upsertIntegration,
  deleteIntegration,
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  type CatalogEntry,
  type UserIntegration,
  type UserCredential,
} from "@/lib/api";
import { toast } from "@/lib/toast";

type ActivateTarget = {
  entry: CatalogEntry;
  existing: UserIntegration | null;
};

export function IntegrationsPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [integrations, setIntegrations] = useState<UserIntegration[]>([]);
  const [credentials, setCredentials] = useState<UserCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [activateTarget, setActivateTarget] = useState<ActivateTarget | null>(null);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);

  const activeBySystemId = useMemo(() => {
    const map: Record<string, UserIntegration> = {};
    for (const it of integrations) {
      if (it.system_integration_id) map[it.system_integration_id] = it;
    }
    return map;
  }, [integrations]);

  async function refresh() {
    setLoading(true);
    try {
      const [c, ints, creds] = await Promise.all([
        getIntegrationsCatalog(),
        listIntegrations(),
        listCredentials(),
      ]);
      setCatalog(c);
      setIntegrations(ints);
      setCredentials(creds);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="container-app">
      <PageHeader
        icon={Plug}
        title="Integrações"
        subtitle="Conecte MCPs e APIs (GitHub, Jira, Notion, Slack, Grafana…) e gerencie as credenciais. Tudo por usuário."
        action={
          <Button variant="secondary" onClick={() => setCredentialDialogOpen(true)}>
            <Key className="w-4 h-4" /> Nova credencial
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="catalog" className="w-full">
          <TabsList>
            <TabsTrigger value="catalog">Catálogo ({catalog.length})</TabsTrigger>
            <TabsTrigger value="active">Minhas integrações ({integrations.length})</TabsTrigger>
            <TabsTrigger value="credentials">Credenciais ({credentials.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-4">
              {catalog.map((entry) => {
                const active = activeBySystemId[entry.id];
                return (
                  <Card key={entry.id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h3 className="font-display font-bold text-base text-text-primary truncate">
                            {entry.name}
                          </h3>
                          <div className="flex gap-1.5 mt-1">
                            <Badge variant={entry.kind === "mcp" ? "outline" : "muted"}>
                              {entry.kind.toUpperCase()}
                            </Badge>
                            <Badge variant="muted">{entry.category}</Badge>
                          </div>
                        </div>
                        {active && (
                          <Badge variant="success" className="gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            Ativa
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed line-clamp-3 mb-4">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setActivateTarget({ entry, existing: active ?? null })
                          }
                        >
                          {active ? "Editar" : "Ativar"}
                        </Button>
                        {entry.docs_url && (
                          <a
                            href={entry.docs_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-text-muted hover:text-purple inline-flex items-center gap-1"
                          >
                            Docs <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="active">
            <ActiveList
              integrations={integrations}
              catalog={catalog}
              credentials={credentials}
              onChange={refresh}
              onEdit={(existing) => {
                const entry = catalog.find(
                  (c) => c.id === existing.system_integration_id,
                );
                if (entry) setActivateTarget({ entry, existing });
              }}
            />
          </TabsContent>

          <TabsContent value="credentials">
            <CredentialsList
              credentials={credentials}
              integrations={integrations}
              onChange={refresh}
            />
          </TabsContent>
        </Tabs>
      )}

      {activateTarget && (
        <ActivateDialog
          target={activateTarget}
          catalog={catalog}
          credentials={credentials}
          refreshCredentials={async () => {
            const creds = await listCredentials();
            setCredentials(creds);
            return creds;
          }}
          onClose={() => setActivateTarget(null)}
          onSaved={() => {
            setActivateTarget(null);
            refresh();
          }}
        />
      )}

      {credentialDialogOpen && (
        <CredentialDialog
          catalog={catalog}
          onClose={() => setCredentialDialogOpen(false)}
          onSaved={() => {
            setCredentialDialogOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ActiveList({
  integrations,
  catalog,
  credentials,
  onChange,
  onEdit,
}: {
  integrations: UserIntegration[];
  catalog: CatalogEntry[];
  credentials: UserCredential[];
  onChange: () => void;
  onEdit: (i: UserIntegration) => void;
}) {
  if (integrations.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="p-12 flex flex-col items-center text-center">
          <Plug className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm text-text-muted">
            Nenhuma integração ativada ainda. Vá em <b>Catálogo</b> e ative uma.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function toggle(i: UserIntegration) {
    try {
      await upsertIntegration(i.slug, { enabled: !i.enabled });
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function remove(i: UserIntegration) {
    if (!confirm(`Remover integração "${i.label || i.slug}"?`)) return;
    try {
      await deleteIntegration(i.slug);
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-4">
      {integrations.map((i) => {
        const entry = catalog.find((c) => c.id === i.system_integration_id);
        const cred = credentials.find((c) => c.id === i.credential_id);
        return (
          <Card key={i.slug}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-base text-text-primary truncate">
                    {i.label || i.slug}
                  </h3>
                  <div className="flex gap-1.5 mt-1">
                    <Badge variant="muted">{i.kind.toUpperCase()}</Badge>
                    {entry && <Badge variant="muted">{entry.name}</Badge>}
                  </div>
                </div>
                <Badge variant={i.enabled ? "success" : "muted"}>
                  {i.enabled ? "Ativa" : "Pausada"}
                </Badge>
              </div>
              <div className="text-xs text-text-muted mb-4 space-y-1">
                <div>Slug: <code className="font-mono">{i.slug}</code></div>
                <div>Credencial: {cred ? cred.name : "—"}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => onEdit(i)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(i)}>
                  <Power className="w-4 h-4" />
                  {i.enabled ? "Pausar" : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                  <Trash2 className="w-4 h-4" /> Remover
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CredentialsList({
  credentials,
  integrations,
  onChange,
}: {
  credentials: UserCredential[];
  integrations: UserIntegration[];
  onChange: () => void;
}) {
  async function remove(c: UserCredential) {
    const used = integrations.filter((i) => i.credential_id === c.id);
    if (used.length > 0) {
      toast("error", `Credencial em uso por ${used.length} integração(ões).`);
      return;
    }
    if (!confirm(`Excluir credencial "${c.name}"?`)) return;
    try {
      await deleteCredential(c.id);
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  if (credentials.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="p-12 flex flex-col items-center text-center">
          <Key className="w-8 h-8 text-text-muted mb-3" />
          <p className="text-sm text-text-muted">
            Nenhuma credencial cadastrada. Clique em <b>Nova credencial</b>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 mt-4">
      {credentials.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display font-bold text-sm truncate">{c.name}</div>
              <div className="text-xs text-text-muted">
                {c.provider_key || "genérica"} · atualizada {new Date(c.updated_at).toLocaleString()}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(c)}>
              <Trash2 className="w-4 h-4" /> Excluir
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActivateDialog({
  target,
  catalog,
  credentials,
  refreshCredentials,
  onClose,
  onSaved,
}: {
  target: ActivateTarget;
  catalog: CatalogEntry[];
  credentials: UserCredential[];
  refreshCredentials: () => Promise<UserCredential[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { entry, existing } = target;
  const [slug, setSlug] = useState(existing?.slug ?? entry.id);
  const [label, setLabel] = useState(existing?.label ?? entry.name);
  const [credentialId, setCredentialId] = useState<number | null>(
    existing?.credential_id ?? null,
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [credentialEditor, setCredentialEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; credential: UserCredential }
    | null
  >(null);

  const matchingCredentials = credentials.filter(
    (c) => !c.provider_key || c.provider_key === entry.id,
  );
  const needsCredential = entry.credential_fields.length > 0;
  const selectedCredential = credentials.find((c) => c.id === credentialId) ?? null;

  async function save() {
    if (needsCredential && !credentialId) {
      toast("error", "Selecione uma credencial para esta integração.");
      return;
    }
    setSaving(true);
    try {
      await upsertIntegration(slug.trim() || entry.id, {
        kind: entry.kind,
        system_integration_id: entry.id,
        label: label.trim() || entry.name,
        enabled,
        credential_id: credentialId,
        config: existing?.config ?? {},
      });
      toast("success", `Integração ${entry.name} salva.`);
      onSaved();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCredentialSaved(saved: UserCredential) {
    await refreshCredentials();
    setCredentialId(saved.id);
    setCredentialEditor(null);
  }

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{existing ? "Editar" : "Ativar"} · {entry.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{entry.description}</p>

            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                disabled={!!existing}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={entry.id}
              />
              <p className="text-xs text-text-muted mt-1">
                Identificador único usado pela tool <code>http_call</code>.
              </p>
            </div>

            <div>
              <Label htmlFor="label">Nome amigável</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={entry.name}
              />
            </div>

            {needsCredential && (
              <div>
                <div className="flex items-center justify-between">
                  <Label>Credencial</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCredentialEditor({ mode: "create" })}
                  >
                    <Plus className="w-3.5 h-3.5" /> Nova
                  </Button>
                </div>
                {matchingCredentials.length === 0 ? (
                  <p className="text-xs text-text-muted mt-1">
                    Nenhuma credencial compatível cadastrada. Clique em{" "}
                    <b>Nova</b> para criar uma agora.
                  </p>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      className="flex-1 px-3 py-2 rounded-md border border-border bg-white text-sm"
                      value={credentialId ?? ""}
                      onChange={(e) =>
                        setCredentialId(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">Selecione…</option>
                      {matchingCredentials.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {selectedCredential && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Editar credencial"
                        onClick={() =>
                          setCredentialEditor({
                            mode: "edit",
                            credential: selectedCredential,
                          })
                        }
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
                <p className="text-xs text-text-muted mt-1">
                  Campos requeridos: {entry.credential_fields.map((f) => f.key).join(", ")}
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Ativar imediatamente
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {credentialEditor && (
        <CredentialDialog
          catalog={catalog}
          presetProviderKey={credentialEditor.mode === "create" ? entry.id : undefined}
          lockProviderKey={credentialEditor.mode === "create"}
          existing={credentialEditor.mode === "edit" ? credentialEditor.credential : undefined}
          onClose={() => setCredentialEditor(null)}
          onSaved={handleCredentialSaved}
        />
      )}
    </>
  );
}

function CredentialDialog({
  catalog,
  existing,
  presetProviderKey,
  lockProviderKey,
  onClose,
  onSaved,
}: {
  catalog: CatalogEntry[];
  existing?: UserCredential;
  presetProviderKey?: string;
  lockProviderKey?: boolean;
  onClose: () => void;
  onSaved: (cred: UserCredential) => void;
}) {
  const isEdit = !!existing;
  const [providerKey, setProviderKey] = useState(
    existing?.provider_key ?? presetProviderKey ?? "",
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selectedEntry = catalog.find((c) => c.id === providerKey);
  const fields = selectedEntry?.credential_fields ?? [];
  const providerLocked = lockProviderKey || isEdit;

  async function save() {
    if (!name.trim()) {
      toast("error", "Informe um nome para a credencial.");
      return;
    }
    if (!isEdit) {
      const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
      if (missing.length > 0) {
        toast("error", `Campos obrigatórios: ${missing.map((f) => f.label).join(", ")}`);
        return;
      }
    }
    const secret: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) secret[k] = v.trim();
    }
    setSaving(true);
    try {
      let saved: UserCredential;
      if (isEdit && existing) {
        const payload: {
          name: string;
          provider_key: string;
          secret?: Record<string, string>;
        } = {
          name: name.trim(),
          provider_key: providerKey,
        };
        if (Object.keys(secret).length > 0) payload.secret = secret;
        saved = await updateCredential(existing.id, payload);
        toast("success", "Credencial atualizada.");
      } else {
        saved = await createCredential({
          name: name.trim(),
          provider_key: providerKey,
          secret,
          metadata: {},
        });
        toast("success", "Credencial criada.");
      }
      onSaved(saved);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {isEdit ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isEdit ? "Editar credencial" : "Nova credencial"}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Integração alvo</Label>
            <select
              className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-white text-sm disabled:opacity-60"
              value={providerKey}
              disabled={providerLocked}
              onChange={(e) => {
                setProviderKey(e.target.value);
                setValues({});
              }}
            >
              <option value="">Genérica (qualquer)</option>
              {catalog
                .filter((c) => c.credential_fields.length > 0)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {selectedEntry && (!!selectedEntry.setup_steps?.length || !!selectedEntry.docs_url) && (
            <div className="rounded-md border border-border bg-surface-alt p-3 space-y-2">
              <p className="text-xs font-semibold text-text-primary">
                Como obter as credenciais de {selectedEntry.name}
              </p>
              {!!selectedEntry.setup_steps?.length && (
                <ol className="list-decimal list-inside space-y-1 text-xs text-text-muted">
                  {selectedEntry.setup_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              {selectedEntry.docs_url && (
                <a
                  href={selectedEntry.docs_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-purple hover:underline inline-flex items-center gap-1"
                >
                  Documentação oficial <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="cred-name">Nome</Label>
            <Input
              id="cred-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: github-main"
            />
          </div>

          {isEdit && (
            <p className="text-xs text-text-muted -mt-2">
              Por segurança, os segredos não são exibidos. Deixe os campos em
              branco para manter os valores atuais, ou preencha para substituir.
            </p>
          )}

          {fields.length === 0 && providerKey === "" && (
            <div>
              <Label>token</Label>
              <Input
                type="password"
                value={values["token"] || ""}
                onChange={(e) => setValues({ ...values, token: e.target.value })}
                placeholder={isEdit ? "•••••••• (deixe em branco para manter)" : ""}
              />
            </div>
          )}

          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`f-${f.key}`}>
                {f.label} {f.required && !isEdit && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id={`f-${f.key}`}
                type={f.kind === "password" ? "password" : "text"}
                value={values[f.key] || ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                placeholder={isEdit ? "•••••••• (deixe em branco para manter)" : ""}
              />
              {f.hint && <p className="text-xs text-text-muted mt-1">{f.hint}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
