import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { ProgressBar } from '../feedback/ProgressBar.jsx';
import { CheckGlyph } from '../icons/BadgeStatusGlyphs.jsx';

/**
 * DualAxisGauge — 2축형(dual) 배지 전용 진행 게이지. 티켓 20260904_1058 (2d: 배지 트리
 * 리뉴얼 2차의 마지막 조각).
 *
 * `BadgeStageRail`(4등급 레일)은 그대로 두고, 프런티어(다음 목표)가 2축형일 때만 레일
 * 아래에 이 컴포넌트를 추가로 렌더한다(호출부: `BadgeFamilyRow.tsx`) — 레일을
 * 대체하지 않는다. "얇은 합성"이면 충분하다는 설계 그대로, 새 프리미티브 없이 기존 DS
 * `ProgressBar`(축 한 줄)·`RarityBadge`(등급 칩)만 조합한다.
 *
 * 구조(위→아래): 배지 썸네일(레일의 44px 눈금보다 큰 64px — "큰 사이즈" 요구) + 등급 칩 +
 * 축 2줄(라벨 + ProgressBar + "current/target unit" + 충족 시 체크 마커) + 규칙 문장
 * ("각각 다른 활동" / "한 번의 활동에서 동시에") + 병목 안내("{met인 축} 조건은 이미
 * 채웠어요", met인 축이 정확히 하나일 때만).
 *
 * 이 컴포넌트는 kind를 모른다 — `sameActivity`도 직접 받지 않고, 이미 완성된 `ruleText`/
 * `bottleneckNote` 문자열만 받는다(`src/lib/badgeProgressText.ts`의 `formatDualAxisGaugeProps()`
 * 가 조립). `axes[].fraction`도 계산 계층(`badgeProgress.ts`)이 만든 값을 그대로 받아
 * `ProgressBar`에 `percent`로 넘긴다 — "작을수록 좋음"(페이스)·한파(최고기온) 축은
 * current/target 단순 비율로 재계산하면 진행 바가 틀리게 그려지므로 반드시 이 값을 써야
 * 한다(계산 계층 주석 참고).
 *
 * 배지 이미지는 이 컴포넌트가 등장하는 시점(프런티어 = 아직 미획득)에는 항상 미획득
 * 상태이므로 `BadgeStageRail`과 같은 규칙(미획득 = `grayscale(1)` 원본)을 예외 없이
 * 적용한다 — `earned` prop을 따로 받지 않는다.
 * (20260905_0036이 한때 실루엣으로 바꿨다가 2026-09-06 사용자 확정으로 되돌렸다)
 *
 * 접근성: 인터랙티브 요소가 없는 정적 텍스트 블록이라(레일의 링크/버튼 눈금과 다름) 별도
 * `aria-label` 요약을 얹지 않는다 — 라벨·수치·규칙 문장·안내 문구가 전부 화면에 보이는
 * 실제 텍스트 노드라 스크린리더가 DOM 순서 그대로 읽어도 의미가 그대로 전달된다.
 *
 * ## v2 — 별도 카드에서 레일 카드 안의 «구획»으로 (티켓 20260906_2140)
 *
 * 예전에는 레일 카드 바로 아래에 **자기 배경·자기 패딩을 가진 두 번째 카드**로 떠 있었다.
 * 한 계열이 카드 두 장을 쓰니 세로 스캔에서 「계열 하나 = 카드 하나」 규칙이 깨졌다. 이제
 * 카드 껍데기를 벗고 1px 구분선 + 소제목만 두른 구획이 되어, 호출부가
 * `BadgeStageRail`의 `secondarySection`으로 **레일 카드 안에** 넣는다.
 *
 * 축 바는 8→10px, 채움은 `--status-progress-sweep`(`ProgressBar fillMode="track-gradient"`)이다
 * — 같은 화면 안에서 진행 채움이 여러 문법으로 갈라지지 않게 한다.
 *
 * 체크 글리프는 `icons/BadgeStatusGlyphs.jsx`(단일 소스)에서 가져온다.
 */

const THUMBNAIL_SIZE = 52;

