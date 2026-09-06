import React from 'react';
import { RarityBadge, getRarityLabel } from '../cards/RarityBadge.jsx';
import { LockGlyph, CheckGlyph, StarGlyph } from '../icons/BadgeStatusGlyphs.jsx';
import { BadgeFamilyCardHeader, progressRampColor } from './BadgeFamilyCardHeader.jsx';

/**
 * BadgeStageRail — 계열(같은 이름, 등급별 눈금) 진행 레일. 티켓 20260903_2329 (1차: 구조 전환).
 *
 * 배지 트리는 원래 등급 우선으로 배지를 평탄하게 나열했다 — 같은 계열의 Common~Mystic
 * 4장이 화면 전역에 흩어져 위계·진행 감각이 없었다. 이 컴포넌트는 계열 하나 = 레일 하나로
 * 묶어, 눈금(등급)과 그 사이 연결선(게이트)으로 "지금 어디까지 왔는가"를 한 줄로 보여준다.
 *
 * 눈금 상태는 이번 범위에서 4종만 지원한다:
 *   earned       — 획득. 원본 컬러 + 라임 링 + 체크 마커.
 *   ready        — 조건은 채웠지만 게이트(미션·선행배지)가 안 열림. 그레이 + 라임 링 +
 *                  자물쇠 마커. "조건을 다 채웠어요" 라벨.
 *   locked       — 조건도 게이트도 안 열림. 그레이 + 중성 얇은 링 + 자물쇠 마커.
 *   not-reached  — 게이트가 이미 열려 있고 막고 있는 게 없지만 아직 도달 전. 그레이 +
 *                  중성 얇은 링, 마커 없음. 캡션은 **그 눈금의 조건값**(`stop.conditionText`,
 *                  「4km」·「6일 연속 · 5회」)이고, 조건값이 없으면 "—" 라벨이다
 *                  (티켓 20260906_1323 §7 — 조건을 해석하지는 않는다, 완성 문자열만 받는다).
 * ready/locked를 가르는 "조건"은 이 컴포넌트가 계산하지 않는다 — 호출부가 기존
 * evaluateConditionDetailed pass/fail을 넘겨준다.
 *
 * 진행 수치(2c, 티켓 20260904_0921): 프런티어(다음 목표) 눈금 하나에만 `frontierProgress`
 * prop으로 붙는다. 문구 조립은 이 컴포넌트가 하지 않는다 — 호출부가 완성 문자열을 만들어
 * 넘긴다(프레젠테이션 전용 원칙 유지, `src/lib/badgeProgressText.ts` 참고).
 *
 * 배지 이미지 색 규칙(예외 없음): 미획득 = grayscale(1), 획득 = 원본 컬러. 필터는 이미지
 * 요소에만 걸고 링·마커에는 걸지 않는다 — MissionCard.jsx의 잠금 오버레이와 같은 원칙.
 * (2026-09-06 사용자 확정: 미획득도 원본 이미지를 그레이로 보여준다.)
 *
 * ## v5 — 정렬 엣지 통합·고정 기하 (티켓 20260906_2140)
 *
 * 실측으로 확정된 결함 두 가지를 구조로 막는다:
 *
 * 1. **헤더를 직접 그리지 않는다.** 계열명 시작 x가 패턴마다 32/88/16px로 갈라져 있었다 —
 *    공유 부품 `BadgeFamilyCardHeader` 하나만 쓴다.
 * 2. **글자가 기하를 움직이지 못하게 분리한다.** 눈금 열이 `flex:none; minWidth:48`인데
 *    캡션이 `maxWidth:92`까지 번져 **열 폭을 캡션 글자 수가 정했다** — 한 화면 네 카드에서
 *    연결선 폭이 37/25/21/14px로 벌어졌다. 이제 눈금은 `repeat(n, 1fr)` **균등 그리드**이고
 *    연결선은 그 위에 **절대 배치**된 별도 레이어다. 캡션이 몇 글자든 기하가 흔들리지 않는다.
 * 3. **캡션 자리 2줄 높이를 상시 예약**한다(같은 레일 안에서 눈금 열 높이가 86/101/115px로
 *    어긋나던 문제). 등급칩 자리도 마찬가지로 항상 예약한다.
 *
 * 함께 바뀐 값: 썸네일 44→52px, 연결선 6→8px, 캡션 `--text-micro`→`--text-caption`
 * (진행 앵커 캡션만 `--text-small`/700), 등급칩 `size="md"`, 배지 이미지는 여백 없이
 * 프레임을 꽉 채운다(`objectFit: cover` + 프레임 `overflow: hidden`).
 *
 * 인터랙션: 눈금 하나는 상태에 따라 링크(embedded 이동, earned/not-reached) 또는
 * 버튼(받는 방법 시트 오픈, ready/locked) 둘 중 하나다 — 앵커 안에 버튼을 중첩하지
 * 않기 위한 설계. "레일에는 지금 막는 문 하나만 그린다" — 마지막 획득 눈금 다음(frontier)이
 * ready/locked일 때만 그 앞 연결선에 점선+자물쇠(게이트)를 그린다.
 */

