---
id: "20261018_0052"
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-10-18
parent: "20261018_0050"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
  - "docs/plan/jam2/service-redesign/현재 서비스 비교.md"
  - "docs/service/prd/02_DATA_MODEL.md"
---

# [BadgeEngine] JAM 2.0 캡슐 서버: 캡슐 상태, 채우기, 열기, 추첨, 빈칸 검사

## 핵심 요약

- 요구사항: 운영 로직 5.2·5.4절의 캡슐을 서버까지 만든다. 유저마다 캡슐 하나(언제나 있음), 챕터별 채울 양, 채우기(잼 원장에서 차감), 열기(개수·트라이브·등급·아이템 배지·잠김 추첨, 보정 두 가지, 인벤토리 빈칸 검사), 열 때마다 기록, 이용 정지 중 막기까지다. 화면은 3-4다.
- 구현 계획: 시작 때 사용자 결정 4건을 질문하고 파일 단위 계획을 옮겨 쓴다. SQL(새 테이블 둘, 새 설정 행, 새 칸)은 사용자 승인과 롤백 실측 뒤 카리나가 실행한다. 규모가 커서 2회로 나눈다(1회 저장·채우기, 2회 열기·추첨).
- 관련 파일(2026-10-18 조사, 시작 때 아현이 줄 위치를 다시 확인한다):
  - 잼: 마이그레이션 `220_jam_ledger.sql`(`jam_wallets`, `jam_transactions`, 함수 `jam_apply`, 사유 `capsule_fill`·`locked_item_badge_fill`은 이미 정의됨, 음수만 허용).
  - 챕터: `221_chapters.sql`(`chapter_definitions`, `user_chapters`, 점수 규칙 `capsule_open`), 챕터가 없는 유저는 퀘스트 전이다.
  - 추첨: `jam-web/src/lib/drop-engine/syncIssue.ts`(등급 추첨, 한 등급 내림 폴백, 후보 조회)와 `syncIssueRun.ts`(발급 실행), `user_drop_state.common_streak`(동기화와 캡슐이 합산해 센다). 보정 1(15번 동안 Epic 이상이 없으면 보장)은 새 카운터가 필요하다.
  - 지급: `grant_inventory_item` RPC, 발급 기록 `item_issue_log`(route에 `capsule` 추가), 이용 정지 검사 `jam-web/src/lib/suspension/suspension.ts`(`assertNotSuspended`).
  - 스펙: 운영 로직 5장, 게이미피케이션 밸런스 3·4절, 비교표 3.5절.

## 배경 / 문제 정의

캡슐은 지금 서비스에 없다. 운영 로직 5.2절: 유저마다 캡슐은 하나이고 언제나 있다. 필요량은 캡슐이 생길 때 정해지고(채우는 도중 챕터가 올라도 바뀌지 않음), 채운 잼은 꺼낼 수 없다. 열면 바로 열리고(기다림 없음) 나오는 아이템 배지는 열 때 정해진다. 인벤토리 빈칸이 나올 수 있는 최대 개수(2)보다 적으면 열 수 없고 채운 잼은 남는다.
드랍 엔진에 같은 모양의 장치(확정 1개와 보너스 확률, 등급 비율 추첨, Common 연속 보정)가 있고 2-4가 새 모듈로 다시 썼다. 캡슐은 그 추첨 코드를 재사용하되 수치가 다르다.
공용 DB 주의: 옛 프로덕션 코드가 같은 테이블·함수를 쓴다. 새 칸·새 테이블·새 함수·새 설정 행만 덧붙이고 기존 칸의 뜻은 바꾸지 않는다. 축소는 묶음 6이다. SQL은 아현이 파일로 쓰고, 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다.

## 시작 전에 사용자에게 확인할 것 (주요 결정, 질문창)

