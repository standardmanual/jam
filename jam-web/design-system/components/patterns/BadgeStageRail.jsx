import React from 'react';
import { RarityBadge, getRarityLabel } from '../cards/RarityBadge.jsx';

/**
 * BadgeStageRail — 계열(같은 이름, 등급별 눈금) 진행 레일. 티켓 20260903_2329 (1차: 구조 전환).
 *
 * 배지 트리는 원래 등급 우선으로 배지를 평탄하게 나열했다 — 같은 계열의 Common~Mystic
 * 4장이 화면 전역에 흩어져 위계·진행 감각이 없었다. 이 컴포넌트는 계열 하나 = 레일 하나로
 * 묶어, 눈금(등급)과 그 사이 연결선(게이트)으로 "지금 어디까지 왔는가"를 한 줄로 보여준다.
 *
 * 눈금 상태는 이번 범위에서 4종만 지원한다:
 *   earned       — 획득. 원본 컬러 + 라임 링 + 체크 마커.
 *   ready        — 조건은 채웠지만 게이트(미션·선행배지)가 안 열림. 실루엣 + 라임 링 +
 *                  자물쇠 마커. "조건 충족" 라벨.
 *   locked       — 조건도 게이트도 안 열림. 실루엣 + 중성 얇은 링 + 자물쇠 마커.
 *   not-reached  — 게이트가 이미 열려 있고 막고 있는 게 없지만 아직 도달 전. 실루엣 +
 *                  중성 얇은 링, 마커 없음. 캡션은 **그 눈금의 조건값**(`stop.conditionText`,
 *                  「4km」·「6일 연속 · 5회 충족」)이고, 조건값이 없으면 "—" 라벨이다
 *                  (티켓 20260906_1323 §7 — 조건을 해석하지는 않는다, 완성 문자열만 받는다).
 * ready/locked를 가르는 "조건"은 이 컴포넌트가 계산하지 않는다 — 호출부가 기존
 * evaluateConditionDetailed pass/fail을 넘겨준다.
 *
 * 진행 수치(2c, 티켓 20260904_0921): 프런티어(다음 목표) 눈금 하나에만 `frontierProgress`
 * prop으로 붙는다 — 누적/기록/주기 3종의 캡션 문구·연결선 비례 채움. 2축형·다중카운터형
 * 전용 강조 링·아크·게이지는 아직 없다(신규 게이지 컴포넌트가 필요한 2d 몫 — 그 경우
 * 호출부가 `frontierProgress`를 넘기지 않으면 이 컴포넌트는 1차와 동일하게 상태 라벨만
 * 그린다). 문구 조립은 이 컴포넌트가 하지 않는다 — 호출부가 완성 문자열을 만들어 넘긴다
 * (프레젠테이션 전용 원칙 유지, `src/lib/badgeProgressText.ts` 참고).
 *
 * 배지 이미지 색 규칙(예외 없음): 미획득 = grayscale(1), 획득 = 원본 컬러. 필터는 이미지
 * 요소에만 걸고 링·마커에는 걸지 않는다 — MissionCard.jsx의 잠금 오버레이와 같은 원칙.
 * (2026-09-06 사용자 확정: 미획득도 원본 이미지를 그레이로 보여준다. 티켓 20260905_0036이
 *  한때 실루엣으로 바꿨다가 되돌렸다 — 「외형 비공개」보다 배지를 알아볼 수 있는 쪽을 택했다)
 * 예전에는 원본 이미지를 그대로 넣고 `filter: grayscale(1)`만 걸었는데, 그러면 원본 URL이
 * 네트워크에 나가 「아직 안 보여준다」가 성립하지 않았다. 미획득 눈금은 이제 배지별 이미지를
 * 아예 요청하지 않는다 — 어떤 배지인지는 등급칩·`aria-label`·펼친 목록의 조건 문장이 말한다.
 *
 * v2에서 함께 들어온 것(같은 티켓):
 *   - `earnCount` — 반복형 계열의 누적 횟수를 **`×N` 칩 하나로만** 헤더 행 오른쪽 끝에.
 *   - 눈금별 **등급색 3px 바**(티켓 20260906_1436에서 등급칩으로 교체 — 아래 참고).
 *   - `stop.gates` — 게이트 종류를 배열로 받아 자물쇠(미션)·별(교차 계열)을 **한 자리에 최대 2개**
 *     그린다. 그래서 게이트 자리 폭이 36px → 44px이다.
 *   - **4눈금 상한을 코드로 강제** — 등급은 4단계뿐인데 v5 무한레벨형(Lv.1~8+)을 실수로
 *     이 레일에 밀어 넣으면 화면이 조용히 망가진다. 개발 빌드에서 즉시 에러를 던진다.
 *
 * v3에서 함께 들어온 것(티켓 20260905_0037):
 *   - **프로덕션에서도 상한을 자른다**(`visibleStops`). 위 throw는 개발 빌드 전용이고,
 *     `badgeTree.ts`의 등급 4회 루프가 하던 구조적 보장을 0037이 걷어냈다.
 *   - `stop.gates[].met` — 이미 통과한 문은 체크+라임으로 그린다. 없으면 미션을 이미 깬
 *     상태에서도 자물쇠 2개가 똑같이 그려져 「무엇이 남았나」가 안 읽혔다.
 *
 * v4에서 함께 들어온 것(티켓 20260906_1436 — 표시 층 정리, 발급·진행 계산은 무관):
 *   - 눈금별 등급색 3px 바를 **없앤다.** 접힌 레일은 그 자리에 `RarityBadge` 등급칩(압축형,
 *     `common`은 기존처럼 칩을 그리지 않는다)을 대신 그려 등급이 색뿐 아니라 텍스트로도
 *     바로 읽힌다. 펼친 목록은 이미 옆에 `RarityBadge` 칩이 있어 바 없이도 정보 손실이
 *     없다 — 그래서 `StopThumbnail`은 호출부가 `showRarityChip`으로 칩 렌더 여부를 고른다.
 *   - 펼친 목록의 상태 줄이 `not-reached`일 때도 접힌 레일과 같은 규칙으로 조건값
 *     (`stop.conditionText`)을 보여준다 — 예전엔 접힌 레일 캡션만 이 규칙을 따랐다.
 *   - 눈금 사이 연결선(게이트 자리)도 다른 연결선과 같은 `flex-grow`를 갖도록 맞춘다 —
 *     게이트 자리만 grow:0(고정 44px)이라 남는 공간이 일반 연결선에만 쏠려 레일 전체가
 *     한쪽으로 치우쳐 보였다.
 *   - 진행 중(조건 미충족)인 눈금의 캡션 색을 옐로우(`--status-short-solid`)에서 화이트
 *     (`--color-text`)로 바꾼다. 채움색(막대·연결선 그라데이션)은 그대로 옐로우를 쓴다 —
 *     텍스트 가독성만의 문제였다.
 *
 * 인터랙션: 눈금 하나는 상태에 따라 링크(embedded 이동, earned/not-reached) 또는
 * 버튼(잠금 해제 조건 시트 오픈, ready/locked) 둘 중 하나다 — 앵커 안에 버튼을 중첩하지
 * 않기 위한 설계. "레일에는 지금 막는 문 하나만 그린다" — 마지막 획득 눈금 다음(frontier)이
 * ready/locked일 때만 그 앞 연결선에 점선+자물쇠(게이트)를 그린다. 그 뒤 눈금은 각자 코너
 * 마커로만 잠김을 나타내고 연결선은 빈 트랙이다 — 문 여러 개를 한꺼번에 그리면 "어디서
 * 막혔는지"가 오히려 안 읽힌다(원 검토문서 §04).
 */

