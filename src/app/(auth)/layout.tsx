import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-xs text-muted">Nothing is sent without your nod.</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 grain opacity-40" />
        <div className="relative flex h-full flex-col justify-end p-14 text-paper">
          <p className="font-display text-[54px] leading-[1.02]">
            Every sentence
            <br />
            traced to a fact
            <br />
            <span className="text-nod">you confirmed.</span>
          </p>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-paper/70">
            Nod finds jobs, drafts tailored applications from your own CV, and waits. You see exactly what will be sent, then
            you decide.
          </p>
        </div>
      </aside>
    </div>
  );
}
