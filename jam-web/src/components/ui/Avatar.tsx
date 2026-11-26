import type { CSSProperties } from 'react'
import Image from 'next/image'
import { UserIcon } from '@/components/ui/icons'

export interface AvatarProps {
  /** 이미지 주소. 없거나 null이면 `UserIcon` 폴백을 그린다. */
  src?: string | null
  alt: string
  /** 지름/한 변(px). `next/image` width/height와 컨테이너 크기를 일치시킨다. */
  size: number
  /** 모서리 모양 — 기본 `'circle'`(`rounded-full`), 편집 화면 등 사각 아바타는 `'rounded'`(`rounded-2xl`). */
  shape?: 'circle' | 'rounded'
  /** 폴백 `UserIcon` 크기·색 클래스(예: `w-4 h-4`, `w-10 h-10 text-muted`). 기본값은 지름의 약 절반. */
  iconClassName?: string
  /** 컨테이너 배경·테두리 등 추가 클래스. */
  className?: string
  /** 컨테이너 인라인 스타일. */
  style?: CSSProperties
  /** `next/image` 최적화 건너뛰기(blob 미리보기 URL 등). */
  unoptimized?: boolean
}

/**
 * 공용 유저 아바타 (티켓 20261125_1444).
 * 서비스 전역에 중복돼 있던 `rounded-full/rounded-2xl overflow-hidden + Image / UserIcon` 패턴을
 * 한 컴포넌트로 통합한다. 호출부별 크기(`size`)·모양(`shape`)·배경/테두리(`className`)는 기존 값을 그대로 유지한다.
 *
 * @summary 프로필 사진을 원이나 둥근 사각형 안에 그리고 사진이 없으면 사용자 아이콘을 보여 주는 아바타다. 프로필·검색·팔로우 목록·상단 내비게이션에서 쓴다.
 */
export default function Avatar({
  src,
  alt,
  size,
  shape = 'circle',
  iconClassName,
  className = '',
  style,
  unoptimized = false,
}: AvatarProps) {
  const fallbackIconSize = Math.round(size * 0.5)
  const radiusClass = shape === 'rounded' ? 'rounded-2xl' : 'rounded-full'

  return (
    <span
      className={`relative ${radiusClass} overflow-hidden flex items-center justify-center shrink-0 ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          unoptimized={unoptimized}
          className="w-full h-full object-cover"
        />
      ) : (
        <UserIcon
          className={iconClassName ?? 'text-muted'}
          style={iconClassName ? undefined : { width: fallbackIconSize, height: fallbackIconSize }}
        />
      )}
    </span>
  )
}
