import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const variants = {
  primary: "bg-blue-500 text-white hover:bg-blue-400 disabled:bg-blue-500/40",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:bg-slate-800/50",
  ghost: "bg-transparent text-slate-300 hover:bg-slate-800/70 disabled:text-slate-500",
  danger: "bg-rose-500 text-white hover:bg-rose-400 disabled:bg-rose-500/40",
};

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("glass-card p-5", className)}>{children}</section>;
}

export function TableShell({ children, height = "max-h-[420px]" }: PropsWithChildren<{ height?: string }>) {
  return <div className={cn("overflow-auto rounded-2xl border border-slate-800", height)}>{children}</div>;
}

export function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4 text-sm text-slate-400">
      <div>
        페이지 <span className="tabular text-slate-200">{page}</span> / <span className="tabular">{totalPages}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          이전
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          다음
        </Button>
      </div>
    </div>
  );
}

const toneMap: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  DRAFT: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  RETIRED: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
  FINALIZED: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  FAILED: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  RUNNING: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  PENDING: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
  SUCCEEDED: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
};

export function StatusBadge({
  value,
  tone,
}: {
  value: string | null | undefined;
  tone?: "blue" | "emerald" | "rose" | "slate";
}) {
  const safe = value ?? "N/A";
  const customTone =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-300 ring-blue-400/30"
      : tone === "emerald"
        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
        : tone === "rose"
          ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
          : tone === "slate"
            ? "bg-slate-500/15 text-slate-300 ring-slate-400/20"
            : null;
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", customTone ?? toneMap[safe] ?? "bg-slate-500/15 text-slate-200 ring-slate-400/20")}>
      {safe}
    </span>
  );
}

export function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <pre className="max-h-[320px] overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  );
}

export function FeedbackState({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "error" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 text-sm",
        tone === "error"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
          : tone === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            : "border-slate-800 bg-slate-900/40 text-slate-300"
      )}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-slate-400">{description}</div>
    </div>
  );
}
