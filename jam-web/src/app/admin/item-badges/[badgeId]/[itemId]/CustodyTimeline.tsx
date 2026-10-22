import Link from 'next/link'
import type { CustodyEventRow, PoiDropSource } from '@/types/database'
import { CUSTODY_EVENT_LABEL, formatDateTime } from '@/lib/admin/item-badge-status'
import { d } from '@/lib/i18n'
import { findPickupDropSource, resolveCustodyActors, type CustodyActorView } from '@/lib/account/withdrawn-actor'

interface CustodyTimelineProps {
  events: CustodyEventRow[]
  poiNameById: Map<string, string>
  /** 이 개체가 주워진 poi_drops 행들(source·picked_up_at). Pickup 이벤트의 from이 시스템 드랍인지 탈퇴인지 가르는 데 쓴다 */
  pickedUpDrops: ReadonlyArray<{ source: PoiDropSource; picked_up_at: string | null }>
}

/**
 * 이력 한 칸(From·To·실행자)의 행위자. 살아 있는 유저는 상세로 가는 링크, 탈퇴한 유저는 고정 텍스트(운영 로직 17.2절)다.
 * 탈퇴 텍스트는 누를 곳이 없으므로 링크와 팝업을 만들지 않고, 안내 문구는 title·aria-label에만 둔다.
 */
function ActorSlot({ label, view }: { label: string; view: CustodyActorView | null }) {
  if (!view) return null
  return (
    <span className="break-keep wrap-break-word">
      {label}:{' '}
      {view.kind === 'user' ? (
        <Link href={`/admin/users/${view.userId}`} className="text-foreground hover:underline">
          {view.name}
        </Link>
      ) : (
        <span className="text-foreground" title={d.withdrawnUser.notice} aria-label={d.withdrawnUser.notice}>
          {d.withdrawnUser.name}
        </span>
      )}
    </span>
  )
}

/**
 * 아이템배지 이력 상세의 CustodyEvent 타임라인(티켓 20260829_2139).
 *
 * 탈퇴한 유저는 정해진 텍스트로 보인다(운영 로직 17.2절, 티켓 20261021_1249 2회) — 처음 티켓의 «익명화 안 함» 결정을 뒤집었다.
 * 지울 때 이름 칸을 비우기 때문이다(마이그레이션 263·264). `*_user_id`가 남아있으면(계정이 아직 살아있으면) 상세로 이동 가능한
 * 링크로, 이벤트 종류별 필수 칸의 `*_user_id`가 NULL이면 탈퇴 텍스트로 표시한다. 필수 칸이 아닌 NULL은 원래 빈 칸이라 그리지 않는다
 * (판정은 `lib/account/withdrawn-actor.ts`). `*_user_id`가 NULL인 칸에 옛 이름 문자열이 남아 있어도 쓰지 않는다.
 */
export function CustodyTimeline({ events, poiNameById, pickedUpDrops }: CustodyTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        이력이 없어요 (개체 정체성 모델 도입 이전 데이터로 추정돼요)
      </p>
    )
  }

  return (
    <div className="space-y-0">
      {events.map((event) => {
        const poiName = event.poi_id ? poiNameById.get(event.poi_id) ?? '(삭제된 장소)' : null
        const actors = resolveCustodyActors(event, findPickupDropSource(event, pickedUpDrops))
        return (
          <div key={event.id} className="border-l-2 border-neutral-200 pl-4 py-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold">{CUSTODY_EVENT_LABEL[event.event_type]}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 mt-1">
              <ActorSlot label="From" view={actors.from} />
              <ActorSlot label="To" view={actors.to} />
              <ActorSlot label="실행자" view={actors.actor} />
              {poiName && (
                <span>
                  장소:{' '}
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
