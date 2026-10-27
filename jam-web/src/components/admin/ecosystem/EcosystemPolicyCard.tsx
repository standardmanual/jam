/**
 * 정책 패널의 정책 카드 한 장 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 세 상태로 나뉜다.
 * - 설정값 정책(`admin_link`): 현재 값(`liveValues`, 정책 대시보드와 같은 읽기)과 [값 바꾸기](`adminLink.href`로 이동). 값을 이 화면에서 저장하지 않는다 —
 *   변경 이력·동시 수정 검사·확률 확인창을 설정 화면이 지키기 때문이다.
 * - 코드 고정 정책(`code_constant`): [개발 요청]. 이미 열린 요청이 있으면 「요청 N번 접수됨」과 [접기].
 * - 그 밖(티켓 결정·오픈 전 대기): 기준 글자만 보인다.
 */
import Link from 'next/link'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import type { PolicyItem, PolicyType } from '@/lib/admin/policyDashboard/types'
import { DevRequestButton, type OpenDevRequest } from './DevRequestButton'

export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  admin_link: '설정값',
  code_constant: '코드 고정',
  ticket_decision: '티켓 결정',
  pre_launch_pending: '오픈 전 대기',
}

export const LIVE_VALUE_MISSING_TEXT = '값을 읽지 못했어요'

/** 설정값 정책의 현재 값 글자. 읽은 값이 없으면 `null` */
export function liveValueText(policy: PolicyItem, liveValues: Readonly<Record<string, unknown>>): string | null {
  const link = policy.adminLink
  if (policy.type !== 'admin_link' || link === undefined || link.liveField === undefined) return null
  const value = liveValues[link.liveField]
  if (value === undefined || value === null) return LIVE_VALUE_MISSING_TEXT
  return `${String(value)}${link.unit ?? ''}`
}

export interface EcosystemPolicyCardProps {
  policy: PolicyItem
  liveValues: Readonly<Record<string, unknown>>
  /** 이 정책에 이미 열린 개발 요청 */
  openRequest: OpenDevRequest | null
}

export function EcosystemPolicyCard({ policy, liveValues, openRequest }: EcosystemPolicyCardProps) {
  const live = liveValueText(policy, liveValues)
  return (
    <Card data-policy-id={policy.id} data-policy-type={policy.type} className="min-w-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold leading-snug text-balance break-keep wrap-break-word">{policy.title}</h4>
          <Badge variant="outline" className="shrink-0 whitespace-nowrap break-keep">
            {POLICY_TYPE_LABEL[policy.type]}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground break-keep wrap-break-word">
          <span className="font-medium">설정/판정 기준: </span>
          {policy.currentSpec}
        </p>

        {live !== null ? (
          <p data-live-value="" className="text-sm break-keep wrap-break-word">
            <span className="text-muted-foreground">현재 값: </span>
            <span className="font-semibold tabular-nums">{live}</span>
            {policy.defaultValue !== undefined ? (
              <span className="ml-1 text-xs text-muted-foreground">
                (기본값 {policy.defaultValue}
                {policy.adminLink?.unit ?? ''})
              </span>
            ) : null}
          </p>
        ) : null}

        {policy.type === 'admin_link' && policy.adminLink ? (
          <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
            <Link href={policy.adminLink.href}>값 바꾸기</Link>
          </Button>
        ) : null}

        {policy.type === 'code_constant' ? (
          <DevRequestButton policyId={policy.id} policyTitle={policy.title} openRequest={openRequest} />
        ) : null}
      </CardContent>
    </Card>
  )
}
