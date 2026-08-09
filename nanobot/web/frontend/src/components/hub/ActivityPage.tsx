import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  GitPullRequest,
  Inbox,
  Loader2,
  MessageSquareReply,
  Play,
  Trash2,
} from "lucide-react";
import { PageHeader } from "./PageHeader";
import {
  answerQuestion,
  cancelJob,
  cancelQuestion,
  getActivity,
  getJobLog,
  type Activity,
  type ActivityItem,
  type Question,
} from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const EMPTY: Activity = { waiting: [], running: [], delivered: [] };
const DELIVERED_PAGE = 8;

const DELIVERED_ICON: Partial<Record<ActivityItem["kind"], LucideIcon>> = {
  page: FileText,
  demand: GitPullRequest,
  answer: MessageSquareReply,
  job: CheckCircle2,
};

export function ActivityPage() {
  const loadOpenQuestions = useStore((st) => st.loadOpenQuestions);
  const [activity, setActivity] = useState<Activity>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(DELIVERED_PAGE);
  const [answering, setAnswering] = useState<Question | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<{ jobId: string; text: string } | null>(null);
  const selectSession = useStore((st) => st.selectSession);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setActivity(await getActivity());
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answering || !draft.trim()) return;
    setSaving(true);
    try {
      await answerQuestion(answering.id, draft.trim());
      toast("success", "Resposta enviada. O agente retomou de onde parou.");
      setAnswering(null);
      setDraft("");
      await load();
      await loadOpenQuestions();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function discard(question: Question) {
    try {
      await cancelQuestion(question.id);
      toast("success", "Pendência descartada.");
      await load();
      await loadOpenQuestions();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function stop(item: ActivityItem) {
    try {
      await cancelJob(item.job_id);
      toast("success", "Tarefa cancelada.");
      await load();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function showLog(item: ActivityItem) {
    try {
      const data = await getJobLog(item.job_id);
      setLog({ jobId: item.job_id, text: data.log });
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const { waiting, running, delivered } = activity;
  const empty = !waiting.length && !running.length && !delivered.length;

  return (
    <div className="container-app">
      <PageHeader
        icon={Inbox}
        title="Atividade"
        subtitle="O que seus agentes estão esperando de você, o que está em andamento e o que já foi entregue."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : empty ? (
        <Card>
          <CardContent className="p-12 pt-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-alt border border-border flex items-center justify-center mb-4">
              <Inbox className="w-7 h-7 text-text-muted" />
            </div>
            <p className="font-display text-base font-bold text-text-primary">
              Nada esperando por você
            </p>
            <p className="text-sm mt-1.5 text-text-muted">
              Quando um agente precisar de uma decisão sua, a pergunta aparece aqui —
              junto com o que ele está executando e os links do que já entregou.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {waiting.length > 0 && (
            <Section title="Esperando você" count={waiting.length} tone="warning">
              {waiting.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-surface rounded-2xl border border-border"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text-primary truncate">
                          {item.question?.subject || "Sem assunto"}
                        </span>
                        <ItemLinks item={item} />
                      </div>
                      <p className="text-sm text-text-primary mt-1.5">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-text-muted mt-1">{item.detail}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <span className="text-xs text-text-muted">
                          {relativeTime(item.at)}
                          {item.question?.asked_where &&
                            ` · perguntado em ${item.question.asked_where}`}
                        </span>
                        <OpenConversation item={item} onOpen={selectSession} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          setAnswering(item.question);
                          setDraft("");
                        }}
                      >
                        Responder
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Descartar"
                        onClick={() => item.question && discard(item.question)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {running.length > 0 && (
            <Section title="Em andamento" count={running.length} tone="muted">
              {running.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-4 bg-surface rounded-2xl border border-border"
                >
                  <Play className="w-4 h-4 text-purple shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary truncate">{item.title}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {item.detail} · começou {relativeTime(item.at)}
                    </p>
                    <OpenConversation item={item} onOpen={selectSession} />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => showLog(item)}>
                    Ver log
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => stop(item)}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </Section>
          )}

          {delivered.length > 0 && (
            <Section title="Entregue" count={delivered.length} tone="success">
              {delivered.slice(0, shown).map((item) => {
                const Icon = DELIVERED_ICON[item.kind] ?? CheckCircle2;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-4 bg-surface rounded-2xl border border-border"
                  >
                    <Icon className="w-4 h-4 text-green shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                          {item.detail}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-xs text-text-muted">
                          {relativeTime(item.at)}
                        </span>
                        <OpenConversation item={item} onOpen={selectSession} />
                        {item.job_id && (
                          <button
                            type="button"
                            onClick={() => showLog(item)}
                            className="text-xs text-purple hover:underline cursor-pointer"
                          >
                            ver log
                          </button>
                        )}
                      </div>
                    </div>
                    <ItemLinks item={item} />
                  </div>
                );
              })}
              {delivered.length > shown && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShown(shown + DELIVERED_PAGE)}
                >
                  Ver mais ({delivered.length - shown})
                </Button>
              )}
              <p className="text-xs text-text-muted pt-1">
                Relatórios e páginas publicadas, pull requests das demandas, tarefas de
                fundo e respostas que você deu. Imagens geradas ainda não são guardadas
                e por isso não aparecem aqui.
              </p>
            </Section>
          )}
        </div>
      )}

      <Dialog open={Boolean(log)} onOpenChange={(open) => (open ? null : setLog(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log da delegação</DialogTitle>
            <DialogDescription>
              Fim do log de {log?.jobId}. A credencial da CLI é mascarada antes de sair
              do servidor.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <pre className="max-h-[50vh] overflow-auto rounded-xl bg-surface-alt p-3 text-[11px] leading-5 text-text-primary whitespace-pre-wrap break-words">
              {log?.text || "(log vazio)"}
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(answering)}
        onOpenChange={(open) => (open ? null : setAnswering(null))}
      >
        <DialogContent>
          <form onSubmit={submitAnswer}>
            <DialogHeader>
              <DialogTitle>Responder</DialogTitle>
              <DialogDescription>{answering?.question}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              {answering?.subject_url && (
                <a
                  href={answering.subject_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-purple hover:underline inline-flex items-center gap-1"
                >
                  Abrir {answering.subject || "o assunto"}{" "}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="answer">Sua resposta</Label>
                <Textarea
                  id="answer"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Responda como explicaria para uma pessoa do time."
                  rows={5}
                  autoFocus
                />
                <p className="text-xs text-text-muted">
                  O agente retoma o trabalho parado com essa resposta e segue
                  trabalhando em segundo plano — você não precisa esperar aqui. Se
                  disser que ele pode decidir, ele decide e declara a premissa em vez
                  de perguntar de novo.
                </p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAnswering(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !draft.trim()}>
                {saving ? "Enviando..." : "Enviar resposta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpenConversation({
  item,
  onOpen,
}: {
  item: ActivityItem;
  onOpen: (key: string, agentId?: string) => void;
}) {
  if (!item.session_key) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.session_key, item.agent_id)}
      className="text-xs text-purple hover:underline cursor-pointer"
    >
      abrir conversa
    </button>
  );
}

function ItemLinks({ item }: { item: ActivityItem }) {
  if (!item.links.length) return null;
  return (
    <span className="flex items-center gap-3 shrink-0">
      {item.links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-purple hover:underline inline-flex items-center gap-1"
        >
          {link.label} <ExternalLink className="w-3 h-3" />
        </a>
      ))}
    </span>
  );
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "warning" | "muted" | "success";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-display text-sm font-bold text-text-primary uppercase tracking-wide">
          {title}
        </h2>
        <Badge variant={tone}>{count}</Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
