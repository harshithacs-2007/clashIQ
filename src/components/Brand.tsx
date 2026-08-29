"use client";

export function ClashMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="6" fill="#14181e" stroke="#c8f542" strokeWidth="2" />
      <path d="M10 32 L18 12 L26 32" fill="none" stroke="#c8f542" strokeWidth="3" />
      <path d="M24 16 L38 16 L31 36" fill="none" stroke="#4aa3ff" strokeWidth="3" />
      <circle cx="18" cy="12" r="2" fill="#c8f542" />
      <circle cx="38" cy="16" r="2" fill="#4aa3ff" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <ClashMark />
      <div>
        <div className="text-[15px] font-semibold tracking-tight">clashIQ</div>
        {!compact && <div className="mono text-[10px] tracking-[0.18em] text-[var(--mute)]">LIVE COMPETITION OS</div>}
      </div>
    </div>
  );
}
