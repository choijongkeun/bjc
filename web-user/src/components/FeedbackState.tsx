import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/components/ui";

export function FeedbackState({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "error" | "success";
}) {
  const Icon = tone === "error" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={cn(
        "rounded-3xl border p-4 text-sm",
        tone === "error"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
          : tone === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            : "border-slate-800 bg-slate-900/40 text-slate-300"
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-slate-400">{description}</div>
        </div>
      </div>
    </div>
  );
}