// 등급 라벨은 RarityBadge.jsx의 config가 MODULAR 단일 소스다 — 여기서 다시 선언하지 않는다
// (티켓 20260905_0027: 같은 표가 5곳에 복사돼 있었고, 20260813_003에서 실제로 3곳 누락 사고가 났다).
const STATUS_LABEL = { earned: '획득', ready: '조건 충족', locked: '잠김', 'not-reached': '—' };

/**
 * 보조기술용 상태 라벨 — 화면 라벨과 갈라 둔다(티켓 20260906_1323 §7).
 * `not-reached`의 화면 라벨은 `'—'`(또는 조건값)이라 그대로 읽히면 스크린리더가 「—」를
 * 읽는다. aria에서는 상태를 말로 남기고, 조건값은 그 뒤에 덧붙인다.
 */
const STATUS_ARIA_LABEL = { earned: '획득', ready: '조건 충족', locked: '잠김', 'not-reached': '미도달' };

/** 눈금 최대 개수 — 등급은 Common~Mystic 4단계뿐이다. */
const MAX_STOPS = 4;

/** 게이트 자리 폭. 자물쇠 2개(미션 + 교차)가 나란히 들어가야 해서 36px → 44px (v2). */
const GATE_SLOT_WIDTH = 44;

const STATIC_CSS = `
.ds-rail-header{background:none;border:none;padding:0;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;transition:opacity var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-rail-header:active{opacity:0.7}
.ds-rail-chevron{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-rail-stop{transition:scale var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1));text-decoration:none;color:inherit}
.ds-rail-stop:active{scale:var(--scale-press,0.96)}
button.ds-rail-stop{background:none;border:none;padding:0;font:inherit;cursor:pointer}
.ds-rail-lock-btn{background:none;border:none;padding:0;color:inherit;font:inherit;cursor:pointer;position:relative}
.ds-rail-lock-btn::after{content:"";position:absolute;inset:-13px}
.ds-rail-gate-link{background:repeating-linear-gradient(90deg, rgba(255,255,255,.26) 0 4px, transparent 4px 8px)}
@media (prefers-reduced-motion: reduce){.ds-rail-header,.ds-rail-chevron,.ds-rail-stop{transition:none!important}}
`;

function LockGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z" />
    </svg>
  );
}
function CheckGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}
/**
 * 교차 게이트(다른 계열의 선행 배지) 표식. 미션 게이트(자물쇠 + `--color-primary`)와
 * **형태로도** 갈라 둔다 — 미션 자물쇠의 대비가 4.18:1로 텍스트 기준에는 못 미쳐(비텍스트
 * 기준 3:1은 통과) 색 하나에만 의존하면 구분이 위태롭다.
 */
function StarGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="m354-247 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z" />
    </svg>
  );
}
const GATE_KIND_LABEL = { mission: '미션', cross: '선행 배지' };
function ChevronDownGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  );
}

/**
 * 눈금 하나의 배지 썸네일 — 접힌 레일·펼친 티어 목록이 공유한다.
 * 44px 썸네일 + (등급이 있고 `showRarityChip`이면) 그 아래 등급칩까지가 한 덩어리다
 * (티켓 20260906_1436 — 3px 등급 바를 걷어내고 등급칩으로 교체).
 * 펼친 목록은 옆에 이미 `RarityBadge` 칩이 있어 `showRarityChip={false}`로 끈다.
 */
function StopThumbnail({ imageUrl, alt, status, rarity, showRarityChip = false }) {
  const earned = status === 'earned';
  const ringColor = status === 'earned' || status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-border-light)';
  const ringWidth = status === 'earned' || status === 'ready' ? 2 : 1;
  const showMarker = status === 'earned' || status === 'ready' || status === 'locked';

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 'none' }}>
      <span
        style={{
          position: 'relative', width: 44, height: 44, flex: 'none',
          borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              width: '100%', height: '100%', objectFit: 'contain', padding: 3,
              borderRadius: 'var(--radius-sm)', filter: earned ? 'none' : 'grayscale(1)',
            }}
          />
        ) : (
          <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
        )}
        {showMarker && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--color-surface-elevated)',
              background: status === 'earned' ? 'var(--status-done-solid)' : 'var(--color-base-grey-700)',
              color: status === 'earned' ? '#000' : 'var(--color-text-secondary)',
            }}
          >
            {status === 'earned' ? <CheckGlyph size={10} /> : <LockGlyph size={10} />}
          </span>
        )}
      </span>
      {/* 등급칩 — barColor와 같은 가드(rarity가 있을 때만)를 유지한다. common은 RarityBadge가
          자체적으로 null을 반환해(노이즈 축소 관례) 자리를 차지하지 않는다. 44px 폭보다
          칩이 넓어도(예: "MYSTIC") 방치한다 — 좌우 눈금 사이 여백이 흡수한다. */}
      {showRarityChip && rarity && <RarityBadge rarity={rarity} />}
    </span>
  );
}

