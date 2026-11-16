import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, actions, children, className }: PanelProps) {
  return (
    <section className={`panel ${className ?? ""}`}>
      <div className="panel-header">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-faint">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
