/**
 * JAM! 에셋 제너레이터 — 설정값·레이어·프리셋 타입
 *
 * 정본: docs/specs/prd/asset-generator/PRD.md §4(레이어)·§5(프리셋).
 * 이미지 레이어는 20260924_2155에서 타입을 선언하고 20260924_2157에서 render.ts의
 * `drawImageLayer`로 그리기를 확정했다. 텍스트 레이어는 20260924_2158에서 `drawTextLayer`로
 * 그리기까지 확정했다.
 *
 * 오버레이 레이어(재작업, 20260924_2158): 이미지 레이어와 텍스트 레이어는 어드민 화면에서
 * 하나의 순서 있는 목록(`OverlayLayerConfig[]`)으로 함께 관리한다 — 하위 티켓 20260924_2159의
 * 프리셋이 `AssetPreset.layers` 배열 하나에 이미지·텍스트를 순서대로 저장하기 때문이다(리본은
 * 저장하지 않는다, §5 아래 문단 참고). 리본 레이어는 이 목록에 들어가지 않고 항상 맨 아래
 * 고정이다(어드민 화면 상태는 별도 필드).
 *
 * 레이어 식별(재작업, 20260924_2157): `id`는 클라이언트에서 생성해 배열 인덱스 대신 선택
 * 상태를 추적하는 키로 쓴다(참고: `src/app/admin/shader-lab/ShaderLabLayerSidebar.tsx`의
 * `layer.id` 추적 방식) — 순서 변경으로 배열 인덱스가 바뀌어도 선택이 다른 레이어를 가리키지
 * 않는다. 프리셋 저장 시에도 그대로 함께 저장되지만 읽는 쪽에서 쓰지 않아 무해하다. 순서
 * 자체는 `layers` 배열 안 위치로 표현하므로(§5 "레이어 순서") 레이어별 `order` 필드는 따로
 * 두지 않는다.
 */

/** 스테이지 비율. 긴 변은 항상 1280px (PRD §3). */
export type StageRatio = '1:1' | '4:5' | '9:16';

/**
 * 프리셋이 적용될 컨텐츠 유형(PRD §12, CHECK 확장 마이그레이션 187). 프리셋 하나는 유형
 * 하나에만 속한다(상위 티켓 20260925_1404 결정 2) — 값 목록·라벨은 `presetSerialize.ts`의
 * `PRESET_TARGET_TYPES`·`PRESET_TARGET_TYPE_LABELS` 참고.
 */
export type PresetTargetType = 'badge' | 'mission' | 'collection' | 'home_feed';

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
  /** 선택 상태 추적용 식별자(배열 인덱스 아님). 클라이언트에서 생성 */
  id: string;
  /** 업로드한 PNG/SVG. 프리셋 저장 시 저장소 경로를 가리킨다 */
  assetUrl: string;
  /** 이미지 중심의 스테이지 가로 위치(%) */
  xPct: number;
  /** 이미지 중심의 스테이지 세로 위치(%) */
  yPct: number;
  /** 스테이지 짧은 변 대비 가로 크기(%). 세로는 원본 비율로 계산한다 */
  widthPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
  /** 컬러 오버레이 사용 여부. 없으면 꺼짐 */
  overlayEnabled?: boolean;
  /** 오버레이 색(`#rrggbb`). 이미지의 불투명한 부분에 입힌다 */
  overlayColor?: string;
}

/**
 * 글꼴 식별자(PRD §4.3). 서버 렌더링(하위 티켓 20260924_2201)이 같은 `family`·`weight` 값으로
 * 폰트 파일을 등록해야 하므로, 프리셋에 저장되는 값이자 두 렌더러(브라우저 캔버스·서버)가
 * 합의하는 계약이다. `family`는 구글 폰트명 또는 시스템 기본 글꼴 식별자
 * (`SYSTEM_DEFAULT_FONT`, assetGeneratorHelpers.ts)다.
 */
export interface TextLayerFont {
  family: string;
  weight: number;
}

/** 텍스트 레이어 (PRD §4.3). */
export interface TextLayerConfig {
  type: 'text';
  /** 선택 상태 추적용 식별자(배열 인덱스 아님). 클라이언트에서 생성 */
  id: string;
  /**
   * 프리셋 직렬화 제외 — 프리셋(§5)에는 스타일만 저장하고 이 값은 저장하지 않는다. 수동
   * 경로는 화면 입력, 자동 경로는 컨텐츠(배지 이름 등)에서 매번 채운다. 여러 줄은 개행 문자로
   * 구분한다.
   */
  content: string;
  font: TextLayerFont;
  /** 스테이지 짧은 변 대비 글자 크기(%) */
  sizePct: number;
  /** 글자 크기 대비 자간 배수(0=기본 간격, 양수면 더 벌어진다) */
  letterSpacing: number;
  /** 글자 크기 대비 행간 배수(예: 1.2). 여러 줄일 때만 의미가 있다 */
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  color: string;
  /** 텍스트 블록 중심의 스테이지 가로 위치(%) */
  xPct: number;
  /** 텍스트 블록 중심의 스테이지 세로 위치(%) */
  yPct: number;
  rotationDeg: number;
  /** 0~100 */
  opacityPct: number;
}

export type Layer = RibbonLayerConfig | ImageLayerConfig | TextLayerConfig;

/**
 * 오버레이 레이어(이미지·텍스트, 재작업 20260924_2158): 리본 위에 얹는 순서 있는 레이어
 * 목록이다. 어드민 화면(`overlayLayers` 상태)과 프리셋 저장(§5, 하위 티켓 20260924_2159)
 * 양쪽이 이 타입을 쓴다.
 */
export type OverlayLayerConfig = ImageLayerConfig | TextLayerConfig;

/**
 * 프리셋 (PRD §5, 저장·불러오기 구현 티켓 20260924_2159). 오버레이 레이어(이미지·텍스트)만
 * 저장한다 — 리본 레이어 자체(색·랜덤 속성값·시드 포함)와 텍스트 글자 내용은 저장하지 않는다.
 * 이 값들은 생성할 때마다(수동은 화면에서, 자동은 CLI 입력으로) 정한다.
 */
export interface AssetPreset {
  id: string;
  name: string;
  targetType: PresetTargetType;
  stageRatio: StageRatio;
  layers: OverlayLayerConfig[];
  /** 프리셋을 만든 어드민의 users.id */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 프리셋 목록·저장 응답의 요약 형태(티켓 20260925_0239). `AssetPreset`에서 파생해 두 형태가 따로
 * 진화하지 않게 한다 — 레이어·대상 유형·작성자는 상세 조회(`presets/[id]`)에서만 내려준다.
 */
export type AssetPresetSummary = Pick<AssetPreset, 'id' | 'name' | 'stageRatio' | 'createdAt' | 'updatedAt'>;
