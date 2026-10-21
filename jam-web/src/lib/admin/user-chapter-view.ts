/**
 * 어드민 유저 상세의 «챕터» 구역이 읽는 값 (티켓 20261019_1318 2회, 운영 로직 12.5절)
 *
 * 한 유저의 지금 챕터와 누적 점수(`user_chapters`), 오른 기록(`chapter_ups`), 점수 기록 최근 {@link USER_CHAPTER_SCORE_EVENT_LIMIT}건(`chapter_score_events`)을
 * service 클라이언트로 읽는다. 세 표는 본인 행만 읽는 정책이라 서버가 service 클라이언트로 읽는다.
 *
 * ## 점수 숫자는 어드민에게만 보인다
 * 운영 로직 12.3절은 유저 화면에 점수 숫자를 보이지 않는다(점수를 올리려는 행동을 부추길 수 있어서). 어드민은 운영자라 숫자를 본다 — 이 값은 어드민 화면에서만 쓴다.
 *
 * ## 읽지 못함과 기록 없음을 구분한다 (보조 읽기 관례)
 * 구역마다 `{ ok: true, value }` 또는 `{ ok: false }`다. 읽지 못한 구역은 `logQueryError`로 로그를 남기고 `{ ok: false }`로 돌려준다 — 화면이 «기록 없음»과 다르게 그린다.
 * 한 구역의 실패가 다른 구역을 막지 않고 유저 상세 화면 전체를 오류로 만들지 않는다. 던지지 않는다.
 *
 * ## 이름
 * 챕터 이름은 트라이브별 표(`chapter_names`)에서 **유저의 지금 트라이브**로 한 번 읽어 붙인다. 오른 기록은 그때의 트라이브를 저장하지 않으므로(챕터 숫자는 트라이브가 바뀌어도 그대로다)
 * 오른 기록의 이름도 지금 트라이브의 것이다. 트라이브가 없거나 이름 표를 읽지 못하면 이름은 null이고, 읽지 못한 경우 `namesFailed`가 참이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logQueryError } from '@/lib/admin/queryError'
import { normalizeChapterName } from '@/lib/chapter/name'
import type { ChapterScoreKind } from '@/lib/chapter/kinds'

/** 점수 기록에서 읽는 최근 건수 */
export const USER_CHAPTER_SCORE_EVENT_LIMIT = 50

/**
 * 활동 종류의 한글 이름 — 운영 로직 12.2절 점수 표의 활동 이름을 따른다.
 * `Record<ChapterScoreKind, string>`이라 종류를 더하면 여기도 채워야 컴파일된다.
 */
export const CHAPTER_SCORE_KIND_LABELS: Record<ChapterScoreKind, string> = {
  jam_earned: '모은 잼',
  capsule_open: '캡슐 열기',
  locked_item_badge_open: '잠긴 아이템 배지 열기',
  badge_receive: '배지 받기',
  collection_complete_common: '컬렉션 완성 (Common)',
  collection_complete_rare: '컬렉션 완성 (Rare)',
  collection_complete_epic: '컬렉션 완성 (Epic)',
  collection_complete_mystic: '컬렉션 완성 (Mystic)',
  mix_success: '믹스 성공',
  mission_complete: '미션 완료',
  drop: '드랍',
  pickup: '픽업',
}

/** 활동 종류의 한글 이름. 점수 규칙 행으로 새 종류가 더해져 사전에 없으면 종류 값을 그대로 보인다 */
export function chapterScoreKindLabel(kind: string): string {
  return Object.prototype.hasOwnProperty.call(CHAPTER_SCORE_KIND_LABELS, kind) ? CHAPTER_SCORE_KIND_LABELS[kind as ChapterScoreKind] : kind
}

export type ViewSection<T> = { ok: true; value: T } | { ok: false }

export interface UserChapterCurrent {
  /** 지금 챕터. 챕터가 없는 유저(퀘스트 전, 행이 없거나 NULL)는 null */
  chapterNo: number | null
  /** 누적 점수. 챕터가 없어도 쌓인 점수가 있을 수 있다 */
  totalScore: number
  /** 지금 트라이브의 챕터 이름. 없으면 null */
  name: string | null
}

export interface UserChapterUp {
  chapterNo: number
  /** 오른 시각(ISO) */
  reachedAt: string
  /** 지금 트라이브의 그 챕터 이름. 없으면 null */
  name: string | null
}

export interface UserChapterScoreEvent {
  id: string
  /** 활동 종류 값(`chapter_score_rules.activity_kind`) */
  kind: string
  kindLabel: string
  /** 활동한 날(KST, `YYYY-MM-DD`) */
  occurredOn: string
  /** 기록된 시각(ISO) */
  createdAt: string
  /** 호출된 양(단위 수) */
  unitAmount: number
  /** 상한 적용 전 점수 */
  rawScore: number
  /** 실제로 센 점수 */
  countedScore: number
}

export interface UserChapterScoreEvents {
  /** 최근순, 최대 {@link USER_CHAPTER_SCORE_EVENT_LIMIT}건 */
  rows: UserChapterScoreEvent[]
  /** 전체 건수 */
  total: number
}

