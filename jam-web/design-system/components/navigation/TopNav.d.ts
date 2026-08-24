import type { ReactNode, CSSProperties } from 'react';

export interface TopNavProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: ReactNode;
  /** 좌측 영역의 back+title 블록 대신 렌더링할 노드(탭 최상위 페이지의 로고 표시용). */
  logoSlot?: ReactNode;
  /** 좌/우 사이 중앙 고정폭 슬롯(스트라바 동기화 버튼용). */
  centerSlot?: ReactNode;
  /** 우측 영역에서 rightSlot 뒤에 이어 렌더링되는 슬롯(프로필 아바타용). */
  avatarSlot?: ReactNode;
  /** 타이틀 font-size(CSS 단위 문자열). 기본 var(--text-h4)(24px). */
  titleSize?: string;
  /** 타이틀 font-weight. 기본 var(--weight-h4). */
  titleWeight?: string | number;
  /** 타이틀 line-height. 기본 var(--leading-h4). */
  titleLineHeight?: string | number;
  /** 타이틀 letter-spacing. 기본 var(--tracking-h4). */
  titleTracking?: string;
  /** header 엘리먼트에 적용할 인라인 스타일(배경색 오버라이드 등). */
  style?: CSSProperties;
}

export function TopNav(props: TopNavProps): JSX.Element;
