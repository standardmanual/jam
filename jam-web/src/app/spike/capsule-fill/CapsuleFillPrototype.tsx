'use client'

import { useCallback, useState } from 'react'
import { Button } from '@ds/components/buttons/Button'
import CapsuleFillModule, { type CapsuleState } from './CapsuleFillModule'

/**
 * 캡슐 채움 프로토타입 화면 — 홈피드·프로필 두 자리에 같은 모듈을 놓고 시연 도구를 곁들인다 (티켓 20261028_1516)
 *
 * 탭을 바꾸면 모듈이 새로 마운트되어 «페이지 진입» 모션이 다시 실행된다. 시나리오를 고르거나 «처음부터»를 누르면
 * 시작 상태로 돌아가 같은 방식으로 다시 시작한다. 캡슐에 든 잼·가진 잼·챕터는 이 화면이 들고 있어 탭을 오가도 이어진다.
 */

const CAPACITY = 300

interface Scenario {
  id: string
  label: string
  hint: string
  state: CapsuleState
}

const SCENARIOS: Scenario[] = [
  {
    id: 'levelup',
    label: '챕터 오름',
    hint: '가진 잼을 다 채우면 100%를 넘어 챕터가 오르고, 남은 잼을 이어서 채워요.',
    state: { filled: 240, balance: 120, chapter: 3 },
  },
  {
    id: 'basic',
    label: '일반 채우기',
    hint: '100%에 닿지 않는 채우기예요.',
    state: { filled: 90, balance: 80, chapter: 3 },
  },
  {
    id: 'double',
    label: '연속 오름',
    hint: '한 번에 100%를 두 번 넘겨서 챕터가 두 번 올라요.',
    state: { filled: 0, balance: 700, chapter: 1 },
  },
  {
    id: 'empty',
    label: '빈 캡슐',
    hint: '2% 원에서 출발해요. 진입 모션은 없어요.',
    state: { filled: 0, balance: 150, chapter: 1 },
  },
]

type Tab = 'home' | 'profile'

export default function CapsuleFillPrototype() {
  const [tab, setTab] = useState<Tab>('home')
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)
  /** 다시 시작할 때마다 올려 모듈을 새로 마운트한다 */
  const [runKey, setRunKey] = useState(0)
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]
  const [committed, setCommitted] = useState<CapsuleState>(scenario.state)
  const [busy, setBusy] = useState(false)

  const restart = useCallback((next: Scenario) => {
    setScenarioId(next.id)
    setCommitted(next.state)
    setBusy(false)
    setRunKey((key) => key + 1)
  }, [])

  const handleChange = useCallback((next: CapsuleState) => setCommitted(next), [])

  const capsuleModule = (
    <CapsuleFillModule
      key={`${tab}-${runKey}`}
      capacity={CAPACITY}
      initial={committed}
      onChange={handleChange}
      onBusyChange={setBusy}
    />
  )

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-6 px-4 pb-16 pt-8">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-bold">캡슐 채움 프로토타입</h1>
          <p className="m-0 break-keep text-sm text-muted">
            그래프를 눌러 시트를 열고 채워 보세요. 진입·채우기·챕터 오름 모션이 이어져요.
          </p>
        </header>

        <div role="group" aria-label="화면 선택" className="inline-flex self-start rounded-full bg-surface p-1">
          {(
            [
              ['home', '홈피드'],
              ['profile', '프로필'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              disabled={busy}
              onClick={() => setTab(id)}
              className={`min-h-9 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-50 ${
                tab === id ? 'bg-foreground text-background' : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'home' ? (
          <section aria-label="홈피드 화면 예시" className="flex flex-col gap-4">
            <p className="m-0 text-base font-bold">오늘도 좋은 하루예요</p>
            {capsuleModule}
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="m-0 text-sm text-muted">오늘의 카드</p>
              <p className="m-0 mt-1 break-keep text-base font-bold">한강 야간 러닝, 5km에 도전해요</p>
            </div>
          </section>
        ) : (
          <section aria-label="프로필 화면 예시" className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="size-12 shrink-0 rounded-full bg-border" aria-hidden="true" />
              <div className="min-w-0">
                <p className="m-0 text-base font-bold">시현 러너</p>
                <p className="m-0 text-sm text-muted">챕터 {committed.chapter}</p>
              </div>
            </div>
            {capsuleModule}
          </section>
        )}

        {/* 시연 도구 — 서비스 화면이 아니라 프로토타입을 다루는 장치다. 숫자는 여기에만 보인다 */}
        <section aria-label="시연 도구" className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-sm font-bold">시연 도구</h2>
            <Button variant="outline" size="sm" onClick={() => restart(scenario)}>
              처음부터
            </Button>
          </div>

          <div role="group" aria-label="시나리오" className="flex flex-wrap gap-2">
            {SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === scenarioId}
                onClick={() => restart(item)}
                className={`min-h-9 rounded-full border px-3 text-sm font-semibold ${
                  item.id === scenarioId ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="m-0 break-keep text-sm text-muted">{scenario.hint}</p>

          <dl className="m-0 grid grid-cols-3 gap-2 text-sm">
            {(
              [
                ['캡슐에 든 잼', `${committed.filled} / ${CAPACITY}`],
                ['가진 잼', String(committed.balance)],
                ['챕터', String(committed.chapter)],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="rounded-xl bg-surface p-2">
                <dt className="text-xs text-muted">{term}</dt>
                <dd className="m-0 font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 break-keep text-xs text-muted">
            그래프 2%가 캡슐 잼 0%에 대응해요. 번개는 채움의 오른쪽 끝을 따라가요.
          </p>
        </section>
      </main>
    </div>
  )
}