/** 상태에 따라 링크(이동) 또는 버튼(잠금 시트 오픈) 중 하나로만 렌더 — 앵커 중첩 버튼 금지. */
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
   * `gates`는 그 눈금 앞을 막고 있는 문의 배열: `[{ kind: 'mission' | 'cross', met?: boolean }]`.
   * 넘기지 않으면 v1과 동일하게 종류 없는 자물쇠 하나만 그린다.
   * `conditionText`는 「무엇이 얼마나 필요한가」 완성 문자열(「4km」) — `not-reached` 눈금의
   * 캡션 자리에만 쓴다. 없으면 기존 `'—'`. **이 컴포넌트는 조건을 해석하지 않는다.**
   * 상한을 넘긴 `stops`는 프로덕션에서도 4개로 잘린다(개발 빌드는 그 전에 throw).
   */
  stops,
  /**
   * 반복형 계열의 누적 획득 횟수 — 헤더 행 오른쪽 끝에 `×N` 칩 하나로만 그린다.
   * 점 그리드를 쓰지 않는 이유는 `BadgeStampRow` 주석 참고. null이면 그리지 않는다.
   */
  // JSDoc 캐스팅이 필요하다 — `= null` 기본값만 두면 JS 추론이 프롭 타입을 정확히 `null`
  // 하나로 좁혀, 숫자를 넘기는 호출부가 타입 에러가 난다(이 파일의 nextRarityLabel·
  // frontierProgress 주석과 같은 함정. 여기서는 기본값이 꼭 필요해서 캐스팅으로 푼다).
  earnCount = /** @type {number | null} */ (null),
  /**
   * 다음으로 노려야 할 등급 라벨("Epic" 등). 전부 획득했으면 null.
   * 기본값을 두지 않는다 — JS 추론 컴포넌트에서 `= null` 기본값은 타입을 정확히 `null`
   * 하나로 좁혀 버려(문자열 값을 넘기는 실제 호출부가 타입 에러가 난다), 항상 명시적으로
   * 넘기는 쪽이 안전하다(호출부는 `nextRarityLabel={family에서 계산한 값 ?? null}` 형태로 넘김).
   */
  nextRarityLabel,
  expanded = false,
  onToggleExpand = () => {},
  /**
   * (stopId) => void — ready/locked 눈금(또는 그 앞 게이트) 탭 시 잠금 해제 조건 시트 요청.
   * 기본값을 두지 않는다 — 0-인자 기본값(`() => {}`)을 두면 JS 추론이 프롭 타입을 정확히
   * `() => void`로 좁혀, `(stopId) => ...` 형태의 실제 호출부가 "인자를 너무 적게 받는
   * 시그니처" 타입 에러가 난다. 항상 명시적으로 넘긴다(잠금 눈금이 없는 스토리는 no-op을 넘김).
   */
  onLockClick,
  /**
   * 프런티어(다음 목표) 눈금의 진행 표시 — 2c(computeBadgeProgress 최초 연결). null이면 1차와
   * 동일(상태 라벨만, 연결선은 idle). `{ text, fraction, muted? }` — text는 STATUS_LABEL을
   * 대체할 완성 문자열, fraction(0~1)은 프런티어 앞 연결선 비례 채움, muted는 §08 H(진행
   * 미지원) 전용 중립색 표시. 누적/기록/주기 3종만 넘긴다 — 2축/다중은 2d 몫이라 호출부가
   * 이 prop에 null을 넘긴다.
   * 기본값을 두지 않는다 — `nextRarityLabel`과 같은 이유(`= null` 기본값은 JS 추론이 타입을
   * 정확히 `null` 하나로 좁혀, 객체를 넘기는 실제 호출부가 타입 에러가 난다). 항상 명시적으로
   * `frontierProgress={... ?? null}` 형태로 넘긴다.
   */
  frontierProgress,
  /**
   * **진행 표시 앵커** 눈금 id — `frontierProgress`를 어느 눈금에 그릴지 (티켓 20260906_1323 §8).
   *
   * 예전에는 이 컴포넌트가 «첫 미획득 눈금»을 스스로 골라 거기에 그렸는데, 조건은 이미
   * 채웠지만 아직 발급되지 않은 눈금이 그 자리라 「22/1일」처럼 **이미 넘긴 조건에 카운트가
   * 뜨는** 표시가 됐다. 어느 눈금이 «진짜 다음 할 일»인지는 호출부(서버)가 정한다.
   * null이면 예전대로 첫 미획득 눈금에 그린다.
   *
   * ⚠️ 게이트 자리(`isGateBefore`)와 「앞 구간 꽉 채움」은 **획득 여부** 기준이라 이 값과
   * 무관하게 `frontierIndex`를 그대로 쓴다 — 비례 채움만 앵커를 따른다.
   * 기본값을 두지 않는다 — `nextRarityLabel`·`frontierProgress`와 같은 이유(JS 추론이
   * `= null` 기본값에서 타입을 `null` 하나로 좁힌다). 항상 `progressStopId={... ?? null}` 형태로 넘긴다.
   */
  progressStopId,
  /**
   * 기록형 "아쉬움 줄"(§05) — 계열당 최대 1줄, record kind 프런티어에서 직전 활동이 임계값
   * 85% 이상일 때만 호출부가 완성 문장을 만들어 넘긴다. null이면 렌더하지 않는다.
   * 기본값을 두지 않는다 — 위 `frontierProgress`와 동일한 이유.
   */
  regretLine,
  className = '',
  style = {},
}) {
  // 4눈금 상한을 코드로 강제한다(v2). 레일은 등급 4단계 전용 구조라, v5 무한레벨형
  // (지금 Lv.1~8까지 시딩, 상한 없음)을 실수로 여기에 넘기면 눈금이 가로로 밀려나
  // 화면이 조용히 망가진다(이 컨테이너에는 overflow도 flexWrap도 없다).
  // 개발 빌드에서만 던진다 — 프로덕션에서 사용자 화면을 통째로 날리는 대신, 개발/스토리북
  // 단계에서 반드시 걸리게 한다. 레벨형은 `BadgeLevelGauge`를 쓴다.
  if (
    stops.length > MAX_STOPS &&
    typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production'
  ) {
    throw new Error(
      `BadgeStageRail: 눈금은 최대 ${MAX_STOPS}개다(등급 4단계). 받은 값 ${stops.length}개 — familyName="${familyName}". 무한레벨형은 BadgeLevelGauge를 쓰세요.`
    );
  }

  // **프로덕션 방어선**(티켓 20260905_0037). 위 throw는 개발 빌드 전용이라 프로덕션에서는
  // 상한을 넘긴 값이 그대로 통과해 눈금이 카드를 뚫는다(이 컨테이너에는 overflow도 flexWrap도
  // 없다). 예전엔 `badgeTree.ts`의 RARITY_ORDER 4회 루프가 상한을 «구조적으로» 보장했는데
  // 0037이 그 루프를 걷어냈다 — 여기서 잘라 어떤 호출부가 와도 레이아웃이 깨지지 않게 한다.
  const visibleStops = stops.length > MAX_STOPS ? stops.slice(0, MAX_STOPS) : stops;

  const frontierIndex = visibleStops.findIndex((s) => s.status !== 'earned');
  // 진행 표시가 붙는 자리. 호출부가 지정하지 않으면 예전대로 첫 미획득 눈금이다
  // (티켓 20260906_1323 §8). **획득 여부** 판정은 계속 frontierIndex를 쓴다.
  const progressIndex = progressStopId != null ? visibleStops.findIndex((s) => s.id === progressStopId) : -1;
  const progressAnchorIndex = progressIndex >= 0 ? progressIndex : frontierIndex;
  const earnedCount = visibleStops.filter((s) => s.status === 'earned').length;
  const summarySentence =
    nextRarityLabel == null
      ? `${familyName}, 모두 획득했어요.`
      : `${familyName}, ${visibleStops.length}단계 중 ${earnedCount}단계 획득. 다음 단계 ${nextRarityLabel}.`;

  return (
    <div
      className={className}
      style={{
        position: 'relative', borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <style>{STATIC_CSS}</style>

      {/* 접근성 이름을 명시한다 — 안쪽 텍스트가 「자세히」 하나뿐이라 계열 이름이 사라진다 */}
      <button
        type="button"
        className="ds-rail-header"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        aria-label={`${familyName} 자세히`}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-12)' }}>
          <span
            style={{
              fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em',
              overflowWrap: 'anywhere', color: 'var(--color-text)',
            }}
          >
            {familyName}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {earnCount != null && (
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
            )}
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              {nextRarityLabel ? '자세히' : '모두 획득'}
            </span>
            <span className="ds-rail-chevron" style={{ display: 'flex', color: 'var(--color-text-secondary)', transform: expanded ? 'rotate(180deg)' : 'none' }}>
              <ChevronDownGlyph size={20} />
            </span>
          </span>
        </span>
      </button>

      <div role="group" aria-label={summarySentence} style={{ display: 'flex', alignItems: 'flex-start', marginTop: 'var(--spacing-16)' }}>
        {visibleStops.map((stop, i) => {
          const rarityLabel = stop.rarity ? getRarityLabel(stop.rarity) : null;
          // 등급이 없는 배지(무한레벨형)는 rarityLabel이 null이다. 템플릿 리터럴에 그대로
          // 끼우면 "동네 산책러 null, 획득"이 aria-label과 img alt로 나간다 — 조각을 뺀다
          // (티켓 20260905_0027 개선 리뷰).
          const stopName = [familyName, rarityLabel].filter(Boolean).join(' ');
          const showProgress = frontierProgress != null && i === progressAnchorIndex;
          // 진행 캡션은 화면에만 보이고 aria-label에는 반영되지 않아, 스크린리더 사용자는
          // 이번 티켓 이전과 동일하게 상태 라벨만 듣는 정보 격차가 있었다(개선 리뷰·인터랙션
          // 리뷰 공통 지적, 티켓 20260904_0921). 진행 캡션을 문장 끝에 이어 붙여 해소한다.
          // 아직 도달하지 않은 눈금은 상태 라벨 자리에 **조건값**을 그린다(§7). 조건값이
          // 없으면(미션 보상·수동 발급 등) 기존 `'—'`로 남는다 — 폴백을 지우지 않는다.
          const showConditionText =
            !showProgress && stop.status === 'not-reached' && stop.conditionText != null;
          const stopAriaLabel =
            (stop.status === 'ready' || stop.status === 'locked'
              ? `${stopName}, ${STATUS_ARIA_LABEL[stop.status]}. 잠금 해제 조건 보기`
              : `${stopName}, ${STATUS_ARIA_LABEL[stop.status]}`) +
            (showConditionText ? `. 조건 ${stop.conditionText}` : '') +
            (showProgress ? `. ${frontierProgress.text}` : '') +
            (showProgress && regretLine ? `. ${regretLine}` : '');
          const isGateBefore = i === frontierIndex && i > 0 && (stop.status === 'locked' || stop.status === 'ready');
          // 게이트 종류(v2). 최대 2개만 그린다 — 자리가 44px이고, 그보다 많은 문을 한 자리에
          // 늘어놓으면 "어디서 막혔는지"가 오히려 안 읽힌다(원 검토문서 §04와 같은 이유).
          // `met`(0037): 문이 둘일 때 「하나는 이미 열렸다」를 색으로 가른다 — 없으면 미션을
          // 이미 깬 상태에서도 자물쇠 2개가 똑같이 그려져 무엇이 남았는지 안 읽혔다.
          const gates = (stop.gates ?? []).slice(0, 2);
          const gateAriaLabel =
            gates.length > 0
              ? `${stopName} 잠금 해제 조건 보기. ${gates
                  .map((g) => `${GATE_KIND_LABEL[g.kind] ?? g.kind} ${g.met ? '통과' : '대기'}`)
                  .join(', ')}`
              : `${stopName} 잠금 해제 조건 보기`;
          // 진행 앵커 앞(게이트 없을 때)만 비례 채움 대상 — 그 앞(모두 획득 구간)은 항상 꽉
          // 채우고, 뒤(아직 도달 안 한 구간)는 항상 idle이다(§05: "다음 목표" 한 곳에만 강조).
          // frontierIndex가 -1(전부 획득)이면 모든 연결선이 "그 앞"에 해당한다.
          // 비례 채움만 앵커를 따른다 — 게이트 자리·꽉 채움은 획득 여부 기준 그대로다.
          const isFrontierConnector = i === progressAnchorIndex && !isGateBefore;
          const allEarnedBefore = frontierIndex === -1 || i < frontierIndex;
          let connectorBackground = 'var(--status-idle-track)';
          if (!isGateBefore) {
            if (allEarnedBefore) {
              connectorBackground = 'var(--status-done-solid)';
            } else if (isFrontierConnector && frontierProgress && typeof frontierProgress.fraction === 'number') {
              const pct = Math.round(Math.min(1, Math.max(0, frontierProgress.fraction)) * 100);
              connectorBackground = `linear-gradient(to right, var(--status-short-solid) ${pct}%, var(--status-idle-track) ${pct}%)`;
            }
          }

          return (
            <React.Fragment key={stop.id}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={isGateBefore ? 'ds-rail-gate-link' : undefined}
                  style={{
                    // 게이트 자리도 다른 연결선과 같은 flex-grow(1)를 갖는다(티켓 20260906_1436
                    // §2-4) — grow:0 고정이던 예전 값은 남는 공간이 일반 연결선에만 쏠려
                    // 레일 전체가 한쪽으로 치우쳐 보이게 했다. 최소 폭(자물쇠 2개 자리)만
                    // basis로 보장하고, 늘어나는 몫은 균등하게 나눈다.
                    flex: isGateBefore ? `1 1 ${GATE_SLOT_WIDTH}px` : '1 1 14px',
                    minWidth: isGateBefore ? GATE_SLOT_WIDTH : 14,
                    height: 6,
                    marginTop: 19,
                    borderRadius: 'var(--radius-xs)',
                    background: isGateBefore ? undefined : connectorBackground,
                    display: isGateBefore ? 'flex' : 'block',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isGateBefore && (
                    <button
                      type="button"
                      className="ds-rail-lock-btn"
                      onClick={() => onLockClick?.(stop.id)}
                      aria-label={gateAriaLabel}
                      style={{
                        // 자물쇠 2개(미션 + 교차)까지 들어가는 자리. 종류를 안 넘기면(v1 호출부)
                        // 예전처럼 원형 자물쇠 하나만 그린다.
                        height: 20, minWidth: 20, padding: gates.length > 1 ? '0 3px' : 0,
                        borderRadius: gates.length > 1 ? 'var(--radius-pill)' : '50%',
                        background: 'var(--color-surface-elevated)',
                        boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {gates.length === 0 ? (
                        <LockGlyph size={10} />
                      ) : (
                        gates.map((gate, gi) =>
                          // 이미 통과한 문은 **체크 + 라임**이다 — 형태까지 바꿔 색만으로
                          // 구분하지 않는다(미션 자물쇠 대비가 4.18:1이라 색 하나에 기댈 수 없다).
                          gate.met ? (
                            <span key={`${gate.kind}-${gi}`} style={{ display: 'flex', color: 'var(--status-done-solid)' }}>
                              <CheckGlyph size={10} />
                            </span>
                          ) : gate.kind === 'mission' ? (
                            // 미션 게이트만 --color-primary(4.18:1). 텍스트 기준에는 못 미치지만
                            // 아이콘이라 비텍스트 기준 3:1은 통과하고, 형태(자물쇠 vs 별)로도
                            // 교차 게이트와 갈라 둬서 색 하나에만 기대지 않는다.
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
              )}
              <StopHitArea
                status={stop.status}
                href={stop.href}
                onOpenLock={() => onLockClick?.(stop.id)}
                ariaLabel={stopAriaLabel}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 48 }}>
                  <StopThumbnail imageUrl={stop.imageUrl} alt={stopName} status={stop.status} rarity={stop.rarity} showRarityChip />
                  {(() => {
                    const captionText = showProgress
                      ? frontierProgress.text
                      : showConditionText
                        ? stop.conditionText
                        : STATUS_LABEL[stop.status];
                    // fraction>=1(조건은 채웠고 게이트만 남음)이면 앰버가 아니라 라임 —
                    // BadgeTrophyGridCard가 이미 쓰는 것과 같은 기준(개선 리뷰 지적,
                    // 티켓 20260904_0921). 조건 자체를 못 채운 동안(진행 중)만
                    // 화이트(`--color-text`)로 남긴다 — 옐로우(`--status-short-solid`)는
                    // 눈에 거슬린다는 지적으로 텍스트만 바꿨다(티켓 20260906_1436 §3).
                    // 토큰 값 자체는 바꾸지 않는다 — 채움색(막대·연결선 그라데이션, 415행)은
                    // 계속 이 토큰을 쓴다. `/badges` 트로피 그리드 등 다른 화면에 영향 없게.
                    const progressComplete = showProgress && !frontierProgress.muted && frontierProgress.fraction >= 1;
                    const captionColor = showProgress
                      ? frontierProgress.muted
                        ? 'var(--color-text-secondary)'
                        : progressComplete
                          ? 'var(--status-done-solid)'
                          : 'var(--color-text)'
                      : stop.status === 'earned' || stop.status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-text-secondary)';
                    return (
                      <span
                        style={{
                          fontSize: 'var(--text-micro)', lineHeight: 1.3,
                          // 조건값도 진행 캡션과 같은 규칙 — 「100일 · 10회」가 nowrap이면 잘린다.
                          whiteSpace: showProgress || showConditionText ? 'normal' : 'nowrap',
                          // keep-all: "3일" 같은 수치+단위가 줄바꿈 때문에 "3"/"일"로 쪼개지지
                          // 않게 한다(한글 줄바꿈은 공백 단위로만 — 주기형 문구가 가장 길다).
                          wordBreak: showProgress || showConditionText ? 'keep-all' : 'normal',
                          maxWidth: showProgress || showConditionText ? 92 : undefined,
                          textAlign: 'center',
                          // 기울임은 «임시 상태 표기»(「진행 표시 준비 중」) 전용이다 —
                          // 조건값은 중립색이지만 사실 표기라 기울이지 않는다(§9).
                          fontStyle: showProgress && frontierProgress.pending ? 'italic' : 'normal',
                          color: captionColor,
                          opacity: !showProgress && stop.status === 'not-reached' ? 0.7 : 1,
                          // 숫자 자릿수가 흔들리는 캡션("87.3/100km"·"100일 · 10회" 등)의 폭을
                          // 고정 — BadgeTrophyGridCard와 표기 일관성(20260904_0921).
                          fontVariantNumeric: showProgress || showConditionText ? 'tabular-nums' : undefined,
                        }}
                      >
                        {captionText}
                      </span>
                    );
                  })()}
                </span>
              </StopHitArea>
            </React.Fragment>
          );
        })}
      </div>

      {regretLine && (
        <p
          style={{
            margin: 'var(--spacing-12) 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.4,
            color: 'var(--status-short-solid)',
          }}
        >
          {regretLine}
        </p>
      )}

      {expanded && (
        <div style={{ marginTop: 'var(--spacing-16)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          {visibleStops.map((stop) => {
            const rarityLabel = stop.rarity ? getRarityLabel(stop.rarity) : null;
            const stopName = [familyName, rarityLabel].filter(Boolean).join(' ');
            const canOpenLock = stop.status === 'ready' || stop.status === 'locked';
            // 접힌 레일(492~533행 인근)과 같은 규칙 — not-reached인데 조건값이 있으면
            // 「—」 대신 조건값을 보여준다(티켓 20260906_1436 §2-1). 시각 텍스트가 그대로
            // 스크린리더에도 읽히는 구조라(별도 aria 라벨 없음) 여기서만 바꾸면 접근성도 함께 해결된다.
            const expandedStatusText =
              stop.status === 'not-reached' && stop.conditionText != null ? stop.conditionText : STATUS_LABEL[stop.status];
            return (
              <div key={stop.id} style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'flex-start' }}>
                <StopThumbnail imageUrl={stop.imageUrl} alt={stopName} status={stop.status} rarity={stop.rarity} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RarityBadge rarity={stop.rarity} />
                    {canOpenLock && (
                      <button
                        type="button"
                        className="ds-rail-lock-btn"
                        onClick={() => onLockClick?.(stop.id)}
                        aria-label={[rarityLabel, '잠금 해제 조건 보기'].filter(Boolean).join(' ')}
                        style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
                      >
                        <LockGlyph size={14} />
                      </button>
                    )}
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0', fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.4,
                      color: stop.status === 'earned' || stop.status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-text-secondary)',
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
  );
}
