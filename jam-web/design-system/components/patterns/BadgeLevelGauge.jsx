import React from 'react';
import { ProgressBar } from '../feedback/ProgressBar.jsx';
import { BadgeFamilyCardHeader, progressRampColor } from './BadgeFamilyCardHeader.jsx';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';

/**
 * BadgeLevelGauge — 무한레벨형 계열 한 줄. 티켓 20260905_0036.
 *
 * v5는 194계열 630종이고 그중 무한레벨형이 193종이다. 레벨을 눈금으로 늘어놓으면
 * 계열 하나가 Lv.1~8(지금 시딩된 범위)만으로도 화면 한 페이지를 먹고, 레벨 상한이 없으니
 * 앞으로 더 늘어난다. **그래서 이 컴포넌트는 레벨 수와 무관하게 높이가 고정이다** —
 * 지나온 레벨을 하나도 그리지 않고 «지금 레벨 · 다음 목표 · 남은 양» 세 가지만 말한다.
 * 높이 고정의 근거는 그 하나뿐이다 — **이름 줄은 말줄임이 아니다**(티켓 20260906_1323 §5).
 *
 * `condition`·`metric`을 받지 않는다 — 배지 이름이 지표를 말하고("걸어온 거리"),
 * 값 행이 조건을 말한다("120 / 150km"). 같은 말을 두 번 하지 않는다.
 *
 * ## v2 — 헤더를 카드 폭 전체로 (티켓 20260906_2140)
 *
 * 예전 그리드는 `[썸네일 44px][내용 1fr]`이고 이름이 그 안쪽 1행에 있어, 계열명 시작 x가
 * **88px**(썸네일 44 + 갭 12 + 칩 52 뒤)이었다. 레일 카드는 32px였다 — 같은 화면에서 같은
 * 위계의 이름이 두 자리에 있었다. 이제 헤더(`BadgeFamilyCardHeader`)가 카드 폭 전체를
 * 차지하고 썸네일은 본문으로 내려간다: 본문 `[52px 썸네일][값 행 + 10px 바]`.
 *
 * 레벨은 **본문 `BadgeLevelChip`**(`size="md"`)이 말한다. 헤더 우측은 **퍼센트 숫자만** 둔다 — 카드 타입이 달라도 숫자가 한 x에서
 * 끝나야 세로로 훑는 스캔 컬럼이 성립한다(티켓 20260906_2344).
 * (2140에서 잠시 헤더 라벨로 올렸다가 되돌렸다) — 예전 주석은 여기서
 * 더 쓰지 않는다(칩과 등급 텍스트가 한 카드에 섞이지 않게. 칩 자체는 다른 화면 6곳이 계속 쓴다).
 *
 * 진행 바는 `ProgressBar fillMode="track-gradient"` — 트랙 기준 그라데이션이라 fill 안에서
 * 그림이 압축되지 않는다. 채움색은 `--status-progress-sweep` 토큰 하나에서 온다.
 *
 * 썸네일: 다음 레벨 배지는 정의상 아직 미획득이라 **grayscale(1) 원본**으로 그린다
 * (2026-09-06 사용자 확정 — 어떤 배지인지 알아볼 수 있어야 한다). 이미지는 여백 없이
 * 프레임을 꽉 채우고(`objectFit: cover`) 모서리는 프레임의 `overflow: hidden`이 자른다.
 */

/** 썸네일 한 변 — 레일 눈금(52px)과 같은 값. 카드 종류가 달라도 배지 크기는 하나다. */
const THUMB_SIZE = 52;

