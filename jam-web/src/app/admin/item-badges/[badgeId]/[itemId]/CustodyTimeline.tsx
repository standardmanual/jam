import Link from 'next/link'
import type { CustodyEventRow } from '@/types/database'
import { CUSTODY_EVENT_LABEL, formatDateTime } from '@/lib/admin/item-badge-status'

interface CustodyTimelineProps {
  events: CustodyEventRow[]
  poiNameById: Map<string, string>
}

/**
 * 아이템배지 이력 상세의 CustodyEvent 타임라인(티켓 20260829_2139).
 *
 * 유저 식별자는 스냅샷 값(`*_username`)을 그대로 표시한다 — 탈퇴한 유저도 익명화하지
 * 않는다(열린 결정 1 확정). `*_user_id`가 남아있으면(계정이 아직 살아있으면) 상세로
 * 이동 가능한 링크로, 탈퇴로 비었으면(NULL) 이름만 텍스트로 표시한다.
 */
export function CustodyTimeline({ events, poiNameById }: CustodyTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        이력이 없습니다 (개체 정체성 모델 도입 이전 데이터로 추정됩니다).
      </p>
    )
  }

  return (
    <div className="space-y-0">
      {events.map((event) => {
        const poiName = event.poi_id ? poiNameById.get(event.poi_id) ?? '(삭제된 POI)' : null
        return (
          <div key={event.id} className="border-l-2 border-neutral-200 pl-4 py-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold">{CUSTODY_EVENT_LABEL[event.event_type]}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 mt-1">
              {event.from_username && (
                <span>
                  From:{' '}
                  {event.from_user_id ? (
                    <Link href={`/admin/users/${event.from_user_id}`} className="text-foreground hover:underline">
                      {event.from_username}
                    </Link>
                  ) : (
                    <span className="text-foreground">{event.from_username}</span>
                  )}
                </span>
              )}
              {event.to_username && (
                <span>
                  To:{' '}
                  {event.to_user_id ? (
                    <Link href={`/admin/users/${event.to_user_id}`} className="text-foreground hover:underline">
                      {event.to_username}
                    </Link>
                  ) : (
                    <span className="text-foreground">{event.to_username}</span>
                  )}
                </span>
              )}
              {event.actor_username && (
                <span>
                  실행자:{' '}
                  {event.actor_user_id ? (
                    <Link href={`/admin/users/${event.actor_user_id}`} className="text-foreground hover:underline">
                      {event.actor_username}
                    </Link>
                  ) : (
                    <span className="text-foreground">{event.actor_username}</span>
                  )}
                </span>
              )}
              {poiName && (
                <span>
                  지점:{' '}
                  {event.poi_id && poiNameById.has(event.poi_id) ? (
                    <Link href={`/admin/poi/${event.poi_id}`} className="text-foreground hover:underline">
                      {poiName}
                    </Link>
                  ) : (
                    <span className="text-foreground">{poiName}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