// 등급 라벨은 RarityBadge.jsx의 config가 MODULAR 단일 소스다 — 여기서 다시 선언하지 않는다
// (티켓 20260905_0027: 같은 표가 5곳에 복사돼 있었고, 20260813_003에서 실제로 3곳 누락 사고가 났다).
// 문구는 UX_WRITING_GUIDELINE.md 갱신분(커밋 00ead78f)을 따른다 — 「충족」은 폐지어다.
const STATUS_LABEL = { earned: '획득', ready: '조건을 다 채웠어요', locked: '잠김', 'not-reached': '—' };

/**
 * 보조기술용 상태 라벨 — 화면 라벨과 갈라 둔다(티켓 20260906_1323 §7).
 * `not-reached`의 화면 라벨은 `'—'`(또는 조건값)이라 그대로 읽히면 스크린리더가 「—」를
 * 읽는다. aria에서는 상태를 말로 남기고, 조건값은 그 뒤에 덧붙인다.
 */
const STATUS_ARIA_LABEL = { earned: '획득', ready: '조건을 다 채웠어요', locked: '잠김', 'not-reached': '아직' };

/** 눈금 최대 개수 — 등급은 Common~Mystic 4단계뿐이다. */
const MAX_STOPS = 4;

/**
 * 썸네일 한 변과 연결선 숨은 **CSS 변수**로 둔다 — 컨테이너 폭에 따라 한 번에 줄어들어야
 * 하기 때문이다(아래 STATIC_CSS의 컨테이너 쿼리). 연결선 폭이 이 두 값에서 계산되므로
 * JS 상수로 박아 두면 좁은 화면에서 연결선이 **0px가 된다**:
 *   320px 화면 → 카드 안쪽 폭 256px ÷ 4열 = 64px, 64 - 52(썸네일) - 12(숨×2) = **0**.
 * 실측으로 확인한 값이라 주석으로 남긴다. 지금 값에서 연결선은 375px에서 18px,
 * 320px에서 14px이고 **한 화면 안에서는 항상 같다**(그게 이번 티켓의 요구사항이다).
 */
const THUMB_VAR = 'var(--ds-rail-thumb)';
const GAP_VAR = 'var(--ds-rail-gap)';

/** 연결선 두께. 6→8px. */
const CONNECTOR_HEIGHT = 8;

/**
 * 등급칩 자리의 예약 높이 — `RarityBadge size="md"`의 렌더 높이(패딩 5px×2 + 11px 폰트·
 * line-height 1 = 21px)와 맞춘다. common은 `RarityBadge`가 null을 반환해 칩이 안 보이지만,
 * 자리는 항상 이 높이만큼 예약해야 같은 레일 안에서 등급마다 캡션 시작 위치가 어긋나지 않는다.
 */
