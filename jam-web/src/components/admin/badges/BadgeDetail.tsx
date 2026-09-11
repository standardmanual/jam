'use client'

import { Fragment, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { BadgeActiveToggleButton } from './BadgeActiveToggleButton'
import {
  BadgeEditorShell,
  BadgeSectionCard,
  BadgeSectionNav,
  RAIL_ACTIONS_CLASS,
  RailCard,
  ReadOnlyGrid,
  ReadOnlyItem,
} from './BadgeEditorLayout'
import { cn } from '@/lib/utils'
import BadgeRailPreview from '@/app/admin/badges/BadgeRailPreview'
import type { BadgeRow, BadgeCondition, BadgeRarity } from '@/types/database'
import { badgeTypeLabel, isJamCategoryBadge } from '@/lib/admin/badge-labels'
import {
  adminActivityTypeLabel,
  badgeSectionDescription,
  badgeSectionTitle,
  computeBadgeSectionStatuses,
  conditionSummaryChips,
  previewConditionText,
  visibleBadgeSections,
  type BadgeSectionId,
} from '@/lib/admin/badge-sections'
import {
  CONDITION_FORM_SECTIONS,
  CONDITION_FORM_SECTION_DESCRIPTION,
  CONDITION_FORM_SECTION_LABEL,
  conditionFormSectionOf,
  formatConditionDetailEntries,
} from '@/lib/badge-engine/conditionRegistry'
import { isLeveledBadge } from '@/lib/badge-engine/badgeKind'
import { parseBlobAnimation } from '@/lib/blobAnimation'

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  mystic: 'Mystic',
}

