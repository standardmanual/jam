import React from 'react';

/**
 * IconCatalog — 라인 아이콘 세트 + 카탈로그 그리드.
 *
 * 20260828_2043: 서비스 `src/components/ui/icons.tsx`(299줄, 서비스 전역에서 실사용 중)를
 * MODULAR 관례(`.jsx`, `currentColor` 고정)에 맞게 이식했다. 이 파일은 Storybook 카탈로그
 * 목적의 사본이다 — 서비스는 계속 `src/components/ui/icons.tsx`를 단일 소스로 쓰고, 이 파일을
 * import하도록 바뀌지 않는다 (리스크 최소화, 티켓 20260828_2043).
 *
 * 규칙: stroke 1.5px, 24 viewBox, `currentColor` 고정. fill/색상은 부모의 text-color로만
 * 제어한다(제3의 컬러 도입 금지). 크기는 className 또는 width/height prop으로 지정, 기본 24×24.
 */
function Svg({ className, children, width = 24, height = 24, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={className ? undefined : width}
      height={className ? undefined : height}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 아바타 플레이스홀더 */
export function UserIcon(props) {
  return (
    <Svg {...props}>
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </Svg>
  );
}

/** 팔로워/팔로잉 빈 상태 */
export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <path d="M15 6.5a3 3 0 11-6 0 3 3 0 016 0zM12 12a6 6 0 00-6 6h12a6 6 0 00-6-6z" />
      <path d="M18 8.5a2.2 2.2 0 100-4.4M19 12.6A5 5 0 0122 17" />
    </Svg>
  );
}

/** 배지 */
export function MedalIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l2.2 4.4 4.9.7-3.55 3.45.84 4.85L12 14.6l-4.39 2.3.84-4.85L4.9 8.6l4.9-.7L12 3.5z" />
      <path d="M8.5 16.5L7 21.5l5-2.4 5 2.4-1.5-5" />
    </Svg>
  );
}

/** 아이템북 */
export function BookIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H10a2 2 0 012 2v13a2 2 0 00-2-2H5.5A1.5 1.5 0 014 15.5v-10z" />
      <path d="M20 5.5A1.5 1.5 0 0018.5 4H14a2 2 0 00-2 2v13a2 2 0 012-2h4.5a1.5 1.5 0 001.5-1.5v-10z" />
    </Svg>
  );
}

/** 아이템 드랍 */
export function PackageIcon(props) {
  return (
    <Svg {...props}>
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </Svg>
  );
}

/** 아이템 픽업 */
export function GiftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5h17V12h-17zM5 12v8.5h14V12M12 8.5V20.5" />
      <path d="M12 8.5H8.2a2.1 2.1 0 110-4.2c2.2 0 3.8 4.2 3.8 4.2zM12 8.5h3.8a2.1 2.1 0 100-4.2C13.6 4.3 12 8.5 12 8.5z" />
    </Svg>
  );
}

/** 미션 참가 */
export function TargetIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM13.5 12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </Svg>
  );
}

/** 미션 완료 */
export function CheckCircleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M8.25 12.4l2.6 2.6 4.9-5.4" />
    </Svg>
  );
}

/** 미션 취소 */
export function XCircleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Svg>
  );
}

/** 마지막 파편 */
export function PuzzleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10.2 4.5a1.8 1.8 0 013.6 0V6h2.7a1 1 0 011 1v2.7h1.5a1.8 1.8 0 010 3.6H17.5V17a1 1 0 01-1 1h-2.7v-1.5a1.8 1.8 0 10-3.6 0V18H7.5a1 1 0 01-1-1v-2.7H5a1.8 1.8 0 010-3.6h1.5V7a1 1 0 011-1h2.7V4.5z" />
    </Svg>
  );
}

/** 피드 빈 상태 */
export function InboxIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
      <path d="M5.6 5.2A1 1 0 016.6 4.5h10.8a1 1 0 011 .7l3.1 8.3v4.5a2 2 0 01-2 2H4.5a2 2 0 01-2-2v-4.5l3.1-8.3z" />
    </Svg>
  );
}

/** Strava 등 외부 서비스 연동 */
export function ActivityIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 12.5h4l3-7 4 14 3-7h3" />
    </Svg>
  );
}

/** 포인트 */
export function CoinIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M14.2 9.2a2.8 2.8 0 00-2.2-1c-1.5 0-2.5.9-2.5 2s.9 1.7 2.5 2 2.5.9 2.5 2-1 2-2.5 2a2.8 2.8 0 01-2.2-1" />
    </Svg>
  );
}

export function ChevronRightIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function CloseIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** 진행 알림(progress_nudge) */
export function HourglassIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12M6 20.5h12" />
      <path d="M7 3.5v3.2a5 5 0 002.2 4.15L12 12l2.8 1.15A5 5 0 0117 17.3v3.2M17 3.5v3.2a5 5 0 01-2.2 4.15L12 12l-2.8 1.15A5 5 0 007 17.3v3.2" />
    </Svg>
  );
}

