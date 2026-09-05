import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';
import { BadgeLevelChip } from '../cards/BadgeLevelChip.jsx';

/**
 * UnlockConditionSheetContent — 잠금 해제 조건 시트의 본문. 티켓 20260903_2329.
 *
 * 레일·티어 목록에는 자물쇠 아이콘 하나만 두고(카드 안에 조건 문장을 늘어놓지 않는다),
 * 그 아이콘을 누르면 이 콘텐츠가 서비스 BottomSheet 위에 얹혀 조건 전체를 보여준다.
 * DS BottomSheet가 아니라 **서비스 `src/components/ui/BottomSheet.tsx`** 위에 얹는
 * 콘텐츠 전용 컴포넌트다 — 병존 구현 중 실제 화면은 서비스 쪽을 쓰기 때문(§1.6).
 *
 * 미션 진행도(0/1 등)·배지 실측값은 표시하지 않는다 — 진행 계산 모듈이 필요한 2차 범위.
 *
 * v5 다단계 대응(티켓 20260905_0037):
 *   - `groups`를 넘기면 **그룹 안은 `relation`, 그룹 사이는 AND**로 그린다. 평면 `relation`
 *     하나로는 「미션 AND (배지 A OR 배지 B)」를 표현할 수 없어, v5의 2단 교차 게이트가
 *     걸린 배지에서 조건이 실제와 다르게 읽혔다.
 *   - 항목·그룹의 `met`으로 「1단 통과, 2단 대기」를 드러낸다 — 예전에는 전부 미충족 항목만
 *     넘어온다는 전제라 통과한 단을 표시할 방법이 없었다.
 *   - 배지 항목 기본 부제를 「배지 · 어느 등급이든 1개」에서 **「배지」**로 낮췄다. 그 문장은
 *     등급이 없는 계열을 가리킬 때 거짓이 된다 — 참인 문장은 호출부가 `note`로 넘긴다.
 *
 * v5 대응(티켓 20260905_0036) 세 가지:
 *   - 구분선 문구가 "또는" 하나로 **하드코딩**돼 있어 조건을 «모두» 채워야 하는 게이트를
 *     표현할 수 없었다 → `relation` prop('or'|'and'). 기본값은 'or'라 기존 호출부는 그대로다.
 *   - 배지 항목 부제가 「배지 · 어느 등급이든 1개」로 **하드코딩**돼 있었다. v5 무한레벨형은
 *     등급이 아예 없어(rarity NULL) 이 문장이 거짓이 된다 → `req.note`로 덮어쓸 수 있다.
 *   - 미획득 배지 이미지에 `grayscale(1)`만 걸어 원본 URL이 네트워크에 나가던 것을
 *     grayscale(1) 원본으로 그린다 — 미획득 배지도 어떤 배지인지 알아볼 수 있어야 한다
 *     (2026-09-06 사용자 확정. 20260905_0036이 한때 실루엣으로 바꿨다가 되돌렸다).
 */
function ChevronRightGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
    </svg>
  );
}
function CheckGlyph({ size = 16 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}

function RequirementIcon({ imageUrl, kind, met = false }) {
  // 배지 항목은 «아직 못 받은 배지»라 grayscale(1)로 그린다(2026-09-06 확정 — 외형을
  // 감추는 대신 어떤 배지인지 알아볼 수 있게 한다). 미션 썸네일은 미획득 개념이 아니라
  // 원본 그대로 둔다. **이미 받은 항목(met)은 원본 컬러**다 — 「받았다」와 「못 받았다」가
  // 같은 그림이면 다단계 게이트에서 어느 단이 통과인지 안 읽힌다(0037).
  const dim = kind === 'badge' && !met;
  return (
    <span
      style={{
        width: 36, height: 36, flex: 'none', borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `inset 0 0 0 ${met ? 2 : 1}px ${met ? 'var(--status-done-solid)' : 'var(--color-border-light)'}`,
        overflow: 'hidden',
        color: 'var(--color-text)',
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
        <img
          src={imageUrl}
          alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'contain', padding: 4,
            filter: dim ? 'grayscale(1)' : 'none',
          }}
        />
      ) : (
        <span style={{ width: 16, height: 16, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
      )}
    </span>
  );
}

/** 항목 한 줄. `met`이면 라임 링 + 체크로 «이미 통과»를 드러낸다(0037) */
function RequirementRow({ req }) {
  const met = req.met === true;
  return (
    <a
      href={req.href}
      style={{
        display: 'flex', gap: 'var(--spacing-12)', alignItems: 'center', padding: 'var(--spacing-12)',
        borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.055)',
        boxShadow: met
          ? 'inset 0 0 0 1px var(--status-done-solid)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
        textDecoration: 'none', color: 'inherit',
      }}
    >
      <RequirementIcon imageUrl={req.imageUrl} kind={req.kind} met={met} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere', color: 'var(--color-text)' }}>
          {req.name}
        </p>
        <p
          style={{
            margin: '3px 0 0', fontSize: 'var(--text-caption)',
            color: met ? 'var(--status-done-solid)' : 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {met && <CheckGlyph size={12} />}
          {/* 기본값이 「배지」인 이유: 예전 기본값 「배지 · 어느 등급이든 1개」는 등급이 없는
              계열을 가리킬 때 **조용히 거짓 문장**이 됐다. 참인 문장은 호출부가 note로 넘긴다
              (티켓 20260905_0037, 0036 넘김 항목 4). */}
          {met ? '이미 받았어요' : (req.note ?? (req.kind === 'mission' ? '미션' : '배지'))}
        </p>
      </div>
      <span style={{ color: 'var(--color-text-secondary)', flex: 'none', display: 'flex' }}>
        <ChevronRightGlyph size={16} />
      </span>
    </a>
  );
}

/** 구분선 — 항목 사이(또는 그룹 사이)의 결합 관계를 한 단어로 */
function RelationDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      {label}
      <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  );
}

