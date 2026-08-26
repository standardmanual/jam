---
id: 20260826_009
category: BadgeEngine
status: OPEN
created: 2026-08-26
---

# [BadgeEngine] 앰비언트(시스템) POI 드랍 재도입 — 카테고리/등급/컬렉션 축 기반 배포

## 배경 / 문제 정의

유저가 완성하고 싶은 컬렉션을 채우려면 아이템배지가 필요한데, 액티비티 동기화(드랍엔진 v2)로만
얻는 경로는 시간이 오래 걸린다. 주변 POI를 탐색하며 아이템배지를 발견·픽업하는 재미를 추가로
주기 위해 **시스템이 POI에 직접 아이템배지를 배치하는 앰비언트 드랍**을 재도입한다.

이 기능은 서비스 초기(마이그레이션 044)에 한 번 구현됐다가 **2026-08-25에 완전히 제거됐다**
(티켓 [20260825_004](20260825_004_Feature_앰비언트-드랍-기능-제거.md)). 제거는 버그 때문이
아니라 — 당시엔 미들웨어가 `/api/cron/*`를 307로 가로채 cron이 실행되지 않아 `source='system'`
행이 0건이었을 뿐 기능 자체는 갖춰져 있었다 — 그 사이 드랍엔진 v2·컨텐츠·POI 체계가 크게
성숙한 만큼, **예전 설계를 그대로 복원하지 않고 현재 정책 기반에 맞춰 새로 설계**하기로
결정했다(2026-08-26, `/layers-orient` 세션). 이 배경은 반드시 인지하고 작업할 것 —
`poi_drops.source`·`assign_random_serial()` 등 남아있는 레거시 조각과의 관계를 §3 참고.

## 상세 요구사항

### 1. 배치 모델 — 공유 배치형
기존 유저 드랍(`poi_drops`, `pickup_drop()` RPC)과 **동일한 오브젝트 모델을 재사용**한다.
시스템이 POI에 배지를 "놓아두면" 여러 유저가 같은 자리를 두고 경쟁하고, 먼저 픽업한 사람이
획득한다. `source='system'`, `dropper_user_id`/`expires_at`은 NULL — 이 규약은 이미
`poi_drops_source_consistency` CHECK(마이그레이션 044)에 정의돼 있다.

### 2. 만료 없음
앰비언트 드랍은 회수·만료 메커니즘이 필요 없다 — **상시 존재를 전제**로 한다. 특정 배지를
한시적으로만 노출하고 싶으면 배지 자체의 기존 `valid_from`/`valid_until` 필드를 쓰면 되므로,
드랍 레코드 차원의 새 만료 로직은 만들지 않는다.

### 3. 트리거 — 자동(지정 시각) + 수동(어드민), 상호 배제
- **자동**: 어드민이 등록한 스케줄(cron)에 따라 정기 배포
- **수동**: 어드민 화면의 "지금 배포" 버튼으로 즉시 배포
- **상호 배제**: 자동 스케줄이 등록돼 있으면, 그 스케줄 시각 전후 **n분**(어드민 설정 가능한
  값) 동안은 수동 배포 버튼을 비활성화한다. 두 트리거가 동시에 도는 것 자체는 운영 판단의
  문제가 아니라 **시스템 레벨 레이스 컨디션 방지**가 목적이므로, 그 창(window) 밖에서는
  자유롭게 수동 배포할 수 있어야 한다.

### 4. 배포 옵션 — 3축, 축별 명시값/무작위 + 전체 무작위
자동·수동 배포 모두 아래 3축을 어드민에서 설정한다. **각 축은 "명시적으로 값을 고른다" 또는
"무작위로 정한다(랜덤 모드)" 중 선택** 가능해야 하고, 3축을 한 번에 전부 무작위로 돌리는
메타 옵션도 필요하다.

| 축 | 명시 모드 | 무작위 모드 |
|---|---|---|
| 카테고리 | `poi_categories`(13종) 중 하나 또는 "전체" 선택 | 실행 시점에 카테고리 하나를 무작위로 선택 |
| 등급(rarity) 비율 | 등급별 비율을 직접 설정 | 실행 시점에 등급 분포를 무작위로 결정 |
| 대상 컬렉션(아이템북) | 단독 또는 멀티 선택 | 실행 시점에 컬렉션(들)을 무작위로 선택 |

예시: "산(mountain) 카테고리 + 전체 컬렉션 중 legend 등급 아이템배지를 무작위 드랍"처럼
일부 축은 고정, 일부 축은 무작위인 조합이 기본 사용 패턴이 될 것.

