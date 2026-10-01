'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconBellRinging } from '@tabler/icons-react'
import {
  SIGNAL_CARD_GROUPS,
  SIGNAL_SECTION_LOAD_FAILED,
  recordMapOf,
  type SignalRecordMap,
  type SignalThresholdRecord,
} from '@/lib/admin/opsSignals/thresholdSettings'
import { OpsSignalCard } from './OpsSignalCard'
import { NoticeCard } from './OpsRuleCardParts'

/**
 * 운영 설정(S7)의 「신호 기준값」 구역 본문 (티켓 20260930_1459 조각 C, 채원 확정 설계). 신호 하나가 카드 한 장(9장)이고, 신호 수준 세 그룹(중단·주의·참고)으로
 * 나눠 보인다. 구역 틀·제목·설명은 `OpsSettingsSection`이 맡고, 기준값 25개의 현재 상태는 서버 컴포넌트(`SignalSection`)가 읽어 넘긴다.
 *
 * - `thresholds`가 `null`이면 읽지 못한 것이다: 이 구역만 오류 카드(다른 구역은 그대로 보인다)와 [새로 고치기]. **기본값을 현재 값처럼 보이지 않는다.**
 * - 빈 상태는 없다(바꾼 값 행이 없는 것이 정상이고, 그때는 기본값이 보인다)
 * - 카드가 저장·되돌리기·최신 값 불러오기를 하면 이 구역이 그 값을 들고 있다. 서버가 값을 다시 넘기면(화면 새로 읽기) 값을 서버 것으로 바꾸고 카드를 새로
 *   그린다(카드 초안도 새로 만든다)
 * - 주소의 `#signal-<신호 키>`로 열었으면 구역이 늦게 나타나도 그 카드로 스크롤한다(스트리밍으로 그려지면 브라우저의 앵커 이동을 놓칠 수 있다)
 */

export interface OpsSignalSettingsProps {
  /** 읽은 기준값 25개의 현재 상태. 읽지 못했으면 `null`. */
  thresholds: readonly SignalThresholdRecord[] | null
}

export function OpsSignalSettings({ thresholds }: OpsSignalSettingsProps) {
  const router = useRouter()
  const [seen, setSeen] = useState(thresholds)
  const [records, setRecords] = useState<SignalRecordMap>(() => recordMapOf(thresholds ?? []))
  const [version, setVersion] = useState(0)

  // 서버가 값을 새로 넘기면(화면 새로 읽기) 값을 바꾸고 카드를 새로 그린다(렌더 중에 비교한다. effect 안에서 `setState`하지 않는다).
  if (thresholds !== seen) {
    setSeen(thresholds)
    setRecords(recordMapOf(thresholds ?? []))
    setVersion((current) => current + 1)
  }

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  if (thresholds === null) {
    return (
      <NoticeCard
        Icon={IconBellRinging}
        title={SIGNAL_SECTION_LOAD_FAILED.title}
        description={SIGNAL_SECTION_LOAD_FAILED.description}
        onRetry={{ label: SIGNAL_SECTION_LOAD_FAILED.retry, run: () => router.refresh() }}
      />
    )
  }

  return (
    <div className="space-y-8">
      {SIGNAL_CARD_GROUPS.map((group) =>
        group.cards.length === 0 ? null : (
          <div key={group.level} className="space-y-3">
            <h3 className="text-base font-semibold">{group.title}</h3>
            {group.cards.map((card) => (
              <OpsSignalCard
                key={`${card.signal}-${version}`}
                card={card}
                records={records}
                onRecords={(next) => setRecords((current) => ({ ...current, ...recordMapOf(next) }))}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
