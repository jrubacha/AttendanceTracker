import React from 'react';

/**
 * Precision Guessworks logo mark.
 *
 * A geometric hexagon (a brand-favored sharp-edged shape) with three red arrows
 * converging on a single point that is intentionally OFF-center — the team's
 * "precision vs. accuracy" dartboard symbolism. The three arrows also represent
 * the three tenets: embrace technology, educate the community, empower the world.
 */
export function LogoMark({ size = 40, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Precision Guessworks logo"
      className={className}
    >
      <defs>
        <marker id="pg-arrow" markerWidth="5" markerHeight="5" refX="2.6" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#9e0001" />
        </marker>
      </defs>
      {/* Hexagon container */}
      <polygon
        points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5"
        fill="none"
        stroke="#3a3a3c"
        strokeWidth="2.5"
      />
      {/* Three arrows converging off-center (target point ~58,48) */}
      <g
        stroke="#9e0001"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
        markerEnd="url(#pg-arrow)"
      >
        <line x1="22" y1="24" x2="53" y2="45" />
        <line x1="83" y1="33" x2="62" y2="46" />
        <line x1="42" y1="84" x2="56" y2="53" />
      </g>
      <circle cx="58" cy="48.5" r="2.6" fill="#9e0001" />
    </svg>
  );
}

/**
 * Full lockup: mark + stacked wordmark. `variant` controls the supporting line:
 *  - "team"  → TEAM 1646        (FIRST-participant facing)
 *  - "app"   → ATTENDANCE       (default, for this kiosk)
 */
export function BrandLockup({ size = 40, variant = 'app', className = '' }) {
  const sub = variant === 'team' ? '1646' : 'Attendance';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <div className="leading-none">
        <div className="brand-heading text-kiosk-text" style={{ fontSize: size * 0.5 }}>
          Precision Guessworks
        </div>
        <div
          className="font-logo text-kiosk-accent uppercase tracking-[0.18em]"
          style={{ fontSize: size * 0.26, marginTop: size * 0.06 }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

export default LogoMark;
