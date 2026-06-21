import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fieldClassName = cn(
  "w-full min-w-0 rounded-[20px] border border-slate-700/80 bg-slate-950/80 px-4 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition duration-150",
  "placeholder:text-slate-500 focus:border-blue-400/60 focus:ring-4 focus:ring-blue-400/12 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/85 disabled:text-slate-500"
);

export const fieldInputClassName = cn(fieldClassName, "h-14 py-3");
export const fieldTextareaClassName = cn(fieldClassName, "min-h-[112px] resize-y py-3 leading-6");
export const fieldLabelClassName = "mb-2 block text-sm font-semibold text-slate-200";
export const fieldHintClassName = "mt-2 text-xs text-slate-500";

const buttonVariants = {
  primary: "bg-blue-500 text-white hover:bg-blue-400 disabled:bg-blue-500/35 disabled:text-white/70",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:bg-slate-800/60 disabled:text-slate-400",
  ghost: "bg-transparent text-slate-300 hover:bg-slate-800/70 disabled:text-slate-500",
  success: "bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-emerald-500/40 disabled:text-slate-300",
};

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed",
        buttonVariants[variant],
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

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      {eyebrow ? <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{eyebrow}</div> : null}
      <h2 className="mt-2 text-xl font-bold text-slate-50">{title}</h2>
      {description ? <p className="mt-2 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        fieldInputClassName,
        props.className
      )}
      {...props}
    />
  );
}

export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        fieldInputClassName,
        "appearance-none pr-11",
        props.className
      )}
      {...props}
    />
  );
}

export function TextAreaField(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        fieldTextareaClassName,
        props.className
      )}
      {...props}
    />
  );
}

export function FieldLabel({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label className={cn(fieldLabelClassName, className)} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function FieldHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(fieldHintClassName, className)}>{children}</p>;
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: PropsWithChildren<{ label?: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; className?: string }>) {
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel> : null}
      {children}
      {error ? <p className="text-xs text-rose-300">{error}</p> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function TableShell({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("overflow-auto rounded-[24px] border border-slate-800", className)}>{children}</div>;
}

export function Badge({
  children,
  tone = "default",
}: PropsWithChildren<{ tone?: "default" | "blue" | "emerald" | "rose" | "slate" }>) {
  const toneClasses =
    tone === "blue"
      ? "bg-blue-500/12 text-blue-200 ring-blue-400/20"
      : tone === "emerald"
        ? "bg-emerald-500/12 text-emerald-200 ring-emerald-400/20"
        : tone === "rose"
          ? "bg-rose-500/12 text-rose-200 ring-rose-400/20"
          : tone === "slate"
            ? "bg-slate-800 text-slate-300 ring-slate-700"
            : "bg-slate-800/80 text-slate-200 ring-slate-700";

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", toneClasses)}>{children}</span>;
}
