import type { CSSProperties } from 'react';

export interface MixerSlotProps {
  /** empty: 채울 수 있는 슬롯(컬러 테두리) · locked: 후보 미보유(불투명도만으로 표현) · filled: 채움 */
  status?: 'empty' | 'locked' | 'filled';
  /** filled일 때 배지 썸네일 URL */
  imageUrl?: string | null;
  /** filled일 때 배지 이름 */
  name?: string;
  /** 슬롯 탭 핸들러 */
  onClick?: () => void;
  /** filled일 때만 렌더되는 제거 버튼 핸들러 — 없으면 제거 버튼을 그리지 않는다 */
  onRemove?: () => void;
  removeLabel?: string;
  /** empty/locked일 때 aria-label로 쓸 문구(화면에는 '+' 아이콘만 보인다) */
  emptyLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function MixerSlot(props: MixerSlotProps): JSX.Element;
