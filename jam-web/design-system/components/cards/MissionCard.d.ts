import type { CSSProperties } from 'react';

export interface MissionCardProps {
  imageUrl?: string | null;
  title: string;
  description?: string;
  /** 보상 요약 텍스트 (예: "5km 배지 + 100P"). */
  rewardText?: string;
  /** 보상 배지 등급 — 있으면 RarityBadge로 표시. common은 RarityBadge 규칙상 렌더되지 않음. */
  rarity?: 'common' | 'rare' | 'epic' | 'mystic';
  /** 상태 칩 텍스트 (예: "참가중", "완료", "시작전"). 없으면 칩을 렌더하지 않음. */
  statusLabel?: string;
  /** 기간/마감 텍스트 (예: "3일 12시간 남음", "상시"). */
  periodText?: string;
  /** true면 썸네일 grayscale+딤 처리, 자물쇠 오버레이, 액션 버튼 비활성화. */
  locked?: boolean;
  /** 액션 버튼 라벨. 기본값 "참가하기". locked면 "잠김"으로 강제 표시. */
  actionLabel?: string;
  /** 제공 시에만 액션 버튼을 렌더한다. */
  onAction?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function MissionCard(props: MissionCardProps): JSX.Element;
