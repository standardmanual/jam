/**
 * 어드민 유저 상세의 «챕터» 구역이 읽는 값 (티켓 20261019_1318 2회, 운영 로직 12.5절)
 *
 * 한 유저의 지금 챕터와 누적 점수(`user_chapters`), 오른 기록(`chapter_ups`)을 service 클라이언트로 읽는다. 두 표는 본인 행만 읽는 정책이라 서버가 service 클라이언트로 읽는다.
 * 점수 기록(`chapter_score_events`) 읽기는 걷었다(티켓 20261028_1742 2회). 누적 점수는 프로필 «다음 챕터까지»가 읽는 값이라 남긴다.
 *
 * ## 점수 숫자는 어드민에게만 보인다
 * 운영 로직 12.3절은 유저 화면에 점수 숫자를 보이지 않는다(점수를 올리려는 행동을 부추길 수 있어서). 어드민은 운영자라 숫자를 본다 — 이 값은 어드민 화면에서만 쓴다.
 *
 * ## 읽지 못함과 기록 없음을 구분한다 (보조 읽기 관례)
 * 구역마다 `{ ok: true, value }` 또는 `{ ok: false }`다. 읽지 못한 구역은 `logQueryError`로 로그를 남기고 `{ ok: false }`로 돌려준다 — 화면이 «기록 없음»과 다르게 그린다.
 * 한 구역의 실패가 다른 구역을 막지 않고 유저 상세 화면 전체를 오류로 만들지 않는다. 던지지 않는다.
 *
 * ## 챕터는 숫자로만 표기한다
 * 챕터 이름은 두지 않는다(2026-10-21 결정, 티켓 20261021_1539). 이름 표를 읽지 않고, 값에도 이름이 없다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logQueryError } from '@/lib/admin/queryError'

export type ViewSection<T> = { ok: true; value: T } | { ok: false }

export interface UserChapterCurrent {
  /** 지금 챕터. 챕터가 없는 유저(퀘스트 전, 행이 없거나 NULL)는 null */
  chapterNo: number | null
  /** 누적 점수. 챕터가 없어도 쌓인 점수가 있을 수 있다 */
  totalScore: number
}

export interface UserChapterUp {
  chapterNo: number
  /** 오른 시각(ISO) */
  reachedAt: string
}

export interface UserChapterView {
  current: ViewSection<UserChapterCurrent>
  ups: ViewSection<UserChapterUp[]>
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

/** 유저 한 명의 챕터 구역 값을 읽는다 */
export async function loadUserChapterView(supabase: SupabaseClient, userId: string): Promise<UserChapterView> {
  const [chapterRead, upsRead] = await Promise.all([
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
  ])

  let current: ViewSection<UserChapterCurrent> = { ok: false }
  if (chapterRead !== null) {
    const row = chapterRead.data
    if (row === null || row === undefined) {
      current = { ok: true, value: { chapterNo: null, totalScore: 0 } }
    } else if (isCount(row.total_score) && (row.chapter_no === null || isCount(row.chapter_no))) {
      const chapterNo = row.chapter_no === null ? null : (row.chapter_no as number)
      current = { ok: true, value: { chapterNo, totalScore: row.total_score } }
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
      value.push({ chapterNo: row.chapter_no, reachedAt: row.reached_at })
    }
    if (valid) ups = { ok: true, value }
    else logQueryError({ message: '해석할 수 없는 chapter_ups 행' }, 'users/detail/chapter-ups')
  }

  return { current, ups }
}
