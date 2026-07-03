import { useEffect } from "react";
import { Store, Sparkles, Wrench, BookOpen, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "./PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AgentTemplate } from "@/lib/api";

export function AgentStorePage() {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const setActiveView = useStore((s) => s.setActiveView);
  const updateWizardDraft = useStore((s) => s.updateWizardDraft);
  const setWizardStep = useStore((s) => s.setWizardStep);
  const resetWizard = useStore((s) => s.resetWizard);

  useEffect(() => {
    if (templates.length === 0) loadTemplates();
  }, [templates.length, loadTemplates]);

  function applyTemplate(t: AgentTemplate) {
    resetWizard();
    updateWizardDraft({
      template_id: t.id,
      name: t.name,
      role: t.role,
      description: t.description,
      avatar: t.icon,
      guidelines: t.system_prompt,
      tools: t.tools,
      rag_enabled: t.rag_enabled,
    });
    setWizardStep(2);
    setActiveView("agent-studio");
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={Store}
        title="Agent Store"
        subtitle="Templates prontos para personalizar. Escolha um perfil e ajuste identidade, RAG, skills e canais."
      />

      {templates.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardContent className="p-6 pt-6 flex-1">
                <div className="w-12 h-12 rounded-2xl bg-purple-muted flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-purple" />
                </div>
                <h3 className="mt-4 font-display font-bold text-base text-text-primary leading-tight">
                  {t.name}
                </h3>
                <p className="text-xs font-semibold text-purple mt-0.5">{t.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary line-clamp-3">
                  {t.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {t.rag_enabled && (
                    <Badge variant="muted" className="gap-1">
                      <BookOpen className="w-3 h-3" /> RAG
                    </Badge>
                  )}
                  {t.tools.slice(0, 4).map((tool) => (
                    <Badge key={tool} variant="code" className="gap-1">
                      <Wrench className="w-3 h-3" /> {tool}
                    </Badge>
                  ))}
                  {t.tools.length > 4 && (
                    <Badge variant="muted">+{t.tools.length - 4}</Badge>
                  )}
                </div>
              </CardContent>
              <div className="border-t border-border p-4">
                <Button className="w-full" onClick={() => applyTemplate(t)}>
                  Usar este template
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
