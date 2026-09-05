'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { IconCheck, IconX } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'
import { BadgeActiveToggleButton } from './BadgeActiveToggleButton'
import type { BadgeRow, BadgeCondition, BadgeRarity } from '@/types/database'
import { badgeTypeLabel } from '@/lib/admin/badge-labels'
import { formatConditionDetail } from '@/lib/badge-engine/conditionRegistry'

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

/**
 * 조건을 읽기 좋은 텍스트로 변환.
 *
 * 문구는 조건 필드 메타 레지스트리(`conditionRegistry.ts`)가 단일 출처다(티켓 20260905_0028).
 * 예전에는 이 파일이 필드마다 한글을 하드코딩하고 있어, 새 조건 필드가 추가돼도 화면에는
 * 아무것도 나타나지 않았다(day_of_week·active_days_count·season_count_all 등이 실제로
 * 표시되지 않고 있었다).
 */
function formatCondition(c: BadgeCondition): string[] {
  const parts = formatConditionDetail(c)
  return parts.length > 0 ? parts : ['없음']
}

interface BadgeDetailProps {
  badge: BadgeRow
  factionName?: string
}

export default function BadgeDetail({ badge, factionName }: BadgeDetailProps) {
  const router = useRouter()
  const condition = badge.condition_json as BadgeCondition | null

  // 삭제 확인 + 실행 (티켓 20260830_1344) — 기존에는 confirm() 뒤 console.log만 찍고 실제
  // DELETE API를 호출하지 않는 스텁이었다. BadgeActiveToggleButton과 같은 AlertDialog 패턴으로
  // 교체하고 DELETE API를 호출한다.
  // 20260830_1912부터 DELETE는 이력이 없을 때만 실제 하드 삭제를 수행하고, 이력이 있으면
  // 409와 함께 안내 메시지를 반환한다 — 아래 alert()가 그 메시지를 그대로 노출한다.
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 h-10"
          >
            ← 뒤로
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{badge.name}</h1>
            {badge.deleted_at && (
              <span className="inline-flex items-center px-2.5 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-semibold whitespace-nowrap">
                비활성화됨 · {formatYmd(badge.deleted_at)} 회수
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-2">{badge.description}</p>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 배지 이미지 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">배지 이미지</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full aspect-square rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
              {badge.image_url ? (
                <Image
                  src={badge.image_url}
                  alt={badge.name}
                  fill
                  className="object-contain"
                />
              ) : (
                <span className="text-gray-400">이미지 없음</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 기본 속성 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">타입</div>
              <div className="px-3 py-1.5 bg-gray-100 rounded text-sm w-fit">
                {badgeTypeLabel(badge.type)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">희귀도</div>
              <div className="text-lg font-bold">
                {RARITY_LABEL[badge.rarity as BadgeRarity] || badge.rarity}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">세계관</div>
              <div className="text-sm">
                {factionName ?? (badge.faction_id ? '(로드 중...)' : '없음')}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">활동 종류</div>
              <div className="flex flex-wrap gap-2">
                {badge.activity_types && badge.activity_types.length > 0 ? (
                  badge.activity_types.map((type) => (
                    <span key={type} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {type}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500 text-sm">없음</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 조건 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>조건</CardTitle>
          <CardDescription>이 배지를 획득하기 위한 조건</CardDescription>
        </CardHeader>
        <CardContent>
          {condition && Object.keys(condition).length > 0 ? (
            <ul className="space-y-2">
              {formatCondition(condition).map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-blue-600 font-bold mt-0.5">•</span>
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Alert>
              <AlertDescription>설정된 조건이 없습니다.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 기타 설정 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 패치 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">패치</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">패치 가능</div>
              <div className="flex items-center gap-1 text-lg font-bold">
                {badge.patch_available ? (
                  <>
                    <IconCheck className="h-4 w-4 text-emerald-600" /> 가능
                  </>
                ) : (
                  <>
                    <IconX className="h-4 w-4 text-gray-400" /> 불가
                  </>
                )}
              </div>
            </div>
            {badge.patch_available && badge.patch_price_krw && (
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">패치 가격</div>
                <div className="text-lg font-bold text-emerald-600">
                  {badge.patch_price_krw.toLocaleString()}원
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 기타 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">기타 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">포인트 보상</div>
              <div className="text-lg font-bold">{badge.point_reward ?? 0}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">드랍 가중치</div>
              <div className="text-sm">{badge.drop_weight ?? 1.0}</div>
            </div>
            {badge.valid_from && (
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">유효 기간</div>
                <div className="text-sm">
                  {badge.valid_from ? new Date(badge.valid_from).toLocaleDateString('ko-KR') : '없음'}{' '}
                  ~{' '}
                  {badge.valid_until ? new Date(badge.valid_until).toLocaleDateString('ko-KR') : '무제한'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-col md:flex-row gap-3 pt-4">
        <BadgeActiveToggleButton
          badgeId={badge.id}
          isActive={!badge.deleted_at}
          className="h-11 md:h-10"
        />
        <Button variant="default" onClick={() => router.push(`/admin/badges/${badge.id}/edit`)} className="h-11 md:h-10">
          수정
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          className="h-11 md:h-10"
        >
          삭제
        </Button>
      </div>

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
