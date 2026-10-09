"use client";

import { Loader2 } from "lucide-react";
import type * as React from "react";
import { useFormStatus } from "react-dom";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "./ui";

/** A submit button that shows a spinner while its form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