1. **캡슐 상태와 기록의 저장**: 유저당 한 행의 `user_capsules`(필요량 고정, 채운 양, 생긴 때)와 열 때마다 한 줄의 `capsule_opens`(연 시각, 그때의 챕터, 채운 양, 나온 개체, 잠김 여부) 새 테이블 둘(추천)과 기존 테이블에 칸을 더하는 방식. 잼 원장에는 채우기 때마다 `capsule_fill` 한 줄이 남는다.
2. **수치 설정**: 개수, 다른 트라이브 확률, 등급 확률, 보정 값, 퀘스트 전 양과 챕터별 채울 양(90~220)을 새 설정 행(`capsule_policy` 한 행 + 챕터별 양 표)으로 둔다(추천, 설정 화면은 묶음 7). 대안은 `jam_policy`에 칸을 더하는 것이다.
3. **열기의 계산 위치**: 추첨은 앱 코드(기존 추첨 모듈 재사용), 잼 확인·상태 갱신·개체 지급·기록은 DB 함수 한 번으로 한다(추천: 같은 캡슐을 두 번 여는 경쟁과 반쯤 열린 상태를 막는다). 대안은 앱 코드가 전부 순서대로 부르는 것이다.
4. **퀘스트 전 첫 캡슐**: 챕터가 없는 유저의 캡슐은 필요량 5이고 잠긴 아이템 배지가 반드시 하나 나온다(5.2절). 이 티켓은 규칙을 구현하고 온보딩 연결은 묶음 6이 한다(추천). 대안은 이 규칙을 묶음 6으로 미루는 것이다.

## 사용자 결정 (2026-10-18, 질문창, 모두 추천안)

1. **캡슐 상태와 기록의 저장**: 새 테이블 둘(`user_capsules` 유저당 한 행, `capsule_opens` 열 때마다 한 줄). 잼 원장에는 채우기 때마다 `capsule_fill` 한 줄이 남는다.
2. **수치 설정**: 새 설정 행 `capsule_policy`(한 행)와 챕터별 채울 양 표 `capsule_chapter_costs`. 챕터 정의는 건드리지 않고, Common 연속 보정(10번)과 잠길 확률(25%)은 동기화와 합산하는 값이라 `jam_policy`의 것을 그대로 쓴다. 설정 화면은 묶음 7.
3. **열기의 계산 위치**: 추첨은 앱 코드(기존 추첨 모듈 재사용), 채운 양 확인·빈칸 확인·개체 지급·기록·다음 캡슐 생성은 DB 함수 한 번으로 한다(같은 캡슐을 두 번 열거나 반쯤 열린 상태를 막는다).
4. **퀘스트 전 첫 캡슐**: 규칙(필요량 5, 잠긴 아이템 배지 하나가 반드시 나옴)만 서버에 구현하고 온보딩 연결은 묶음 6.

## 상세 요구사항

### 서비스/코드베이스 관점

- **캡슐 하나**: 유저가 처음 필요할 때 만든다(지연 생성). 열면 같은 트랜잭션에서 다음 캡슐을 만든다. 다음 캡슐의 필요량은 그때의 챕터로 정한다.
- **채우기**: 기본값은 남은 양, 가진 잼이 모자라면 가진 만큼 전부. 양을 줄여서 채울 수 있고, 남은 양보다 많이 채울 수 없다. 채운 잼은 되돌리지 않는다. 채우기는 `jam_apply`(`capsule_fill`, 음수)와 캡슐 갱신이 한 트랜잭션이다. 이용 정지 중에는 거부한다(`user_suspended`, 403).
- **열기 순서(5.2절)**: 개수(1개 확정 + 20%로 1개 더) → 트라이브(하나마다 20%로 다른 트라이브, 나머지 넷 가운데 고르게) → 등급(70/22/6/2, 보정 두 가지) → 그 트라이브·등급의 후보(활성이고 공개 기간 안) 중 무작위 → 잠김(3-1의 함수, 25%). 후보가 없으면 한 등급씩 내려 다시 뽑는다(2-4와 같은 방식).
- **보정**: 보정 1은 15번 열 동안 Epic 이상이 없으면 다음 캡슐은 Epic 이상(새 카운터 칸). 보정 2는 Common이 10번 이어지면 다음은 Rare 이상(기존 `common_streak`를 동기화와 합산).
- **빈칸 검사**: 빈칸이 나올 수 있는 최대 개수보다 적으면 열기를 거부하고 지금 빈칸 수와 필요한 빈칸 수를 응답에 싣는다. 채운 잼은 그대로 남고 다음 캡슐은 생기지 않는다.
- **기록**: 열 때마다 `capsule_opens`에 한 줄, 개체마다 `item_issue_log`(route `capsule`)에 한 줄. 캡슐 연 횟수는 기록으로 센다(액티비티 배지 조건은 묶음 4, 챕터 점수는 묶음 5).
- **API**: 캡슐 조회, 채우기, 열기 라우트. 응답에 필요량, 채운 양, 열 수 있는지(`openable`)와 못 여는 까닭(빈칸 모자람 수치 포함)을 싣는다. 세션 유저로만 호출하고 서비스 클라이언트로 DB 함수를 부른다.
- 문구는 «열 때 부추기지 않는다, 낮은 등급을 꽝으로 표현하지 않는다»(5.2절 연출)를 API 오류 문구에도 지킨다. 새 칸과 새 함수는 덧붙이기만 한다. 생성 타입을 같은 커밋에 맞춘다.

