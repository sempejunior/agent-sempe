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
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  every_seconds: number;
}

export function AlertsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewAlertForm>({
    name: "",
    message: "",
    every_seconds: 3600,
  });
  const [saving, setSaving] = useState(false);

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
      toast("success", `Alerta "${job.name}" disparado`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function remove(job: CronJob) {
    try {
      await deleteCronJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast("success", "Alerta excluído");
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
      await addCronJob({
        name: form.name.trim(),
        message: form.message.trim(),
        kind: "interval",
        every_seconds: form.every_seconds,
        deliver: false,
      });
      setModalOpen(false);
      setForm({ name: "", message: "", every_seconds: 3600 });
      await reload();
      toast("success", "Alerta criado");
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
        title="Alertas Agênticos"
        subtitle="Agendamentos que disparam ações proativas."
        action={
          <Button size="lg" onClick={() => setModalOpen(true)}>
            <Plus />
            Novo Alerta
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
              Nenhum alerta configurado
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              Crie alertas para ações proativas em intervalos regulares.
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
                    <p className="text-xs font-mono text-text-muted mt-0.5 truncate">
                      {job.schedule_expr}
                    </p>
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Novo alerta agêntico</DialogTitle>
              <DialogDescription>
                Configure uma rotina que dispara o agente em intervalos regulares.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
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
                <Label htmlFor="alert-message">Mensagem</Label>
                <Textarea
                  id="alert-message"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={4}
                  placeholder="O que o agente deve fazer?"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-interval">Intervalo (segundos)</Label>
                <Input
                  id="alert-interval"
                  type="number"
                  min={1}
                  value={form.every_seconds}
                  onChange={(e) =>
                    setForm({ ...form, every_seconds: Number(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-text-muted">
                  3600s = 1 hora · 86400s = 1 dia
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? "Salvando..." : "Criar alerta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