### 5. 현재 컨텐츠 제약
아이템배지 카탈로그는 **현재 common 등급만 존재**한다. 기능 자체는 전체 등급 옵션을 지원하도록
만들되, 지금은 운영상 등급 옵션을 common으로 설정해서 쓴다 (드랍엔진 v2의 "미보유 우선,
rarity 없으면 인접 등급 폴백" 같은 폴백 규칙이 필요한지는 구현자가 판단 — 지금은 사실상 common만
뽑히므로 폴백이 발동할 일이 없을 수 있음).

### 6. 스코프 제외 (향후 계획 — 이번 티켓에서 만들지 않음)
유저별 컬렉션 보유 현황·아이템배지 생성(발행) 현황·컬렉션 완성률 등을 근거로 **앰비언트
채널과 액티비티 드랍엔진 채널의 희귀도 분포를 교차 자동 조정**하는 밸런싱 시스템은 범위 밖이다.
이번엔 어드민이 수동으로 설정한 축 값을 그대로 실행할 뿐, 자동 조정 로직은 없다.

## 기술 연속성 참고 (구현 전 반드시 확인)

- **살아있는 레거시**: `poi_drops.source` 컬럼, `poi_drops_source_consistency` CHECK,
  `assign_random_serial()`의 앰비언트 분기(`source='system'`이면 일련번호 50,001~999,999
  범위)는 마이그레이션 100에서 **삭제되지 않았다** — 즉시 재사용 가능. 다만 `source` 컬럼의
  현재 COMMENT("레거시 — 전 행 'user'")는 이제 사실이 아니게 되므로 갱신할 것.
- **제거된 것**: `idx_poi_drops_system_available` 부분 인덱스(마이그레이션 100에서 DROP) —
  재생성 필요. 구 `ambient_drop_policy` 테이블(044에서 생성, 100에서 DROP)도 제거된 상태.
- **구 정책 테이블을 그대로 복원하지 말 것**: 044의 `ambient_drop_policy`는 "전역 상시
  커버리지 목표치"(target_coverage_ratio·min/max_target_total·replenish_batch_size로
  점진 보충하는) 모델이라, 이번 요구사항(§4의 축별 명시/무작위 + §3의 배치 단위 실행)과
  스키마 성격이 다르다. 참고용으로만 볼 것 — 그대로 스키마를 복사하지 말고 새로 설계.
  (과거 운영값은 문서에 남아있음: common 86%/rare 12%/legend 2%, 커버리지 15%, POI당 1개,
  보충 30개 — 참고용 초기값 후보로만 활용 가능)
- **참고 어드민 패턴**: `/admin/drop-policy`(`getDropPolicy()` + `DropPolicyForm`, 액티비티
  드랍엔진 v2 정책 화면)의 싱글톤 폼 구조를 참고하되, 이번엔 축별 명시/무작위 토글 UI가
  추가로 필요하다. 어드민 화면은 MODULAR 대상이 아니므로 기존 shadcn/ui 어드민 컴포넌트
  표준을 따른다.
- **카테고리 목록**: `poi_categories` 테이블(13개 slug — mountain, bike_route, trail, park,
  other, government, transit, hospital, pharmacy, tourist_attraction, convenience, food,
  nature).
- **cron 등록**: `vercel.json`에 현재 `poi-cleanup`·`notifications` 2개 등록돼 있음. 세 번째
  엔트리로 추가.
- **⚠️ cron 차단 재발 방지**: 이전 앰비언트 드랍이 0건이었던 근본 원인이 미들웨어가
  `/api/cron/*`를 307로 가로챈 것이었다(티켓 20260825_003). 이 미들웨어 수정이 여전히
  유효한지, 신규 cron 라우트도 인증 방식(307→401 전환)을 동일하게 따르는지 확인할 것.
- **DB 변경은 SQL 파일 작성까지만** — 실행은 사용자 승인 후 오케스트레이터가 처리한다
  (jam-developer 권한 없음, 프로젝트 공통 규칙).

## 구현 계획
> 구현자가 §3~6 요구사항과 위 기술 연속성 참고를 바탕으로 스키마·엔진 로직·어드민 화면
> 세부 설계를 진행한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

앰비언트(시스템) POI 드랍을 **카테고리/등급비율/대상컬렉션 3축 배치 실행형**으로 새로 설계해
재도입했다. 구 `ambient_drop_policy`(전역 커버리지 목표치 모델)는 참고만 하고 그대로 복원하지
않았다.

