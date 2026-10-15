import type { EntryStatus } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

export function StatusDot({ status }: { status: EntryStatus }) {
  return (
    <span
      aria-label={status === "published" ? "Published" : "Draft"}
      role="img"
      className={cn("size-2 shrink-0 rounded-full", status === "published" ? "bg-status-published" : "bg-status-draft")}
    />
  );
}

export function EntryStatusLabel({ status }: { status: EntryStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <span aria-hidden className={cn("size-2 rounded-full", status === "published" ? "bg-status-published" : "bg-status-draft")} />
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
const relativeTimeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

function formatRelativeTime(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  for (const [unit, unitSeconds] of relativeTimeUnits) {
    if (Math.abs(seconds) >= unitSeconds) return relativeTimeFormat.format(Math.round(seconds / unitSeconds), unit);
  }
  return "just now";
}

export function RelativeTime({ value, className }: { value: string; className?: string }) {
  // Server and browser clocks and locales differ, so the rendered text may legitimately change on hydration.
  return (
    <time dateTime={value} title={new Date(value).toLocaleString()} className={className} suppressHydrationWarning>
      {formatRelativeTime(value)}
    </time>
  );
}