/** 지역 트렌드(location_trend) / 드랍 위치 */
export function PinIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 21.5s-6.5-5.79-6.5-11a6.5 6.5 0 1113 0c0 5.21-6.5 11-6.5 11z" />
      <path d="M12 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </Svg>
  );
}

/** 조합(아이템 합성) */
export function FlaskIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9.5 3.5h5M10 3.5v5.8L5.8 16.9a2 2 0 001.75 3h8.9a2 2 0 001.75-3L14 9.3V3.5" />
      <path d="M7.8 15h8.4" />
    </Svg>
  );
}

/** 기사(editorial_article) */
export function NewspaperIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5.5h12a1.5 1.5 0 011.5 1.5v11a2 2 0 002 2H6a2 2 0 01-2-2v-12.5z" />
      <path d="M17.5 20V8.5a1.5 1.5 0 00-1.5-1.5" />
      <path d="M7 9.5h6M7 12.5h6M7 15.5h4" />
    </Svg>
  );
}

/** 검색 */
export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" />
    </Svg>
  );
}

/** 성공(체크) — 토스트 등 상태 표시 */
export function CheckIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

/** 정보(i) — 토스트 info 상태 */
export function InfoIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      <path d="M12 11v5.5M12 8v.01" />
    </Svg>
  );
}

/** 편집(연필) */
export function PencilIcon(props) {
  return (
    <Svg {...props}>
      <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

/** 알림 종 */
export function BellIcon(props) {
  return (
    <Svg {...props}>
      <path d="M18 9a6 6 0 10-12 0c0 4.5-1.5 6-2.5 7h17c-1-1-2.5-2.5-2.5-7z" />
      <path d="M10 19.5a2.2 2.2 0 004 0" />
    </Svg>
  );
}

/** 경고(삼각형) */
export function AlertTriangleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 4.5L21 20H3L12 4.5z" />
      <path d="M12 10v4.5M12 17v.01" />
    </Svg>
  );
}

/** 자물쇠 — 잠김 상태(선행 조건 미충족으로 참가·진입 불가) */
export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 018 0v3" />
      <path d="M12 14v2" />
    </Svg>
  );
}

/** 카탈로그 그리드에 노출할 전체 아이콘 목록 — 이름 순서는 원본 icons.tsx 등장 순서를 유지한다. */
export const ICON_ENTRIES = [
  { name: 'UserIcon', Icon: UserIcon },
  { name: 'UsersIcon', Icon: UsersIcon },
  { name: 'MedalIcon', Icon: MedalIcon },
  { name: 'BookIcon', Icon: BookIcon },
  { name: 'PackageIcon', Icon: PackageIcon },
  { name: 'GiftIcon', Icon: GiftIcon },
  { name: 'TargetIcon', Icon: TargetIcon },
  { name: 'CheckCircleIcon', Icon: CheckCircleIcon },
  { name: 'XCircleIcon', Icon: XCircleIcon },
  { name: 'PuzzleIcon', Icon: PuzzleIcon },
  { name: 'InboxIcon', Icon: InboxIcon },
  { name: 'ActivityIcon', Icon: ActivityIcon },
  { name: 'CoinIcon', Icon: CoinIcon },
  { name: 'ChevronRightIcon', Icon: ChevronRightIcon },
  { name: 'CloseIcon', Icon: CloseIcon },
  { name: 'HourglassIcon', Icon: HourglassIcon },
  { name: 'PinIcon', Icon: PinIcon },
  { name: 'FlaskIcon', Icon: FlaskIcon },
  { name: 'NewspaperIcon', Icon: NewspaperIcon },
  { name: 'SearchIcon', Icon: SearchIcon },
  { name: 'CheckIcon', Icon: CheckIcon },
  { name: 'InfoIcon', Icon: InfoIcon },
  { name: 'PencilIcon', Icon: PencilIcon },
  { name: 'BellIcon', Icon: BellIcon },
  { name: 'AlertTriangleIcon', Icon: AlertTriangleIcon },
  { name: 'LockIcon', Icon: LockIcon },
];

/**
 * IconCatalog — 전체 아이콘 그리드. Storybook 카탈로그 전용 컴포넌트.
 * 아이콘 이름 + 글리프를 나열해 세트 전체를 한눈에 확인할 수 있게 한다.
 */
export function IconCatalog({ className = '', style = {} }) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 'var(--spacing-16)',
        color: 'var(--color-text)',
        ...style,
      }}
    >
      {ICON_ENTRIES.map(({ name, Icon }) => (
        <div
          key={name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-8)',
            padding: 'var(--spacing-12)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-surface)',
          }}
        >
          <Icon width={24} height={24} />
          <span
            style={{
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              wordBreak: 'break-word',
            }}
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}
