'use client'

/**
 * 어드민 투데이 카드 조회 화면 — 티켓 20260911_1454(배지 조회 화면 `BadgeDetail.tsx`,
 * 티켓 20260911_0901 기준으로 리뉴얼)
 *
 * 생성·수정 폼(`TodayCardForm.tsx`)과 **같은 섹션 순서·레일 구조**다. 각 섹션은 읽기 전용
 * 라벨-값 그리드로 그린다.
 */
import { Fragment, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import SafeImage from '@/components/SafeImage'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import {
  TodayEditorShell,
  TodaySectionCard,
  TodaySectionNav,
  RAIL_ACTIONS_CLASS,
  RailCard,
  ReadOnlyGrid,
  ReadOnlyItem,
} from '@/components/admin/today/TodayEditorLayout'
import {
  TODAY_TEMPLATE_OPTIONS,
  TODAY_LAYOUT_OPTIONS,
  TODAY_EXPOSURE_TAG_OPTIONS,
  todayTemplateFields,
  visibleTodaySections,
  todaySectionTitle,
  todaySectionDescription,
  computeTodaySectionStatuses,
  type TodaySectionId,
} from '@/lib/admin/today-sections'
// 순수 함수라 서버 전용 의존이 없는 targetHref.ts에서 가져온다(TodayCardForm.tsx와 동일 이유
// — `@/lib/today/cards`를 값으로 import하면 next/headers까지 클라이언트 번들에 딸려 들어간다).
import { resolveTargetHref } from '@/lib/today/targetHref'
import type { TodayCardRow } from '@/types/database'
import { cn } from '@/lib/utils'

/** 읽기 전용 화면에 필요한 배지 라벨 — `[id]/page.tsx`가 서버에서 조회해 넘긴다 */
export interface TodayCardDetailBadge {
  id: string
  name: string
}

interface TodayCardDetailProps {
  card: TodayCardRow
  linkedBadges: TodayCardDetailBadge[]
  missionTitle?: string
  itemBookName?: string
  /** ranking_board 카드가 연결한 랭킹모드 제목(티켓 20260911_1440) */
  rankingModeTitle?: string
  /** 저장·취소 후 돌아갈 목록 날짜('YYYY-MM-DD') — 캘린더뷰 맥락 보존(20260902_1028) */
  returnDate: string
}

/** 값이 없을 때 표시 */
function Empty({ children = '없음' }: { children?: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

function templateLabel(value: string): string {
  return TODAY_TEMPLATE_OPTIONS.find((t) => t.value === value)?.label ?? value
}
function layoutLabel(value: string): string {
  return TODAY_LAYOUT_OPTIONS.find((t) => t.value === value)?.label ?? value
}
function exposureTagLabel(value: string): string {
  return TODAY_EXPOSURE_TAG_OPTIONS.find((t) => t.value === value)?.label ?? value
}

/** "YYYY.MM.DD HH:mm" 형식으로 날짜·시각 포맷 */
function formatYmdHm(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TodayCardDetail({ card, linkedBadges, missionTitle, itemBookName, rankingModeTitle, returnDate }: TodayCardDetailProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/today/${card.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '삭제에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.push(`/admin/today?date=${returnDate}`)
      router.refresh()
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleToggleActive = async () => {
    setToggling(true)
    try {
      const res = await fetch(`/api/admin/today/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !card.is_active }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '상태 변경에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.refresh()
    } finally {
      setToggling(false)
    }
  }

  const fields = todayTemplateFields(card.template_type)
  const hasRef = Boolean(fields.badges || fields.mission || fields.itemBook || fields.region || fields.body || fields.rankingMode)
  const sections = visibleTodaySections(card.template_type)
  const statuses = computeTodaySectionStatuses({
    templateType: card.template_type,
    title: card.title,
    badgeCount: card.badge_ids?.length ?? 0,
    missionId: card.mission_id,
    itemBookId: card.item_book_id,
    regionLabel: card.region_label ?? '',
    bodyMarkdown: card.body_markdown ?? '',
    rankingModeId: card.ranking_mode_id,
    exposureTagCount: card.exposure_tags?.length ?? 0,
    hasStartsAt: Boolean(card.starts_at),
    hasEndsAt: Boolean(card.ends_at),
  })
  const sectionHeader = (id: TodaySectionId) => ({
    id,
    title: todaySectionTitle(id),
    description: todaySectionDescription(id),
    status: statuses[id],
  })

  const classSection = (
    <TodaySectionCard {...sectionHeader('class')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="템플릿 타입">{templateLabel(card.template_type)}</ReadOnlyItem>
        <ReadOnlyItem label="노출 형태">{layoutLabel(card.layout_type)}</ReadOnlyItem>
      </ReadOnlyGrid>
    </TodaySectionCard>
  )

  const basicSection = (
    <TodaySectionCard {...sectionHeader('basic')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="제목" span={3}>
          {card.title}
        </ReadOnlyItem>
        <ReadOnlyItem label="부제" span={3}>
          {card.subtitle || <Empty />}
        </ReadOnlyItem>
        <ReadOnlyItem label="커버 이미지" span={3}>
          {/* 20260824_004: cover_image_url은 어드민 자유 입력이라 호스트를 알 수 없다.
              next/image에 그대로 넘기면 미등록 호스트에서 이 화면 전체가 500으로 죽는다
              (티켓 20260911_1454 게이트 리뷰 FAIL) → SafeImage 경유 */}
          <SafeImage
            src={card.cover_image_url}
            alt={card.title}
            className="object-cover"
            containerClassName="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
            fallback={<Empty>이미지 없음</Empty>}
          />
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </TodaySectionCard>
  )

  const refSection = hasRef && (
    <TodaySectionCard {...sectionHeader('ref')}>
      <ReadOnlyGrid>
        {fields.badges && (
          <ReadOnlyItem label="배지" span={3}>
            {linkedBadges.length > 0 ? linkedBadges.map((b) => b.name).join(' · ') : <Empty />}
          </ReadOnlyItem>
        )}
        {fields.mission && <ReadOnlyItem label="미션">{missionTitle ?? (card.mission_id ? '(찾을 수 없음)' : <Empty />)}</ReadOnlyItem>}
        {fields.itemBook && <ReadOnlyItem label="컬렉션">{itemBookName ?? (card.item_book_id ? '(찾을 수 없음)' : <Empty />)}</ReadOnlyItem>}
        {fields.region && <ReadOnlyItem label="지역명">{card.region_label || <Empty />}</ReadOnlyItem>}
        {fields.body && (
          <ReadOnlyItem label="본문" span={3}>
            {card.body_markdown ? <span className="whitespace-pre-line">{card.body_markdown}</span> : <Empty />}
          </ReadOnlyItem>
        )}
        {fields.rankingMode && (
          <ReadOnlyItem label="랭킹 규칙">
            {rankingModeTitle ?? (card.ranking_mode_id ? '(찾을 수 없음)' : <Empty />)}
          </ReadOnlyItem>
        )}
      </ReadOnlyGrid>
    </TodaySectionCard>
  )

  const exposeSection = (
    <TodaySectionCard {...sectionHeader('expose')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="노출조건 태그" span={3}>
          {card.exposure_tags.length > 0 ? card.exposure_tags.map(exposureTagLabel).join(' · ') : <Empty />}
        </ReadOnlyItem>
        <ReadOnlyItem label="이동 경로" span={3}>
          <span className="font-mono text-[13px]">{resolveTargetHref(card)}</span>
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </TodaySectionCard>
  )

  const periodSection = (
    <TodaySectionCard {...sectionHeader('period')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="시작 일시">{formatYmdHm(card.starts_at)}</ReadOnlyItem>
        <ReadOnlyItem label="종료 일시">{formatYmdHm(card.ends_at)}</ReadOnlyItem>
        <ReadOnlyItem label="정렬 순서">{card.sort_order}</ReadOnlyItem>
        <ReadOnlyItem label="활성화">{card.is_active ? '활성' : '비활성'}</ReadOnlyItem>
      </ReadOnlyGrid>
    </TodaySectionCard>
  )

  const sectionNodes: Record<TodaySectionId, ReactNode> = {
    class: classSection,
    basic: basicSection,
    ref: refSection,
    expose: exposeSection,
    period: periodSection,
  }

  const rail = (
    <>
      <RailCard title="섹션">
        <TodaySectionNav items={sections.map((id) => ({ id, label: todaySectionTitle(id), status: statuses[id] }))} />
      </RailCard>

      <RailCard className={cn('flex flex-col gap-2', RAIL_ACTIONS_CLASS)}>
        <Link href={`/admin/today/${card.id}/edit?date=${returnDate}`} className="w-full">
          <Button type="button" className="w-full">
            수정
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={toggling} onClick={handleToggleActive} className="flex-1">
            {card.is_active ? '비활성화' : '활성화'}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} className="flex-1">
            삭제
          </Button>
        </div>
      </RailCard>
    </>
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      <TodayEditorShell
        header={
          <div>
            <Link href={`/admin/today?date=${returnDate}`} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← 투데이 목록
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{card.title}</h1>
              {!card.is_active && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                  비활성
                </span>
              )}
            </div>
          </div>
        }
        railLabel="섹션과 관리"
        main={sections.map((id) => (
          <Fragment key={id}>{sectionNodes[id]}</Fragment>
        ))}
        rail={rail}
      />

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open && !deleting) setShowDeleteConfirm(false)
        }}
      >
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>투데이 카드 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{card.title}&apos; 카드를 삭제합니다. 삭제하면 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setShowDeleteConfirm(false)}>
              취소
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? '삭제 중...' : '삭제 확인'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
