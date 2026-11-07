"use client";

/**
 * Shows the right thing for an API read: a skeleton while loading, a
 * translated error with "Try again" if it failed, otherwise the content.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/states";
import type { ApiState } from "@/lib/api/use-api";
import { errorText } from "@/lib/i18n/error-text";
import { useI18n } from "@/lib/i18n/i18n";

export function QueryError({ state, className }: { state: Pick<ApiState<unknown>, "error" | "reload">; className?: string }) {
  const { t } = useI18n();
  return (
    <ErrorState
      className={className}
      title={t("states.errorTitle")}
      description={errorText(t, state.error)}
      action={<Button variant="outline" onClick={state.reload}>{t("common.retry")}</Button>}
    />
  );
}

export function QueryState<T>({
  state, children, skeleton, className,
}: {
  state: ApiState<T>;
  children: (data: T) => ReactNode;
  /** Height of the loading placeholder (Tailwind class), default h-40. */
  skeleton?: string;
  className?: string;
}) {
  if (state.error && state.data === undefined) return <QueryError state={state} className={className} />;
  if (state.data === undefined) return <div className={className} aria-busy="true"><Skeleton className={skeleton ?? "h-40 w-full"} /></div>;
  return <>{children(state.data)}</>;
}
