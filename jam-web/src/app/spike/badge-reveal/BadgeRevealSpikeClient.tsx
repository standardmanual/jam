'use client'

import { useRef, useState } from 'react'
import { BadgeRevealCarousel } from '@ds/components/patterns/BadgeRevealCarousel'
import { Button } from '@ds/components/buttons/Button'
import { d } from '@/lib/i18n'

/**
 * 배지 획득 3D 캐러셀 스파이크 하네스 (20260823_007 → 20260824_001 갱신).
 *
 * 실제 Strava 동기화 없이 아래 3축을 조합해 연출을 검증한다.
 *   - 배지 개수: 0 / 1 / 2 / 3 / 20
 *   - 응답 지연: 0.5초 / 3초 / 8초 → "지연 동안 트리거 버튼 스피너가 돌고,
 *     결과가 오면 캐러셀이 뜬다"를 검증한다(빈 카드 스핀 단계는 20260824_001에서 폐기).
 *   - 엣지 데이터: 이미지 없음 / 설명 아주 김 / 이름 아주 김 / mythic만
 *
 * 🔴 이 화면은 배지를 발급하지 않는다. 서버에서 `badges`를 조회해 받은 데이터를
 *    화면에서 조합만 하며, 어떤 쓰기 요청도 보내지 않는다.
 */

export type SpikeBadge = {
  id: string
  name: string
  description: string
  imageUrl: string
  rarity: 'common' | 'rare' | 'legend' | 'mythic'
}

/** 캐러셀에 한 번에 보여줄 최대 카드 수 — 넘치면 "전체 보기" 카드로 접는다 */
const MAX_CARDS = 10

const DELAY_OPTIONS = [
  { label: '0.5초', ms: 500 },
  { label: '3초', ms: 3000 },
  { label: '8초', ms: 8000 },
] as const

const EDGE_OPTIONS = [
  { key: 'none', label: '기본' },
  { key: 'no-image', label: '이미지 없음' },
  { key: 'long-desc', label: '설명 아주 김' },
  { key: 'long-name', label: '이름 아주 김' },
  { key: 'mythic', label: 'mythic만' },
] as const

type EdgeKey = (typeof EDGE_OPTIONS)[number]['key']

const RARITIES: SpikeBadge['rarity'][] = ['common', 'rare', 'legend', 'mythic']

/** 세션이 없어 DB 조회가 비었을 때 쓰는 대체 데이터 (연출 자체는 그대로 검증 가능) */
const SAMPLE_BADGES: SpikeBadge[] = Array.from({ length: 24 }, (_, i) => ({
  id: `sample-${i + 1}`,
  name: `예시 배지 ${i + 1}`,
  description: '예시 데이터예요. 실제 배지 설명 대신 표시하고 있어요.',
  imageUrl: '',
  rarity: RARITIES[i % RARITIES.length],
}))

const LONG_DESCRIPTION =
  '한강 자전거길 전 구간을 완주하고, 같은 주에 러닝과 라이딩을 각각 3회 이상 기록하면 획득할 수 있어요. ' +
  '누적 거리 200km를 넘기면 다음 단계 배지로 이어져요. 시즌이 끝나기 전에 도전해 보세요.'
const LONG_NAME = '한강 자전거길 전 구간 완주 기념 특별 배지 시즌 2 한정판'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 실제 `/api/strava/sync` + 배지 드랍 엔진 판정 대기를 대체하는 시뮬레이션.
 * `delayMs`만큼 기다렸다 응답 소요 시간을 돌려준다. 최소 대기 규칙은 없다 —
 * 결과가 도착하는 그 시점에 캐러셀이 열린다.
 * (네트워크·DB 접근 없음 — 순수 타이머)
 */
async function simulateSyncWait(delayMs: number): Promise<{ responseMs: number }> {
  const startedAt = Date.now()
  await sleep(delayMs)
  return { responseMs: Date.now() - startedAt }
}

function applyEdge(badges: SpikeBadge[], edge: EdgeKey): SpikeBadge[] {
  switch (edge) {
    case 'no-image':
      return badges.map((b) => ({ ...b, imageUrl: '' }))
    case 'long-desc':
      return badges.map((b) => ({ ...b, description: LONG_DESCRIPTION }))
    case 'long-name':
      return badges.map((b) => ({ ...b, name: LONG_NAME }))
    case 'mythic':
      return badges.map((b) => ({ ...b, rarity: 'mythic' as const }))
    default:
      return badges
  }
}

