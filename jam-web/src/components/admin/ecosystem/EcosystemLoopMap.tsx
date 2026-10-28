/**
 * 순환 지도 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 두 줄이다. 성장 순환 6마디가 화살표로 이어지고, 필드 순환은 시스템 드랍·유저 드랍(위아래로 겹침) → 지점 → 픽업 → 인벤토리다.
 * 필드 쪽 인벤토리는 같은 마디의 바로가기라 누르면 성장 쪽 인벤토리가 선택된다. 선과 SVG 화살표는 그리지 않고 글자 화살표(→)만 쓰며,
 * 좁은 화면에서는 줄바꿈된다. 마디 순서와 이음선은 `nodes.ts`의 `ECOSYSTEM_NODES`·`ECOSYSTEM_EDGES`가 단일 원천이다.
 */
import type { EcosystemNodeId, NodeIndicator } from '@/lib/admin/ecosystem/types'
import { EcosystemNodeCard } from './EcosystemNodeCard'

const CELL = 'w-44 shrink-0'

function Arrow() {
  return (
    <span aria-hidden="true" className="self-center px-1 text-lg text-muted-foreground">
      →
    </span>
  )
}

export interface EcosystemLoopMapProps {
  nodes: readonly NodeIndicator[]
  selected: EcosystemNodeId | null
}

export function EcosystemLoopMap({ nodes, selected }: EcosystemLoopMapProps) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const growth = nodes.filter((node) => node.loop === 'growth')
  const card = (id: EcosystemNodeId, shortcut = false) => {
    const node = byId.get(id)
    if (!node) return null
    return <EcosystemNodeCard node={node} selected={selected === id} shortcut={shortcut} />
  }

  return (
    <section aria-labelledby="eco-map-heading" className="space-y-3">
      <div>
        <h2 id="eco-map-heading" className="text-base font-semibold text-foreground">
          순환 지도
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-pretty break-keep wrap-break-word">
          마디를 누르면 그 마디의 정책이 아래에 열려요
        </p>
      </div>

      <div data-loop="growth" className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">성장 순환</h3>
        <div className="flex flex-wrap items-stretch gap-y-3">
          {growth.map((node, index) => (
            <div key={node.id} className="flex items-stretch">
              {index > 0 ? <Arrow /> : null}
              <div className={CELL}>{card(node.id)}</div>
            </div>
          ))}
        </div>
      </div>

      <div data-loop="field" className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">필드 순환</h3>
        <div className="flex flex-wrap items-center gap-y-3">
          <div className="flex items-center">
            <div className={`${CELL} flex flex-col gap-2`}>
              {card('system_drop')}
              {card('user_drop')}
            </div>
          </div>
          <div className="flex items-center">
            <Arrow />
            <div className={CELL}>{card('checkin_point')}</div>
          </div>
          <div className="flex items-center">
            <Arrow />
            <div className={CELL}>{card('pickup')}</div>
          </div>
          <div className="flex items-center">
            <Arrow />
            <div className={CELL}>{card('inventory', true)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
