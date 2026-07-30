# JAM! 디자인 리뉴얼 — 데이터 모델

> 이 문서는 리뉴얼로 새로 생기는 설정 데이터(테마 컬러, 상태 팔레트, i18n 딕셔너리)의 구조를 정의합니다.
> 기존 서비스 데이터(users, badges, missions 등)는 변경하지 않습니다.

---

## 전체 구조

```
[theme_presets] --1:N--> (여러 개의 메인/서브 컬러 프리셋, 그중 1개만 is_active=true)
[state_color_palette] --1:N--> (희귀도/카테고리별 상태 색상 항목들, 기존 jam-* 값 그대로 이관)
[i18n dictionary (코드 내 정적 구조)] --키참조--> (모든 화면의 UI 컴포넌트)
```

관계는 모두 "설정 → 화면 렌더링에 영향"이며, 기존 users/badges/missions 테이블과는 FK 관계를 맺지 않는 순수 설정 데이터입니다.

---

## 엔티티 상세

### theme_presets
서비스 전역에 적용되는 메인/서브 브랜드 컬러를 "프리셋" 단위로 저장. 시즌 이벤트나 캠페인마다 새 프리셋을 만들어두고 필요할 때 활성화만 전환하는 구조 (싱글턴이 아님).

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | abc-123 | O |
| name | 프리셋 이름 (어드민 식별용) | "기본(코발트/아이스)", "겨울 시즌" | O |
| main_color | 메인 컬러 hex | `#0033e5` | O |
| sub_color | 서브 컬러 hex | `#f0f7ff` | O |
| is_active | 현재 서비스에 적용 중인 프리셋 여부 (전체 중 1개만 true) | true | O |
| created_by | 프리셋을 만든 어드민 유저 id | admin-uuid | O |
| created_at | 생성 시각 | 2026-07-29T10:00:00Z | O |
| updated_at | 마지막 수정 시각 | 2026-07-29T10:00:00Z | O |

기본 시드: `{ name: "기본(코발트/아이스)", main_color: "#0033e5", sub_color: "#f0f7ff", is_active: true }` 1개.

### state_color_palette
배지 희귀도 및 카테고리처럼 "기능적으로 색상이 의미를 가지는" 항목들의 예외 색상 목록. 메인/서브 2색 원칙의 유일한 예외 지점. **색상값은 기존 `jam-*` 팔레트를 그대로 재사용**한다 (재조정 없음).

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | abc-123 | O |
| scope | 어떤 용도의 팔레트인지 | `badge_rarity` / `badge_category` | O |
| key | 팔레트 내 식별 키 | `legendary`, `rare`, `common`, `mythic` | O |
| color | 상태 색상 hex (기존 jam-* 값 그대로) | `#c6ff3a` (jam-lime) | O |
| label | 어드민 화면에 표시할 이름 | "레전더리" | O |
| sort_order | 표시 순서 | 1 | X |
| updated_at | 마지막 변경 시각 | 2026-07-29T10:00:00Z | O |

기본 시드 (`scope: badge_rarity`, 기존 `globals.css` 값 그대로 이관):

| key | color | 출처 |
|-----|-------|------|
| common | (기존 무채색/화이트 계열 유지) | 기존 로직 그대로 |
| rare | `#2dd4bf` | jam-teal |
| legendary | `#8b6cf6` | jam-purple |
| mythic | `#ffc93c` | jam-yellow |

카테고리 색상이 필요해지면 `scope: badge_category`로 `#c6ff3a`(jam-lime) 등 나머지 jam-* 값을 같은 방식으로 추가한다.

**어드민 UI 정책**: `badge_rarity` scope의 4개 row(`common`/`rare`/`legendary`/`mythic`)는 **고정 슬롯**이다. 어드민 화면에서 새 희귀도 키를 추가하거나 기존 키를 삭제할 수 없고, 오직 각 슬롯의 `color` 값만 수정 가능하다. 이는 배지 엔진의 `rarity` enum과 1:1로 고정 매칭되어야 하기 때문이며, 자유 추가를 허용하면 배지 데이터의 `rarity` 값과 팔레트 키가 어긋나는 불일치가 발생할 수 있다.

### i18n 딕셔너리 (코드 구조, DB 아님)
Phase 1에서는 DB가 아니라 코드 내 정적 객체로 관리합니다 (번역 실 작업은 범위 밖이므로 `ko` 로케일만 채움).