const RARITY_CHIP_SLOT_HEIGHT = 22;

/**
 * 캡션 자리의 예약 높이 — **2줄 상시 예약**(티켓 20260906_2140).
 * 진행 앵커 캡션이 `--text-small`(14px)/line-height 1.3이라 2줄이 36.4px다. 캡션 글자 수에
 * 따라 눈금 열 높이가 86/101/115px로 어긋나던 문제를 이 상수 하나로 없앤다.
 */
const CAPTION_SLOT_HEIGHT = 37;

const STATIC_CSS = `
.ds-rail{container-type:inline-size}
.ds-rail-scale{--ds-rail-thumb:52px;--ds-rail-gap:4px}
/* 좁은 카드(320px 화면 = 카드 안쪽 288px)에서는 썸네일·숨을 함께 줄인다. 그러지 않으면
   4열 균등 그리드에서 연결선 폭이 0이 되어 레일이 「점 네 개」로 보인다(실측). */
@container (max-width: 300px){.ds-rail-scale{--ds-rail-thumb:44px;--ds-rail-gap:3px}}
.ds-rail-stop{transition:scale var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1));text-decoration:none;color:inherit}
.ds-rail-stop:active{scale:var(--scale-press,0.96)}
button.ds-rail-stop{background:none;border:none;padding:0;font:inherit;cursor:pointer}
.ds-rail-lock-btn{background:none;border:none;padding:0;color:inherit;font:inherit;cursor:pointer;position:relative;pointer-events:auto}
.ds-rail-lock-btn::after{content:"";position:absolute;inset:-13px}
.ds-rail-gate-link{background:repeating-linear-gradient(90deg, rgba(255,255,255,.26) 0 4px, transparent 4px 8px)}
@media (prefers-reduced-motion: reduce){.ds-rail-stop{transition:none!important}}
`;

const GATE_KIND_LABEL = { mission: '미션', cross: '선행 배지' };

/**
 * 눈금 하나의 배지 썸네일 — 접힌 레일·펼친 티어 목록이 공유한다.
 * 52px 썸네일 + (등급이 있고 `showRarityChip`이면) 그 아래 등급칩까지가 한 덩어리다.
 *
 * 이미지는 **여백 없이 프레임을 꽉 채운다**(티켓 20260906_2140 F-3) — `padding: 0` +
 * `objectFit: cover`, 모서리는 **프레임의 `overflow: hidden`으로만** 자른다. 이미지에
 * 따로 `border-radius`를 걸면 두 radius가 어긋나 모서리가 삐져나온다.
 */
function StopThumbnail({ imageUrl, alt, status, rarity, showRarityChip = false }) {
  const earned = status === 'earned';
  const ringColor = status === 'earned' || status === 'ready' ? 'var(--status-progress-done)' : 'var(--color-border-light)';
  const ringWidth = status === 'earned' || status === 'ready' ? 2 : 1;
  const showMarker = status === 'earned' || status === 'ready' || status === 'locked';

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)', flex: 'none' }}>
      <span
        style={{
          position: 'relative', width: THUMB_VAR, height: THUMB_VAR, flex: 'none',
          borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // 이미지를 꽉 채우므로 자르는 일은 프레임이 전담한다.
          overflow: 'hidden',
          boxShadow: `inset 0 0 0 ${ringWidth}px ${ringColor}`,
          color: 'var(--color-text)',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다(BadgeGridCard.jsx와 동일 컨벤션)
          <img
            src={imageUrl}
            alt={alt}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', padding: 0,
              display: 'block',
              // 미획득 그레이스케일은 유지한다(2026-09-06 사용자 확정) — 꽉 채우기로
              // 바꾸는 과정에서 필터가 유실되지 않게 한다(F-5).
              filter: earned ? 'none' : 'grayscale(1)',
            }}
          />
        ) : (
          <span style={{ width: 24, height: 24, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
        )}
        {showMarker && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-surface-elevated)',
              background: status === 'earned' ? 'var(--status-progress-done)' : 'var(--color-base-grey-700)',
              color: status === 'earned' ? '#000' : 'var(--color-text-secondary)',
            }}
          >
            {status === 'earned' ? <CheckGlyph size={10} /> : <LockGlyph size={10} />}
          </span>
        )}
      </span>
      {/* 등급칩 자리 — showRarityChip이면 항상 같은 높이를 예약한다. common은 RarityBadge가
          자체적으로 null을 반환하므로(노이즈 축소 관례) 칩 자체는 안 보이지만, 자리를 비워
          두면 같은 레일 안에서 Common 눈금만 캡션이 위로 붙어 탭 타깃 높이가 어긋난다. */}
      {showRarityChip && (
        <span style={{ display: 'flex', alignItems: 'center', minHeight: RARITY_CHIP_SLOT_HEIGHT }}>
          {rarity && <RarityBadge rarity={rarity} size="md" />}
        </span>
      )}
    </span>
  );
}