1. **DB (마이그레이션 104, 실행 안 함)** — `ambient_drop_config` 싱글톤 신설(3축 모드/값 +
   `auto_enabled`/`exclusion_window_minutes`/`all_random`/`batch_size`/`max_active_per_poi`),
   `idx_poi_drops_system_available` 재생성, `poi_drops.source` COMMENT를 "레거시"에서 활성
   컬럼 설명으로 갱신. `assign_random_serial()`/`poi_drops_source_consistency`/`pickup_drop()`은
   무변경 재사용.
2. **엔진** (`src/lib/ambient-drop/`) — `schedule.ts`(고정 스케줄 상수 + 상호 배제 창 판정),
   `config.ts`(싱글톤 get/update), `rarity.ts`(순수 함수 — 등급 추첨/무작위 분포 생성/폴백),
   `index.ts`(`runAmbientDropBatch` — 3축 확정 → POI/배지 후보 조회 → 배치 삽입 →
   `engine_decision_log` 기록). POI·배지 조회는 PostgREST 1000행 상한 대응으로 `.range()`
   페이지네이션(`fetchAllRows`) — "전체 카테고리/컬렉션" 모드에서 조용히 일부만 조회되는 사고
   (티켓 20260825_029와 같은 클래스)를 피했다.
3. **트리거** — 자동: `/api/cron/ambient-drop`(매일 18:00 UTC 고정, Vercel Hobby 일 1회 제약).
   `ambient_drop_config.auto_enabled=false`면 no-op. 수동: `/admin/ambient-drop`의 "지금 배포" →
   `POST /api/admin/ambient-drop/deploy`. 상호 배제는 API 레벨에서 강제(409) — 화면 버튼
   비활성화는 UX 편의일 뿐.
4. **어드민 화면** (`/admin/ambient-drop`) — 트리거(자동 스위치 + 상호 배제 창 분)/메타
   옵션(전체 무작위)/3축(각 명시·무작위 토글)/배치 규모/저장/지금 배포/최근 실행 이력(20건,
   `engine_decision_log` 조회) 단일 페이지. `adminNavItems.ts`에 '정책 및 밸런스' 그룹 항목 추가.
5. **`engine_decision_log`** — `EngineDecisionEvent`에 `'ambient_batch_result'` 추가(engine은
   기존 `'drop'` 재사용, event 컬럼엔 DB CHECK가 없어 마이그레이션 불필요).
6. **`vercel.json`** cron 2개 → 3개(`ambient-drop` 추가). `proxy.ts`의 `/api/cron` prefix가 이미
   `/api/cron/ambient-drop`도 커버해 별도 수정 불필요(확인만 함).
7. **타입** — `database.ts`(`AmbientDropConfigRow`/`AmbientDropAxisMode` 추가, `PoiDropSource`/
   `PoiDropRow.source` "레거시" 주석 제거)·`database.generated.ts` 수동 반영
   (`npm run db:types` 미실행 — 사고 이력 회피).
8. **문서** — PRD 01/02/03/04/README/Notification, BadgeEngine §3.12 갱신 (제거 판단 경위는
   보존하고 재도입 사실·신규 설계를 반영).

### 설계 의사결정 (상세는 "주요 의사결정" 참고)

- 스케줄 시각은 어드민이 자유 설정하는 게 아니라 **코드 상수로 고정**(18:00 UTC, vercel.json과
  동기화). `auto_enabled`는 "그 고정 시각에 실제로 배치할지"를 켜고 끄는 스위치다.
- 카테고리 축의 "전체" = `category_slug IS NULL`. 컬렉션 축의 "전체" = `collection_ids = []`
  (티켓 §4 예시 "전체 컬렉션 중 legend 등급 무작위 드랍"과 동일한 표현으로 채택).
- 등급 무작위 모드는 "실행 1회당 분포 자체를 무작위 생성"(개별 드랍마다가 아님) — §4 원문
  "등급 분포를 무작위로 결정"을 그대로 반영.
- 컬렉션 무작위 모드는 활성 컬렉션 1개를 무작위 선택(카테고리 축과 동일한 "하나를 무작위 선택"
  패턴으로 통일).
- 배치 대상 배지는 `item_book_id IS NOT NULL`인 것만(컬렉션 미소속 아이템배지 제외) — 이 축의
  목적 자체가 "컬렉션 채우기"이기 때문.

