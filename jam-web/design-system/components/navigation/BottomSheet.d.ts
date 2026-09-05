import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children?: ReactNode;
  /** compact: 콘텐츠 높이만큼(최대 75vh) / full: 화면 대부분을 채우는 큰 디텐트 */
  detent?: 'compact' | 'full';
  /** 스크롤 영역 밖, 시트 맨 아래에 항상 고정으로 보여줄 콘텐츠(주로 액션 버튼). */
  footer?: ReactNode;
  /** `detent="full"` 전용 — 화면 최상단에서 남길 여백(px). */
  topGapPx?: number;
  /** footer의 아래쪽 여백 기준. 기본값 `'tabbar'`. */
  footerBottomInset?: 'tabbar' | 'safe-area';
  /** 기본값 `true`는 콘텐츠 영역을 스크롤 가능하게 둔다. */
  contentScrollable?: boolean;
}

export function BottomSheet(props: BottomSheetProps): JSX.Element | null;