export function BadgeLevelGauge({
  /** 계열 이름 — 이 이름이 곧 지표다("걸어온 거리", "걸은 날들") */
  name,
  /** 지금까지 도달한 레벨(1부터). null이면 아직 Lv.1도 못 받은 상태다 */
  level,
  /**
   * 다음 목표 레벨 — `level`이 `null`(아직 아무것도 못 받음)일 때 칩에 대신 그린다.
   * 「지금 어디쯤인가」를 항상 하나의 값으로 말하기 위한 폴백이다(티켓 20260906_2344).
   */
  nextLevel = /** @type {number | null} */ (null),
  /** 현재 누적값 — 호출부가 이미 포맷한 문자열/숫자를 그대로 받는다(DS는 계산하지 않는다) */
  current,
  /** 다음 레벨 목표값(단위 포함 문자열 허용 — "150km") */
  next,
  /** 남은 양("30km 남음" 등 완성 문장). null이면 그리지 않는다 */
  left,
  /** 0~1 진행률. 계산 계층이 만든 값을 그대로 쓴다("작을수록 좋음" 축 때문에 재계산 금지) */
  fraction,
  /** 헤더 2행(메타 줄) 완성 문자열. null이면 그리지 않는다 */
  metaText = /** @type {React.ReactNode} */ (null),
  /** 다음 레벨 배지 이미지. 미획득이라 grayscale(1)로 그린다 */
  imageUrl = /** @type {string | null} */ (null),
  /** 이미지 대체 텍스트. 생략하면 `name`을 쓴다 */
  alt = /** @type {string | null} */ (null),
  className = '',
  style = {},
}) {
  const clamped = Math.min(1, Math.max(0, fraction ?? 0));
  // 받은 게 있으면 현재 레벨, 없으면 다음 목표 레벨. 둘 다 없으면 칩을 그리지 않는다.
  const chipLevel = level ?? nextLevel;
  const valueColor = progressRampColor(clamped);

  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--radius-card)',
        padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <BadgeFamilyCardHeader
        name={name}
        fraction={clamped}
        metaText={metaText}
      />

      {/* 본문 — [52px 썸네일][값 행 + 10px 바] */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: `${THUMB_SIZE}px 1fr`,
          columnGap: 'var(--spacing-12)', alignItems: 'center',
          marginTop: 'var(--spacing-12)',
        }}
      >
        <span
          style={{
            width: THUMB_SIZE, height: THUMB_SIZE, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
            color: 'var(--color-text)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
            <img
              src={imageUrl}
              alt={alt ?? name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', padding: 0,
                display: 'block', filter: 'grayscale(1)',
              }}
            />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>

        <div style={{ minWidth: 0 }}>
          {/* 값 행 — `BadgeStampRow`(반복형)와 같은 문법: [칩] 왼쪽부터 flex로 흘려
              쓴다(티켓 20260906_2344 3차, 사용자 지적). 예전 grid(`5ch` 우측정렬 +
              `1fr`)는 칩↔숫자 사이가 벌어지고 「남음」이 카드 오른쪽 끝까지 밀려,
              같은 화면의 반복형 카드와 다른 문법으로 읽혔다.
              레벨칩이 **항상 맨 앞**에 온다(2344 1차 확정) — 받은 게 있으면 현재 레벨,
              없으면 다음 목표 레벨이다. 숫자만 반복형보다 크게 두고 상태 램프 색을
              올린다 — 이 화면에서 「지금 얼마인지」를 말하는 유일한 큰 수치라 배치는
              맞추되 강조는 남긴다(사용자 확정, 완전 동일화가 아니라 배치만 통일).
              현재값이 없는 기록형 계열(`current == null`)은 `—` 대신 통째로 생략한다. */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-8)', minWidth: 0, flexWrap: 'wrap' }}>
            {chipLevel != null && <BadgeLevelChip level={chipLevel} size="md" />}
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
              {current != null && (
                <>
                  <span style={{ fontSize: 'var(--text-body-l)', fontWeight: 700, lineHeight: 1.2, color: valueColor }}>
                    {current}
                  </span>
                  <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>/</span>
                </>
              )}
              <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>{next}</span>
            </span>
            {left != null && (
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', wordBreak: 'keep-all' }}>
                · {left}
              </span>
            )}
          </div>

          <div style={{ marginTop: 'var(--spacing-8)' }}>
            <ProgressBar
              percent={clamped * 100}
              fillMode="track-gradient"
              trackColor="var(--status-idle-track)"
              height={10}
              radius="var(--radius-xs)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
