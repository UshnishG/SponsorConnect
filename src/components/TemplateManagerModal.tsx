import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { upsertEmailTemplate, deleteEmailTemplate, type EmailTemplate } from "@/lib/templates.functions";
import { supabase } from "@/integrations/supabase/client";
import { RichMarkdownEditor } from "./RichMarkdownEditor";

function ImageDropzone({ label, helper, value, onChange, onClear }: any) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please drop a valid image file.");
      return;
    }
    
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      
      const { error } = await supabase.storage.from("assets").upload(fileName, file);
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from("assets").getPublicUrl(fileName);
      onChange(data.publicUrl);
    } catch (err: any) {
      toast.error(err?.message || "Upload failed. Ensure 'assets' bucket exists.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-3 w-full">
      <label className="mb-1 block text-xs font-semibold text-slate-700">
        {label} {helper && <span className="font-normal text-slate-400">({helper})</span>}
      </label>
      {value ? (
        <div className="relative border-2 border-slate-300 rounded overflow-hidden flex items-center justify-center bg-slate-100 p-2 group" style={{ minHeight: "80px" }}>
          <img src={value} alt="" className="max-h-24 max-w-full object-contain" />
          <button 
            type="button"
            onClick={onClear}
            className="absolute top-1 right-1 bg-red-500 text-white rounded px-2 py-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow"
          >✕</button>
        </div>
      ) : (
        <div 
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed p-4 flex items-center justify-center text-center text-xs transition-colors rounded cursor-pointer ${dragging ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-300 bg-white text-slate-500"}`}
          style={{ minHeight: "80px" }}
        >
          {uploading ? "Uploading..." : "Drag & Drop Image"}
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  templates: EmailTemplate[];
};

type Draft = {
  id?: string;
  key: string;
  label: string;
  description: string;
  subject: string;
  body_md: string;
  header_tagline: string;
  event_dates: string;
  sign_off: string;
  secondary_cta_label: string;
  secondary_cta_url: string;
  logo_urls: string[];
  header_bg: string;
  header_image_url: string;
  footer_image_url: string;

};

const EMPTY: Draft = {
  key: "",
  label: "",
  description: "",
  subject: "",
  body_md: "",
  header_tagline: "",
  event_dates: "",
  sign_off: "Warm regards,\n**Team AICSSYC**",
  secondary_cta_label: "",
  secondary_cta_url: "",
  logo_urls: [],
  header_bg: "",
  header_image_url: "",
  footer_image_url: "",

};

function toDraft(t: EmailTemplate): Draft {
  return {
    id: t.id,
    key: t.key,
    label: t.label,
    description: t.description ?? "",
    subject: t.subject,
    body_md: t.body_md,
    header_tagline: t.header_tagline ?? "",
    event_dates: t.event_dates ?? "",
    sign_off: t.sign_off ?? "",
    secondary_cta_label: t.secondary_cta_label ?? "",
    secondary_cta_url: t.secondary_cta_url ?? "",
    logo_urls: t.logo_urls ?? [],
    header_bg: t.header_bg ?? "",
    header_image_url: t.header_image_url ?? "",
    footer_image_url: t.footer_image_url ?? "",

  };
}


export function TemplateManagerModal({ open, onClose, templates }: Props) {
  const upsert = useServerFn(upsertEmailTemplate);
  const del = useServerFn(deleteEmailTemplate);
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (templates.length === 0) {
      setSelectedId("new");
      setDraft(EMPTY);
    } else if (selectedId === null) {
      setSelectedId(templates[0].id);
      setDraft(toDraft(templates[0]));
    }
  }, [open, templates, selectedId]);

  const pick = (id: string | "new") => {
    setSelectedId(id);
    if (id === "new") setDraft(EMPTY);
    else {
      const t = templates.find((x) => x.id === id);
      if (t) setDraft(toDraft(t));
    }
  };

  const save = async () => {
    if (!draft.key.trim() || !draft.label.trim() || !draft.subject.trim() || !draft.body_md.trim()) {
      toast.error("Key, label, subject and body are required.");
      return;
    }
    setSaving(true);
    try {
      const row = await upsert({
        data: {
          id: draft.id,
          key: draft.key.trim().toLowerCase(),
          label: draft.label.trim(),
          description: draft.description.trim() || null,
          subject: draft.subject,
          body_md: draft.body_md,
          header_tagline: draft.header_tagline || null,
          event_dates: draft.event_dates || null,
          sign_off: draft.sign_off || null,
          secondary_cta_label: draft.secondary_cta_label || null,
          secondary_cta_url: draft.secondary_cta_url || null,
          logo_urls: draft.logo_urls.filter((u) => u.trim()),
          header_bg: draft.header_bg.trim() || null,
          header_image_url: draft.header_image_url.trim() || null,
          footer_image_url: draft.footer_image_url.trim() || null,

        },
      });

      toast.success("Template saved");
      await qc.invalidateQueries({ queryKey: ["email-templates"] });
      setSelectedId(row.id);
      setDraft(toDraft(row));
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm(`Delete template "${draft.label}"? This can't be undone.`)) return;
    setSaving(true);
    try {
      await del({ data: { id: draft.id } });
      toast.success("Template deleted");
      await qc.invalidateQueries({ queryKey: ["email-templates"] });
      setSelectedId(null);
      setDraft(EMPTY);
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">Manage email templates</h2>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="grid flex-1 grid-cols-[240px_1fr] overflow-hidden">
          <aside className="border-r bg-slate-50 overflow-y-auto">
            <button
              onClick={() => pick("new")}
              className={`block w-full border-b px-4 py-3 text-left text-sm font-semibold ${
                selectedId === "new" ? "bg-amber-100 text-amber-900" : "text-emerald-700 hover:bg-slate-100"
              }`}
            >
              + New template
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                className={`block w-full border-b px-4 py-3 text-left text-sm ${
                  selectedId === t.id ? "bg-amber-50 text-amber-900" : "hover:bg-slate-100"
                }`}
              >
                <div className="font-medium text-slate-900">{t.label}</div>
                <div className="text-xs text-slate-500 font-mono">{t.key}</div>
              </button>
            ))}
            {templates.length === 0 && (
              <p className="p-4 text-xs text-slate-500">No custom templates yet.</p>
            )}
          </aside>

          <div className="overflow-y-auto p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Label</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Speaker Invitation"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Key (slug)</label>
                <input
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder="speaker-invite"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Description (internal only)</label>
              <input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Subject</label>
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Header tagline</label>
                <input
                  value={draft.header_tagline}
                  onChange={(e) => setDraft({ ...draft, header_tagline: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Event dates</label>
                <input
                  value={draft.event_dates}
                  onChange={(e) => setDraft({ ...draft, event_dates: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>




            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Secondary CTA label (optional)</label>
                <input
                  value={draft.secondary_cta_label}
                  onChange={(e) => setDraft({ ...draft, secondary_cta_label: e.target.value })}
                  placeholder="Speaker Brief"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Secondary CTA URL (optional)</label>
                <input
                  value={draft.secondary_cta_url}
                  onChange={(e) => setDraft({ ...draft, secondary_cta_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Body <span className="font-normal text-slate-400">(Markdown — use {"{{name}}"} for recipient name)</span>
              </label>
              <RichMarkdownEditor
                value={draft.body_md}
                onChange={(v) => setDraft({ ...draft, body_md: v })}
                height={280}
                preview="edit"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Sign-off</label>
              <RichMarkdownEditor
                value={draft.sign_off}
                onChange={(v) => setDraft({ ...draft, sign_off: v })}
                height={140}
                preview="edit"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={remove}
                disabled={!draft.id || saving}
                className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Create template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
