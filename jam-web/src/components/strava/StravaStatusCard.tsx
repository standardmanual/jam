import Link from 'next/link'
import { StravaConnectionRow } from '@/types/database'
import LocalDate from '@/components/LocalDate'
import { d } from '@/lib/i18n'

interface StravaStatusCardProps {
  connection: StravaConnectionRow | null
}

export default function StravaStatusCard({ connection }: StravaStatusCardProps) {
  if (!connection) {
    return (
      <div className="rounded-2xl bg-[#FC4C02]/10 border border-[#FC4C02]/30 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 rounded-full bg-border" />
          <span className="font-semibold text-sm text-muted">{d.auth.stravaNotConnectedTitle}</span>
        </div>
        <p className="text-muted text-sm mb-4">
          {d.auth.stravaConnectPrompt}
        </p>
        <Link
          href="/api/strava/auth"
          className="inline-block bg-[#FC4C02] text-foreground font-bold px-5 py-2.5 rounded-xl text-sm"
        >
          {d.auth.stravaConnectButton}
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#FC4C02]/10 border border-[#FC4C02]/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FC4C02]" />
          <span className="font-semibold text-sm text-foreground">{d.auth.stravaConnectedTitle}</span>
        </div>
      </div>
      {connection.last_synced_at ? (
        <p className="text-muted text-xs">
          {d.auth.stravaLastSyncedLabel} <LocalDate iso={connection.last_synced_at} korean={{ year: true, time: true }} />
        </p>
      ) : (
        <p className="text-muted text-xs">{d.auth.stravaNoSyncYet}</p>
      )}
    </div>
  )
}
