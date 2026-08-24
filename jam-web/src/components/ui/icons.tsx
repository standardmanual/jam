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

/** 진행 알림(progress_nudge) */
export function HourglassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12M6 20.5h12" />
      <path d="M7 3.5v3.2a5 5 0 002.2 4.15L12 12l2.8 1.15A5 5 0 0117 17.3v3.2M17 3.5v3.2a5 5 0 01-2.2 4.15L12 12l-2.8 1.15A5 5 0 007 17.3v3.2" />
    </Svg>
  )
}

/** 지역 트렌드(location_trend) / 드랍 위치 */
export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21.5s-6.5-5.79-6.5-11a6.5 6.5 0 1113 0c0 5.21-6.5 11-6.5 11z" />
      <path d="M12 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </Svg>
  )
}

/** 조합(아이템 합성) */
export function FlaskIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 3.5h5M10 3.5v5.8L5.8 16.9a2 2 0 001.75 3h8.9a2 2 0 001.75-3L14 9.3V3.5" />
      <path d="M7.8 15h8.4" />
    </Svg>
  )
}

/** 기사(editorial_article) */
export function NewspaperIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h12a1.5 1.5 0 011.5 1.5v11a2 2 0 002 2H6a2 2 0 01-2-2v-12.5z" />
      <path d="M17.5 20V8.5a1.5 1.5 0 00-1.5-1.5" />
      <path d="M7 9.5h6M7 12.5h6M7 15.5h4" />
    </Svg>
  )
}

/** 검색 */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" />
    </Svg>
  )
}

/** 성공(체크) — 토스트 등 상태 표시 */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  )
}

/** 정보(i) — 토스트 info 상태 */
export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M12 11v5.5M12 8v.01" />
    </Svg>
  )
}

/** 편집(연필) — 프로필 헤더 아바타 오버레이 편집 버튼 전용 (20260820_019) */
export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  )
}

/**
 * 알림 종 — TopNav 우측 알림함 진입점 (20260824_021)
 *
 * Material Symbols `notifications`(FILL 0 / wght 400 / opsz 24)의 **형태만** 참조하고
 * 구현은 이 세트 규칙(stroke 1.5px, 24 viewBox, currentColor)을 따른다.
 * - 폰트를 로드하지 않는다 — 아이콘 하나 때문에 수백 KB를 받을 이유가 없다(Apache 2.0이라 형태 참조는 자유)
 * - Material Symbols Outlined는 겉보기와 달리 fill 기반 path라 그대로 넣으면 TabBar 등
 *   기존 아이콘과 선 굵기·질감이 어긋난다
 * - 안 읽은 소식 버블은 이 아이콘 안이 아니라 **바깥 엘리먼트**로 얹는다
 *   (세트의 "제3의 컬러 도입 금지" 규칙 유지 — NotificationBell.tsx)
 */
export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 9a6 6 0 10-12 0c0 4.5-1.5 6-2.5 7h17c-1-1-2.5-2.5-2.5-7z" />
      <path d="M10 19.5a2.2 2.2 0 004 0" />
    </Svg>
  )
}

/**
 * 경고(삼각형) — 알림함 ⑧ 계정·시스템 소식 (20260824_021)
 *
 * 세트에 경고 아이콘이 없어 추가한다. 색은 부모가 `--color-warning`으로 지정하며,
 * 경고 여부는 저장값이 아니라 **렌더 시점의 현재 상태**로 판정한다(PRD §6-2).
 */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5L21 20H3L12 4.5z" />
      <path d="M12 10v4.5M12 17v.01" />
    </Svg>
  )
}
