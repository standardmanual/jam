import Link from 'next/link'
import { StravaConnectionRow } from '@/types/database'

interface StravaStatusCardProps {
  connection: StravaConnectionRow | null
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function StravaStatusCard({ connection }: StravaStatusCardProps) {
  if (!connection) {
    return (
      <div className="rounded-2xl bg-[#FC4C02]/10 border border-[#FC4C02]/30 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-2 h-2 rounded-full bg-white/30" />
          <span className="font-semibold text-sm text-white/70">Strava 미연결</span>
        </div>
        <p className="text-white/50 text-sm mb-4">
          Strava를 연결하면 활동 기반 배지를 자동으로 획득할 수 있어요.
        </p>
        <Link
          href="/api/strava/auth"
          className="inline-block bg-[#FC4C02] text-white font-bold px-5 py-2.5 rounded-xl text-sm"
        >
          Strava 연동하기
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#FC4C02]/10 border border-[#FC4C02]/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FC4C02]" />
          <span className="font-semibold text-sm text-[#FC4C02]">Strava 연결됨</span>
        </div>
      </div>
      {connection.last_synced_at ? (
        <p className="text-white/40 text-xs">
          마지막 동기화: {formatDateTime(connection.last_synced_at)}
        </p>
      ) : (
        <p className="text-white/40 text-xs">아직 동기화된 데이터가 없습니다</p>
      )}
    </div>
  )
}
