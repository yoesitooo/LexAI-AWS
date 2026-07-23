'use client';

import { useState, useCallback } from 'react';

export type LogoVariant = 'full' | 'icon' | 'wordmark';
export type LogoTheme = 'dark' | 'light';

export interface LogoProps {
  /** Which logo to render: full (isotipo + wordmark), icon-only (isotipo), or wordmark-only */
  variant?: LogoVariant;
  /** Color theme: 'dark' for light backgrounds, 'light' for dark backgrounds */
  theme?: LogoTheme;
  /** Height in pixels. If ≤24, automatically switches to wordmark variant */
  height?: number;
  /** Additional CSS class */
  className?: string;
  /** Accessible label override */
  'aria-label'?: string;
}

const LOGO_SRCS: Record<LogoVariant, Record<LogoTheme, string>> = {
  full: {
    dark: '/logo-lexai-dark.svg',
    light: '/logo-lexai-light.svg',
  },
  icon: {
    dark: '/logo-lexai-icon-dark.svg',
    light: '/logo-lexai-icon-light.svg',
  },
  wordmark: {
    dark: '/logo-lexai-wordmark-dark.svg',
    light: '/logo-lexai-wordmark-light.svg',
  },
};

/**
 * Wordmark text fallback rendered when SVG fails to load.
 * Uses CSS to match the brand identity.
 */
function WordmarkFallback({
  height,
  theme,
  className,
}: {
  height: number;
  theme: LogoTheme;
  className?: string;
}) {
  const color = theme === 'dark' ? '#1A1A1A' : '#F5F5F5';
  const fontSize = Math.max(10, height * 0.6);

  return (
    <span
      className={className}
      role="img"
      aria-label="LexAI"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: `${height}px`,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color,
        userSelect: 'none',
      }}
    >
      LexAI
    </span>
  );
}

/**
 * LexAI brand logo component.
 *
 * - Renders SVG logo with appropriate variant and theme.
 * - Automatically switches to wordmark variant when height ≤ 24px.
 * - Falls back to a styled text wordmark if the SVG fails to load.
 *
 * Requirements: R17.1, R17.2, R17.3, R17.4, R17.5
 */
export function Logo({
  variant = 'full',
  theme = 'dark',
  height = 48,
  className,
  'aria-label': ariaLabel = 'LexAI',
}: LogoProps) {
  const [svgFailed, setSvgFailed] = useState(false);

  const handleError = useCallback(() => {
    setSvgFailed(true);
  }, []);

  // R17.3: Use wordmark-only version for heights ≤24px
  const resolvedVariant: LogoVariant = height <= 24 ? 'wordmark' : variant;

  // R17.5: Fallback to wordmark text if SVG can't load
  if (svgFailed) {
    return (
      <WordmarkFallback height={height} theme={theme} className={className} />
    );
  }

  const src = LOGO_SRCS[resolvedVariant][theme];

  // Compute width based on variant aspect ratios
  // full: viewBox 200x48 → ratio ~4.17
  // icon: viewBox 48x48 → ratio 1
  // wordmark: viewBox 120x24 → ratio 5
  const aspectRatios: Record<LogoVariant, number> = {
    full: 200 / 48,
    icon: 1,
    wordmark: 120 / 24,
  };
  const width = Math.round(height * aspectRatios[resolvedVariant]);

  return (
    <img
      src={src}
      alt={ariaLabel}
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      className={className}
      onError={handleError}
      style={{ display: 'inline-block' }}
    />
  );
}

export default Logo;
