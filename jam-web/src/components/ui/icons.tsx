import type { SVGProps } from 'react'

/**
 * SuperHi Plus 라인 아이콘 세트
 *
 * - 이모지 대체용. stroke 1.5px, 24 viewBox, `currentColor` 고정.
 * - fill/색상은 부모의 text-* 로만 제어합니다(제3의 컬러 도입 금지).
 * - 크기는 className으로 지정하세요. 기본 w-6 h-6.
 */
type IconProps = SVGProps<SVGSVGElement>

function Svg({ className = 'w-6 h-6', children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** 아바타 플레이스홀더 (기존 사람 이모지 대체) */
export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </Svg>
  )
}

/** 팔로워/팔로잉 빈 상태 */
export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 6.5a3 3 0 11-6 0 3 3 0 016 0zM12 12a6 6 0 00-6 6h12a6 6 0 00-6-6z" />
      <path d="M18 8.5a2.2 2.2 0 100-4.4M19 12.6A5 5 0 0122 17" />
    </Svg>
  )
}

/** 배지 */
export function MedalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l2.2 4.4 4.9.7-3.55 3.45.84 4.85L12 14.6l-4.39 2.3.84-4.85L4.9 8.6l4.9-.7L12 3.5z" />
      <path d="M8.5 16.5L7 21.5l5-2.4 5 2.4-1.5-5" />
    </Svg>
  )
}

/** 아이템북 */
export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H10a2 2 0 012 2v13a2 2 0 00-2-2H5.5A1.5 1.5 0 014 15.5v-10z" />
      <path d="M20 5.5A1.5 1.5 0 0018.5 4H14a2 2 0 00-2 2v13a2 2 0 012-2h4.5a1.5 1.5 0 001.5-1.5v-10z" />
    </Svg>
  )
}

/** 아이템 드랍 */
export function PackageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </Svg>
  )
}

/** 아이템 픽업 */
export function GiftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5h17V12h-17zM5 12v8.5h14V12M12 8.5V20.5" />
      <path d="M12 8.5H8.2a2.1 2.1 0 110-4.2c2.2 0 3.8 4.2 3.8 4.2zM12 8.5h3.8a2.1 2.1 0 100-4.2C13.6 4.3 12 8.5 12 8.5z" />
    </Svg>
  )
}

/** 미션 참가 */
export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM13.5 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </Svg>
  )
}

/** 미션 완료 */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M8.25 12.4l2.6 2.6 4.9-5.4" />
    </Svg>
  )
}

/** 미션 취소 */
export function XCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Svg>
  )
}

/** 마지막 파편 */
export function PuzzleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.2 4.5a1.8 1.8 0 013.6 0V6h2.7a1 1 0 011 1v2.7h1.5a1.8 1.8 0 010 3.6H17.5V17a1 1 0 01-1 1h-2.7v-1.5a1.8 1.8 0 10-3.6 0V18H7.5a1 1 0 01-1-1v-2.7H5a1.8 1.8 0 010-3.6h1.5V7a1 1 0 011-1h2.7V4.5z" />
    </Svg>
  )
}

/** 피드 빈 상태 */
export function InboxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
      <path d="M5.6 5.2A1 1 0 016.6 4.5h10.8a1 1 0 011 .7l3.1 8.3v4.5a2 2 0 01-2 2H4.5a2 2 0 01-2-2v-4.5l3.1-8.3z" />
    </Svg>
  )
}

/** Strava 등 외부 서비스 연동 */
export function ActivityIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12.5h4l3-7 4 14 3-7h3" />
    </Svg>
  )
}

/** 포인트 */
export function CoinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M14.2 9.2a2.8 2.8 0 00-2.2-1c-1.5 0-2.5.9-2.5 2s.9 1.7 2.5 2 2.5.9 2.5 2-1 2-2.5 2a2.8 2.8 0 01-2.2-1" />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}
