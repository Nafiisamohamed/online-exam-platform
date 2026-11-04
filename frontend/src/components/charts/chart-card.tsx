/**
 * Frame for every chart: title, short description, optional actions (filters,
 * export) and a clear "Sample data" label when the numbers are illustrative.
 */
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";

export interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Set when the chart shows illustrative numbers instead of API data. */
  sample?: { label: string; hint: string };
  children: ReactNode;
  className?: string;
  /** Height of the plot area in pixels. */
  height?: number;
}

export function ChartCard({ title, description, actions, sample, children, className, height = 280 }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title={title}
        description={description}
        action={
          <>
            {sample && (
              <Tooltip content={sample.hint}>
                <span tabIndex={0} className="rounded-full">
                  <Badge tone="neutral"><Info className="h-3 w-3" aria-hidden />{sample.label}</Badge>
                </span>
              </Tooltip>
            )}
            {actions}
          </>
        }
      />
      <CardContent className="flex-1 pt-4">
        <div style={{ height }} className="w-full">{children}</div>
      </CardContent>
    </Card>
  );
}
