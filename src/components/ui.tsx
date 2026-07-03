import { ReactNode, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, LucideIcon, HelpCircle, Minus, Plus, ChevronDown } from "lucide-react";
import { TabColorKey, tabColors } from "../theme/tokens";

export function GlassCard({
  children,
  className = "",
  hover = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl ${hover ? "glass-hover cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

type IconBoxTone = "blue" | "cyan" | "indigo" | "neutral";

const iconBoxTones: Record<IconBoxTone, string> = {
  blue: "border-beacon-cyan/20 from-beacon-cyan/16 to-beacon-medium/4 text-beacon-cyan",
  cyan: "border-beacon-light/20 from-beacon-light/16 to-beacon-cyan/4 text-beacon-light",
  indigo: "border-beacon-medium/20 from-beacon-medium/16 to-beacon-dark/4 text-beacon-medium",
  neutral: "border-white/12 from-white/8 to-white/2 text-beacon-ice/80",
};

export function IconBox({
  icon: Icon,
  tone = "blue",
  size = "md",
  className = "",
}: {
  icon: LucideIcon;
  tone?: IconBoxTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? 15 : 17;
  return (
    <div
      className={`icon-box bg-gradient-to-br ${dim} ${iconBoxTones[tone]} ${className}`}
    >
      <Icon size={iconSize} strokeWidth={1.65} />
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger" | "success";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-white text-beacon-bg shadow-lg shadow-beacon-cyan/15 hover:bg-beacon-glow",
  ghost:
    "border border-white/12 bg-white/5 text-beacon-ice hover:bg-white/10 hover:border-beacon-cyan/30",
  danger:
    "border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  success:
    "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled = false,
  className = "",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function PageLayout({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 overflow-hidden p-4 ${className}`}>
      {children}
    </div>
  );
}

export function ScrollArea({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}>
      {children}
    </div>
  );
}

/** Glass section panel with header + scrollable body */
export function Panel({
  title,
  subtitle,
  icon,
  actions,
  header,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`glass flex min-h-0 flex-col overflow-hidden rounded-2xl ${className}`}>
      <div className="shrink-0 border-b border-white/8 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <h2 className="text-sm font-semibold text-white">{title}</h2>
            </div>
            {subtitle && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>}
        </div>
        {header && <div className="mt-3">{header}</div>}
      </div>
      <div className={`flex min-h-0 flex-1 flex-col p-3 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-white/8 ${className}`} />;
}

export function TabIcon({
  icon: Icon,
  colorKey,
  size = 15,
  active = false,
}: {
  icon: LucideIcon;
  colorKey: TabColorKey;
  size?: number;
  active?: boolean;
}) {
  const color = tabColors[colorKey];
  return (
    <Icon
      size={size}
      style={{ color: active ? color : undefined }}
      className={active ? "" : "text-slate-400"}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-beacon-bg/70 p-6 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
            className={`glass-strong max-h-[85vh] w-full overflow-y-auto rounded-2xl p-6 ${wide ? "max-w-3xl" : "max-w-lg"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Tip({ text, className = "" }: { text: string; className?: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, above: true });

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const above = rect.top >= 100;
    setCoords({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      above,
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <>
      <span className={`inline-flex shrink-0 ${className}`}>
        <button
          ref={anchorRef}
          type="button"
          tabIndex={0}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className="rounded-full p-0.5 text-beacon-ice/45 transition-colors hover:bg-beacon-cyan/10 hover:text-beacon-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-beacon-cyan/40"
          aria-label={text}
        >
          <HelpCircle size={14} />
        </button>
      </span>
      {visible &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.above ? coords.top : coords.top,
              left: coords.left,
              transform: coords.above ? "translateY(-100%)" : undefined,
              zIndex: 99999,
            }}
            className="pointer-events-none w-64 max-w-[min(16rem,calc(100vw-1.5rem))] rounded-xl border border-beacon-cyan/20 bg-beacon-surface px-3 py-2.5 text-xs leading-relaxed text-beacon-ice/90 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            {text}
          </span>,
          document.body
        )}
    </>
  );
}

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap gap-1 rounded-2xl border border-beacon-edge/30 bg-beacon-bg/40 p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-beacon-cyan/20 text-white shadow-[inset_0_1px_0_rgba(234,251,255,0.08)]"
                : "text-beacon-ice/55 hover:bg-white/5 hover:text-beacon-ice"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive ? "bg-white/15 text-white" : "bg-white/8 text-beacon-ice/50"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PageSection({
  title,
  tip,
  icon,
  badge,
  actions,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  tip?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <GlassCard className={`overflow-hidden p-0 ${className}`}>
      <div className="flex items-center gap-3 border-b border-beacon-edge/25 px-5 py-4">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-beacon-cyan/15 bg-beacon-cyan/10">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{title}</h3>
            {tip && <Tip text={tip} />}
            {badge}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg p-1.5 text-beacon-ice/50 transition-colors hover:bg-white/5 hover:text-white"
            >
              <ChevronDown
                size={16}
                className={`transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>
      {(!collapsible || open) && <div className="p-5">{children}</div>}
    </GlassCard>
  );
}

export function NumericUpDown({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled = false,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-2xl border border-white/12 bg-white/5 ${disabled ? "opacity-40" : ""} ${className}`}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
        className="flex w-10 shrink-0 items-center justify-center text-beacon-ice/70 transition-colors hover:bg-beacon-cyan/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus size={15} />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 border-x border-white/10 px-2 py-2.5">
        <span className="font-mono text-sm font-semibold text-white tabular-nums">{value}</span>
        {suffix && <span className="text-xs text-beacon-ice/45">{suffix}</span>}
      </div>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
        className="flex w-10 shrink-0 items-center justify-center text-beacon-ice/70 transition-colors hover:bg-beacon-cyan/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warn" | "neutral" | "info";
  children: ReactNode;
}) {
  const tones = {
    success: "border-emerald-400/25 bg-emerald-500/12 text-emerald-200",
    warn: "border-amber-400/25 bg-amber-500/12 text-amber-200",
    neutral: "border-white/12 bg-white/8 text-beacon-ice/70",
    info: "border-beacon-cyan/25 bg-beacon-cyan/12 text-beacon-light",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
  tip,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  tip?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-beacon-ice/80">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-beacon-ice/40">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-beacon-ice/35 outline-none transition-colors focus:border-beacon-cyan/50 focus:bg-white/8";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputClass} appearance-none [&>option]:bg-beacon-surface ${props.className ?? ""}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border border-white/18 transition-colors ${checked ? "bg-beacon-cyan" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "ltr:left-[22px] rtl:right-[22px]" : "ltr:left-0.5 rtl:right-0.5"}`}
        />
      </span>
      {label && <span className="text-sm text-slate-300">{label}</span>}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-beacon-cyan/30 border-t-beacon-cyan ${className}`}
    />
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-500">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-1 flex shrink-0 flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