export default function BadgeRevealSpikeClient({ badges }: { badges: SpikeBadge[] }) {
  const pool = badges.length > 0 ? badges : SAMPLE_BADGES
  const usingSample = badges.length === 0

  const [delayMs, setDelayMs] = useState<number>(DELAY_OPTIONS[0].ms)
  const [edge, setEdge] = useState<EdgeKey>('none')

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SpikeBadge[]>([])
  const [moreCount, setMoreCount] = useState(0)
  const [log, setLog] = useState<string>('')
  /* 결과를 기다리는 동안 눌린 트리거 버튼 — 실제 SyncButton의 loading 스피너를 모사한다.
     null이면 대기 중이 아니다. */
  const [pendingCount, setPendingCount] = useState<number | null>(null)

  // 연출이 진행 중일 때 다른 버튼을 누르면 이전 실행 결과가 뒤늦게 반영되지 않도록 막는다.
  const runIdRef = useRef(0)

  async function run(count: number) {
    const runId = ++runIdRef.current

    setItems([])
    setMoreCount(0)
    setOpen(false)
    setPendingCount(count)
    setLog(`동기화 대기 중 — 요청 ${count}개 / 응답 지연 ${delayMs}ms (버튼 스피너 유지)`)

    const { responseMs } = await simulateSyncWait(delayMs)
    if (runIdRef.current !== runId) return

    setPendingCount(null)

    const picked = applyEdge(pool.slice(0, count), edge)

    if (picked.length === 0) {
      setLog(`획득 배지 0개 — 캐러셀을 열지 않았어요 (응답 ${responseMs}ms)`)
      return
    }

    setItems(picked.slice(0, MAX_CARDS))
    setMoreCount(Math.max(0, picked.length - MAX_CARDS))
    setOpen(true)
    setLog(
      `노출 — 카드 ${Math.min(picked.length, MAX_CARDS)}장` +
        `${picked.length > MAX_CARDS ? ` + 전체 보기(${picked.length - MAX_CARDS})` : ''}` +
        ` / 응답 ${responseMs}ms`
    )
  }

  function close() {
    runIdRef.current++
    setPendingCount(null)
    setOpen(false)
  }

  return (
    <div style={{ padding: 24, maxWidth: 430, margin: '0 auto', color: 'var(--color-text)' }}>
      <h1 style={{ fontSize: 'var(--text-h4)', fontWeight: 700, margin: '0 0 8px' }}>
        배지 획득 캐러셀 스파이크
      </h1>
      <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
        배지를 발급하지 않아요. 배지 조회 데이터로 연출만 확인하는 검증용 화면이에요.
        {usingSample ? ' 지금은 조회 결과가 없어 예시 데이터로 표시하고 있어요.' : ''}
      </p>

      <Section title="응답 지연">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DELAY_OPTIONS.map((o) => (
            <Button
              key={o.ms}
              variant={delayMs === o.ms ? 'primary' : 'secondary'}
              onClick={() => setDelayMs(o.ms)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', margin: '8px 0 0', lineHeight: 1.5 }}>
          지연 동안 아래 버튼의 스피너가 돌아요. 결과가 도착하는 그 시점에 캐러셀이 열려요.
        </p>
      </Section>

      <Section title="엣지 데이터">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EDGE_OPTIONS.map((o) => (
            <Button
              key={o.key}
              variant={edge === o.key ? 'primary' : 'secondary'}
              onClick={() => setEdge(o.key)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="배지 개수 (누르면 연출 시작)">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 20].map((n) => (
            <Button
              key={n}
              variant="primary"
              loading={pendingCount === n}
              disabled={pendingCount !== null && pendingCount !== n}
              onClick={() => run(n)}
            >
              {`${n}개`}
            </Button>
          ))}
        </div>
      </Section>

      {log && (
        <p
          style={{
            marginTop: 24,
            padding: 12,
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-surface)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            wordBreak: 'keep-all',
          }}
        >
          {log}
        </p>
      )}

      <BadgeRevealCarousel
        open={open}
        items={items}
        moreCount={moreCount}
        onMoreClick={() => setLog('전체 보기 클릭 — 실제 이동은 호출부(후속 티켓) 책임이에요')}
        onClose={close}
        closeLabel={d.common.close}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 'var(--text-small)', fontWeight: 700, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  )
}
