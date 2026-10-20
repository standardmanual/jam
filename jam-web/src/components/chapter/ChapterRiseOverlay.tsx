'use client'

import { useEffect, useState } from 'react'
import { Card } from '@ds/components/cards/Card'
import { IconButton } from '@ds/components/buttons/IconButton'
import { pushMainScrollLock, pushTabBarHidden } from '@/lib/uiOverlay'
import { d, t } from '@/lib/i18n'

/**
 * 챕터 오름 축하 카드 (티켓 20261019_1317 1회, 사용자 결정 2, 채원 사전 판정 C)
 *
 * `BadgeRevealOverlay`의 캐러셀 틀은 맞지 않는다(이미지가 없으면 사람 실루엣이 나오고 등급 칩이 배지 전용이다).
 * 그래서 그 껍데기만 따른다.
 *   - 탭바 숨김: `pushTabBarHidden()` (iOS Safari 동적 툴바에서 덮기만 하면 탭바가 비치는 이력이 있다)
 *   - 배경 스크롤 잠금: 스크롤 컨테이너는 body가 아니라 `(main)/layout.tsx`의 `<main>`이다 — 참조 카운트 헬퍼 `pushMainScrollLock()`을 쓴다
 *   - 서비스 컬럼 폭(430px) 맞춤: `inset: 0` + 좌우 auto 마진
 *   - 닫기: 닫기 X와 Escape
 *   - 접근성 공지: 라이브 리전은 닫혀 있을 때도 계속 마운트해 열릴 때 문장을 채운다
 * `Card` 면에 «축하해요!» / «챕터 N에 올랐어요» / 이름(있을 때만)을 둔다. 점수와 게이지는 없다.
 *
 * 모션: `--duration-medium` 페이드와 16px 상승. `prefers-reduced-motion`이면 상승을 빼고 페이드만 남긴다(`motion-reduce:`).
 * 다른 오버레이가 열려 있는 동안 띄울지는 이 컴포넌트가 아니라 `ChapterRiseWatcher`가 정한다.
 */

interface Props {
  open: boolean
  /** 오른 챕터 번호 */
  chapterNo: number
  /** 지금 트라이브의 챕터 이름. 없으면 이름 줄을 그리지 않는다 */
  name: string | null
  onClose: () => void
}

/** 배지 획득 오버레이(zIndex 60)와 같은 층 */
const OVERLAY_Z_INDEX = 60

/** 서비스 컬럼 폭에 맞춘 오버레이 박스 — fixed + inset:0 + 좌우 auto 마진으로 가운데 정렬된다 */
const COLUMN_STYLE = { maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' } as const

const TEXT_BASE = 'm-0 break-keep wrap-break-word'

function RiseDialog({ chapterNo, name, onClose }: Omit<Props, 'open'>) {
  // 열린 직후 한 프레임 뒤에 켜서 전환이 보이게 한다(마운트와 같은 프레임에 켜면 시작 상태가 그려지지 않는다).
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => pushTabBarHidden(), [])
  useEffect(() => pushMainScrollLock(), [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={d.chapter.rise.ariaLabel}
      data-chapter-rise
      style={{
        position: 'fixed',
        inset: 0,
        ...COLUMN_STYLE,
        zIndex: OVERLAY_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-24)',
        padding: 'var(--spacing-24)',
        background: 'var(--backdrop)',
      }}
    >
      <div
        className={`w-full transition-[opacity,transform] duration-[var(--duration-medium)] ease-[var(--ease-smooth-out)] motion-reduce:transition-opacity ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0'
        }`}
      >
        <Card className="flex flex-col items-center gap-2 text-center">
          <p className={`${TEXT_BASE} text-balance text-base font-bold text-[color:var(--link)]`}>{d.chapter.rise.cheer}</p>
          <p className={`${TEXT_BASE} text-balance text-2xl font-bold text-foreground`}>
            {t(d.chapter.rise.title, { chapterNo })}
          </p>
          {name && <p className={`${TEXT_BASE} max-w-full truncate text-base text-muted`}>{name}</p>}
        </Card>
      </div>
      <IconButton icon="close" label={d.common.close} surface="light" onClick={onClose} />
    </div>
  )
}

export default function ChapterRiseOverlay({ open, chapterNo, name, onClose }: Props) {
  // 라이브 리전은 닫혀 있을 때도 마운트돼 있어야 내용 변경이 공지된다 — 텍스트만 열림/닫힘에 따라 채우고 비운다.
  const announcement = open ? t(d.chapter.rise.announce, { chapterNo }) : ''

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {open && <RiseDialog chapterNo={chapterNo} name={name} onClose={onClose} />}
    </>
  )
}
