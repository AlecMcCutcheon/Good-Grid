import type { CSSProperties } from 'react'

type IconProps = {
  className?: string
  style?: CSSProperties
}

export function XMarkIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

export function LightbulbIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18h6m-5 3h4m-2-19a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.4h4c0-1.1.5-1.9 1.2-2.4A7 7 0 0 0 12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 5.5v1m-3 .8.6.6m4.8 0 .6-.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function SettingsIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8.7a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m19.4 13.5 1.1.8-1.1 1.9-1.3-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.4h-2.2l-.4-1.3a7.7 7.7 0 0 1-1.8 0l-.7 1.1-2-.9.3-1.4a7.8 7.8 0 0 1-1.2-1.3l-1.4.1-.7-2.1 1.2-.8a7.7 7.7 0 0 1 0-1.8l-1.1-.7.9-2 1.4.3a7.8 7.8 0 0 1 1.3-1.2l-.1-1.4 2.1-.7.8 1.2a7.7 7.7 0 0 1 1.8 0l.7-1.1 2 .9-.3 1.4a7.8 7.8 0 0 1 1.2 1.3l1.4-.1.7 2.1-1.2.8a7.7 7.7 0 0 1 0 1.8Z" transform="translate(-1 -1)" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TemporarySmileIcon({ className }: IconProps) {
  return <SmileIcon className={className} />
}
