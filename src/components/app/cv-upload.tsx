"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { uploadCv, type CvUploadState } from "@/app/app/actions/profile";
import { Button, cn } from "@/components/ui";

export function CvUpload({ current }: { current?: string | null }) {
  const [state, action, pending] = useActionState<CvUploadState, FormData>(uploadCv, null);
  const [name, setName] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={action} className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file && input.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.current.files = dt.files;
            setName(file.name);
            form.current?.requestSubmit();
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-9 text-center transition-colors",
          drag ? "border-ink bg-nod/30" : "border-line-2 bg-card hover:bg-paper-2/50",
        )}
      >
        {pending ? <Loader2 className="size-6 animate-spin text-ink" /> : <FileUp className="size-6 text-ink" />}
        <span className="font-medium">
          {pending ? `Reading ${name ?? "your CV"}…` : current ? "Upload a new version" : "Drop your CV here, or click to choose"}
        </span>
        <span className="text-[13px] text-muted">
          PDF, Word (.docx) or text · {current ? `current: ${current}` : "up to 6 MB"}
        </span>
        <input
          ref={input}
          type="file"
          name="cv"
          accept=".pdf,.docx,.txt,.md"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setName(f.name);
              form.current?.requestSubmit();
            }
          }}
        />
      </label>
      {state ? (
        <p className={cn("rounded-[10px] px-3 py-2 text-sm", state.ok ? "bg-traced-bg text-traced" : "bg-blocked-bg text-blocked")}>{state.message}</p>
      ) : null}
      <noscript>
        <Button type="submit">Upload</Button>
      </noscript>
    </form>
  );
}
