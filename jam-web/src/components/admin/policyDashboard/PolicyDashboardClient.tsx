'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  IconSearch,
  IconAdjustmentsHorizontal,
  IconCode,
  IconDatabase,
  IconFileCertificate,
  IconClock,
  IconX,
  IconArrowRight,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Card, CardContent } from '@/components/admin/ui/card'
import type { PolicyItem, PolicyType } from '@/lib/admin/policyDashboard/types'

interface Props {
  initialPolicies: readonly PolicyItem[]
  initialLiveValues: Record<string, unknown>
  updatedAt: string
}

type FilterTab = 'all' | PolicyType

export function PolicyDashboardClient({
  initialPolicies,
  initialLiveValues,
  updatedAt,
}: Props) {
  const [policies] = useState<readonly PolicyItem[]>(initialPolicies)
  // 값은 읽어서 보여 주기만 한다. 바꾸는 일은 카드의 링크가 이어 주는 설정 화면에서 한다.
  const liveValues = initialLiveValues
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState<FilterTab>('all')
  const [collapsedChapters, setCollapsedChapters] = useState<Record<number, boolean>>({})

  // 상단 통계 수치
  const metrics = useMemo(() => {
    let adminLink = 0
    let codeConstant = 0
    let ticketDecision = 0
    let preLaunch = 0

    for (const p of policies) {
      if (p.type === 'admin_link') adminLink += 1
      else if (p.type === 'code_constant') codeConstant += 1
      else if (p.type === 'ticket_decision') ticketDecision += 1
      else if (p.type === 'pre_launch_pending') preLaunch += 1
    }

    return {
      total: policies.length,
      adminLink,
      codeConstant,
      ticketDecision,
      preLaunch,
    }
  }, [policies])

  // 필터 및 검색 적용
  const filteredPolicies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return policies.filter((item) => {
      // 탭 필터
      if (selectedTab !== 'all' && item.type !== selectedTab) {
        return false
      }

      // 검색어 필터
      if (!query) return true

      const matchTitle = item.title.toLowerCase().includes(query)
      const matchSpec = item.currentSpec.toLowerCase().includes(query)
      const matchUx = item.userExperience.toLowerCase().includes(query)
      const matchDoc = item.basisDoc.toLowerCase().includes(query)
      const matchTicket = item.ticketId?.toLowerCase().includes(query) ?? false
      const matchTable = item.dbTable?.toLowerCase().includes(query) ?? false
      const matchColumn = item.dbColumn?.toLowerCase().includes(query) ?? false
      const matchCode = item.codeLocation?.toLowerCase().includes(query) ?? false
      const matchChapter = `${item.chapter}장 ${item.chapterTitle}`.toLowerCase().includes(query)

      return (
        matchTitle ||
        matchSpec ||
        matchUx ||
        matchDoc ||
        matchTicket ||
        matchTable ||
        matchColumn ||
        matchCode ||
        matchChapter
      )
    })
  }, [policies, selectedTab, searchQuery])

  // 챕터별 그룹화
  const groupedByChapter = useMemo(() => {
    const map = new Map<number, { title: string; items: PolicyItem[] }>()

    for (const item of filteredPolicies) {
      if (!map.has(item.chapter)) {
        map.set(item.chapter, { title: item.chapterTitle, items: [] })
      }
      map.get(item.chapter)!.items.push(item)
    }

    return Array.from(map.entries())
      .map(([chapter, data]) => ({ chapter, ...data }))
      .sort((a, b) => a.chapter - b.chapter)
  }, [filteredPolicies])

  // 챕터 접기/펼치기 토글
  const toggleChapter = (chapter: number) => {
    setCollapsedChapters((prev) => ({
      ...prev,
      [chapter]: !prev[chapter],
    }))
  }

  // 모두 펼치기 / 모두 접기
  const toggleAllChapters = (expand: boolean) => {
    const next: Record<number, boolean> = {}
    for (let c = 1; c <= 19; c += 1) {
      next[c] = !expand
    }
    setCollapsedChapters(next)
  }

  const getTypeBadge = (type: PolicyType) => {
    switch (type) {
      case 'admin_link':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1 font-semibold whitespace-nowrap break-keep wrap-break-word">
            <IconDatabase className="size-3" />
            설정 화면에서 바꾸기
          </Badge>
        )
      case 'code_constant':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 flex items-center gap-1 font-semibold">
            <IconCode className="size-3" />
            엔진 고정 규칙
          </Badge>
        )
      case 'ticket_decision':
        return (
          <Badge className="bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-100 flex items-center gap-1 font-semibold">
            <IconFileCertificate className="size-3" />
            티켓 세부 결정
          </Badge>
        )
      case 'pre_launch_pending':
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-100 flex items-center gap-1 font-semibold">
            <IconClock className="size-3" />
            오픈 전 적용 대기
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* 상단 현황 카드 5개 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
        <span>19개 장 총 {metrics.total}건의 정책을 모니터링하고 있어요.</span>
        <span>조회 시점: {new Date(updatedAt).toLocaleTimeString('ko-KR')}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card
          className={`cursor-pointer transition-all border ${
            selectedTab === 'all' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-slate-300'
          }`}
          onClick={() => setSelectedTab('all')}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">전체 정책</div>
            <div className="text-2xl font-bold mt-1">{metrics.total}건</div>
            <div className="text-[11px] text-muted-foreground mt-1">19개 장 망라</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            selectedTab === 'admin_link'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
              : 'hover:border-emerald-300'
          }`}
          onClick={() => setSelectedTab('admin_link')}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1 break-keep wrap-break-word">
              <IconDatabase className="size-3.5" />
              설정 화면에서 바꾸기
            </div>
            <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-1">
              {metrics.adminLink}건
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-1 break-keep wrap-break-word">값은 설정 화면에서 수정</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            selectedTab === 'code_constant'
              ? 'border-blue-500 ring-2 ring-blue-500/20'
              : 'hover:border-blue-300'
          }`}
          onClick={() => setSelectedTab('code_constant')}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1">
              <IconCode className="size-3.5" />
              엔진 고정 규칙
            </div>
            <div className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1">
              {metrics.codeConstant}건
            </div>
            <div className="text-[11px] text-blue-600/80 mt-1">코드 판정 로직</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            selectedTab === 'ticket_decision'
              ? 'border-purple-500 ring-2 ring-purple-500/20'
              : 'hover:border-purple-300'
          }`}
          onClick={() => setSelectedTab('ticket_decision')}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
              <IconFileCertificate className="size-3.5" />
              티켓 세부 결정
            </div>
            <div className="text-2xl font-bold text-purple-800 dark:text-purple-300 mt-1">
              {metrics.ticketDecision}건
            </div>
            <div className="text-[11px] text-purple-600/80 mt-1">개발 단계 확정안</div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all border ${
            selectedTab === 'pre_launch_pending'
              ? 'border-amber-500 ring-2 ring-amber-500/20'
              : 'hover:border-amber-300'
          }`}
          onClick={() => setSelectedTab('pre_launch_pending')}
        >
          <CardContent className="p-4">
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <IconClock className="size-3.5" />
              오픈 전 대기
            </div>
            <div className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-1">
              {metrics.preLaunch}건
            </div>
            <div className="text-[11px] text-amber-600/80 mt-1">출시 직전 시드</div>
          </CardContent>
        </Card>
      </div>

      {/* 검색 및 탭 필터 컨트롤 */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* 검색창 */}
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="정책명, 기준 수치(예: 20km, 60km), DB 테이블, 티켓 번호 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 bg-white dark:bg-slate-950"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                aria-label="검색어 지우기"
              >
                <IconX className="size-4" />
              </button>
            )}
          </div>

          {/* 모두 펼치기 / 접기 버튼 */}
          <div className="flex items-center gap-2 text-xs">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleAllChapters(true)}
              className="h-8 text-xs"
            >
              전체 펼치기
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleAllChapters(false)}
              className="h-8 text-xs"
            >
              전체 접기
            </Button>
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800 text-xs">
          <Button
            type="button"
            size="sm"
            variant={selectedTab === 'all' ? 'default' : 'ghost'}
            onClick={() => setSelectedTab('all')}
            className="h-7 text-xs px-2.5"
          >
            전체 ({metrics.total})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedTab === 'admin_link' ? 'default' : 'ghost'}
            onClick={() => setSelectedTab('admin_link')}
            className="h-7 text-xs px-2.5 text-emerald-800 dark:text-emerald-300 whitespace-nowrap break-keep wrap-break-word"
          >
            설정 화면에서 바꾸기 ({metrics.adminLink})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedTab === 'code_constant' ? 'default' : 'ghost'}
            onClick={() => setSelectedTab('code_constant')}
            className="h-7 text-xs px-2.5 text-blue-800 dark:text-blue-300"
          >
            엔진 고정 규칙 ({metrics.codeConstant})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedTab === 'ticket_decision' ? 'default' : 'ghost'}
            onClick={() => setSelectedTab('ticket_decision')}
            className="h-7 text-xs px-2.5 text-purple-800 dark:text-purple-300"
          >
            티켓 세부 결정 ({metrics.ticketDecision})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedTab === 'pre_launch_pending' ? 'default' : 'ghost'}
            onClick={() => setSelectedTab('pre_launch_pending')}
            className="h-7 text-xs px-2.5 text-amber-800 dark:text-amber-300"
          >
            오픈 전 대기 ({metrics.preLaunch})
          </Button>
        </div>
      </div>

      {/* 빠른 목차 점프 네비게이션 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs text-muted-foreground scrollbar-none">
        <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-1">
          <IconAdjustmentsHorizontal className="size-3.5" />
          장 바로가기:
        </span>
        {Array.from({ length: 19 }, (_, i) => i + 1).map((chNo) => {
          const hasItems = groupedByChapter.some((g) => g.chapter === chNo)
          return (
            <a
              key={chNo}
              href={`#chapter-${chNo}`}
              className={`shrink-0 px-2 py-0.5 rounded border transition-colors ${
                hasItems
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary text-foreground'
                  : 'bg-slate-100 dark:bg-slate-950 border-transparent text-slate-400 opacity-60'
              }`}
            >
              {chNo}장
            </a>
          )
        })}
      </div>

      {/* 검색 결과 카운트 안내 */}
      {searchQuery && (
        <div className="text-xs text-muted-foreground flex items-center justify-between">
          <div>
            «<span className="font-semibold text-foreground">{searchQuery}</span>» 검색 결과: 총{' '}
            <span className="font-semibold text-primary">{filteredPolicies.length}</span>건
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setSearchQuery('')}
            className="h-auto p-0 text-xs"
          >
            검색 초기화
          </Button>
        </div>
      )}

      {/* 챕터별 정책 카드 목록 */}
      {groupedByChapter.length === 0 ? (
        <div className="py-16 text-center border rounded-lg bg-slate-50 dark:bg-slate-900">
          <p className="text-sm font-medium text-muted-foreground">
            조건에 일치하는 운영 정책이 없습니다.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('')
              setSelectedTab('all')
            }}
            className="mt-3 text-xs"
          >
            필터 및 검색 초기화
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByChapter.map(({ chapter, title: chapterTitle, items }) => {
            const isCollapsed = Boolean(collapsedChapters[chapter])

            return (
              <section key={chapter} id={`chapter-${chapter}`} className="space-y-3 scroll-mt-20">
                {/* 챕터 헤더 */}
                <div
                  onClick={() => toggleChapter(chapter)}
                  className="flex items-center justify-between py-2 px-3 bg-slate-100/80 dark:bg-slate-900/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900">
                      {chapter}장
                    </span>
                    <h2 className="text-base font-bold tracking-tight">{chapterTitle}</h2>
                    <span className="text-xs font-medium text-muted-foreground ml-1">
                      ({items.length}개 항목)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{isCollapsed ? '펼치기' : '접기'}</span>
                    {isCollapsed ? <IconChevronDown className="size-4" /> : <IconChevronUp className="size-4" />}
                  </div>
                </div>

                {/* 챕터 본문 (카드 그리드) */}
                {!isCollapsed && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {items.map((policy) => {
                      const adminLink = policy.type === 'admin_link' ? policy.adminLink : undefined
                      const liveVal =
                        adminLink?.liveField !== undefined && liveValues[adminLink.liveField] !== undefined
                          ? liveValues[adminLink.liveField]
                          : null

                      return (
                        <Card
                          key={policy.id}
                          className="flex flex-col justify-between border-slate-200 dark:border-slate-800 hover:shadow-sm transition-shadow"
                        >
                          <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-2">
                              {/* 상단 뱃지 및 타이틀 */}
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-bold leading-snug">{policy.title}</h3>
                                <div className="shrink-0">{getTypeBadge(policy.type)}</div>
                              </div>

                              {/* 기준값 및 실시간 DB 설정 구역 */}
                              <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-muted-foreground font-medium shrink-0">
                                    설정/판정 기준:
                                  </span>
                                  <span className="font-semibold text-foreground text-right break-words">
                                    {policy.currentSpec}
                                  </span>
                                </div>

                                {/* 설정 화면에서 바꾸는 항목: 실시간 값은 읽기만 하고, 바꾸는 일은 링크가 이어 준다 */}
                                {adminLink && (
                                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 space-y-1.5">
                                    {adminLink.liveField !== undefined && (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold break-keep wrap-break-word">
                                          현재 DB 실측값:
                                        </span>
                                        <span className="font-bold text-emerald-800 dark:text-emerald-300 break-keep wrap-break-word">
                                          {liveVal !== null ? `${liveVal}${adminLink.unit ?? ''}` : '조회 중'}
                                        </span>
                                        {policy.defaultValue !== undefined && (
                                          <span className="text-[11px] text-muted-foreground ml-1 break-keep wrap-break-word">
                                            (기본값: {policy.defaultValue}
                                            {adminLink.unit ?? ''})
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    <div className="text-right">
                                      <Link
                                        href={adminLink.href}
                                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5 whitespace-nowrap break-keep wrap-break-word"
                                      >
                                        {adminLink.href.startsWith('/admin/balance')
                                          ? '밸런스 설정에서 바꾸기'
                                          : '설정 화면에서 바꾸기'}{' '}
                                        <IconArrowRight className="size-3" />
                                      </Link>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 실제 동작 설명 (유저 경험) */}
                              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-100/50 dark:bg-slate-900/30 p-2.5 rounded border border-slate-200/40">
                                <span className="font-semibold text-slate-900 dark:text-slate-100 mr-1">
                                  유저가 겪는 결과:
                                </span>
                                {policy.userExperience}
                              </div>
                            </div>

                            {/* 카드 하단 메타 정보 */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-1.5">
                              <span className="font-medium text-slate-600 dark:text-slate-400">
                                {policy.basisDoc}
                              </span>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {policy.ticketId && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                    티켓 {policy.ticketId}
                                  </Badge>
                                )}
                                {policy.dbTable && (
                                  <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">
                                    {policy.dbTable}.{policy.dbColumn}
                                  </code>
                                )}
                                {policy.codeLocation && (
                                  <code
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono truncate max-w-[150px]"
                                    title={policy.codeLocation}
                                  >
                                    {policy.codeLocation.split('/').pop()}
                                  </code>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
