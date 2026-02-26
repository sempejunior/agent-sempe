import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PanelWrapper } from "@/components/ui/panel-wrapper";
import { getPrompts, updatePrompts } from "@/lib/api";
import type { PromptSection } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  Sparkles,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

function PromptCard({
  section,
  extension,
  onChange,
}: {
  section: PromptSection;
  extension: string;
  onChange: (value: string) => void;
}) {
  const [showBase, setShowBase] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-primary">{section.label}</h3>
        </div>
        <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
      </div>

      <div className="border-t border-white/[0.04] px-4 py-3 space-y-3">
        {/* Base prompt (read-only, collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowBase(!showBase)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <Lock className="w-3 h-3" />
            <span>System prompt (read-only)</span>
            {showBase ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {showBase && (
            <div className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-text-muted font-mono leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {section.base || "(empty)"}
            </div>
          )}
        </div>

        {/* User extension (editable) */}
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">
            {section.hint}
          </label>
          <textarea
            value={extension}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Write in Markdown...\n\nExample:\n- ${section.label === "Soul" ? "You are a friendly customer service agent for Acme Corp. Be warm and empathetic." : section.label === "Behavior" ? "Always check our internal docs before answering customer questions. Escalate billing issues." : "I'm Carlos, CTO at Acme Corp. We use Python/FastAPI for the backend."}`}
            rows={5}
            className="w-full resize-none text-sm leading-relaxed bg-white/[0.03] border border-white/[0.06] rounded-lg p-3.5 text-text-primary placeholder:text-text-muted/30 focus:outline-none focus:border-green/30 transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

export function PromptsPanel({ open, onClose }: Props) {
  const [sections, setSections] = useState<PromptSection[]>([]);
  const [extensions, setExtensions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const data = await getPrompts();
      setSections(data);
      const exts: Record<string, string> = {};
      for (const s of data) {
        exts[s.filename] = s.extension;
      }
      setExtensions(exts);
      setDirty(false);
    } catch (e) {
      toast("error", `Failed to load prompts: ${(e as Error).message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      loadPrompts();
      setSaved(false);
    }
  }, [open]);

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
      toast("success", "Agent prompts saved");
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast("error", `Failed to save: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  return (
    <PanelWrapper open={open} onClose={onClose} title="Agent Prompts" icon={Sparkles}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Info */}
        <div className="text-xs text-text-muted leading-relaxed px-1">
          Customize how your agent behaves. Each section has a system prompt
          (read-only) that ensures core functionality, and an extension area
          where you define your agent's persona and rules.
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-green/30 border-t-green rounded-full animate-spin" />
          </div>
        ) : (
          sections.map((section) => (
            <PromptCard
              key={section.filename}
              section={section}
              extension={extensions[section.filename] || ""}
              onChange={(val) => handleExtensionChange(section.filename, val)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-5 py-4 flex items-center justify-end gap-3 bg-white/[0.01] shrink-0">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green font-medium">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
        <Button onClick={handleSave} disabled={!dirty || saving || loading}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Prompts
        </Button>
      </div>
    </PanelWrapper>
  );
}
