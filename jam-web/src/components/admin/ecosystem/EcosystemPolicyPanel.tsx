/**
 * 정책 패널 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 지도에서 마디를 누르면(`?node=`) 그 마디의 정책이 설정값 → 코드 고정 → 그 밖 순서(`policiesOfNode`)로 열린다.
 * 마디가 하나도 없는 정책은 맨 아래 「순환 밖 정책 N개」 접힘 목록에 둔다(`policiesOutsideLoop`).
 * 설정값(`liveValues`)과 열린 개발 요청(`openRequests`)은 마디가 선택됐을 때만 읽어 넘기므로 선택이 없으면 비어 있다.
 */
import { ECOSYSTEM_NODES } from '@/lib/admin/ecosystem/nodes'
import { policiesOfNode, policiesOutsideLoop } from '@/lib/admin/ecosystem/policyLinks'
import type { EcosystemNodeId } from '@/lib/admin/ecosystem/types'
import type { OpenRequestRef } from '@/lib/admin/ecosystem/view'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import { EcosystemPolicyCard } from './EcosystemPolicyCard'

export interface EcosystemPolicyPanelProps {
  /** 선택한 마디. 없으면 안내만 보인다 */
  nodeId: EcosystemNodeId | null
  policies: readonly PolicyItem[]
  liveValues: Readonly<Record<string, unknown>>
  openRequests: ReadonlyMap<string, OpenRequestRef>
}

function Group({
  title,
  items,
  liveValues,
  openRequests,
}: {
  title: string
  items: readonly PolicyItem[]
  liveValues: Readonly<Record<string, unknown>>
  openRequests: ReadonlyMap<string, OpenRequestRef>
}) {
  if (items.length === 0) return null
  return (
    <div data-group={title} className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {title} {items.length}
      </h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((policy) => (
          <EcosystemPolicyCard
            key={policy.id}
            policy={policy}
            liveValues={liveValues}
            openRequest={openRequests.get(policy.id) ?? null}
          />
        ))}
      </div>
    </div>
  )
}

export function EcosystemPolicyPanel({ nodeId, policies, liveValues, openRequests }: EcosystemPolicyPanelProps) {
  const node = nodeId === null ? null : (ECOSYSTEM_NODES.find((def) => def.id === nodeId) ?? null)
  const groups = node === null ? null : policiesOfNode(policies, node.id)
  const outside = policiesOutsideLoop(policies)
  const total = groups === null ? 0 : groups.changeable.length + groups.codeFixed.length + groups.other.length

  return (
    <section id="eco-policy-panel" aria-labelledby="eco-policy-heading" className="space-y-3">
      <h2 id="eco-policy-heading" className="text-base font-semibold text-foreground">
        {node === null ? '정책 패널' : `${node.label} 정책`}
      </h2>

      {groups === null ? (
        <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">
          지도에서 마디를 누르면 그 마디의 정책이 여기에 열려요
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">이 마디에 걸린 정책이 없어요</p>
      ) : (
        <div className="space-y-4">
          <Group title="설정값" items={groups.changeable} liveValues={liveValues} openRequests={openRequests} />
          <Group title="코드 고정" items={groups.codeFixed} liveValues={liveValues} openRequests={openRequests} />
          <Group title="그 밖" items={groups.other} liveValues={liveValues} openRequests={openRequests} />
        </div>
      )}

      {outside.length > 0 ? (
        <details data-outside-loop="" className="rounded-lg border border-border bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium break-keep wrap-break-word">순환 밖 정책 {outside.length}개</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {outside.map((policy) => (
              <li key={policy.id} className="break-keep wrap-break-word">
                {policy.chapter}장 {policy.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