export function UnlockConditionSheetContent({
  badgeName,
  rarity,
  /**
   * 무한레벨형 배지의 레벨(v5는 rarity가 NULL이고 level만 있다). 넘기면 등급 칩 대신
   * `BadgeLevelChip`을 그린다.
   */
  // `= null` 기본값은 JS 추론이 타입을 `null` 하나로 좁히므로 JSDoc으로 캐스팅한다.
  level = /** @type {number | null} */ (null),
  /**
   * 본 배지 이미지. 이 시트에 뜨는 배지는 정의상 미획득이라 **grayscale(1)** 로 그린다
   * (2026-09-06 사용자 확정 — 미획득도 원본을 그레이로 보여준다).
   */
  imageUrl = /** @type {string | null} */ (null),
  /** true면 수치 조건은 이미 채운 상태 — "조건을 다 채웠어요" 확인 줄을 보여준다 */
  conditionMet = false,
  /**
   * [{ kind: 'mission'|'badge', name, href, imageUrl, note?, met? }].
   * `note`는 항목 부제를 덮어쓴다(기본값: 미션 → "미션", 배지 → "배지").
   * `met`이 true면 그 항목은 이미 채운 것으로 그린다.
   * `groups`를 넘기면 이 prop은 무시된다.
   */
  requirements,
  /** 항목 사이 관계. 'or'=하나만 채우면 됨(기본), 'and'=전부 채워야 함 */
  relation = 'or',
  /**
   * **다단계 게이트** — `[{ title?, relation?, met?, note?, requirements: [...] }]`.
   * **그룹 안은 `relation`(기본 'or'), 그룹 사이는 언제나 AND**다. 그래서
   * 「미션 AND (배지 A OR 배지 B)」가 표현된다 — 평면 `relation` 하나로는 못 담아
   * 시트가 조건을 잘못 읽고 있었다(티켓 20260905_0037, 0036 넘김 항목 3).
   * 그룹의 `met`이 「1단 통과, 2단 대기」를 그대로 드러낸다.
   */
  // `= null` 기본값은 JS 추론이 타입을 `null` 하나로 좁히므로 JSDoc으로 캐스팅한다.
  groups = /** @type {Array<{ title?: string | null, relation?: 'or' | 'and', met?: boolean, note?: string | null, requirements: object[] }> | null} */ (null),
  className = '',
  style = {},
}) {
  const relationLabel = relation === 'and' ? '그리고' : '또는';
  const useGroups = Array.isArray(groups) && groups.length > 0;
  return (
    <div className={className} style={style}>
      <div style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'center' }}>
        <span
          style={{
            width: 56, height: 56, flex: 'none', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `inset 0 0 0 2px ${conditionMet ? 'var(--status-done-solid)' : 'var(--color-border-light)'}`,
            color: 'var(--color-text)',
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다
            <img
              src={imageUrl}
              alt={badgeName}
              style={{
                width: '100%', height: '100%', objectFit: 'contain', padding: 4,
                borderRadius: 'var(--radius-sm)', filter: 'grayscale(1)',
              }}
            />
          ) : (
            <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere', color: 'var(--color-text)' }}>
            {badgeName}
          </p>
          <div style={{ marginTop: 2 }}>
            {level != null ? <BadgeLevelChip level={level} /> : <RarityBadge rarity={rarity} />}
          </div>
        </div>
      </div>

      {conditionMet && (
        <div style={{ marginTop: 'var(--spacing-16)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-small)', fontWeight: 600, color: 'var(--status-done-solid)' }}>
          <CheckGlyph size={16} />
          조건을 다 채웠어요
        </div>
      )}

      <h3
        style={{
          margin: `${conditionMet ? 'var(--spacing-16)' : 'var(--spacing-24)'} 0 var(--spacing-8)`,
          fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-text-secondary)',
        }}
      >
        잠금 해제 조건
      </h3>

      {useGroups ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map((group, gi) => {
            const inner = group.relation === 'and' ? '그리고' : '또는';
            const groupMet = group.met === true;
            return (
              <React.Fragment key={group.title ?? `group-${gi}`}>
                {/* 그룹 사이는 **언제나 AND**다 — 그룹 자체가 「이것도 따로 채워야 한다」는 뜻이다 */}
                {gi > 0 && <RelationDivider label="그리고" />}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {(group.title || group.note || groupMet) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px', fontSize: 'var(--text-caption)', color: groupMet ? 'var(--status-done-solid)' : 'var(--color-text-secondary)' }}>
                      {groupMet && <CheckGlyph size={12} />}
                      <span style={{ fontWeight: 600 }}>{group.title ?? (groupMet ? '통과' : '대기')}</span>
                      {group.note && <span>· {group.note}</span>}
                    </div>
                  )}
                  {group.requirements.map((req, i) => (
                    <React.Fragment key={req.href}>
                      {i > 0 && <RelationDivider label={inner} />}
                      <RequirementRow req={req} />
                    </React.Fragment>
                  ))}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {requirements.map((req, i) => (
            <React.Fragment key={req.href}>
              {i > 0 && <RelationDivider label={relationLabel} />}
              <RequirementRow req={req} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
