import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import UserSearchBar from '../UserSearchBar'
import ListRowCard from '@/components/ui/ListRowCard'
import TopNav from '@/components/ui/TopNav'
import { UserIcon, ChevronRightIcon, SearchIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
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
      <TopNav title={d.common.back} />

      <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)]">
        {/* 재검색 */}
        <UserSearchBar defaultValue={q ?? ''} />

        {/* 결과 */}
        {!hasQuery ? (
          <EmptyState
            icon={<SearchIcon className="w-8 h-8" />}
            title={d.search.promptTitle}
            description={d.search.promptBody}
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="w-8 h-8" />}
            title={d.search.emptyTitle}
            description={d.search.emptyBody}
          />
        ) : (
          <section className="flex flex-col gap-[var(--spacing-8)]">
            <p className="text-text/50 text-[length:var(--text-caption)] px-1">{t(d.search.resultCount, { count: results.length })}</p>
            {results.map((u) => {
              const subtitle = [
                u.region,
                u.activity_types?.length ? u.activity_types.map((a) => ACTIVITY_TYPE_LABELS[a] ?? a).join(', ') : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <ListRowCard
                  key={u.id}
                  href={`/${u.username}`}
                  icon={
                    u.avatar_url ? (
                      <Image src={u.avatar_url} alt={u.username} width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-text/50" />
                      </div>
                    )
                  }
                  title={u.username}
                  subtitle={subtitle || undefined}
                  trailing={<ChevronRightIcon className="w-4 h-4 text-text/40" />}
                />
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
