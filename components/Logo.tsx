'use client';

export type LogoVariant = 'full' | 'compact';

export interface LogoProps {
  variant?: LogoVariant;
  height?: number;
  className?: string;
  'aria-label'?: string;
}

export function Logo({
  variant = 'full',
  height = 32,
  className,
  'aria-label': ariaLabel = 'LexAI by HorumLabs',
}: LogoProps) {
  const fontSize = Math.max(12, height * 0.55);
  const subFontSize = Math.max(9, height * 0.3);

  return (
    <span
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${Math.max(6, height * 0.2)}px`,
        height: `${height}px`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          letterSpacing: '-0.02em',
          color: 'var(--texto-primario)',
          lineHeight: 1,
        }}
      >
        LexAI
      </span>
      {variant === 'full' && (
        <>
          <span
            style={{
              width: '1px',
              height: `${height * 0.5}px`,
              backgroundColor: 'var(--borde)',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span
            style={{
              fontSize: `${subFontSize}px`,
              fontWeight: 400,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              letterSpacing: '0.05em',
              color: 'var(--texto-secundario)',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            BY HORUMLABS
          </span>
        </>
      )}
    </span>
  );
}

export default Logo;
