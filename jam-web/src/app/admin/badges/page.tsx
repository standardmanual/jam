import { createServiceClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import type { BadgeRow, BadgeType, BadgeRarity, FactionRow } from '@/types/database'
import BadgeList from '@/components/admin/badges/BadgeList'
import BadgesFilterBar from './BadgesFilterBar'
import Pagination from '../poi/Pagination'

const PAGE_SIZE = 50

interface AdminBadgesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminBadgesPage({ searchParams }: AdminBadgesPageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const filterType = params.type as BadgeType | undefined
  const filterRarity = params.rarity as BadgeRarity | undefined
  const sortBy = params.sort ?? 'created_desc'
  const q = params.q?.trim() ?? ''

  const supabase = createServiceClient()

  let query = supabase
    .from('badges')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)

  if (filterType) query = query.eq('type', filterType)
  if (filterRarity) query = query.eq('rarity', filterRarity)
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`)

  switch (sortBy) {
    case 'name_asc': query = query.order('name', { ascending: true }); break
    case 'name_desc': query = query.order('name', { ascending: false }); break
    case 'created_asc': query = query.order('created_at', { ascending: true }); break
    default: query = query.order('created_at', { ascending: false })
  }

  const from = (page - 1) * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const [{ data: badgesRaw, count }, { data: factionsRaw }] = await Promise.all([
    query,
    supabase.from('factions').select('id, name'),
  ])

  const badges = (badgesRaw ?? []) as BadgeRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const factionMap = new Map(
    ((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name])
  )

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">배지 관리</h1>
        <Link href="/admin/badges/new" className="w-full md:w-auto">
          <Button className="w-full md:w-auto h-11 md:h-10">+ 새 배지</Button>
        </Link>
      </div>

      {/* 필터 */}
      <Suspense>
        <BadgesFilterBar />
      </Suspense>

      {/* 카운트 */}
      <div className="text-sm text-muted-foreground">
        총 {total}개
        {(q || filterType || filterRarity) && ' (필터 적용 중)'}
      </div>

      {/* 목록 */}
      <BadgeList badges={badges} factionMap={factionMap} />

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/badges" />
    </div>
  )
}