/** "YYYY.MM.DD" 형식으로 날짜 포맷 */
function formatYmd(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/** 연결된 지점 1곳 — `[id]/page.tsx`가 서버에서 조회해 넘긴다(티켓 20260911_0901) */
export interface BadgeDetailLinkedPoi {
  id: string
  name: string
  category: string
  radius_meters: number
}

interface BadgeDetailProps {
  badge: BadgeRow
  tribeName?: string
  itemBookName?: string
  linkedPois: BadgeDetailLinkedPoi[]
  /** poi_categories.slug → 한글 라벨 */
  poiCategoryLabels: Record<string, string>
}

/** 값이 없을 때 표시 */
function Empty({ children = '없음' }: { children?: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

/**
 * 어드민 배지 조회 화면 — 티켓 20260911_0901
 *
 * 생성·수정 폼(`BadgeForm.tsx`)과 **같은 섹션 순서·레일 구조**다. 각 섹션은 읽기 전용 라벨-값
 * 그리드로 그린다. 획득 조건은 폼과 같은 그룹 제목 아래에 설정된 조건만 보여 주고, 문구는
 * 레지스트리의 `formatConditionDetail` 계열을 그대로 쓴다(티켓 20260905_0028 — 문구의 단일 출처).
 */
export default function BadgeDetail({ badge, tribeName, itemBookName, linkedPois, poiCategoryLabels }: BadgeDetailProps) {
  const router = useRouter()
  const condition = badge.condition_json as BadgeCondition | null

  // 삭제 확인 + 실행 (티켓 20260830_1344). 20260830_1912부터 DELETE는 이력이 없을 때만 실제 하드
  // 삭제를 수행하고, 이력이 있으면 409와 함께 안내 메시지를 반환한다 — 아래 alert()가 그대로 노출한다.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // AlertDialog(Radix Portal)는 [data-admin-theme] 스코프 밖(document.body)에 렌더링되면 테마
  // 색이 깨진다 — BadgeActiveToggleButton과 동일하게 포털 컨테이너를 지정한다(20260827_002).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/badges/${badge.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? '삭제에 실패했습니다. 다시 시도해주세요.')
        return
      }
      router.push('/admin/badges')
      router.refresh()
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const isJam = isJamCategoryBadge(badge.admin_category)
  const jamActivity = badge.type === 'activity' && isJam
  const leveled = isLeveledBadge(badge)
  const missionReward = condition?.mission_reward === true
  const animation = parseBlobAnimation(badge.background_animation)
  const sectionCtx = { type: badge.type, isJam }
  const sections = visibleBadgeSections(sectionCtx)
  const statuses = computeBadgeSectionStatuses({
    ...sectionCtx,
    activityTypeCount: badge.activity_types?.length ?? 0,
    name: badge.name,
    description: badge.description ?? '',
    conditionCount: conditionSummaryChips(condition).length,
    missionReward,
    tribeId: badge.tribe_id,
    itemBookId: badge.item_book_id,
    poiCount: linkedPois.length,
    pointReward: badge.point_reward ?? 0,
    patchAvailable: badge.patch_available,
    hasPeriod: Boolean(badge.valid_from || badge.valid_until),
    imageUrl: badge.image_url,
    hasAnimation: animation !== null,
    hasBackgroundColor: Boolean(badge.background_color),
  })
  const sectionHeader = (id: BadgeSectionId) => ({
    id,
    title: badgeSectionTitle(id, sectionCtx),
    description: badgeSectionDescription(id, sectionCtx),
    status: statuses[id],
  })
  const poiCategoryLabel = (slug: string | null) => (slug ? (poiCategoryLabels[slug] ?? slug) : null)

  // 획득 조건 — 폼과 같은 그룹 제목 아래로 나눈다. 미션 보상 표시는 그룹이 아니라 발급 방식으로 보여 준다
  const detailEntries = formatConditionDetailEntries(condition).filter((e) => e.key !== 'mission_reward')
  const conditionGroups = CONDITION_FORM_SECTIONS.map((section) => ({
    section,
    lines: detailEntries.filter((e) => conditionFormSectionOf(e.key) === section).map((e) => e.text),
  })).filter((g) => g.lines.length > 0)

  const classSection = (
    <BadgeSectionCard {...sectionHeader('class')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="타입">{badgeTypeLabel(badge.type)}</ReadOnlyItem>
        {badge.type === 'activity' && (
          <ReadOnlyItem label="분류">
            {isJam
              ? 'JAM!'
              : badge.activity_types && badge.activity_types.length > 0
                ? badge.activity_types.map(adminActivityTypeLabel).join(' · ')
                : <Empty />}
          </ReadOnlyItem>
        )}
        {badge.type === 'activity' && <ReadOnlyItem label="배지 종류">{leveled ? '레벨형' : '등급형'}</ReadOnlyItem>}
        {leveled ? (
          <ReadOnlyItem label="레벨">{badge.level !== null ? `Lv.${badge.level}` : <Empty />}</ReadOnlyItem>
        ) : (
          <ReadOnlyItem label="등급">
            {badge.rarity ? (RARITY_LABEL[badge.rarity] ?? badge.rarity) : <Empty />}
          </ReadOnlyItem>
        )}
      </ReadOnlyGrid>
    </BadgeSectionCard>
  )

  const basicSection = (
    <BadgeSectionCard {...sectionHeader('basic')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="이름" span={3}>
          {badge.name}
        </ReadOnlyItem>
        <ReadOnlyItem label="설명" span={3}>
          {badge.description ? <span className="whitespace-pre-line">{badge.description}</span> : <Empty />}
        </ReadOnlyItem>
        <ReadOnlyItem label="계열 키" span={3}>
          {badge.family_key ? <span className="font-mono text-[13px]">{badge.family_key}</span> : <Empty>아직 없음</Empty>}
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </BadgeSectionCard>
  )

  const conditionSection = badge.type !== 'checkin' && (
    <BadgeSectionCard {...sectionHeader('cond')}>
      {badge.type === 'activity' && !jamActivity && (
        <ReadOnlyGrid>
          <ReadOnlyItem label="발급 방식" span={3}>
            {missionReward ? '미션 완료로만 지급 — 아래 조건은 발급 판정에 쓰이지 않아요' : '조건 충족 시 자동 발급'}
          </ReadOnlyItem>
        </ReadOnlyGrid>
      )}
      {conditionGroups.length === 0 ? (
        <p className="rounded-lg bg-muted px-3.5 py-3 text-xs text-muted-foreground">
          {badge.type === 'item' ? '설정된 조건이 없어 모두에게 드랍돼요.' : '설정된 조건이 없어요.'}
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {conditionGroups.map((g) => (
            <div key={g.section} className="px-4 py-3">
              <p className="text-sm font-medium text-foreground">{CONDITION_FORM_SECTION_LABEL[g.section]}</p>
              <p className="text-xs text-muted-foreground">{CONDITION_FORM_SECTION_DESCRIPTION[g.section]}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {g.lines.map((line, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </BadgeSectionCard>
  )

  const linkSection = !jamActivity && (
    <BadgeSectionCard {...sectionHeader('link')}>
      {badge.type === 'checkin' ? (
        <>
          <ReadOnlyGrid>
            <ReadOnlyItem label="지점 카테고리">{poiCategoryLabel(badge.category) ?? <Empty>연결된 지점을 따름</Empty>}</ReadOnlyItem>
          </ReadOnlyGrid>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">연결된 지점 {linkedPois.length}곳</p>
            {linkedPois.length === 0 ? (
              <p className="rounded-lg bg-muted px-4 py-4 text-center text-sm text-muted-foreground">아직 연결한 지점이 없어요.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {linkedPois.map((poi) => (
                  <li key={poi.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
                    <span className="truncate text-foreground">
                      {poi.name} <span className="text-xs text-muted-foreground">{poiCategoryLabel(poi.category)}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">반경 {poi.radius_meters}m</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <ReadOnlyGrid>
          <ReadOnlyItem label="소속 트라이브">{tribeName ?? (badge.tribe_id ? '(찾을 수 없음)' : <Empty />)}</ReadOnlyItem>
          <ReadOnlyItem label="소속 컬렉션">{itemBookName ?? (badge.item_book_id ? '(찾을 수 없음)' : <Empty />)}</ReadOnlyItem>
          {badge.type === 'item' && <ReadOnlyItem label="드랍 가중치">{badge.drop_weight ?? 1.0}</ReadOnlyItem>}
        </ReadOnlyGrid>
      )}
    </BadgeSectionCard>
  )

  const rewardSection = (
    <BadgeSectionCard {...sectionHeader('reward')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="포인트 보상">
          {badge.point_reward ? `${badge.point_reward.toLocaleString()}포인트` : <Empty />}
        </ReadOnlyItem>
        <ReadOnlyItem label="실물 패치">
          {badge.patch_available
            ? `구매 가능${badge.patch_price_krw ? ` · ${badge.patch_price_krw.toLocaleString()}원` : ''}`
            : <Empty>구매 불가</Empty>}
        </ReadOnlyItem>
        <ReadOnlyItem label="유효기간">
          {badge.valid_from || badge.valid_until ? (
            `${badge.valid_from ? formatYmd(badge.valid_from) : '처음부터'} ~ ${badge.valid_until ? formatYmd(badge.valid_until) : '종료일 없음'}`
          ) : (
            <Empty>{badge.type === 'item' ? '상시 드랍' : '상시 평가'}</Empty>
          )}
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </BadgeSectionCard>
  )

  const designSection = (
    <BadgeSectionCard {...sectionHeader('design')}>
      <ReadOnlyGrid>
        <ReadOnlyItem label="배지 이미지">
          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {badge.image_url ? (
              <Image src={badge.image_url} alt={badge.name} fill className="object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">이미지 없음</span>
            )}
          </div>
        </ReadOnlyItem>
        {/* 배경 — 편집 화면이 아니므로 애니메이션 파라미터 전체를 나열하지 않고 방식만 요약한다
            (티켓 20260906_1423) */}
        <ReadOnlyItem label="배경" span={2}>
          {animation ? (
            '애니메이션'
          ) : badge.background_color ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 shrink-0 rounded border border-border"
                style={{ backgroundColor: badge.background_color }}
              />
              <span className="font-mono text-[13px]">{badge.background_color}</span>
            </span>
          ) : (
            <Empty>기본 배경</Empty>
          )}
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </BadgeSectionCard>
  )

  const sectionNodes: Record<BadgeSectionId, ReactNode> = {
    class: classSection,
    basic: basicSection,
    cond: conditionSection,
    link: linkSection,
    reward: rewardSection,
    design: designSection,
  }

  const rail = (
    <>
      <RailCard title="상세 화면 미리보기" className="@2xl:row-span-2 @4xl:row-span-1">
        <BadgeRailPreview
          badge={{
            image_url: badge.image_url,
            name: badge.name,
            rarity: badge.rarity,
            level: badge.level,
            description: badge.description,
          }}
          background={{
            background_color: badge.background_color,
            background_shader_id: badge.background_shader_id,
            background_image_url: badge.background_image_url,
            background_video_url: badge.background_video_url,
            background_animation: badge.background_animation,
          }}
          conditionText={previewConditionText({
            type: badge.type,
            isJam,
            condition: badge.type === 'checkin' ? null : condition,
            poiNames: linkedPois.map((p) => p.name),
          })}
        />
      </RailCard>

      <RailCard title="섹션">
        <BadgeSectionNav items={sections.map((id) => ({ id, label: badgeSectionTitle(id, sectionCtx), status: statuses[id] }))} />
      </RailCard>

      <RailCard className={cn('flex flex-col gap-2', RAIL_ACTIONS_CLASS)}>
        <Button type="button" onClick={() => router.push(`/admin/badges/${badge.id}/edit`)} className="w-full">
          수정
        </Button>
        <div className="flex gap-2">
          {/* 토글 버튼은 size="sm"(h-9)이다 — 높이를 className으로 덮지 않고 삭제 버튼을 같은 크기로 맞춘다 */}
          <BadgeActiveToggleButton badgeId={badge.id} isActive={!badge.deleted_at} className="flex-1" />
          <Button type="button" variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} className="flex-1">
            삭제
          </Button>
        </div>
      </RailCard>
    </>
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BadgeEditorShell
        header={
          <div>
            <Button variant="ghost" onClick={() => router.back()} className="mb-2 -ml-3">
              ← 뒤로
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{badge.name}</h1>
              {badge.deleted_at && (
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                  비활성화됨 · {formatYmd(badge.deleted_at)} 회수
                </span>
              )}
            </div>
          </div>
        }
        railLabel="미리보기와 관리"
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
            <AlertDialogTitle>배지 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{badge.name}&apos; 배지를 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              단, 발급·드랍 등 이력이 있는 배지는 삭제할 수 없으며 비활성화만 가능합니다.
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
