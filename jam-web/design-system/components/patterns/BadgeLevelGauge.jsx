import React from 'react';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';

/**
 * BadgeLevelGauge — 무한레벨형 계열 한 줄. 티켓 20260905_0036.
 *
 * v5는 194계열 630종이고 그중 무한레벨형이 193종이다. 레벨을 눈금으로 늘어놓으면
 * 계열 하나가 Lv.1~8(지금 시딩된 범위)만으로도 화면 한 페이지를 먹고, 레벨 상한이 없으니
 * 앞으로 더 늘어난다. **그래서 이 컴포넌트는 레벨 수와 무관하게 높이가 고정이다** —
 * 지나온 레벨을 하나도 그리지 않고 «지금 레벨 · 다음 목표 · 남은 양» 세 가지만 말한다.
 * 높이 고정의 근거는 그 하나뿐이다 — **이름 줄은 말줄임이 아니다**(티켓 20260906_1323 §5).
 * 계열 이름은 이 화면의 지표 그 자체라(「걸어온 거리」) 끝이 잘리면 무엇의 배지인지 사라져서,
 * 긴 이름은 줄바꿈으로 전부 보여준다. 그래서 아주 긴 이름에서는 카드 높이가 한 줄 늘어난다.
 *
 * `condition`·`metric`을 받지 않는다 — 배지 이름이 지표를 말하고("걸어온 거리"),
 * 값 행이 조건을 말한다("120 / 150km"). 같은 말을 두 번 하지 않는다.
 *
 * 그리드(프로토타입 확정):
 *   카드   `[썸네일 44px][내용 1fr]` — 썸네일이 grid-row 1/-1로 걸려 **정렬 엣지가 하나만** 생긴다
 *   1행    `[52px 칩][1fr 이름][auto 카운터]` — 칩 폭이 고정이라 **칩이 있는 행끼리** 이름 시작
 *          x가 같다. 레벨이 없으면(`level == null`) 칩 칸 자체를 만들지 않는다(§2) — 빈
 *          `<span>`을 남기면 `columnGap`(8px)까지 여백으로 남아 이름이 안쪽으로 밀린다
 *   값 행  `[5ch][auto][1fr][auto]` — 현재값을 5ch 우측 정렬해 **`/` 구분자가 세로로 정렬**된다
 *
 * 진행 바는 `ProgressBar fillMode="track-gradient"` — 트랙 기준 그라데이션이라 fill 안에서
 * 그림이 압축되지 않는다(같은 티켓에서 ProgressBar에 추가한 모드).
 *
 * 썸네일: 다음 레벨 배지는 정의상 아직 미획득이라 **grayscale(1) 원본**으로 그린다
 * (2026-09-06 사용자 확정 — 어떤 배지인지 알아볼 수 있어야 한다).
 */
export function BadgeLevelGauge({
  /** 계열 이름 — 이 이름이 곧 지표다("걸어온 거리", "걸은 날들") */
  name,
  /** 지금까지 도달한 레벨(1부터). null이면 아직 Lv.1도 못 받은 상태라 칩을 그리지 않는다 */
  level,
  /** 현재 누적값 — 호출부가 이미 포맷한 문자열/숫자를 그대로 받는다(DS는 계산하지 않는다) */
  current,
  /** 다음 레벨 목표값(단위 포함 문자열 허용 — "150km") */
  next,
  /** 남은 양("30km 남음" 등 완성 문장). null이면 그리지 않는다 */
  left,
  /** 0~1 진행률. 계산 계층이 만든 값을 그대로 쓴다("작을수록 좋음" 축 때문에 재계산 금지) */
  fraction,
  /** 다음 레벨 배지 이미지. 미획득이라 grayscale(1)로 그린다 */
  imageUrl = /** @type {string | null} */ (null),
  /** 이미지 대체 텍스트. 생략하면 `name`을 쓴다 */
  alt = /** @type {string | null} */ (null),
  className = '',
  style = {},
}) {
  // 칩을 실제로 그릴 때만 52px 칸을 잡는다 — `BadgeLevelChip`은 level이 null이면 아무것도
  // 그리지 않으므로 조건이 곧 「칩이 있는가」다(§2).
  const showChip = level != null;
  const clamped = Math.min(1, Math.max(0, fraction ?? 0));
  const done = clamped >= 1;
  const valueColor = done ? 'var(--status-done-solid)' : 'var(--status-short-solid)';

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr',
        columnGap: 'var(--spacing-12)',
        alignItems: 'start',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      {/* grid-row 1/-1 — 썸네일이 내용 전체 높이에 걸려 왼쪽 정렬 엣지를 하나만 만든다 */}
      <span
        style={{
          gridColumn: 1, gridRow: '1 / -1',
          width: 44, height: 44, flex: 'none',
          borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              width: '100%', height: '100%', objectFit: 'contain', padding: 3,
              borderRadius: 'var(--radius-sm)', filter: 'grayscale(1)',
            }}
          />
        ) : (
          <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
        )}
      </span>

      <div style={{ gridColumn: 2, minWidth: 0 }}>
        {/* 1행 — [52px 칩][1fr 이름][auto 카운터] */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: showChip ? '52px 1fr auto' : '1fr auto',
            columnGap: 'var(--spacing-8)', alignItems: 'center',
          }}
        >
          {showChip && <BadgeLevelChip level={level} />}
          <span
            style={{
              fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.3,
              color: 'var(--color-text)', minWidth: 0,
              // 말줄임을 쓰지 않는다(§5) — 이름이 곧 지표라 끝이 잘리면 안 된다.
              // keep-all로 한글은 어절 단위로만 끊는다.
              wordBreak: 'keep-all',
            }}
          >
            {name}
          </span>
          <span />
        </div>

        {/* 값 행 — [5ch][auto][1fr][auto] */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '5ch auto 1fr auto',
            columnGap: 6, alignItems: 'baseline', marginTop: 'var(--spacing-8)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span
            style={{
              // 5ch 우측 정렬이 이 그리드의 요점이다 — 자릿수가 달라도 `/`가 세로로 정렬된다.
              textAlign: 'right', fontSize: 'var(--text-small)', fontWeight: 700,
              color: valueColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {current}
          </span>
          <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>/</span>
          <span style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {next}
          </span>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            {left}
          </span>
        </div>

        <div style={{ marginTop: 'var(--spacing-8)' }}>
          <ProgressBar
            percent={clamped * 100}
            fillMode="track-gradient"
            trackColor="var(--status-idle-track)"
            height={6}
            radius="var(--radius-xs)"
          />
        </div>
      </div>
    </div>
  );
}
