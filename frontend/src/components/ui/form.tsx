/**
 * Form controls: Field (label, hint and error around any control), Input,
 * Textarea, Select and SearchInput. All share one look and focus style, and
 * mark themselves invalid for screen readers when an error is shown.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-sm text-foreground placeholder:text-subtle shadow-card transition-colors " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-ring disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/** Wraps a control with its label, hint and error, and wires up the accessibility ids. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-accent-strong" aria-hidden>*</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-10 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-subtle" />
    </div>
  );
});

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchInput({ className, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input ref={ref} type="search" className={cn(control, "h-10 pl-10")} {...props} />
    </div>
  );
});