### UI/UX 관점 (해당 시)

- 없음(화면은 3-4).

## 구현 계획 (회차)

규모가 커서 처음부터 2회로 나눠 돌리고 회마다 게이트를 돌린다. 요약은 2,500자 이내. 각 회의 SQL은 카리나가 먼저 승인·롤백 실측·적용하고 생성 타입을 맞춘다. 아현은 SQL을 만들지 않는다. `planOnlyWaiver`를 넘긴다. tsc 메모리 한도는 이미 올라가 있다(티켓 20261018_0051).

### 1회: 저장(SQL 232), 설정, 채우기, 조회 API

SQL(마이그레이션 `232_capsule_storage_and_fill.sql`)이 만드는 것: 새 테이블 `capsule_policy`(한 행), `capsule_chapter_costs`(챕터 1~10: 90·100·110·120·135·150·165·180·200·220), `user_capsules`, `capsule_opens`, `user_drop_state.capsule_epic_miss`(보정 1 카운터), 새 함수 `capsule_get_or_create(p_user_id)`(없으면 그때의 챕터로 필요량을 정해 만듦, 챕터가 없으면 퀘스트 전 값 5, 표의 마지막보다 높으면 마지막 양), `capsule_fill(p_user_id, p_amount)`(기본값은 남은 양, 가진 잼이 모자라면 가진 만큼, 남은 양 초과 거부, `jam_apply(capsule_fill)` 한 줄과 캡슐 갱신이 한 트랜잭션, 이용 정지 중 거부). 오류 코드: `user_suspended`, `already_full`, `invalid_amount`, `exceeds_remaining`, `insufficient_jam`.

