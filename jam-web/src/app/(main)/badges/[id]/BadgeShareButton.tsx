'use client'

import { useState } from 'react'
import Image from 'next/image'
import { IconButton } from '@ds/components/buttons/IconButton'
import BottomSheet from '@/components/ui/BottomSheet'
import { MedalIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

interface BadgeShareButtonProps {
  /** 미리보기에 쓸 이미지. 20260821_003 범위는 UI 셸이라 실제 투명 PNG 생성 전까지는
   *  배지 원본 이미지를 더미로 보여준다(후속 티켓에서 실제 공유용 이미지로 교체). */
  imageUrl: string | null
  badgeName: string
}

/**
 * 배지 상세 TopNav 우측 공유 버튼 + 미리보기 바텀시트 (20260821_003, UI 셸).
 *
 * activity/poi/item 3개 배지 타입 페이지가 공통으로 쓰는 rightSlot 콘텐츠 — TopNav/BottomSheet는
 * MODULAR 컴포넌트를 그대로 재사용하고, 체크보드 미리보기 프레임만 이 파일 안에 서비스 전용으로
 * 구현한다(선례 없는 좁은 용례 — MODULAR 승격 보류, 완료 기록 참고).
 *
 * 이 컴포넌트가 하는 일은 딱 여기까지다: 아이콘 클릭 → 전체화면 바텀시트 → 정적 미리보기 표시.
 * 실제 투명 PNG 생성·스트라바 데이터 연동·OS 공유시트 연결은 후속 티켓 범위.
 */
export default function BadgeShareButton({ imageUrl, badgeName }: BadgeShareButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <IconButton icon="share" label={d.badges.shareButtonLabel} onClick={() => setOpen(true)} />

      <BottomSheet open={open} onClose={() => setOpen(false)} detent="full" title={d.badges.sharePreviewTitle}>
        <div className="px-[var(--spacing-24)] pt-[var(--spacing-8)] pb-[var(--spacing-32)] flex flex-col items-center">
          {/*
            체크보드 미리보기 프레임 — 투명 PNG의 투명 영역을 시각화한다.
            다크 서피스 톤에 맞춰 라이트톤 체크보드(spike/background-generator/FilterPreview.tsx)보다
            대비를 낮춘 흰색 저투명도 2톤 조합으로 재조정했다(그대로 재사용하지 않음, 티켓 지시).
          */}
          <div
            className="w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center"
            style={{
              backgroundImage:
                'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, rgba(255,255,255,0.02) 0% 50%)',
              backgroundSize: '20px 20px',
            }}
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={badgeName}
                width={320}
                height={320}
                className="w-full h-full object-contain p-[var(--spacing-24)]"
              />
            ) : (
              <MedalIcon className="w-16 h-16 text-text/40" />
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