export interface UserChapterView {
  current: ViewSection<UserChapterCurrent>
  ups: ViewSection<UserChapterUp[]>
  scoreEvents: ViewSection<UserChapterScoreEvents>
  /** 이름 표를 읽지 못했다 — 이름 칸이 비어 보이는 것이 «이름 없음»이 아니다 */
  namesFailed: boolean
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

type QueryResult<T> = { data: T | null; error: { message: string } | null; count?: number | null }

/** 한 조회를 감싼다. 던지거나 오류가 있으면 로그를 남기고 null이다 */
async function guarded<T>(label: string, run: () => PromiseLike<QueryResult<T>>): Promise<QueryResult<T> | null> {
  try {
    const result = await run()
    if (result.error) {
      logQueryError(result.error, label)
      return null
    }
    return result
  } catch (e) {
    logQueryError({ message: e instanceof Error ? e.message : String(e) }, label)
    return null
  }
}

/** 유저 한 명의 챕터 구역 값을 읽는다. `tribeId`는 유저의 지금 트라이브(`users.tribe_id`)이고 없으면 이름을 읽지 않는다 */
export async function loadUserChapterView(
  supabase: SupabaseClient,
  userId: string,
  tribeId: string | null
): Promise<UserChapterView> {
  const [chapterRead, upsRead, eventsRead, namesRead] = await Promise.all([
    guarded<{ chapter_no: unknown; total_score: unknown } | null>('users/detail/chapter', () =>
      supabase.from('user_chapters').select('chapter_no, total_score').eq('user_id', userId).maybeSingle()
    ),
    guarded<Array<{ chapter_no: unknown; reached_at: unknown }>>('users/detail/chapter-ups', () =>
      supabase
        .from('chapter_ups')
        .select('chapter_no, reached_at')
        .eq('user_id', userId)
        .order('reached_at', { ascending: true })
        .order('chapter_no', { ascending: true })
    ),
    guarded<Array<Record<string, unknown>>>('users/detail/chapter-score-events', () =>
      supabase
        .from('chapter_score_events')
        .select('id, activity_kind, occurred_on, unit_amount, raw_score, counted_score, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(USER_CHAPTER_SCORE_EVENT_LIMIT)
    ),
    tribeId
      ? guarded<Array<{ chapter_no: unknown; name: unknown }>>('users/detail/chapter-names', () =>
          supabase.from('chapter_names').select('chapter_no, name').eq('tribe_id', tribeId)
        )
      : Promise.resolve({ data: [] as Array<{ chapter_no: unknown; name: unknown }>, error: null }),
  ])

  const namesFailed = namesRead === null
  const names = new Map<number, string>()
  for (const row of namesRead?.data ?? []) {
    const name = normalizeChapterName(row.name)
    if (typeof row.chapter_no === 'number' && name !== null) names.set(row.chapter_no, name)
  }

  let current: ViewSection<UserChapterCurrent> = { ok: false }
  if (chapterRead !== null) {
    const row = chapterRead.data
    if (row === null || row === undefined) {
      current = { ok: true, value: { chapterNo: null, totalScore: 0, name: null } }
    } else if (isCount(row.total_score) && (row.chapter_no === null || isCount(row.chapter_no))) {
      const chapterNo = row.chapter_no === null ? null : (row.chapter_no as number)
      current = { ok: true, value: { chapterNo, totalScore: row.total_score, name: chapterNo === null ? null : (names.get(chapterNo) ?? null) } }
    } else {
      logQueryError({ message: '해석할 수 없는 user_chapters 행' }, 'users/detail/chapter')
    }
  }

  let ups: ViewSection<UserChapterUp[]> = { ok: false }
  if (upsRead !== null) {
    const value: UserChapterUp[] = []
    let valid = true
    for (const row of upsRead.data ?? []) {
      if (!isCount(row.chapter_no) || typeof row.reached_at !== 'string') {
        valid = false
        break
      }
      value.push({ chapterNo: row.chapter_no, reachedAt: row.reached_at, name: names.get(row.chapter_no) ?? null })
    }
    if (valid) ups = { ok: true, value }
    else logQueryError({ message: '해석할 수 없는 chapter_ups 행' }, 'users/detail/chapter-ups')
  }

  let scoreEvents: ViewSection<UserChapterScoreEvents> = { ok: false }
  if (eventsRead !== null) {
    const rows: UserChapterScoreEvent[] = []
    let valid = true
    for (const row of eventsRead.data ?? []) {
      if (
        typeof row.id !== 'string' ||
        typeof row.activity_kind !== 'string' ||
        typeof row.occurred_on !== 'string' ||
        typeof row.created_at !== 'string' ||
        !isCount(row.unit_amount) ||
        !isCount(row.raw_score) ||
        !isCount(row.counted_score)
      ) {
        valid = false
        break
      }
      rows.push({
        id: row.id,
        kind: row.activity_kind,
        kindLabel: chapterScoreKindLabel(row.activity_kind),
        occurredOn: row.occurred_on,
        createdAt: row.created_at,
        unitAmount: row.unit_amount,
        rawScore: row.raw_score,
        countedScore: row.counted_score,
      })
    }
    if (valid) scoreEvents = { ok: true, value: { rows, total: eventsRead.count ?? rows.length } }
    else logQueryError({ message: '해석할 수 없는 chapter_score_events 행' }, 'users/detail/chapter-score-events')
  }

  return { current, ups, scoreEvents, namesFailed }
}
