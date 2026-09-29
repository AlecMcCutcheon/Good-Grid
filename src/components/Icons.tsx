type IconProps = {
  className?: string
}

export function XMarkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3.5 3.5 17 17m0-17-17 17" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}

export function TemporaryNoteIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 2.8 2.5 6.7 6.7 2.5-6.7 2.5-2.5 6.7-2.5-6.7L2.8 12l6.7-2.5L12 2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19.3 2.8v3.9m-1.95-1.95h3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
