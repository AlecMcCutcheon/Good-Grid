import type { CSSProperties } from 'react'

type IconProps = {
  className?: string
}

/** Full-size X mark. Supports two-stroke drawing via CSS variables: the first
 * diagonal uses --draw-1 (a length fraction), the second uses --draw-2. Both
 * default to 1 so the icon renders fully drawn when unanimated. */
export function XMarkIcon({ className, style }: IconProps & { style?: CSSProperties }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path
        className="x-mark__stroke x-mark__stroke--1"
        d="M4.5 4.5 19.5 19.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        style={{ ['--draw' as string]: 'var(--draw-1, 1)' }}
      />
      <path
        className="x-mark__stroke x-mark__stroke--2"
        d="M19.5 4.5 4.5 19.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        style={{ ['--draw' as string]: 'var(--draw-2, 1)' }}
      />
    </svg>
  )
}

/** Legacy one-piece X kept for tiny decorative uses. */
export function XMarkSimpleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3.5 3.5 17 17m0-17-17 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}

export function SmileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="currentColor" />
      <path d="M8.4 10v.1m7.2-.1v.1M8.2 13.6c.7 1.8 2.1 2.7 3.8 2.7s3.1-.9 3.8-2.7" stroke="var(--bg, #101418)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function FrownIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.4" fill="currentColor" />
      <path d="M8.4 10v.1m7.2-.1v.1M8.2 16.3c.7-1.8 2.1-2.7 3.8-2.7s3.1.9 3.8 2.7" stroke="var(--bg, #101418)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function HeartIcon({ className, filled }: IconProps & { filled: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.8 8.7c0 5-8.8 11-8.8 11s-8.8-6-8.8-11a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TemporarySmileIcon({ className }: IconProps) {
  return <SmileIcon className={className} />
}
