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
   * 팔레트(JAM 2.0 라이트). 비활성 라벨은 두 팔레트 모두 `--muted`다.
   * - `onSurface`(기본): 크림 바탕 위 — 트랙은 `--default`, 활성 pill은 `--background-inverse`, 활성 라벨은 `--snow`
   * - `onCard`: 흰 카드 위 — 트랙은 `--background-secondary`, 활성 pill은 `--accent`, 활성 라벨은 `--accent-foreground`
   */
  variant?: 'onSurface' | 'onCard';
  /** 탭 높이. md=30px / lg=44px(터치영역) / xl=콘텐츠 높이(2줄 라벨) */
  size?: 'md' | 'lg' | 'xl';
  /** 모서리. pill=완전 라운드 / card=--radius-2xl */
  shape?: 'pill' | 'card';
  /** true면 컨테이너 전체 폭을 균등 분할합니다. */
  block?: boolean;
  /** true(기본)면 트랙을 팔레트 색 대신 `--surface` 채움으로 칠합니다. false면 위 팔레트의 트랙 색입니다. */
  outlined?: boolean;
  className?: string;
  tabClassName?: string;
  'aria-label'?: string;
}

export function SlidingTabs(props: SlidingTabsProps): JSX.Element;
