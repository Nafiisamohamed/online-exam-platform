"use client";

/**
 * Menus, dialogs, tabs and tooltips, built on Radix primitives so keyboard
 * navigation, focus trapping and screen-reader labels work out of the box.
 * Styling follows the shared tokens; open/close uses short fade/pop animations.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const panel = "z-50 rounded-2xl border border-border bg-surface shadow-overlay animate-pop-in";

// --- Dropdown menu ------------------------------------------------------------------

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({ className, align = "end", sideOffset = 8, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content align={align} sideOffset={sideOffset} className={cn(panel, "min-w-52 p-1.5", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({ className, icon, children, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { icon?: ReactNode }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text outline-none select-none",
        "data-[highlighted]:bg-accent-soft data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center text-muted">{icon}</span>}
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownLabel({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return <DropdownPrimitive.Label className={cn("px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-subtle uppercase", className)} {...props} />;
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1.5 h-px bg-border" />;
}

export const DropdownRadioGroup = DropdownPrimitive.RadioGroup;

export function DropdownRadioItem({ className, children, icon, ...props }: ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem> & { icon?: ReactNode }) {
  return (
    <DropdownPrimitive.RadioItem
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text outline-none select-none",
        "data-[highlighted]:bg-accent-soft data-[state=checked]:font-semibold data-[state=checked]:text-accent-strong",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
      <span className="flex-1">{children}</span>
      <DropdownPrimitive.ItemIndicator className="h-1.5 w-1.5 rounded-full bg-accent" />
    </DropdownPrimitive.RadioItem>
  );
}

// --- Popover (for richer panels such as notifications) ----------------------------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "end", sideOffset = 8, ...props }: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} collisionPadding={12} className={cn(panel, "outline-none", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}

// --- Modal dialog -------------------------------------------------------------------

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
}

export function Modal({ open, onOpenChange, title, description, children, footer, size = "md", closeLabel = "Close" }: ModalProps) {
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-[rgb(11_26_48/0.55)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "rounded-2xl border border-border bg-surface shadow-overlay animate-pop-in focus:outline-none",
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-foreground">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-2 h-9 w-9" aria-label={closeLabel}>
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children && <div className="px-6 py-5 text-sm text-text">{children}</div>}
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A yes/no question before an important action (publishing results, deleting). */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive, loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      closeLabel={cancelLabel}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    />
  );
}

// --- Tabs ---------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted transition-all",
        "hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-card",
        className,
      )}
      {...props}
    />
  );
}

// --- Tooltip ------------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = "bottom" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className="z-50 animate-fade-in rounded-lg bg-navy px-2.5 py-1.5 text-xs font-medium text-white shadow-raised dark:bg-surface-muted dark:text-foreground">
          {content}
          <TooltipPrimitive.Arrow className="fill-navy dark:fill-[var(--surface-muted)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
