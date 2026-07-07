import { useEffect, useMemo } from "react";
import { Store, Sparkles, Wrench, BookOpen, Loader2, GraduationCap } from "lucide-react";
import { getIcon } from "@/lib/iconCatalog";
import { useStore } from "@/lib/store";
import { PageHeader } from "./PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAgentTemplateDetail, type AgentTemplate } from "@/lib/api";
import { toast } from "@/lib/toast";

const CATEGORY_ORDER = [
  "Comportamental",
  "R&S",
  "T&D",
  "Ponto",
  "DP",
  "Jurídico",
  "Engajamento",
  "Onboarding",
  "Geral",
];

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

  const blankTemplate = useMemo(
    () => templates.find((t) => t.id === "blank") ?? null,
    [templates],
  );

  const sortedTemplates = useMemo(() => {
    return templates
      .filter((t) => t.id !== "blank" && t.id !== "skill_author")
      .slice()
      .sort((a, b) => {
        const ca = CATEGORY_ORDER.indexOf(a.category || "Geral");
        const cb = CATEGORY_ORDER.indexOf(b.category || "Geral");
        const oa = ca === -1 ? 999 : ca;
        const ob = cb === -1 ? 999 : cb;
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name);
      });
  }, [templates]);

  async function applyTemplate(t: AgentTemplate) {
    resetWizard();
    let skills: string[] = [];
    try {
      const detail = await getAgentTemplateDetail(t.id);
      skills = detail.skills.map((s) => s.name);
    } catch (e) {
      toast("error", `Não consegui carregar detalhes do template: ${(e as Error).message}`);
    }
    updateWizardDraft({
      template_id: t.id,
      name: t.name,
      role: t.role,
      description: t.description,
      avatar: t.icon,
      guidelines: t.system_prompt,
      tools: t.tools,
      skills,
      rag_enabled: t.rag_enabled,
      starter_prompts: t.starter_prompts,
    });
    setWizardStep(2);
    setActiveView("agent-studio");
  }

  return (
    <div className="container-app">
      <PageHeader
        icon={Store}
        title="Sólides Agent Hub"
        subtitle="Agentes prontos para o time de Gente & Gestão. Escolha um perfil, aplique e ajuste o que precisar."
      />

      {templates.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {blankTemplate && (
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="font-display font-bold text-base text-text-primary">
                  Do zero
                </h2>
                <span className="text-xs text-text-muted">
                  Começar sem template
                </span>
              </div>
              <Card className="flex flex-col md:flex-row items-stretch border-dashed border-2 border-purple/30 bg-purple-muted/30">
                <div className="p-6 flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-purple flex items-center justify-center shrink-0">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-base text-text-primary leading-tight">
                      {blankTemplate.name}
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      {blankTemplate.description}
                    </p>
                  </div>
                </div>
                <div className="border-t md:border-t-0 md:border-l border-border p-4 flex items-center md:w-56">
                  <Button
                    className="w-full"
                    variant="subtle"
                    onClick={() => applyTemplate(blankTemplate)}
                  >
                    Criar do zero
                  </Button>
                </div>
              </Card>
            </section>
          )}

          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="font-display font-bold text-base text-text-primary">
                Templates prontos
              </h2>
              <span className="text-xs text-text-muted">
                {sortedTemplates.length} templates
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sortedTemplates.map((t) => {
                const TplIcon = getIcon(t.icon);
                return (
                <Card key={t.id} className="flex flex-col">
                  <CardContent className="p-6 pt-6 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-12 h-12 rounded-2xl bg-purple-muted flex items-center justify-center shrink-0">
                        <TplIcon className="w-6 h-6 text-purple" />
                      </div>
                      <Badge variant="muted" className="text-[10px]">
                        {t.category || "Geral"}
                      </Badge>
                    </div>
                    <h3 className="mt-4 font-display font-bold text-base text-text-primary leading-tight">
                      {t.name}
                    </h3>
                    <p className="text-xs font-semibold text-purple mt-0.5">{t.role}</p>
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary line-clamp-3">
                      {t.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {t.skills_count > 0 && (
                        <Badge variant="muted" className="gap-1">
                          <GraduationCap className="w-3 h-3" /> {t.skills_count} skills
                        </Badge>
                      )}
                      {t.rag_enabled && (
                        <Badge variant="muted" className="gap-1">
                          <BookOpen className="w-3 h-3" /> RAG
                        </Badge>
                      )}
                      {t.tools.slice(0, 2).map((tool) => (
                        <Badge key={tool} variant="code" className="gap-1">
                          <Wrench className="w-3 h-3" /> {tool}
                        </Badge>
                      ))}
                      {t.tools.length > 2 && (
                        <Badge variant="muted">+{t.tools.length - 2}</Badge>
                      )}
                    </div>
                  </CardContent>
                  <div className="border-t border-border p-4">
                    <Button className="w-full" onClick={() => applyTemplate(t)}>
                      Usar este template
                    </Button>
                  </div>
                </Card>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
