import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import UserSearchBar from '../UserSearchBar'

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

interface UserSearchResult {
  id: string
  username: string
  avatar_url: string | null
  region: string | null
  activity_types: string[] | null
}

/**
 * q로 users를 조회한다. (dev-api /api/users/search 와 동일 로직)
 * - username IS NOT NULL
 * - username ilike OR email ilike (email은 검색 조건으로만 사용, 절대 노출 금지)
 * - 정확 일치 우선 → username 오름차순
 * - LIMIT 30
 */
async function searchUsers(rawQuery: string): Promise<UserSearchResult[]> {
  const q = rawQuery.trim()
  if (q.length < 2) return []

  // ilike 와일드카드(%, _) + PostgREST or-필터 DSL 구분자(,, (, ))를 함께 제거
  const sanitized = q.replace(/[%_,()]/g, '')
  if (sanitized.length < 2) return []

  const service = createServiceClient()
  const pattern = `%${sanitized}%`

  const { data } = await service
    .from('users')
    .select('id, username, avatar_url, region, activity_types')
    .not('username', 'is', null)
    .or(`username.ilike.${pattern},email.ilike.${pattern}`)
    .limit(30)

  const lowerQ = sanitized.toLowerCase()
  const rows = (data ?? []) as Pick<
    UserRow,
    'id' | 'username' | 'avatar_url' | 'region' | 'activity_types'
  >[]

  return rows
    .map((row) => ({
      id: row.id,
      // username IS NOT NULL 필터가 쿼리에 걸려 있어 null 불가
      username: row.username as string,
      avatar_url: row.avatar_url ?? null,
      region: row.region ?? null,
      activity_types: row.activity_types ?? null,
    }))
    .sort((a, b) => {
      const aExact = a.username.toLowerCase() === lowerQ ? 0 : 1
      const bExact = b.username.toLowerCase() === lowerQ ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return a.username.localeCompare(b.username)
    })
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams

  // 로그인 검증 — 미로그인 시 로그인 페이지로 리다이렉트
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const query = (q ?? '').trim()
  const hasQuery = query.replace(/[%_,()]/g, '').trim().length >= 2
  const results = hasQuery ? await searchUsers(query) : []

  return (
    <div className="min-h-full bg-jam-lime px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 flex flex-col gap-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-jam-ink font-black text-2xl tracking-tighter">
            JAM!
          </Link>
        </div>
        <h1 className="text-3xl font-black leading-tight text-jam-ink">유저 검색</h1>
      </div>

      {/* 재검색 */}
      <UserSearchBar defaultValue={q ?? ''} />

      {/* 결과 */}
      {!hasQuery ? (
        <div className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-8 text-center">
          <p className="text-jam-ink/60 text-sm font-bold">아이디 또는 이메일로 유저를 검색해보세요</p>
          <p className="text-jam-ink/40 text-xs mt-1 font-semibold">두 글자 이상 입력해주세요</p>
        </div>
      ) : results.length === 0 ? (
        <div className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-8 text-center">
          <p className="text-jam-ink/60 text-sm font-bold">검색 결과가 없어요</p>
          <p className="text-jam-ink/40 text-xs mt-1 font-semibold">다른 아이디나 이메일로 다시 검색해보세요</p>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-jam-ink/50 text-xs font-bold">{results.length}명의 유저</p>
          {results.map((u) => (
            <Link
              key={u.id}
              href={`/${u.username}`}
              className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 flex items-center gap-3"
            >
              {/* 아바타 */}
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.avatar_url}
                  alt={u.username}
                  className="w-12 h-12 rounded-full object-cover border-[2px] border-jam-ink shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-jam-lime border-[2px] border-jam-ink shrink-0 flex items-center justify-center text-xl font-black text-jam-ink">
                  {u.username.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-black text-jam-ink truncate">{u.username}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {u.region && (
                    <span className="text-[11px] font-bold text-jam-ink/60">{u.region}</span>
                  )}
                  {u.region && u.activity_types && u.activity_types.length > 0 && (
                    <span className="text-jam-ink/30 text-[11px]">·</span>
                  )}
                  {u.activity_types && u.activity_types.length > 0 && (
                    <span className="text-[11px] font-semibold text-jam-ink/50 truncate">
                      {u.activity_types.map((a) => ACTIVITY_TYPE_LABELS[a] ?? a).join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <span className="shrink-0 text-jam-ink/40 font-black">→</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
