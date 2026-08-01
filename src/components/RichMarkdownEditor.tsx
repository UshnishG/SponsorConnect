import { lazy, Suspense } from "react";
import "@uiw/react-md-editor/markdown-editor.css";

// MDEditor touches window at import; keep it client-only via lazy() (route already ssr:false under _authenticated).
const MDEditor = lazy(() => import("@uiw/react-md-editor"));

type Props = {
  value: string;
  onChange: (v: string) => void;
  height?: number;
  preview?: "live" | "edit" | "preview";
};

export function RichMarkdownEditor({ value, onChange, height = 360, preview = "edit" }: Props) {
  return (
    <div data-color-mode="light" className="rounded-md border border-slate-300 overflow-hidden">
      <Suspense fallback={<div className="p-3 text-sm text-slate-500">Loading editor…</div>}>
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? "")}
          height={height}
          preview={preview}
          visibleDragbar={false}
        />
      </Suspense>
    </div>
  );
}
