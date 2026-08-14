import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import UserSearchBar from '../UserSearchBar'
import Card from '@/components/ui/Card'
import TopNav from '@/components/ui/TopNav'
import { UserIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

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
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.search.title} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)]">
        {/* 재검색 */}
        <UserSearchBar defaultValue={q ?? ''} />

        {/* 결과 */}
        {!hasQuery ? (
          <Card className="text-center py-[var(--spacing-32)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70">{d.search.promptTitle}</p>
            <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-1">{d.search.promptBody}</p>
          </Card>
        ) : results.length === 0 ? (
          <Card className="text-center py-[var(--spacing-32)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70">{d.search.emptyTitle}</p>
            <p className="text-[length:var(--text-caption)] text-text-inverse/40 mt-1">{d.search.emptyBody}</p>
          </Card>
        ) : (
          <section className="flex flex-col gap-[var(--spacing-16)]">
            <p className="text-text/50 text-[length:var(--text-caption)]">{t(d.search.resultCount, { count: results.length })}</p>
            {results.map((u) => (
              <Link key={u.id} href={`/${u.username}`}>
                <Card className="flex items-center gap-[var(--spacing-16)] active:scale-[0.98] transition-transform duration-100">
                  {u.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar_url} alt={u.username} className="w-12 h-12 rounded-full object-cover shrink-0 shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-text-inverse/50" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{u.username}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {u.region && (
                        <span className="text-[length:var(--text-caption)] text-text-inverse/60">{u.region}</span>
                      )}
                      {u.region && u.activity_types && u.activity_types.length > 0 && (
                        <span className="text-text-inverse/30 text-[length:var(--text-caption)]">·</span>
                      )}
                      {u.activity_types && u.activity_types.length > 0 && (
                        <span className="text-[length:var(--text-caption)] text-text-inverse/50 truncate">
                          {u.activity_types.map((a) => ACTIVITY_TYPE_LABELS[a] ?? a).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 text-text-inverse/40">&rarr;</span>
                </Card>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
