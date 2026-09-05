import type { ReactNode } from 'react';

export interface SlidingTabItem {
  key: string;
  /** 버튼 안에 렌더링할 내용. 문자열뿐 아니라 커스텀 노드도 가능합니다. */
  label: ReactNode;
  /** label이 ReactNode일 때 스크린리더용 접근 이름 */
  ariaLabel?: string;
}

export interface SlidingTabsProps {
  items: SlidingTabItem[];
  /** 현재 활성 탭 key */
  value: string;
  onChange: (key: string) => void;
  /**
   * 팔레트.
   * - `onSurface`(기본): 다크 배경 위 — pill은 흰색, 활성 라벨은 검정
   * - `onCard`: 라이트 카드 위 — pill은 primary, 활성 라벨은 흰색
   */
  variant?: 'onSurface' | 'onCard';
  /** 탭 높이. md=30px / lg=44px(터치영역) / xl=콘텐츠 높이(2줄 라벨) */
  size?: 'md' | 'lg' | 'xl';
  /** 모서리. pill=완전 라운드 / card=--radius-cards */
  shape?: 'pill' | 'card';
  /** true면 컨테이너 전체 폭을 균등 분할합니다. */
  block?: boolean;
  /** true면 반투명 바 배경 대신 채움 배경을 사용합니다. */
  outlined?: boolean;
  className?: string;
  tabClassName?: string;
  'aria-label'?: string;
}

export function SlidingTabs(props: SlidingTabsProps): JSX.Element;
