import React from 'react';

/**
 * 'div'  — 기본. 기존 마크업 그대로.
 * 'span' — 모든 요소(바깥·트랙·채움)를 span으로 그린다. `<a>`·`<button>`·`Link` 같은
 *          클릭 영역 안(phrasing 요건)에 놓을 때 켠다. `ProgressBar` 한정 prop이다.
 */
export type ProgressBarAs = 'div' | 'span';

/**
 * 'flat'    — 기본. 기존 모양 그대로(트랙 `--border`, 채움 `--accent`).
 * 'capsule' — 홈 캡슐 게이지와 같은 모양. 어두운 트랙(`--capsule-track`) 안쪽 2px 여백, 둥근 채움(기본색 `--capsule-fill`).
 *             채움 너비는 `calc(원지름px + (100% - 원지름px) × 비율)`(원지름 = height - 4)이라 아주 작아도 찌그러지지 않고, 0%이면 채움이 없다.
 *             **숫자 height만 받는다**(문자열이면 flat으로 그린다).
 */
export type ProgressBarShape = 'flat' | 'capsule';

export interface ProgressBarProps {
  /** 현재값 (percent 미지정 시 percent 계산에 사용) */
  current?: number;
  /** 전체값 (percent 미지정 시 percent 계산에 사용) */
  total?: number;
  /** 0~100 사이 퍼센트값. 지정하면 current/total 기반 계산을 덮어쓴다 */
  percent?: number;
  /** 바 높이(px 또는 CSS 단위 문자열). 기본 8. shape='capsule'은 숫자만 받는다 */
  height?: number | string;
  /** 필 색상. 기본 var(--accent)(capsule은 var(--capsule-fill)). 그라데이션 문자열도 허용(순위별 그라데이션 등) */
  color?: string;
  /** 트랙(배경) 색상. 기본 var(--border)(capsule은 var(--capsule-track)) */
  trackColor?: string;
  /** 바/트랙 모서리 radius(CSS 단위 문자열). 기본 var(--radius-full) */
  radius?: string;
  /** 모양. 기본 'flat'(기존 마크업 그대로). 'capsule'은 홈 캡슐 게이지와 같은 트랙·채움 모양 */
  shape?: ProgressBarShape;
  /**
   * 어떤 태그로 그릴지. 기본 'div'(기존 마크업 그대로).
   * 'span'은 `<a>`·`<button>`·`Link` 같은 클릭 영역 안(phrasing 요건)에 놓을 때 켠다.
   * span 경로에서만 바깥·트랙에 `display:block`이 붙어 높이·폭이 div와 같다.
   * `role`·`aria-*`는 더하지 않는다(태그만 바꾼다).
   */
  as?: ProgressBarAs;
  className?: string;
}

/**
 * ProgressBar — 진행도 바.
 *
 * [20260820_001] 서비스 6개 호출처(ItemBookHeroSection, CollectionGridCard,
 * itembooks/page, MissionDetailClient, inventory/page, MissionStatusClient) 전수조사 결과,
 * 트랙/필/radius 값이 파편화돼 있었다(하드코딩 vs 토큰 혼재). MissionDetailClient만 토큰을
 * 올바르게 참조하고 있어 이를 캐노니컬 스펙으로 삼는다:
 *   - 트랙: var(--border)
 *   - 필: var(--accent) 기본값 — 면 채우기라 accent다 (color prop으로 오버라이드 — 순위 그라데이션 등 예외 대응)
 *   - radius: var(--radius-full) 기본값 (radius prop으로 오버라이드 — MissionStatusClient의
 *     3px 임의값 등 예외 대응. [20260820_006])
 *   - height: 기본 8px (실사용 최빈값 — MissionDetailClient/ItemBookHeroSection 등 6곳 중 4곳)
 *
 * [20261114_1502] `shape` 추가 — **기본 'flat'이라 기존 호출부는 한 글자도 바뀌지 않는다.** 'capsule'이면 홈 캡슐 게이지(`CapsuleGauge`)와 같은
 * 트랙·채움 모양을 쓴다: 어두운 트랙(`--capsule-track`) 안쪽 2px 여백, 둥근 채움, 채움 너비 `calc(원지름px + (100% - 원지름px) × 비율)`
 * (원지름 = height - 4, 비율 0이면 채움 없음). 테두리·그림자는 게이지 전용이라 없다(게이지의 회색 점은 2026-11-19에 뺐다). 채움 기본색은 `--capsule-fill`이고 호출부가 `color`로 정한다.
 * capsule은 숫자 height만 받는다(문자열이면 flat으로 그린다).
 *
 * [20261126_1635] 서비스가 쓰지 않는 표현(바깥 선 `outlined`·`track-gradient` 채움·퍼센트/분수 글자)을 지웠다. 진행 바는 바만 그린다.
 */