/** 상태에 따라 링크(이동) 또는 버튼(받는 방법 시트 오픈) 중 하나로만 렌더 — 앵커 중첩 버튼 금지. */
function StopHitArea({ status, href, onOpenLock, ariaLabel, children }) {
  if (status === 'ready' || status === 'locked') {
    return (
      <button type="button" className="ds-rail-stop" onClick={onOpenLock} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} className="ds-rail-stop" aria-label={ariaLabel}>
      {children}
    </a>
  );
}

export function BadgeStageRail({
  familyName,
  /**
   * [{ id, rarity, imageUrl, description, status, href, gates?, conditionText? }] — Common→Mystic 순,
   * 존재하는 등급만. **최대 4개**(등급이 4단계뿐이다 — 아래 상한 검사 참고).
   */
  stops,
  /**
   * 반복형 계열의 누적 획득 횟수 — 헤더 메타 줄 앞에 `×N` 칩 하나로만 그린다.
   * 점 그리드를 쓰지 않는 이유는 `BadgeStampRow` 주석 참고. null이면 그리지 않는다.
   */
  // JSDoc 캐스팅이 필요하다 — `= null` 기본값만 두면 JS 추론이 프롭 타입을 정확히 `null`
  // 하나로 좁혀, 숫자를 넘기는 호출부가 타입 에러가 난다.
  earnCount = /** @type {number | null} */ (null),
  /**
   * 다음으로 노려야 할 등급 라벨("Epic" 등). 전부 획득했으면 null.
   * 기본값을 두지 않는다 — `= null` 기본값은 JS 추론이 타입을 `null` 하나로 좁힌다.
   */
  nextRarityLabel,
  /**
   * 헤더 우측 진행률(0~1). null이면 퍼센트를 적지 않는다(진행 계산 불가).
   * `frontierProgress.fraction`과 같은 값이지만 **헤더는 별도 prop으로 받는다** — 진행 앵커가
   * 없는 계열(전부 획득)에서도 헤더는 그려져야 하기 때문이다.
   */
  headerFraction = /** @type {number | null} */ (null),
  /** 헤더 퍼센트 옆 라벨 — 보통 다음 등급명(`Epic`). 완성 문자열만 받는다 */
  headerLabel = /** @type {string | null} */ (null),
  /** 헤더 2행(메타 줄) 완성 문자열. null이면 그리지 않는다 */
  headerMeta = /** @type {React.ReactNode} */ (null),
  expanded = false,
  onToggleExpand = () => {},
  /**
   * (stopId) => void — ready/locked 눈금(또는 그 앞 게이트) 탭 시 받는 방법 시트 요청.
   * 기본값을 두지 않는다 — 0-인자 기본값을 두면 JS 추론이 프롭 타입을 좁혀
   * `(stopId) => ...` 형태의 실제 호출부가 타입 에러가 난다.
   */
  onLockClick,
  /**
   * 프런티어(다음 목표) 눈금의 진행 표시. null이면 상태 라벨만 그린다.
   * `{ text, fraction, muted? }` — text는 STATUS_LABEL을 대체할 완성 문자열,
   * fraction(0~1)은 프런티어 앞 연결선 비례 채움, muted는 §08 H(진행 미지원) 전용.
   * 기본값을 두지 않는다 — 위와 같은 이유.
   */
  frontierProgress,
  /**
   * **진행 표시 앵커** 눈금 id — `frontierProgress`를 어느 눈금에 그릴지 (티켓 20260906_1323 §8).
   * null이면 첫 미획득 눈금에 그린다.
   */
  progressStopId,
  /**
   * 기록형 "아쉬움 줄"(§05) — 계열당 최대 1줄. null이면 렌더하지 않는다.
   * 기본값을 두지 않는다 — 위와 동일한 이유.
   */
  regretLine,
  /**
   * 카드 안쪽 아래에 붙는 보조 구획 — 2축형 게이지(`DualAxisGauge`)가 여기로 들어온다
   * (티켓 20260906_2140: 별도 카드에서 **레일 카드 안의 구획**으로). null이면 없다.
   * 기본값을 두지 않는다 — 위와 동일한 이유.
   */
  secondarySection,
  className = '',
  style = {},
}) {
  // 4눈금 상한을 코드로 강제한다(v2). 레일은 등급 4단계 전용 구조라, v5 무한레벨형
  // (지금 Lv.1~8까지 시딩, 상한 없음)을 실수로 여기에 넘기면 눈금이 가로로 밀려나
  // 화면이 조용히 망가진다. 개발 빌드에서만 던진다 — 레벨형은 `BadgeLevelGauge`를 쓴다.
  if (
    stops.length > MAX_STOPS &&
    typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production'
  ) {
    throw new Error(
      `BadgeStageRail: 눈금은 최대 ${MAX_STOPS}개다(등급 4단계). 받은 값 ${stops.length}개 — familyName="${familyName}". 무한레벨형은 BadgeLevelGauge를 쓰세요.`
    );
  }

  // **프로덕션 방어선**(티켓 20260905_0037). 위 throw는 개발 빌드 전용이다.
  const visibleStops = stops.length > MAX_STOPS ? stops.slice(0, MAX_STOPS) : stops;
  const columnCount = Math.max(1, visibleStops.length);

  const frontierIndex = visibleStops.findIndex((s) => s.status !== 'earned');
  // 진행 표시가 붙는 자리. 호출부가 지정하지 않으면 첫 미획득 눈금이다.
  const progressIndex = progressStopId != null ? visibleStops.findIndex((s) => s.id === progressStopId) : -1;
  const progressAnchorIndex = progressIndex >= 0 ? progressIndex : frontierIndex;
  const earnedCount = visibleStops.filter((s) => s.status === 'earned').length;
  const summarySentence =
    nextRarityLabel == null
      ? `${familyName}, 모두 획득했어요.`
      : `${familyName}, ${visibleStops.length}단계 중 ${earnedCount}단계 획득. 다음 단계 ${nextRarityLabel}.`;

  /**
   * 연결선 레이어 — **글자와 완전히 분리된 고정 기하**가 이번 개편의 핵심이다.
   * 눈금 열이 `1fr` 균등이므로 i번째 열의 중심은 `((i + 0.5) / n) * 100%`다. 연결선은
   * 이웃한 두 중심 사이를 잇고, 썸네일 반지름 + 숨만큼 양쪽을 물린다. 캡션이 몇 줄이든
   * 이 값들은 변하지 않는다.
   */
  const connectorInset = `calc(${THUMB_VAR} / 2 + ${GAP_VAR})`;
  const connectors = visibleStops.slice(1).map((stop, idx) => {
    const i = idx + 1; // 이 연결선의 오른쪽 눈금 인덱스
    const isGateBefore = i === frontierIndex && (stop.status === 'locked' || stop.status === 'ready');
    const isFrontierConnector = i === progressAnchorIndex && !isGateBefore;
    const allEarnedBefore = frontierIndex === -1 || i < frontierIndex;
    const pct =
      isFrontierConnector && frontierProgress && typeof frontierProgress.fraction === 'number' && !frontierProgress.muted
        ? Math.round(Math.min(1, Math.max(0, frontierProgress.fraction)) * 100)
        : 0;
    // 게이트 종류(v2). 최대 2개만 그린다 — 그보다 많은 문을 한 자리에 늘어놓으면
    // "어디서 막혔는지"가 오히려 안 읽힌다(원 검토문서 §04와 같은 이유).
    const gates = (stop.gates ?? []).slice(0, 2);
    const rarityLabel = stop.rarity ? getRarityLabel(stop.rarity) : null;
    const stopName = [familyName, rarityLabel].filter(Boolean).join(' ');
    const gateAriaLabel =
      gates.length > 0
        ? `${stopName} 받는 방법 보기. ${gates
            .map((g) => `${GATE_KIND_LABEL[g.kind] ?? g.kind} ${g.met ? '통과' : '대기'}`)
            .join(', ')}`
        : `${stopName} 받는 방법 보기`;
    return { key: stop.id, i, isGateBefore, allEarnedBefore, isFrontierConnector, pct, gates, gateAriaLabel, stopId: stop.id };
  });

  return (
    <div
      className={`ds-rail ${className}`}
      style={{
        position: 'relative', borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <style>{STATIC_CSS}</style>
      {/* 기하 스케일 변수를 여는 래퍼 — 컨테이너 쿼리는 «자기 자신»을 질의할 수 없으므로
          변수는 컨테이너(.ds-rail)의 **자손**에 선언해야 한다. */}
      <div className="ds-rail-scale">

      <BadgeFamilyCardHeader
        name={familyName}
        fraction={headerFraction}
        pctLabel={headerLabel}
        done={nextRarityLabel == null}
        metaText={
          earnCount != null ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-8)' }}>
              <span
                aria-label={`누적 ${earnCount}회`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '3px 8px', borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--text-micro)', lineHeight: 1, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  background: 'var(--status-idle-track)', color: 'var(--color-text)',
                }}
              >
                ×{earnCount}
              </span>
              {headerMeta}
            </span>
          ) : (
            headerMeta
          )
        }
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        toggleAriaPrefix={familyName}
      />

      <div style={{ position: 'relative', marginTop: 'var(--spacing-16)' }}>
        {/* 연결선 레이어 — 절대 배치. 캡션 글자 수가 이 기하를 움직이지 못한다.
            레이어 자체는 클릭을 통과시키고, 게이트 버튼만 pointer-events를 되살린다. */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {connectors.map((c) => (
            <span
              key={c.key}
              className={c.isGateBefore ? 'ds-rail-gate-link' : undefined}
              style={{
                position: 'absolute',
                left: `calc(${(((c.i - 1) + 0.5) / columnCount) * 100}% + ${connectorInset})`,
                width: `calc(${(1 / columnCount) * 100}% - 2 * (${connectorInset}))`,
                top: `calc(${THUMB_VAR} / 2 - ${CONNECTOR_HEIGHT / 2}px)`,
                height: CONNECTOR_HEIGHT,
                borderRadius: 'var(--radius-xs)',
                background: c.isGateBefore
                  ? undefined
                  : c.allEarnedBefore
                    ? 'var(--status-progress-done)'
                    : 'var(--status-idle-track)',
                overflow: c.isGateBefore ? 'visible' : 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* 비례 채움 — 스윕을 트랙 전체에 깔고 clip-path로 자른다(토큰 단일 정의).
                  `width: N%` + 그라데이션으로 하면 그림이 채움 안에서 압축돼 진행 감각이 사라진다. */}
              {c.isFrontierConnector && !c.isGateBefore && c.pct > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 'var(--radius-xs)',
                    background: 'var(--status-progress-sweep)',
                    clipPath: `inset(0 ${100 - c.pct}% 0 0)`,
                  }}
                />
              )}
              {c.isGateBefore && (
                <button
                  type="button"
                  className="ds-rail-lock-btn"
                  onClick={() => onLockClick?.(c.stopId)}
                  aria-label={c.gateAriaLabel}
                  style={{
                    // 자물쇠 2개(미션 + 교차)까지 들어가는 자리. 종류를 안 넘기면(v1 호출부)
                    // 예전처럼 원형 자물쇠 하나만 그린다.
                    height: 20, minWidth: 20, padding: c.gates.length > 1 ? '0 3px' : 0,
                    borderRadius: c.gates.length > 1 ? 'var(--radius-pill)' : '50%',
                    background: 'var(--color-surface-elevated)',
                    boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {c.gates.length === 0 ? (
                    <LockGlyph size={10} />
                  ) : (
                    c.gates.map((gate, gi) =>
                      // 이미 통과한 문은 **체크 + 라임**이다 — 형태까지 바꿔 색만으로
                      // 구분하지 않는다(미션 자물쇠 대비가 4.18:1이라 색 하나에 기댈 수 없다).
                      gate.met ? (
                        <span key={`${gate.kind}-${gi}`} style={{ display: 'flex', color: 'var(--status-progress-done)' }}>
                          <CheckGlyph size={10} />
                        </span>
                      ) : gate.kind === 'mission' ? (
                        <span key={`${gate.kind}-${gi}`} style={{ display: 'flex', color: 'var(--color-primary)' }}>
                          <LockGlyph size={10} />
                        </span>
                      ) : (
                        <span key={`${gate.kind}-${gi}`} style={{ display: 'flex', color: 'var(--color-text-secondary)' }}>
                          <StarGlyph size={10} />
                        </span>
                      )
                    )
                  )}
                </button>
              )}
            </span>
          ))}
        </div>

        {/* 눈금 — 균등 n열 그리드. 열 폭이 캡션 글자 수와 무관하게 고정된다. */}
        <div
          role="group"
          aria-label={summarySentence}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columnCount}, 1fr)`, alignItems: 'start' }}
        >
          {visibleStops.map((stop, i) => {
            const rarityLabel = stop.rarity ? getRarityLabel(stop.rarity) : null;
            // 등급이 없는 배지(무한레벨형)는 rarityLabel이 null이다 — 조각을 뺀다.
            const stopName = [familyName, rarityLabel].filter(Boolean).join(' ');
            const showProgress = frontierProgress != null && i === progressAnchorIndex;
            // 아직 도달하지 않은 눈금은 상태 라벨 자리에 **조건값**을 그린다(§7).
            const showConditionText =
              !showProgress && stop.status === 'not-reached' && stop.conditionText != null;
            const stopAriaLabel =
              (stop.status === 'ready' || stop.status === 'locked'
                ? `${stopName}, ${STATUS_ARIA_LABEL[stop.status]}. 받는 방법 보기`
                : `${stopName}, ${STATUS_ARIA_LABEL[stop.status]}`) +
              (showConditionText ? `. 조건 ${stop.conditionText}` : '') +
              (showProgress ? `. ${frontierProgress.text}` : '') +
              (showProgress && regretLine ? `. ${regretLine}` : '');

            const captionText = showProgress
              ? frontierProgress.text
              : showConditionText
                ? stop.conditionText
                : STATUS_LABEL[stop.status];
            // 상태 램프(티켓 20260906_2140 A) — 진행 앵커는 진행률이 색을 정하고, 나머지
            // 눈금은 획득/조건 완료면 done, 그 외는 idle이다.
            const captionColor = showProgress
              ? frontierProgress.muted
                ? 'var(--status-progress-idle)'
                : progressRampColor(frontierProgress.fraction)
              : stop.status === 'earned' || stop.status === 'ready'
                ? 'var(--status-progress-done)'
                : 'var(--status-progress-idle)';

            return (
              <div key={stop.id} style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                <StopHitArea
                  status={stop.status}
                  href={stop.href}
                  onOpenLock={() => onLockClick?.(stop.id)}
                  ariaLabel={stopAriaLabel}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-8)', width: '100%' }}>
                    <StopThumbnail imageUrl={stop.imageUrl} alt={stopName} status={stop.status} rarity={stop.rarity} showRarityChip />
                    {/* 캡션 자리 — 2줄 높이 상시 예약. 글자 수가 눈금 열 높이를 못 바꾼다. */}
                    <span
                      style={{
                        display: 'block', minHeight: CAPTION_SLOT_HEIGHT, width: '100%',
                        // 진행 앵커 캡션만 한 단계 크고 굵다 — 「지금 내 차례」를 한 곳에만 준다.
                        fontSize: showProgress ? 'var(--text-small)' : 'var(--text-caption)',
                        fontWeight: showProgress ? 700 : 400,
                        lineHeight: 1.3,
                        // keep-all: "3일" 같은 수치+단위가 "3"/"일"로 쪼개지지 않게 한다.
                        wordBreak: 'keep-all', overflowWrap: 'anywhere',
                        textAlign: 'center',
                        // 기울임은 «임시 상태 표기»(「진행 표시 준비 중」) 전용이다.
                        fontStyle: showProgress && frontierProgress.pending ? 'italic' : 'normal',
                        color: captionColor,
                        // 0.7 감쇠는 정보 없는 '—' 글리프 전용이다 — 실제 조건값에 걸면
                        // WCAG AA(4.5:1) 미달이다(티켓 20260906_1424 ②).
                        opacity: !showProgress && stop.status === 'not-reached' && !showConditionText ? 0.7 : 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {captionText}
                    </span>
                  </span>
                </StopHitArea>
              </div>
            );
          })}
        </div>
      </div>

      {regretLine && (
        <p
          style={{
            margin: 'var(--spacing-12) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4,
            color: 'var(--status-progress-near)',
          }}
        >
          {regretLine}
        </p>
      )}

      {secondarySection}

      {expanded && (
        <div style={{ marginTop: 'var(--spacing-16)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          {visibleStops.map((stop) => {
            const rarityLabel = stop.rarity ? getRarityLabel(stop.rarity) : null;
            const stopName = [familyName, rarityLabel].filter(Boolean).join(' ');
            const canOpenLock = stop.status === 'ready' || stop.status === 'locked';
            // 접힌 레일과 같은 규칙 — not-reached인데 조건값이 있으면 「—」 대신 조건값.
            const expandedStatusText =
              stop.status === 'not-reached' && stop.conditionText != null ? stop.conditionText : STATUS_LABEL[stop.status];
            return (
              <div key={stop.id} style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'flex-start' }}>
                <StopThumbnail imageUrl={stop.imageUrl} alt={stopName} status={stop.status} rarity={stop.rarity} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RarityBadge rarity={stop.rarity} size="md" />
                    {canOpenLock && (
                      <button
                        type="button"
                        className="ds-rail-lock-btn"
                        onClick={() => onLockClick?.(stop.id)}
                        aria-label={[rarityLabel, '받는 방법 보기'].filter(Boolean).join(' ')}
                        style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
                      >
                        <LockGlyph size={14} />
                      </button>
                    )}
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0', fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.4,
                      color: stop.status === 'earned' || stop.status === 'ready' ? 'var(--status-progress-done)' : 'var(--status-progress-idle)',
                    }}
                  >
                    {expandedStatusText}
                  </p>
                  {stop.description && (
                    <p
                      style={{
                        margin: '4px 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.5,
                        color: 'var(--color-text-secondary)', whiteSpace: 'pre-line',
                      }}
                    >
                      {stop.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
