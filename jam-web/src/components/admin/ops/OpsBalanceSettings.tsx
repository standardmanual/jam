'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconScale } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import type { OpsRuleRecord } from '@/lib/admin/opsInbox/balance/rules'
import { BALANCE_RULE_GROUPS, SECTION_EMPTY, SECTION_LOAD_FAILED, readPointRewardValue } from '@/lib/admin/opsInbox/balance/settings'
import { OpsRuleCard } from './OpsRuleCard'

/**
 * 운영 설정(S7)의 「밸런스 규칙」 구역 본문 (티켓 20260930_1459 조각 B, 채원 확정 설계). 규칙 8개를 세 그룹(컬렉션 개방 R1~R4 · 포인트 크기 R5~R7 ·
 * 경제 수치 불변 R8)으로 나눠 카드로 보인다. 구역 틀·제목·설명은 `OpsSettingsSection`이 맡고, 규칙과 열린 컬렉션 수는 서버 컴포넌트가 읽어 넘긴다.
 *
 * - `rules`가 `null`이면 읽지 못한 것이다: 이 구역만 오류 카드(다른 구역은 그대로 보인다)와 [새로 고치기]
 * - `rules`가 빈 목록이면 규칙이 아직 등록되지 않은 것이다(마이그레이션 207 적용 전): 안내 카드
 * - 카드가 저장하거나 최신 값을 불러오면 이 구역이 그 값을 들고 있어 R6·R7(R5를 따른다)이 바로 바뀐다. 서버가 더 새로운 값을 다시 넘기면(화면 새로 읽기)
 *   서버 값이 이긴다(수정 시각으로 견준다)
 * - 주소의 `#rule-<규칙 키>`로 열었으면 구역이 늦게 나타나도 그 카드로 스크롤한다(스트리밍으로 그려지면 브라우저의 앵커 이동을 놓칠 수 있다)
 */

export interface OpsBalanceSettingsProps {
  /** 읽은 밸런스 규칙. 읽지 못했으면 `null`. */
  rules: readonly OpsRuleRecord[] | null
  /** 지금 열린 컬렉션 수(R1 카드의 「지금 서비스」). 읽지 못했으면 `null`이고 저장은 막지 않는다. */
  openCollectionsNow: number | null
}

function NoticeCard({ title, description, onRetry }: { title: string; description: string; onRetry?: { label: string; run: () => void } }) {
  return (
    <Card className="flex flex-col items-start gap-2 p-5">
      <IconScale className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry.run}>
          {onRetry.label}
        </Button>
      )}
    </Card>
  )
}

export function OpsBalanceSettings({ rules, openCollectionsNow }: OpsBalanceSettingsProps) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, OpsRuleRecord>>({})

  const records = useMemo(() => {
    const map: Record<string, OpsRuleRecord> = {}
    for (const rule of rules ?? []) {
      const override = local[rule.ruleKey]
      map[rule.ruleKey] = override && Date.parse(override.updatedAt) > Date.parse(rule.updatedAt) ? override : rule
    }
    return map
  }, [rules, local])
  const pointRewardValue = useMemo(() => readPointRewardValue(records.point_reward_max), [records])

  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])

  if (rules === null) {
    return <NoticeCard title={SECTION_LOAD_FAILED.title} description={SECTION_LOAD_FAILED.description} onRetry={{ label: SECTION_LOAD_FAILED.retry, run: () => router.refresh() }} />
  }
  if (rules.length === 0) return <NoticeCard title={SECTION_EMPTY.title} description={SECTION_EMPTY.description} />

  return (
    <div className="space-y-8">
      {BALANCE_RULE_GROUPS.map((group) => {
        const keys = group.keys.filter((key) => records[key] !== undefined)
        if (keys.length === 0) return null
        return (
          <div key={group.id} className="space-y-3">
            <h3 className="text-base font-semibold">{group.title}</h3>
            {keys.map((key) => (
              <OpsRuleCard
                key={key}
                ruleKey={key}
                record={records[key]}
                pointRewardValue={pointRewardValue}
                openCollectionsNow={openCollectionsNow}
                onRecord={(next) => setLocal((current) => ({ ...current, [next.ruleKey]: next }))}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
