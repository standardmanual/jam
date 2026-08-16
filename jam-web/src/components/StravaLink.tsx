import { d } from '@/lib/i18n'

interface StravaLinkProps {
  stravaId: number
}

export default function StravaLink({ stravaId }: StravaLinkProps) {
  return (
    <a
      href={`https://www.strava.com/activities/${stravaId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-full min-h-11 rounded-[var(--radius-nav-buttons)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold active:scale-95 transition-transform duration-100"
      style={{ background: '#FC4C02', color: '#FFFFFF' }}
    >
      {d.badges.viewOnStrava} ↗
    </a>
  )
}
