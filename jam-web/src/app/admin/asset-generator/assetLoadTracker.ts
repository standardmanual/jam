/**
 * 에셋 제너레이터 뷰포트의 이미지·폰트 로드 대기 추적기 (티켓 20260925_0149)
 *
 * `AssetGeneratorViewport.tsx`가 들고 있던 "진행 중인 로드 수 + 대기자 목록 + 이미 불러온 키
 * 캐시" 로직을 React·캔버스에 의존하지 않는 순수 모듈로 옮겼다(동작 변화 없음). 이미지
 * (assetUrl별)와 폰트(family·굵기별)가 각각 인스턴스 하나씩 쓴다.
 *
 * - `loadMissing`: 아직 안 불러온 키만 골라 한꺼번에 불러온다. 실패한 키는 캐시에서 빼 다음
 *   호출에서 재시도되게 한다. 취소(`isCancelled`)되면 결과를 캐시에 반영하지 않는다.
 * - `waitUntilIdle`: 진행 중인 로드가 모두 끝날 때까지(성공·실패 모두) 기다린다.
 * - `prune`: 더 이상 쓰이지 않는 키의 캐시(불러온 표시·값)를 지운다.
 * - `dispose`: 컴포넌트가 사라질 때 대기자를 깨워 영원히 멈춰 있지 않게 한다.
 */
export interface AssetLoadTracker<V> {
  /** 아직 불러오지 않은 키만 불러온다. 로드할 게 없으면 진행 카운트를 올리지 않고 바로 끝난다.
   * 반환 프로미스는 reject되지 않는다(실패는 `onError`로 알린다). */
  loadMissing(
    keys: readonly string[],
    load: (key: string) => Promise<V>,
    options?: {
      onError?: (key: string, error: unknown) => void
      isCancelled?: () => boolean
    }
  ): Promise<void>
  /** 진행 중인 로드가 하나도 없으면 true. */
  isIdle(): boolean
  /** 진행 중인 로드가 모두 끝날 때 resolve된다(이미 idle이면 즉시). */
  waitUntilIdle(): Promise<void>
  /** 불러오기에 성공해 값이 있는 키인지. */
  has(key: string): boolean
  /** 성공한 키별 값. 갱신될 때마다 새 객체로 교체되므로 읽는 쪽이 참조를 오래 쥐지 않는다. */
  getValues(): Readonly<Record<string, V>>
  /** `keepKeys`에 없는 키의 불러온 표시와 값을 지운다. */
  prune(keepKeys: ReadonlySet<string>): void
  /** 캐시 표시를 비우고 진행 카운트를 0으로 되돌리며 대기자를 모두 깨운다. */
  dispose(): void
}

export function createAssetLoadTracker<V>(): AssetLoadTracker<V> {
  // 배열·집합 자체는 재할당하지 않고 비우기만 한다 — 호출부가 참조를 쥐어도 항상 최신 상태를 본다.
  const claimedKeys = new Set<string>()
  const waiters: Array<() => void> = []
  let values: Record<string, V> = {}
  let pendingCount = 0

  function notifyIfIdle() {
    if (pendingCount > 0) return
    waiters.splice(0).forEach((resolve) => resolve())
  }

  return {
    async loadMissing(keys, load, options) {
      const toLoad = Array.from(new Set(keys)).filter((key) => !claimedKeys.has(key))
      if (toLoad.length === 0) return
      toLoad.forEach((key) => claimedKeys.add(key))
      pendingCount += 1
      try {
        const entries = await Promise.all(
          toLoad.map(async (key) => {
            try {
              return [key, await load(key)] as const
            } catch (error) {
              claimedKeys.delete(key)
              options?.onError?.(key, error)
              return null
            }
          })
        )
        if (options?.isCancelled?.()) return
        const next = { ...values }
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1]
        }
        values = next
      } finally {
        pendingCount -= 1
        notifyIfIdle()
      }
    },
    isIdle: () => pendingCount <= 0,
    waitUntilIdle() {
      if (pendingCount <= 0) return Promise.resolve()
      return new Promise<void>((resolve) => {
        waiters.push(resolve)
      })
    },
    has: (key) => Object.prototype.hasOwnProperty.call(values, key),
    getValues: () => values,
    prune(keepKeys) {
      for (const key of Array.from(claimedKeys)) {
        if (!keepKeys.has(key)) claimedKeys.delete(key)
      }
      let changed = false
      const next: Record<string, V> = {}
      for (const [key, value] of Object.entries(values)) {
        if (keepKeys.has(key)) next[key] = value
        else changed = true
      }
      if (changed) values = next
    },
    dispose() {
      claimedKeys.clear()
      pendingCount = 0
      waiters.splice(0).forEach((resolve) => resolve())
    },
  }
}