```ts
// src/lib/i18n/ko.ts
export const ko = {
  profile: {
    editButton: "편집",
    logoutButton: "로그아웃",
    pointBalance: "{count}P",
  },
  tabs: {
    badge: "뱃지",
    itembooks: "아이템북",
    followers: "팔로워",
    following: "팔로잉",
  },
  // ...
} as const

// src/lib/i18n/index.ts
export const dictionaries = { ko } // 추후 en 등 추가 시 여기에만 등록
```

| 필드(키 구조) | 설명 | 예시 | 필수 |
|------|------|------|------|
| namespace | 화면/도메인 단위 그룹 | `profile`, `tabs`, `common` | O |
| key | 문구 식별 키 | `editButton` | O |
| value | 실제 표시 문구 (로케일별) | "편집" | O |
| interpolation | `{변수}` 형태의 동적 값 삽입 여부 | `{count}P` | X |

### 관계
- `theme_presets`는 여러 row를 가질 수 있으며, 그중 `is_active = true`인 딱 1개가 서비스 전역 CSS 변수(`--color-main`, `--color-sub`)에 바인딩됩니다. 프리셋을 전환하면 이전 활성 row의 `is_active`를 false로, 새 row를 true로 바꾸는 트랜잭션으로 처리합니다.
- `state_color_palette`는 `scope`별로 여러 row를 가지며(예: `badge_rarity`에 4개 row), 배지 렌더링 시 `rarity` 값으로 매칭해 색상을 조회합니다.
- i18n 딕셔너리는 DB와 무관하게 코드 레벨 구조이며, 컴포넌트는 항상 `dictionaries[locale].namespace.key` 형태로 참조합니다.

---

## 왜 이 구조인가

- **분리의 이유**: 브랜드 전역 컬러(2개)와 기능적 상태 컬러(희귀도/카테고리)는 변경 빈도와 책임자가 다릅니다 — 전자는 브랜드 담당이 시즌마다 바꾸고, 후자는 배지 시스템 운영자가 카테고리 추가 시마다 바뀝니다. 테이블을 분리해두면 한쪽 변경이 다른 쪽에 영향을 주지 않습니다.
- **프리셋 구조를 선택한 이유**: 싱글턴 대신 `theme_presets` 여러 row + `is_active` 플래그로 잡은 이유는, 시즌 이벤트(예: 겨울 캠페인 컬러)를 미리 만들어두고 날짜에 맞춰 활성화만 전환할 수 있게 하기 위해서입니다. 과거 프리셋도 row로 남아있어 "지난 시즌 컬러로 되돌리기"가 즉시 가능합니다.
- **기존 색상값을 그대로 재사용하는 이유**: 희귀도/카테고리 색상을 재조정하지 않고 기존 `jam-lime/teal/purple/yellow`를 그대로 이관하는 이유는, 유저가 이미 학습한 "이 색 = 이 희귀도" 연상을 리뉴얼로 깨뜨리지 않기 위해서입니다. 배경/테두리 등 나머지 UI만 바이너리로 바뀌고, 배지의 색 언어는 그대로 유지됩니다.
- **확장성**: `state_color_palette`에 `scope` 컬럼을 둔 이유는, 이후 팩션(faction) 색상이나 POI 카테고리 색상처럼 다른 "예외 색상 그룹"이 생겨도 테이블 구조를 바꾸지 않고 새 `scope` 값만 추가하면 되기 때문입니다.
- **단순성**: i18n을 Phase 1에서 DB가 아닌 코드 객체로 잡은 이유는, 지금 결정된 범위가 "번역은 나중"이기 때문입니다. 코드 객체 구조는 나중에 `en.ts` 파일 하나만 추가하면 실제 다국어로 확장 가능하며, 지금 단계에서 DB 테이블/마이그레이션까지 만드는 건 과설계입니다.

---

## 확정된 결정 (2차 인터뷰)

- `state_color_palette`의 `badge_rarity` scope는 4개 고정 슬롯(색상만 수정 가능, 키 추가/삭제 불가).
- `theme_presets` 전환은 **즉시 적용만** 지원한다 — 예약 발행(날짜 지정 자동 전환) 기능은 만들지 않는다. 시즌 이벤트 담당자가 당일 직접 버튼을 눌러 활성화한다.
- RLS 정책: `theme_presets`, `state_color_palette` 모두 **전체 유저 SELECT 허용 + INSERT/UPDATE/DELETE는 admin 역할만** — 기존 `badges`/`missions` 등 다른 어드민 관리 테이블과 동일한 패턴을 따른다.

## [NEEDS CLARIFICATION]

- [ ] `state_color_palette`의 `scope` 종류를 배지 희귀도/카테고리 외에 어디까지 미리 정의해둘지 (팩션, POI 카테고리 등) — Phase 2 착수 시점에 재검토.
