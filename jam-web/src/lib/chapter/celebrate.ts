/**
 * 챕터 오름 축하 판정 (티켓 20261019_1317 1회, 사용자 결정 1)
 *
 * 연출 시점은 «다음에 앱을 열 때 한 번»이다. `(main)/layout.tsx`가 화면을 열 때마다 지금 챕터 번호를 읽어 내려주고,
 * 클라이언트(`ChapterRiseWatcher`)가 기기에 저장된 «마지막으로 축하한 챕터»와 견줘 더 높을 때만 가장 높은 챕터로 한 번 띄운다.
 *
 * ## 규칙
 * - 저장값이 없으면(처음 보는 기기·처음 쓰는 계정) 연출 없이 지금 챕터를 저장만 한다 — 기존 유저가 앱을 열 때마다 축하받지 않는다.
 * - 지금 챕터가 1 이하면 연출하지 않는다. 챕터 1은 «오른» 것이 아니라 «시작»이라 축하 카드를 띄우지 않고, 오름 처리가 보내는 소식으로 알린다(`rise.ts`, 티켓 20261021_1248).
 * - 저장값 이상이면 연출도 저장도 하지 않는다(챕터는 내려가지 않으므로 저장값을 낮추지도 않는다).
 * - 한 번에 여러 챕터를 넘었어도 가장 높은 챕터 하나만 한 번 보인다.
 *
 * ## 저장소가 막혀 있을 때 (사생활 보호 모드·저장 공간 차단)
 * 읽기·쓰기는 모두 `try/catch`로 감싼다. 읽을 수 없거나 쓴 값이 남지 않으면 연출하지 않는다 — 저장되지 않으면 열 때마다 다시 뜨기 때문이다.
 * 한 기기를 여러 계정이 쓸 수 있으므로 키에 유저 id를 넣는다.
 *
 * 순수 함수와 주입된 저장소(`StorageLike`)만 쓴다. 브라우저 전역은 `ChapterRiseWatcher`가 연결한다.
 */

/** `localStorage`에서 쓰는 두 메서드만 — 테스트가 가짜를 넣을 수 있게 좁혔다 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 저장 키 — 유저마다 따로 둔다 */
export function chapterCelebratedKey(userId: string): string {
  return `jam:chapter-celebrated:${userId}`
}

/** 읽은 값이 1 이상의 정수 챕터 번호이면 그 값, 아니면 null (행이 없음·NULL·손상된 값) */
export function parseChapterNo(raw: unknown): number | null {
  if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) {
    const parsed = Number(raw)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 1) return raw
  return null
}

export interface CelebrationDecision {
  /** 축하 카드로 보일 챕터. 보이지 않으면 null */
  celebrate: number | null
  /** 저장할 «마지막으로 축하한 챕터». 저장할 것이 없으면 null */
  save: number | null
}

/** 지금 챕터와 저장값으로 «보일 챕터»와 «저장할 값»을 정한다 */
export function decideCelebration(current: number | null, saved: number | null): CelebrationDecision {
  if (current === null || !Number.isSafeInteger(current) || current < 1) return { celebrate: null, save: null }
  if (saved === null) return { celebrate: null, save: current }
  if (current <= 1) return { celebrate: null, save: current > saved ? current : null }
  if (current > saved) return { celebrate: current, save: current }
  return { celebrate: null, save: null }
}

type ReadSaved = { ok: true; value: number | null } | { ok: false }

/** 저장값을 읽는다. 저장소가 막혀 있어 던지면 `ok: false`다. 저장값이 없거나 손상됐으면 `value: null` */
export function readCelebratedChapter(storage: StorageLike | null, userId: string): ReadSaved {
  if (!storage) return { ok: false }
  try {
    return { ok: true, value: parseChapterNo(storage.getItem(chapterCelebratedKey(userId))) }
  } catch {
    return { ok: false }
  }
}

/** 저장하고 다시 읽어 값이 남았는지 확인한다. 쓸 수 없거나 값이 남지 않으면 false */
export function writeCelebratedChapter(storage: StorageLike | null, userId: string, chapterNo: number): boolean {
  if (!storage) return false
  try {
    const key = chapterCelebratedKey(userId)
    storage.setItem(key, String(chapterNo))
    return storage.getItem(key) === String(chapterNo)
  } catch {
    return false
  }
}

/**
 * - `none`: 연출하지 않는다(저장은 필요한 만큼 이미 했다)
 * - `wait`: 연출할 챕터가 있지만 다른 오버레이가 열려 있다 — 아직 저장하지 않았고, 닫힌 뒤 다시 부른다
 * - `celebrate`: 저장을 마쳤으니 지금 카드를 띄운다. `chapterNo`가 보일 챕터다
 */
export type RiseClaim = { kind: 'none' } | { kind: 'wait' } | { kind: 'celebrate'; chapterNo: number }

/**
 * 연출을 띄울지 정하고 저장까지 처리한다. 저장은 **띄우기 직전**에 한다 — 기다리는 동안 화면을 떠나도 다음에 다시 보인다.
 * 저장이 실패하면 띄우지 않는다(매번 뜨면 안 된다).
 */
export function claimChapterRise(args: {
  storage: StorageLike | null
  userId: string
  chapterNo: number
  /** 다른 전체화면 오버레이가 열려 있는가 (`useTabBarHidden`) */
  blocked: boolean
}): RiseClaim {
  const read = readCelebratedChapter(args.storage, args.userId)
  if (!read.ok) return { kind: 'none' }

  const decision = decideCelebration(args.chapterNo, read.value)
  if (decision.celebrate === null) {
    if (decision.save !== null) writeCelebratedChapter(args.storage, args.userId, decision.save)
    return { kind: 'none' }
  }
  if (args.blocked) return { kind: 'wait' }
  if (!writeCelebratedChapter(args.storage, args.userId, decision.celebrate)) return { kind: 'none' }
  return { kind: 'celebrate', chapterNo: decision.celebrate }
}
