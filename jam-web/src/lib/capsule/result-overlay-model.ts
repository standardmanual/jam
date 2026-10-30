/**
 * 합친 연출의 표시 모델 — 한 번의 적립에서 일어난 열기 이벤트들을 연출 한 번의 모양으로 합친다 (티켓 20261028_1740 1회, 채원 사전 판정)
 *
 * 서버가 준 이벤트(`CapsuleUnseenEvent`: 열린 순서 그대로)와 챕터 배지를 받아 «제목 종류·오른 챕터·보상 목록»만 정한다.
 * 이벤트 순서는 입력 순서를 보존하고 화면에서 다시 정렬하지 않는다. 오른 챕터는 서버가 준 `reachedChapters`에서 읽는다 —
 * `chapterNo`(오르기 전 챕터)에 1을 더하는 계산은 하지 않는다. 그래서 입력 모양에도 `chapterNo`·`chapterCount`가 없다.
 *
 * 챕터 1은 오른 것이 아니라 시작이다(`lib/chapter/celebrate.ts`). 도달 챕터가 1뿐이면 제목은 «캡슐이 가득 찼어요»다.
 *
 * **이 파일은 아무것도 가져오지 않는다.** `sync-auto-fill.ts`는 서버 전용이라 가져오면 `capsule-boundary.test.ts`가 깨진다.
 * 입력 타입은 이 모델이 읽는 필드만 좁혀 적고, 개체·배지의 모양은 호출부가 정한다(제네릭).
 */

/** 모델이 읽는 이벤트 필드. 서버의 `CapsuleUnseenEvent`가 이 모양을 그대로 만족한다 */
export interface CapsuleResultEventInput<Item = unknown> {
  openId: string
  /** 나온 개체(나온 순서). 잠긴 개체도 1개로 센다 */
  items: readonly Item[]
  /** 이번 열기로 오른 챕터 번호 목록. 오르지 않았으면 빈 배열 */
  reachedChapters: readonly number[]
}

/** 보상 한 칸. 이벤트 순서대로 개체를 늘어놓고 챕터 배지를 맨 끝에 둔다 */
export type CapsuleResultReward<Item = unknown, Badge = unknown> =
  | { kind: 'item'; item: Item }
  | { kind: 'chapterBadge'; badge: Badge }

interface CapsuleResultViewBase<Item, Badge> {
  /** 보상 개수 — 보상 유무(`hasRewards`)를 정하는 데만 쓴다. 화면에 숫자로 그리지 않는다 */
  rewardCount: number
  hasRewards: boolean
  /** 캐러셀로 넘길 보상(3회차). `rewardCount`와 길이가 같다 */
  rewards: readonly CapsuleResultReward<Item, Badge>[]
}

export type CapsuleResultView<Item = unknown, Badge = unknown> =
  | (CapsuleResultViewBase<Item, Badge> & { titleKind: 'full' })
  | (CapsuleResultViewBase<Item, Badge> & {
      titleKind: 'chapter'
      /** 도달 챕터 중 2 이상의 최댓값 */
      chapterNo: number
    })

/** 오른 것으로 세는 최소 챕터. 챕터 1은 시작이다 */
const MIN_RISEN_CHAPTER = 2

/**
 * 이벤트가 없으면 `null`(오버레이를 그리지 않는다 — 채움만 한 시나리오는 호출부가 아예 부르지 않는다).
 * 입력 배열은 바꾸지 않는다.
 */
export function buildCapsuleResultView<Item, Badge>(
  events: readonly CapsuleResultEventInput<Item>[],
  chapterBadges: readonly Badge[]
): CapsuleResultView<Item, Badge> | null {
  if (events.length === 0) return null

  const seenOpenIds = new Set<string>()
  const rewards: CapsuleResultReward<Item, Badge>[] = []
  let highestChapter = 0

  for (const event of events) {
    if (seenOpenIds.has(event.openId)) continue
    seenOpenIds.add(event.openId)
    for (const item of event.items) rewards.push({ kind: 'item', item })
    for (const reached of event.reachedChapters) {
      if (Number.isInteger(reached) && reached >= MIN_RISEN_CHAPTER && reached > highestChapter) highestChapter = reached
    }
  }
  for (const badge of chapterBadges) rewards.push({ kind: 'chapterBadge', badge })

  const base = { rewardCount: rewards.length, hasRewards: rewards.length > 0, rewards }
  return highestChapter > 0 ? { ...base, titleKind: 'chapter', chapterNo: highestChapter } : { ...base, titleKind: 'full' }
}

/** 오렌지 채움의 자리(px). 기준 좌표는 쓰는 곳이 정한다(뷰포트 또는 오버레이 루트) */
export interface OverlayOrigin {
  top: number
  left: number
  width: number
  height: number
  /** 채움 오른쪽 끝 원의 지름(px) — 번개가 있던 자리 */
  circle: number
}

/**
 * 뷰포트 기준 자리를 오버레이 루트 기준 자리로 바꾼다.
 * 서비스는 컬럼이 430px로 좁혀져 있어 루트의 왼쪽 위가 뷰포트 (0, 0)이 아닐 수 있다.
 */
export function toRootOrigin(origin: OverlayOrigin, rootRect: { left: number; top: number }): OverlayOrigin {
  return { ...origin, left: origin.left - rootRect.left, top: origin.top - rootRect.top }
}

/** 루트 기준 자리에서 시작하는 `clip-path` 값. 채움이 루트 밖으로 나가 있어도 음수 여백이 되지 않는다 */
export function originClip(origin: OverlayOrigin, rootWidth: number, rootHeight: number): string {
  const right = Math.max(0, rootWidth - origin.left - origin.width)
  const bottom = Math.max(0, rootHeight - origin.top - origin.height)
  return `inset(${origin.top}px ${right}px ${bottom}px ${origin.left}px round ${origin.height / 2}px)`
}
