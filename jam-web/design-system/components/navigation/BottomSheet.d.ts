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
  /** @deprecated 값과 무관하게 footer 아래 여백은 항상 안전영역 + 20px이다(티켓 20261110_2150). */
  footerBottomInset?: 'tabbar' | 'safe-area';
  /** 기본값 `true`는 콘텐츠 영역을 스크롤 가능하게 둔다. */
  contentScrollable?: boolean;
  /**
   * 시트 면의 바탕. `'card'`(기본)는 흰 면(`--card-bg`, footer는 `--surface`), `'background'`는 페이지 바탕색(`--background`)이다.
   * 안에 흰 카드를 올리는 화면에서 쓴다. footer 띠도 같은 바탕을 따른다. 서비스 BottomSheet.tsx와 같은 prop이다.
   */
  panelTone?: 'card' | 'background';
}

export function BottomSheet(props: BottomSheetProps): JSX.Element | null;
