import { useEffect, useState } from "react";
import { Bell, Plus, Play, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "./PageHeader";
import {
  listCronJobs,
  addCronJob,
  deleteCronJob,
  enableCronJob,
  runCronJob,
  type CronJob,
  type ScheduleBody,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScheduleBuilder } from "@/components/schedule/ScheduleBuilder";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface NewAlertForm {
  name: string;
  message: string;
  schedule: ScheduleBody;
  agent_id: string;
}

export function AlertsPage() {
  const agents = useStore((st) => st.agents);
  const activeAgentId = useStore((st) => st.activeAgentId);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewAlertForm>({
    name: "",
    message: "",
    schedule: { kind: "cron", expr: "0 9 * * *" },
    agent_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!form.agent_id && activeAgentId) {
      setForm((prev) => ({ ...prev, agent_id: activeAgentId }));
    }
  }, [activeAgentId, form.agent_id]);

  async function reload() {
    setLoading(true);
    try {
      const data = await listCronJobs();
      setJobs(data);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function toggle(job: CronJob) {
    try {
      await enableCronJob(job.id, !job.enabled);
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)),
      );
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function runNow(job: CronJob) {
    try {
      await runCronJob(job.id);
      toast("success", `Rotina "${job.name}" executada`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setCreated(null);
  }

  async function testCreated() {
    if (!created) return;
    setTesting(true);
    try {
      await runCronJob(created.id);
      toast("success", "Rodando agora — o resultado aparece na conversa do agente.");
      await reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function remove(job: CronJob) {
    try {
      await deleteCronJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast("success", "Rotina excluída");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.message.trim()) {
      toast("error", "Nome e mensagem são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const job = await addCronJob({
        name: form.name.trim(),
        message: form.message.trim(),
        ...form.schedule,
        agent_id: form.agent_id || undefined,
        deliver: false,
      });
      setCreated(job);
      setForm({
        name: "", message: "", agent_id: form.agent_id,
        schedule: { kind: "cron", expr: "0 9 * * *" },
      });
      await reload();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={Bell}
        title="Rotinas"
        subtitle="Tarefas que um agente executa sozinho, no horário que você definir."
        action={
          <Button size="lg" onClick={() => setModalOpen(true)}>
            <Plus />
            Nova rotina
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              Nenhuma rotina configurada
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              Crie uma rotina para o agente rodar uma análise ou um resumo sozinho.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="p-5 pt-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-base text-text-primary truncate">
                      {job.name}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {job.schedule_label || job.schedule_expr}
                    </p>
                    {job.agent_name && (
                      <Badge variant="muted" className="mt-1.5">
                        {job.agent_name}
                      </Badge>
                    )}
                    {job.next_runs && job.next_runs.length > 0 && (
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Próximo:{" "}
                        {new Date(job.next_runs[0]).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={() => toggle(job)}
                  />
                </div>
                <p className="text-sm text-text-secondary line-clamp-2 mb-4 min-h-[2.5rem]">
                  {job.message}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="subtle" size="sm" onClick={() => runNow(job)}>
                    <Play className="w-4 h-4" />
                    Disparar teste
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(job)}>
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => (open ? setModalOpen(true) : closeModal())}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Nova rotina</DialogTitle>
              <DialogDescription>
                Diga o que o agente deve fazer e quando. Você vê os próximos
                disparos antes de salvar.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              {created ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-primary">
                    Rotina <span className="font-semibold">{created.name}</span> criada.
                  </p>
                  <p className="text-sm text-text-muted">
                    Vale rodar uma vez agora para conferir se a instrução faz o que
                    você espera — sem esperar o horário. O resultado aparece na
                    conversa do agente.
                  </p>
                </div>
              ) : (
              <>
              <div className="space-y-1.5">
                <Label htmlFor="alert-name">Nome</Label>
                <Input
                  id="alert-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Relatório diário"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-agent">Executar com</Label>
                <select
                  id="alert-agent"
                  value={form.agent_id}
                  onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                >
                  {agents.map((a) => (
                    <option key={a.agent_id} value={a.agent_id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">
                  A rotina roda com as integrações, skills e permissões deste agente.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-message">A demanda</Label>
                <Textarea
                  id="alert-message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={5}
                  placeholder={
                    "Instrução completa, como você diria no chat — pode ter várias etapas.\n\n" +
                    "Ex.: Liste no projeto Killer as tarefas de Bug e Débito Técnico que " +
                    "mudaram de estado hoje, cruze com os pedidos de saída antecipada da " +
                    "base de RH e publique uma página com a leitura."
                  }
                />
              </div>
              <ScheduleBuilder
                onChange={(schedule) =>
                  setForm((prev) => ({ ...prev, schedule }))
                }
              />
              </>
              )}
            </DialogBody>
            <DialogFooter>
              {created ? (
                <>
                  <Button type="button" variant="ghost" size="lg" onClick={closeModal}>
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    disabled={testing}
                    onClick={testCreated}
                  >
                    <Play className="w-4 h-4" />
                    {testing ? "Rodando..." : "Rodar agora"}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" size="lg" onClick={closeModal}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="lg" disabled={saving}>
                    {saving ? "Salvando..." : "Criar rotina"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
