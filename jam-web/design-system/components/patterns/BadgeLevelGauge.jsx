import React from 'react';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';
import { BadgeSilhouette } from '../cards/BadgeSilhouette.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';

/**
 * BadgeLevelGauge — 무한레벨형 계열 한 줄. 티켓 20260905_0036.
 *
 * v5는 194계열 630종이고 그중 무한레벨형이 193종이다. 레벨을 눈금으로 늘어놓으면
 * 계열 하나가 Lv.1~8(지금 시딩된 범위)만으로도 화면 한 페이지를 먹고, 레벨 상한이 없으니
 * 앞으로 더 늘어난다. **그래서 이 컴포넌트는 레벨 수와 무관하게 높이가 고정이다** —
 * 지나온 레벨을 하나도 그리지 않고 «지금 레벨 · 다음 목표 · 남은 양» 세 가지만 말한다.
 * 이름 줄을 1줄 말줄임으로 못 박아 계열 이름 길이로도 높이가 흔들리지 않는다.
 *
 * `condition`·`metric`을 받지 않는다 — 배지 이름이 지표를 말하고("걸어온 거리"),
 * 값 행이 조건을 말한다("120 / 150km"). 같은 말을 두 번 하지 않는다.
 *
 * 그리드(프로토타입 확정):
 *   카드   `[썸네일 44px][내용 1fr]` — 썸네일이 grid-row 1/-1로 걸려 **정렬 엣지가 하나만** 생긴다
 *   1행    `[52px 칩][1fr 이름][auto 카운터]` — 칩 폭이 고정이라 이름 시작 x가 모든 계열에서 같다
 *   값 행  `[5ch][auto][1fr][auto]` — 현재값을 5ch 우측 정렬해 **`/` 구분자가 세로로 정렬**된다
 *
 * 진행 바는 `ProgressBar fillMode="track-gradient"` — 트랙 기준 그라데이션이라 fill 안에서
 * 그림이 압축되지 않는다(같은 티켓에서 ProgressBar에 추가한 모드).
 *
 * 썸네일: 다음 레벨 배지는 정의상 아직 미획득이라 **외형을 공개하지 않는다** —
 * 원본 URL을 받지 않고 `BadgeSilhouette`을 그린다(`imageUrl` prop 자체가 없다).
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
  /** 썸네일 자리에 미획득 실루엣을 그릴지. 기본 true */
  silhouette = true,
  className = '',
  style = {},
}) {
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
        {silhouette && <BadgeSilhouette size={30} />}
      </span>

      <div style={{ gridColumn: 2, minWidth: 0 }}>
        {/* 1행 — [52px 칩][1fr 이름][auto 카운터] */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '52px 1fr auto',
            columnGap: 'var(--spacing-8)', alignItems: 'center',
          }}
        >
          <BadgeLevelChip level={level} />
          <span
            style={{
              fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.3,
              color: 'var(--color-text)', minWidth: 0,
              // 1줄 말줄임 — 이름 길이로 카드 높이가 흔들리면 "레벨 수와 무관하게 높이 고정"이
              // 깨진다. 계열 이름은 전체가 `title`로도 남는다.
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={name}
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