1. `jam-web/src/lib/capsule/capsule-contract.ts`(새 순수 파일, import 없음): 응답 타입(`CapsuleStatus`: `required`, `filled`, `remaining`, `balance`, `openable`, `notOpenableReason`), 오류 코드 상수와 타입. 클라이언트도 가져올 수 있어야 한다.
2. `jam-web/src/lib/capsule/policy.ts`(서버, `lib/jam/policy.ts`의 `getJamPolicy` 패턴): `DEFAULT_CAPSULE_POLICY`(232 기본값과 같게)와 `getCapsulePolicy(supabase)`(칸 단위 폴백). 챕터별 양 표는 DB 함수가 읽으므로 앱은 정책 행만 읽는다. 2회의 추첨이 이 값을 쓴다.
3. `jam-web/src/lib/capsule/capsule.ts`(서버 전용): `getCapsuleStatus(supabase, userId)`는 `capsule_get_or_create`와 `jam_wallets` 잔액을 읽어 `CapsuleStatus`를 만든다(1회의 `openable`은 `filled >= required` 여부만, 빈칸 검사는 2회). `fillCapsule(supabase, userId, amount?)`는 `capsule_fill` RPC를 부르고 오류 코드를 `CapsuleError`로 바꾼다. RPC 호출 전에 `assertNotSuspended`(`lib/suspension/suspension.ts`)를 먼저 부른다.
4. `jam-web/src/app/api/capsule/route.ts`(GET)와 `jam-web/src/app/api/capsule/fill/route.ts`(POST `{ amount?: number }`): 세션으로 유저를 확인하고(401) 서비스 클라이언트로 부른다. 오류 매핑: `user_suspended` 403(`code: 'user_suspended'`, 2-6과 같은 모양), `already_full`·`exceeds_remaining`·`invalid_amount` 400, `insufficient_jam` 409, 나머지 500. `amount`는 양의 정수만(상한은 필요량 이내는 DB가 판정).
5. `jam-web/src/lib/i18n/ko.ts`: `d.capsule.*`(채우기 오류 문구와 안내). 부추기는 말, 꽝 표현 금지, `fluent-korean` 지침.
6. 시험: 정책 기본값(232와 같음)과 칸 단위 폴백, `capsule.ts`(가짜 RPC로 오류 코드 변환, 이용 정지가 RPC 호출 전에 막음), 두 라우트(401, 400, 403, 409, 정상), 클라이언트·서버 경계(`capsule-contract.ts`에 import 없음, 클라이언트 사슬에 서버 모듈 없음).
7. 문서: `docs/service/prd/02_DATA_MODEL.md`(새 테이블·함수·칸), `docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md`(캡슐 채우기 규칙 절, 열기는 2회), 비교표 3.5절 진행 상황.

### 2회: 열기(추첨, 보정, 빈칸 검사, 기록), 열기 API

SQL(마이그레이션 233, 1회 뒤에 카리나가 쓴다): 열기 함수 `capsule_open(p_user_id, p_items JSONB, p_guaranteed_locked BOOLEAN ...)`가 캡슐 행을 잠그고 채운 양과 이용 정지를 확인하고, 빈칸이 `p_items` 개수 상한(`guaranteed_count + bonus_count`)보다 적으면 거부하고, 개체마다 `grant_inventory_item_locked`로 지급하고 `item_issue_log`(route `capsule`)와 `capsule_opens`에 쓰고, `user_drop_state`의 `common_streak`·`capsule_epic_miss`를 갱신하고, 다음 캡슐을 만든다. 파일 단위 계획은 1회 뒤에 이 절에 옮겨 쓴다.

## 완료 조건

### 구현 범위 (게이트 판정 대상, 회차마다 해당 항목)

- (1회) 캡슐 상태, 열기 기록, 설정 행을 저장하는 새 테이블이 있고, 마이그레이션이 옛 객체를 바꾸지 않으며 되돌림 SQL을 싣는다. 클라이언트 역할은 쓰지 못한다.
- (1회) 채우기가 기본값(남은 양), 줄인 양, 가진 잼 부족(가진 만큼), 초과 거부를 지키고 잼 원장 한 줄과 함께 한 트랜잭션이다. 이용 정지 중 거부된다. 필요량은 캡슐이 생길 때 고정되어 챕터가 올라도 바뀌지 않는다.
- (2회) 열기가 개수·트라이브·등급·후보·잠김 순서로 추첨하고, 보정 두 가지와 후보 없음 폴백을 지킨다. 확률 경계 시험과 보정 시험이 있다.
- (2회) 빈칸이 모자라면 열기가 거부되고 채운 잼이 남으며 다음 캡슐이 생기지 않는다. 같은 캡슐을 동시에 두 번 열어도 한 번만 열린다.
- (2회) 열 때마다 기록이 남고, 퀘스트 전 첫 캡슐은 필요량 5에 잠긴 아이템 배지가 하나 반드시 나온다.
- (전체) `docs/service/badge-engine/`와 `docs/service/prd/`에 캡슐 규칙이 반영되어 있다.

### 후속 범위 (담당: 카리나, 시점: 사용자 승인 뒤)

- 사용자 확인 1~4번의 결정을 이 티켓 「사용자 결정」 절에 기록한다. SQL 실행은 승인과 롤백 실측 뒤에 하고, 실제 잼과 인벤토리를 바꾸는 시험은 하지 않는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
