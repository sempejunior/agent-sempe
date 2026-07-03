import { Fragment, useEffect, useRef, useState } from "react";
import { getPrompts, updatePrompts } from "@/lib/api";
import type { PromptSection } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Save,
  Sparkles,
} from "lucide-react";
import { TabBar } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/hub/PageHeader";

export function PromptsPanel() {
  const [sections, setSections] = useState<PromptSection[]>([]);
  const [extensions, setExtensions] = useState<Record<string, string>>({});
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const data = await getPrompts();
      setSections(data);
      const exts: Record<string, string> = {};
      for (const s of data) exts[s.filename] = s.extension;
      setExtensions(exts);
      setDirty(false);
      setSaved(false);
    } catch (e) {
      toast("error", `Failed to load prompts: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleExtensionChange = (filename: string, value: string) => {
    setExtensions((prev) => ({ ...prev, [filename]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = sections.map((s) => ({
        filename: s.filename,
        extension: extensions[s.filename] || "",
      }));
      await updatePrompts(payload);
      toast("success", "Prompts salvos");
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast("error", `Falha ao salvar: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const activeSection = sections[selectedIdx];
  const activeExtension = activeSection ? extensions[activeSection.filename] || "" : "";

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const ta = textareaRef.current;
    if (!ta || !activeSection) return;
    const currentVal = extensions[activeSection.filename] || "";
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = currentVal.substring(start, end);
    const newText =
      currentVal.substring(0, start) + prefix + selected + suffix + currentVal.substring(end);
    handleExtensionChange(activeSection.filename, newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const toolbar: { icon: typeof Bold; title: string; prefix: string; suffix?: string }[] = [
    { icon: Bold, title: "Negrito", prefix: "**", suffix: "**" },
    { icon: Italic, title: "Itálico", prefix: "_", suffix: "_" },
    { icon: Heading, title: "Título", prefix: "### " },
    { icon: List, title: "Lista", prefix: "- " },
    { icon: ListOrdered, title: "Lista numerada", prefix: "1. " },
    { icon: Code, title: "Código", prefix: "`", suffix: "`" },
    { icon: Link, title: "Link", prefix: "[", suffix: "](url)" },
  ];

  return (
    <div className="container-app">
      <PageHeader
        icon={Sparkles}
        title="Prompts do Agente"
        subtitle="Adicione instruções extras sobre o comportamento base do backend."
        action={
          <div className="flex items-center gap-3">
            {saved && (
              <Badge variant="success" className="gap-1.5 text-xs">
                <Check className="w-3.5 h-3.5" />
                Salvo
              </Badge>
            )}
            <Button
              size="lg"
              onClick={handleSave}
              disabled={!dirty || saving || loading}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-purple animate-spin" />
        </div>
      ) : sections.length > 0 && activeSection ? (
        <div className="flex flex-col gap-5">
          <TabBar
            items={sections.map((sec, i) => ({
              key: String(i),
              label: sec.label,
              badge: (extensions[sec.filename] || "").trim().length > 0 ? "•" : undefined,
            }))}
            value={String(selectedIdx)}
            onChange={(k) => setSelectedIdx(parseInt(k, 10))}
          />

          <Card>
            <CardContent className="p-4 pt-4">
              <p className="text-[13px] text-text-secondary leading-relaxed">
                <span className="font-bold text-text-primary">{activeSection.label}</span>
                {" — "}
                {activeSection.description}
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple/30">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-purple">
                  Sua customização
                </p>
                <p className="text-[12px] text-text-muted">{activeSection.hint}</p>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {activeExtension.length} caracteres
              </span>
            </div>

            <div className="flex items-center gap-1 border-y border-border bg-surface-alt px-3 py-1.5">
              {toolbar.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Fragment key={item.title}>
                    {(i === 2 || i === 5) && <div className="w-px h-4 bg-border mx-1" />}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => insertMarkdown(item.prefix, item.suffix)}
                      title={item.title}
                      className="h-7 w-7"
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </Button>
                  </Fragment>
                );
              })}
            </div>

            <Textarea
              ref={textareaRef}
              variant="code"
              value={activeExtension}
              onChange={(e) => handleExtensionChange(activeSection.filename, e.target.value)}
              placeholder={`Ex: Você deve conversar como o Mestre Yoda. Sempre inverter a ordem das frases, você deve.`}
              rows={14}
              className="rounded-t-none rounded-b-2xl border-0 p-5 text-[14px] leading-relaxed resize-y"
            />
          </Card>

          <Card>
            <button
              type="button"
              onClick={() => setShowBase((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-alt transition-colors rounded-2xl cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {showBase ? (
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                )}
                <Lock className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-[13px] font-bold text-text-primary">
                  Prompt base do sistema
                </span>
                <span className="text-[11px] text-text-muted">(somente leitura)</span>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {(activeSection.base || "").length} caracteres
              </span>
            </button>
            {showBase && (
              <div className="mx-5 mb-5 p-4 rounded-xl bg-slate-900 text-slate-300 text-[13px] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto shadow-inner">
                {activeSection.base || "(vazio)"}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
