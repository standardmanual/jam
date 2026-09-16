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
          <span className="w-2 h-2 rounded-full bg-white/30" />
          <span className="font-semibold text-sm text-white/70">{d.auth.stravaNotConnectedTitle}</span>
        </div>
        <p className="text-white/50 text-sm mb-4">
          {d.auth.stravaConnectPrompt}
        </p>
        <Link
          href="/api/strava/auth"
          className="inline-block bg-[#FC4C02] text-white font-bold px-5 py-2.5 rounded-xl text-sm"
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
          <span className="font-semibold text-sm text-[#FC4C02]">{d.auth.stravaConnectedTitle}</span>
        </div>
      </div>
      {connection.last_synced_at ? (
        <p className="text-white/40 text-xs">
          {d.auth.stravaLastSyncedLabel} <LocalDate iso={connection.last_synced_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
        </p>
      ) : (
        <p className="text-white/40 text-xs">{d.auth.stravaNoSyncYet}</p>
      )}
    </div>
  )
}
