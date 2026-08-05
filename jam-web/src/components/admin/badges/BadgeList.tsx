'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/shadcn-button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import BadgeCard from './BadgeCard'
import BadgesTable from './BadgesTable'
import type { BadgeRow, BadgeRarity, BadgeType, FactionRow } from '@/types/database'

interface BadgeListProps {
  badges: BadgeRow[]
  factionMap?: Map<string, string>
}

type SortOption = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc'

export default function BadgeList({ badges, factionMap = new Map() }: BadgeListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<BadgeType | 'all'>('all')
  const [filterRarity, setFilterRarity] = useState<BadgeRarity | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('created_desc')

  // 필터링 및 정렬
  const filtered = useMemo(() => {
    let result = [...badges]

    // 검색 필터 (이름, 설명)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q)
      )
    }

    // 타입 필터
    if (filterType !== 'all') {
      result = result.filter((b) => b.type === filterType)
    }

    // 희귀도 필터
    if (filterRarity !== 'all') {
      result = result.filter((b) => b.rarity === filterRarity)
    }

    // 정렬
    switch (sortBy) {
      case 'name_asc':
        result.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
        break
      case 'name_desc':
        result.sort((a, b) => b.name.localeCompare(a.name, 'ko-KR'))
        break
      case 'created_asc':
        result.sort(
          (a, b) =>
            new Date(a.created_at ?? 0).getTime() -
            new Date(b.created_at ?? 0).getTime()
        )
        break
      case 'created_desc':
      default:
        result.sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime()
        )
    }

    return result
  }, [badges, searchQuery, filterType, filterRarity, sortBy])

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">배지 관리</h1>
        <Link href="/admin/badges/new" className="w-full md:w-auto">
          <Button className="w-full md:w-auto h-11 md:h-10">
            + 새 배지
          </Button>
        </Link>
      </div>

      {/* 검색 및 필터 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* 검색창 */}
        <div className="md:col-span-2">
          <Input
            placeholder="배지 이름, 설명으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10"
          />
        </div>

        {/* 타입 필터 */}
        <Select value={filterType} onValueChange={(v) => setFilterType(v as BadgeType | 'all')}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 타입</SelectItem>
            <SelectItem value="activity">활동</SelectItem>
            <SelectItem value="item">아이템</SelectItem>
            <SelectItem value="poi">POI</SelectItem>
          </SelectContent>
        </Select>

        {/* 희귀도 필터 */}
        <Select value={filterRarity} onValueChange={(v) => setFilterRarity(v as BadgeRarity | 'all')}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="희귀도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 희귀도</SelectItem>
            <SelectItem value="common">Common</SelectItem>
            <SelectItem value="rare">Rare</SelectItem>
            <SelectItem value="legendary">Legend</SelectItem>
            <SelectItem value="mythic">Mythic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 정렬 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">정렬:</span>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-48 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">최신 등록순</SelectItem>
            <SelectItem value="created_asc">오래된 순</SelectItem>
            <SelectItem value="name_asc">이름 (가나다)</SelectItem>
            <SelectItem value="name_desc">이름 (역순)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 결과 수 */}
      <div className="text-sm text-gray-600">
        {filtered.length}개의 배지 ({badges.length}개 중)
      </div>

      {/* 모바일: 카드 리스트 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">일치하는 배지가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:hidden gap-4">
            {filtered.map((badge) => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>

          {/* 데스크탑: 테이블 */}
          <div className="hidden md:block">
            <BadgesTable badges={filtered} factionMap={factionMap} />
          </div>
        </>
      )}
    </div>
  )
}
