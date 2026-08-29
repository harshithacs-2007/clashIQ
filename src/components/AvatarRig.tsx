"use client";

import type { AvatarConfig } from "@/lib/constants";

const palettes: Record<string, [string, string, string]> = {
  cyber: ["#0d1b16", "#c8f542", "#4aa3ff"],
  arcade: ["#1a1024", "#ff5cdb", "#ffd84a"],
  pixel: ["#101410", "#7dff7a", "#f4f4f4"],
  futuristic: ["#0e1624", "#67e8f9", "#c8f542"],
  robot: ["#1a1c1e", "#c5ccd3", "#ffb020"],
  tech: ["#101318", "#4aa3ff", "#e8edf2"],
};

export function AvatarRig({
  config,
  size = 96,
  label,
}: {
  config: AvatarConfig;
  size?: number;
  label?: string;
}) {
  const [bg, a, b] = palettes[config.style] ?? palettes.tech!;
  const hue = `hsl(${config.hue} 70% 54%)`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label ?? `${config.style} avatar`}>
      <rect width="120" height="120" rx="18" fill={bg} />
      <rect x="18" y="22" width="84" height="76" rx="14" fill={hue} opacity="0.22" />
      <rect x="28" y="34" width="64" height="44" rx="8" fill={a} opacity="0.9" />
      <rect x="34" y={40 + config.visor * 2} width="52" height="14" rx="3" fill={bg} />
      <circle cx={44 + config.mark * 4} cy="47" r="3" fill={b} />
      <circle cx={70 - config.mark} cy="47" r="3" fill={b} />
      <path d={`M40 78 Q60 ${88 - config.crest} 80 78`} fill="none" stroke={b} strokeWidth="3" />
      <rect x="50" y="18" width={8 + config.crest * 2} height="16" fill={a} />
      <text x="60" y="112" textAnchor="middle" fill={a} fontSize="9" fontFamily="ui-monospace, monospace">
        {config.style.toUpperCase()}
      </text>
    </svg>
  );
}

export const defaultAvatar = (): AvatarConfig => ({
  style: "cyber",
  hue: 140,
  visor: 1,
  crest: 2,
  mark: 1,
});
