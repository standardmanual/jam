/**
 * JAM! 에셋 제너레이터 — 설정값·레이어·프리셋 타입
 *
 * 정본: docs/specs/prd/asset-generator/PRD.md §4(레이어)·§5(프리셋).
 * 이미지 레이어는 20260924_2155에서 타입을 선언하고 20260924_2157에서 render.ts의
 * `drawImageLayer`로 그리기를 확정했다. 텍스트 레이어는 타입만 있고 그리기는 후속 티켓 과제다.
 */

/** 스테이지 비율. 긴 변은 항상 1280px (PRD §3). */
export type StageRatio = '1:1' | '4:5' | '9:16';

/** 스탬프 그라데이션 방향. h=가로, v=세로, r=방사형. */
export type GradientDirection = 'h' | 'v' | 'r';

/** 브랜드 글자 원천 (J·A·M). */
export type LetterKey = 'J' | 'A' | 'M';

/** 리본 레이어의 원천 그래픽: 브랜드 글자 또는 업로드한 PNG/SVG. */
export type RibbonSource = { kind: 'letter'; letter: LetterKey } | { kind: 'upload'; assetUrl: string };

/**
 * 리본 레이어 (기본 레이어, PRD §4.1).
 * 원천 그래픽·크기·블러·회전(진행 방향 회전 포함)·그라데이션·곡선 불규칙성/시드·속도·복사 간격/수·배경색을 갖는다.
 */
export interface RibbonLayerConfig {
  type: 'ribbon';
  source: RibbonSource;
  /** 스테이지 짧은 변 대비 크기(%) */
  sizePct: number;
  /** 블러 세기(%) */
  blurPct: number;
  /** 스탬프 자체 회전(도) */
  rotationDeg: number;
  /** 켜면 rotationDeg를 곡선 진행 방향에 더한다 */
  followPath: boolean;
  direction: GradientDirection;
  backgroundColor: string;
  /** 그라데이션 시작색. linkStartToBackground가 true면 backgroundColor와 같아야 한다 */
  startColor: string;
  endColor: string;
  /** true면 startColor가 backgroundColor를 따른다 (PRD §6) */
  linkStartToBackground: boolean;
  /** 곡선 불규칙성 슬라이더 값(0~100) */
  irregularityPct: number;
  seed: number;
  /** px/s */
  speed: number;
  /** 복사 간격(px) */
  gap: number;
  /** 복사 수 */
  count: number;
}

/** 이미지 레이어 (PRD §4.2). 위치·크기는 스테이지 기준 비율(%)로 저장해 비율이 바뀌어도 유지된다. */
export interface ImageLayerConfig {
  type: 'image';
  /** 업로드한 PNG/SVG. 프리셋 저장 시 저장소 경로를 가리킨다 */
  assetUrl: string;
  /** 이미지 중심의 스테이지 가로 위치(%) */
  xPct: number;
  /** 이미지 중심의 스테이지 세로 위치(%) */
  yPct: number;
  /** 스테이지 짧은 변 대비 가로 크기(%) */
  widthPct: number;
  /** 스테이지 짧은 변 대비 세로 크기(%) */
  heightPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
  /** 리본 레이어 기준 위/아래 순서 */
  order: number;
}

/** 텍스트 레이어 (PRD §4.3). 글자 내용은 프리셋에 저장하지 않는다. */
export interface TextLayerConfig {
  type: 'text';
  /** 프리셋에 저장하지 않는 값. 수동 경로는 화면 입력, 자동 경로는 컨텐츠에서 채운다 */
  content: string;
  /** 구글 폰트명 또는 기본 시스템 글꼴 */
  fontFamily: string;
  /** 스테이지 짧은 변 대비 크기(%) */
  sizePct: number;
  weight: number;
  letterSpacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  color: string;
  xPct: number;
  yPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
  /** 리본 레이어 기준 위/아래 순서 */
  order: number;
}

export type Layer = RibbonLayerConfig | ImageLayerConfig | TextLayerConfig;

/**
 * 프리셋 (PRD §5). 텍스트 글자 내용·배경색/끝색·리본 레이어의 랜덤 속성값과 시드는
 * 저장하지 않는다 — 생성할 때마다 정한다.
 */
export interface AssetPreset {
  id: string;
  name: string;
  targetType: 'badge';
  stageRatio: StageRatio;
  layers: Layer[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
