import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background,color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink-2",
        nod: "bg-nod text-ink hover:bg-nod-deep shadow-[inset_0_-2px_0_rgb(21_22_26/0.12)]",
        outline: "border border-line-2 bg-card text-ink hover:bg-paper-2",
        ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink",
        danger: "border border-blocked/30 bg-card text-blocked hover:bg-blocked-bg",
        link: "rounded-none px-0 text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const field =
  "w-full rounded-[10px] border border-line-2 bg-card px-3 text-[15px] text-ink placeholder:text-muted/70 shadow-[inset_0_1px_0_rgb(21_22_26/0.03)] transition-colors focus:border-ink focus:outline-none disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        field,
        "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2315161a%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-paper-2 text-ink-2",
        ink: "bg-ink text-paper",
        nod: "bg-nod text-ink",
        traced: "bg-traced-bg text-traced",
        blocked: "bg-blocked-bg text-blocked",
        warn: "bg-warn-bg text-warn",
        info: "bg-info-bg text-info",
        outline: "border border-line-2 text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-line bg-card shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function SectionTitle({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {eyebrow ? <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{eyebrow}</p> : null}
        <h1 className="font-display text-[40px] leading-[1.05] text-ink sm:text-[46px]">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-2 px-6 py-12 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}
