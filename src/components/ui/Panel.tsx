import type { CSSProperties, ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Warna aksen panel dari skin aktif (deck/mixer). */
  accentColor?: string;
  style?: CSSProperties;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  accentColor,
  style,
}: PanelProps) {
  const accentStyle = accentColor
    ? ({ ...style, "--panel-accent": accentColor } as CSSProperties)
    : style;

  return (
    <section
      className={`panel ${accentColor ? "panel-accent" : ""} ${className ?? ""}`}
      style={accentStyle}
    >
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