/** capsule 트랙 안쪽 여백(px) — `CapsuleGauge`의 PADDING_PX와 같다 */
const CAPSULE_PADDING_PX = 2;

/**
 * @summary 진행률을 가로 막대로 보여 주는 바다. 미션 상세·오늘 상태 띠·랭킹 줄에서 쓴다.
 */
export function ProgressBar({
  current,
  total,
  percent,
  height = 8,
  color,
  trackColor,
  radius = 'var(--radius-full)',
  shape = 'flat',
  as = 'div',
  className = '',
}: ProgressBarProps) {
  // [20261107_2156] `as="span"` — <a>·<button>·Link 같은 클릭 영역 안에 놓을 때 쓴다(phrasing 요건).
  // 기본 'div'는 기존 마크업 그대로다. span 경로에서만 display:block을 더해(조건부 스프레드),
  // div 경로의 스타일 키 순서와 마크업이 한 글자도 달라지지 않게 한다. role·aria-*는 더하지 않는다.
  const isSpan = as === 'span';
  const Tag = isSpan ? 'span' : 'div';
  const blockStyle = isSpan ? { display: 'block' } : null;

  const computedPercent =
    percent != null
      ? percent
      : total != null && total > 0
        ? ((current ?? 0) / total) * 100
        : 0;
  const clampedPercent = Math.min(100, Math.max(0, computedPercent));

  // [20261114_1502] capsule은 숫자 height에서만 켠다. color·trackColor는 shape에 따라 기본값이 갈려 undefined로 받아 여기서 푼다
  // (구조분해 기본값으로 쓰면 flat 경로가 바뀐다).
  const isCapsule = shape === 'capsule' && typeof height === 'number';
  const resolvedColor = color === undefined ? (isCapsule ? 'var(--capsule-fill)' : 'var(--accent)') : color;
  const resolvedTrackColor = trackColor === undefined ? (isCapsule ? 'var(--capsule-track)' : 'var(--border)') : trackColor;

  const capsuleCircle = isCapsule ? height - CAPSULE_PADDING_PX * 2 : 0;
  const capsuleRatio = clampedPercent / 100;

  const bar = isCapsule ? (
    // 캡슐: 트랙 안쪽 여백 2px 안의 기준 상자에 채움을 절대 배치한다(CapsuleGauge와 같은 구조).
    <Tag
      style={{
        ...blockStyle,
        flex: 1,
        position: 'relative',
        boxSizing: 'border-box',
        height,
        padding: CAPSULE_PADDING_PX,
        borderRadius: radius,
        background: resolvedTrackColor,
      }}
    >
      <Tag style={{ display: 'block', position: 'relative', width: '100%', height: '100%' }}>
        <Tag
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width:
              capsuleRatio > 0
                ? `calc(${capsuleCircle}px + (100% - ${capsuleCircle}px) * ${capsuleRatio})`
                : '0px',
            borderRadius: radius,
            background: resolvedColor,
            transition: 'width var(--duration-slow) var(--ease-smooth-out)',
          }}
        />
      </Tag>
    </Tag>
  ) : (
    <Tag
      style={{
        ...blockStyle,
        flex: 1,
        position: 'relative',
        height,
        borderRadius: radius,
        overflow: 'hidden',
        background: resolvedTrackColor,
      }}
    >
      <Tag
        style={{
          position: 'absolute',
          inset: 0,
          left: 0,
          width: `${clampedPercent}%`,
          height: '100%',
          borderRadius: radius,
          background: resolvedColor,
          transition: 'width var(--duration-slow) var(--ease-smooth-out)',
        }}
      />
    </Tag>
  );

  return <Tag className={className} style={{ ...blockStyle, width: '100%' }}>{bar}</Tag>;
}