### 변경된 파일
```
[신규]
jam-web/supabase/migrations/104_ambient_drop_reintroduce.sql   ← 실행 전 (승인 후 오케스트레이터가 실행)
jam-web/src/lib/ambient-drop/schedule.ts
jam-web/src/lib/ambient-drop/config.ts
jam-web/src/lib/ambient-drop/rarity.ts
jam-web/src/lib/ambient-drop/index.ts
jam-web/src/lib/ambient-drop/__tests__/schedule.test.ts
jam-web/src/lib/ambient-drop/__tests__/rarity.test.ts
jam-web/src/app/api/cron/ambient-drop/route.ts
jam-web/src/app/api/admin/ambient-drop/config/route.ts
jam-web/src/app/api/admin/ambient-drop/deploy/route.ts
jam-web/src/app/admin/ambient-drop/page.tsx
jam-web/src/app/admin/ambient-drop/AmbientDropForm.tsx

[수정]
jam-web/vercel.json
jam-web/src/components/admin/adminNavItems.ts
jam-web/src/lib/engine-log/index.ts
jam-web/src/types/database.ts
jam-web/src/types/database.generated.ts

[문서]
Service Plan/Specs/PRD/01_PRD.md
Service Plan/Specs/PRD/02_DATA_MODEL.md
Service Plan/Specs/PRD/03_PHASES.md
Service Plan/Specs/PRD/04_PROJECT_SPEC.md
Service Plan/Specs/PRD/README.md
Service Plan/Specs/PRD/Notification/PRD.md
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 0 에러
- [x] `npm run build` — 성공. 라우트 목록에 `/admin/ambient-drop`,
      `/api/admin/ambient-drop/config`, `/api/admin/ambient-drop/deploy`,
      `/api/cron/ambient-drop` 확인
- [x] `npx vitest run` — 60 파일 / 562 테스트 전부 통과 (신규 17건: schedule 7 + rarity 10)
- [x] `npm run test:node` — 미션 visibility 실측 대조 포함 전부 통과 (무관 영역, 회귀 없음 확인)
- [x] `npx eslint` — 변경 파일 신규 오류 0 (경고 1건 자체 수정 — 미사용 eslint-disable)
- [ ] **실측 검증 미실시** — DB 마이그레이션(104)이 아직 미적용이라 실제 배치 실행(cron/수동
      배포)은 로컬/스테이징에서 실행해보지 못했다. 마이그레이션 적용 후 어드민 화면에서
      "지금 배포" 1회 실행 + `poi_drops` 실측 확인이 필요하다.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

이 화면은 `/admin/` 어드민 전용(MODULAR·소비자 화면 아님) — 대상 독자가 앱 유저가 아니라
운영자다. 기존 어드민 화면(`DropPolicyForm`·`ItemBookForm` 등)도 "POI" 등 내부 용어를 그대로
쓰고 톤도 해요체/합쇼체가 섞여 있어, 이번에도 그 기존 관례를 따랐다(신규 소비자 노출 문구
없음 — 배치되는 배지 자체의 이름·설명은 기존 배지 데이터를 그대로 쓸 뿐 이 티켓에서 새로
작성하지 않았다).

- [x] 용어 일관성: 드랍/픽업/배지 등 고정 용어는 그대로 사용. "POI"는 기존 어드민 화면 전반의
      관례를 따름(`adminNavItems.ts`의 "POI 관리" 등 기존에도 동일)
- [ ] 톤앤매너: 어드민 화면 특성상 해요체로 엄격히 통일하지 않았음(기존 `DropPolicyForm`도 동일)
- [x] 에러 메시지: 수동 배포 상호 배제(409) 메시지에 원인("자동 배포 스케줄 시각과 겹쳐")과
      해결책("전후 N분이 지나면 다시 시도")을 담았음
- [x] 문장 규칙: 마침표 위치 등 기본 규칙 준수
- [x] 표기 규칙: 분(分) 단위 명시, UTC/KST 병기

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

**1. "어드민이 등록한 스케줄"을 코드 상수(고정 시각)로 해석했다 (medium confidence 판단)**

티켓 §3은 "어드민이 등록한 스케줄(cron)에 따라 정기 배포"라고 적었으나, Vercel Hobby 플랜은
**일 1회 초과 빈도의 cron 표현식을 배포 시점에 거부**한다(SERVICE_OPERATIONS_20260723_1435,
실제 배포 실패 인시던트). 즉 실행 시각을 어드민이 런타임에 자유롭게 바꾸는 것은 이 플랫폼에서
불가능하다 — 바꾸려면 `vercel.json` 수정 + 재배포가 필요하다.

그래서 "스케줄 등록"을 **"고정된 하루 1회 시각(18:00 UTC, 구 ambient-drop-monitor와 동일 값
재사용)에 실제로 배치를 수행할지를 켜고 끄는 것"**으로 해석했다 — `auto_enabled` 토글 +
`exclusion_window_minutes`(§3이 명시적으로 "어드민 설정 가능"이라 부른 값)만 어드민이 조정한다.
스케줄 시각 자체는 어드민 화면에 읽기 전용으로 표시된다.

**대안으로 검토했으나 선택하지 않은 것**: DB에 임의 `HH:MM`을 저장하고 그걸 "스케줄"이라
어드민에게 보여주는 안 — 실제 vercel.json과 동기화되지 않으면 어드민이 존재하지 않는 실행
시각을 설정한 것으로 착각할 수 있어(정직하지 않은 UI) 채택하지 않았다.

**2. 컬렉션 축 "전체"를 explicit + 빈 배열로 표현했다**

축 설명표(§4)는 컬렉션 명시 모드를 "단독 또는 멀티 선택"이라고만 적어 "전체" 옵션이 없어
보이지만, 바로 아래 예시("산 카테고리 + **전체 컬렉션** 중 legend 등급 무작위 드랍")는 카테고리·
등급 두 축이 모두 explicit인 조합에서 "전체 컬렉션"을 쓴다 — 즉 전체 컬렉션도 explicit
모드의 한 상태여야 예시가 성립한다. 카테고리 축과 동일하게 "명시 + 미선택 = 전체"로 통일해
해석했다.

**3. `batch_size`/`max_active_per_poi`는 3축이 아닌 별도 실행 파라미터로 뒀다**

티켓은 3축(카테고리/등급비율/대상컬렉션)만 명시했지만, "몇 개를 배치할지"는 배치 실행 자체에
필수인 파라미터다. 구 `ambient_drop_policy`의 커버리지 계산(목표 총량 산정)은 재도입하지
않았고, 대신 "실행당 배치 개수"를 어드민이 직접 입력하는 단순한 형태로 뒀다 — 티켓 §6이
범위 밖으로 못박은 "교차채널 자동 밸런싱"과 방향이 섞이지 않도록 계산 로직 자체를 만들지 않았다.

**4. §5 폴백 규칙 — 만들었다 (RARITY_ORDER 고정 순서 폴백)**

티켓은 "폴백이 필요한지는 구현자가 판단"이라 했다. 현재는 사실상 발동하지 않지만(카탈로그가
common뿐), 기능 자체는 4개 등급을 전부 지원해야 하므로 뽑힌 등급에 후보가 없을 때
`common → rare → legend → mythic` 순서로 폴백하도록 만들었다 — "인접 등급"이라는 위상 개념이
아직 정의돼 있지 않아(드랍엔진 v2의 세계관 인접과 달리 등급 간 인접 그래프는 없음) 가장 단순한
고정 순서를 택했다.

**5. `engine_decision_log` 재사용 — 신규 이력 테이블을 만들지 않았다**

이전 앰비언트 드랍 0건 사고가 "조용히 실패해도 아무도 몰랐다"는 관측성 문제였던 만큼, 실행
결과를 남기는 것 자체는 안전장치로서 가치가 있다고 판단했다. 신규 테이블 대신 기존
`engine_decision_log`(engine='drop')에 event만 추가해 재사용 — 스키마 변경 없이(event 컬럼은
CHECK 제약이 없음) 관측성을 확보했다.

### 잔여 이슈

- **마이그레이션 104 미실행** — 승인 후 오케스트레이터가 실행해야 실제로 동작한다. 실행 전까지
  `/admin/ambient-drop`은 `ambient_drop_config` 조회 실패 시 기본값(폴백)으로만 표시되고,
  저장/배포는 테이블이 없어 실패한다.
- **실배치 실측 미실시** — 위 테스트 결과 참고. 마이그레이션 적용 후 최소 1회 수동 배포로
  `poi_drops` 실측 확인 필요.
- **어드민 UX Writing 톤 미세 조정 여지** — 해요체/합쇼체 혼재 상태를 기존 어드민 관례대로
  유지했다. 추후 어드민 전체 톤을 통일하는 별도 작업이 있다면 이 화면도 함께 다듬을 것.
