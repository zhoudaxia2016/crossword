import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export function Collapsible({
  open,
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>> & { open: boolean }) {
  return (
    <div className={cn("ui-collapsible", open ? "is-open" : "", className)} {...props}>
      {children}
    </div>
  );
}

export function CollapsibleTrigger({
  className,
  children,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button className={cn("ui-collapsible__trigger", className)} type="button" {...props}>
      {children}
    </button>
  );
}

export function CollapsibleContent({
  open,
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>> & { open: boolean }) {
  if (!open) return null;
  return (
    <div className={cn("ui-collapsible__content", className)} {...props}>
      {children}
    </div>
  );
}
