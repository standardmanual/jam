'use client'

interface LocalDateProps {
  iso: string | null | undefined
  options?: Intl.DateTimeFormatOptions
  suffix?: string
  fallback?: string
}

export default function LocalDate({ iso, options, suffix = '', fallback = '' }: LocalDateProps) {
  if (!iso) return <>{fallback}</>
  return <>{new Date(iso).toLocaleString('ko-KR', options)}{suffix}</>
}