function AxisRow({ label, rangeText, fraction, met }) {
  const color = met ? 'var(--status-progress-done)' : 'var(--status-progress-active)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 'var(--spacing-8)', alignItems: 'center' }}>
      <span
        style={{
          fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', flex: 'none',
          // break-word: 지금 라벨(한글 2~4자)엔 영향 없지만, 라틴 문자 섞인 라벨이 나중에
          // 추가돼도 단어 경계를 먼저 시도해 anywhere보다 방어적이다(인터랙션 리뷰 지적,
          // 티켓 20260904_1058).
          maxWidth: 64, overflowWrap: 'break-word',
        }}
      >
        {label}
      </span>
      <ProgressBar
        percent={fraction * 100}
        fillMode="track-gradient"
        trackColor="var(--status-idle-track)"
        height={10}
        radius="var(--radius-xs)"
      />
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none',
          fontSize: 'var(--text-caption)', fontWeight: 600, color,
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {rangeText}
        {met && <CheckGlyph size={11} />}
      </span>
    </div>
  );
}

export function DualAxisGauge({
  /** 배지 이미지. 이 컴포넌트는 정의상 미획득 시점이라 grayscale(1)로 그린다 */
  imageUrl,
  /** 이미지 대체 텍스트 */
  alt,
  rarity = 'common',
  /** [{ key, label, rangeText, fraction, met }, { ... }] — 항상 2개, formatDualAxisGaugeProps() 결과 그대로 */
  axes,
  /** "두 조건은 각각 다른 활동에서 채워도 돼요." / "한 번의 활동에서 두 조건을 동시에 채워야 해요." */
  ruleText,
  /** "{축} 조건은 이미 채웠어요." — met인 축이 정확히 하나일 때만. 그 외엔 null(렌더 안 함) */
  bottleneckNote,
  /** 구획 소제목 — 이 블록이 무엇에 대한 진행인지 한 마디로 말한다 */
  title = '두 조건 진행',
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      style={{
        // 카드가 아니라 «구획»이다 — 배경·그림자를 갖지 않고 1px 구분선으로만 갈린다.
        marginTop: 'var(--spacing-16)',
        paddingTop: 'var(--spacing-16)',
        borderTop: '1px solid var(--color-border-light)',
        ...style,
      }}
    >
      <p
        style={{
          margin: '0 0 var(--spacing-12)', fontSize: 'var(--text-micro)', fontWeight: 700,
          letterSpacing: '0.3px', color: 'var(--status-progress-idle)',
        }}
      >
        {title}
      </p>

      <div style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'flex-start' }}>
        <span
          style={{
            width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            // 레일의 StopThumbnail(44px)이 미획득 눈금에 항상 그리는 중성 얇은 링과 같은
            // 문법 — 이 컴포넌트의 64px 사본만 프레임 없이 떠 있으면 같은 배지가 화면에서
            // 두 가지로 보인다(인터랙션 리뷰 지적, 티켓 20260904_1058).
            boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
            color: 'var(--color-text)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
            <img
              src={imageUrl}
              alt={alt}
              style={{
                // 여백 없이 프레임을 꽉 채운다 — 모서리는 프레임의 overflow: hidden이 자른다
                // (이미지에 radius를 따로 걸면 두 radius가 어긋나 모서리가 삐져나온다).
                width: '100%', height: '100%', objectFit: 'cover', padding: 0,
                display: 'block', filter: 'grayscale(1)',
              }}
            />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 'var(--spacing-8)' }}>
            <RarityBadge rarity={rarity} size="md" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            {axes.map((axis) => (
              <AxisRow key={axis.key} label={axis.label} rangeText={axis.rangeText} fraction={axis.fraction} met={axis.met} />
            ))}
          </div>
        </div>
      </div>

      <p style={{ margin: 'var(--spacing-12) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
        {ruleText}
      </p>
      {bottleneckNote && (
        <p style={{ margin: 'var(--spacing-4) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4, color: 'var(--status-progress-done)' }}>
          {bottleneckNote}
        </p>
      )}
    </div>
  );
}
