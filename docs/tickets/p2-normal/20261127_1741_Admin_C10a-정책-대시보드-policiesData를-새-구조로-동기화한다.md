---
id: "20261127_1741"
category: Admin
priority: P2
status: IN_PROGRESS
created: 2026-11-27
parent: "20261127_1720"
workType: admin
---

# [Admin] C10a 정책 대시보드 `policiesData.ts`를 새 구조로 동기화한다

## 핵심 요약

- 요구사항: 정책 대시보드 카탈로그의 캡슐 항목을 상위 티켓 표대로 바꾸고, 새 항목(카드 표시 규칙, 진행값 적립 규칙, 챕터 보상)을 더한다(CLAUDE.md 규칙 2).
- 구현 계획: 아래 «구현 계획»의 단계를 파일 단위로 따른다(3단계).
- 관련 파일: `jam-web/src/lib/admin/policyDashboard/policiesData.ts` / `jam-web/src/lib/admin/policyDashboard/__tests__/policiesData.test.ts`, `liveValues.ts` / `jam-web/src/app/api/admin/policy-dashboard/route.ts`
- 선행 티켓: 20261127_1739(C9a), 20261127_1740(C9b)
- 상위 티켓: 20261127_1720(챕터 게이지 카드로 전환하고 캡슐을 폐지한다). 기획 경위와 사용자 확정 결정은 상위 티켓에 있다.

## 배경 / 문제 정의

상위 티켓 20261127_1720의 단계 C(전환, 같은 배포 창)에 속하는 조각이다. 잼은 챕터를 올리는 경험치이고 포인트는 별도 재화이며, 캡슐은 폐지한다(2026-11-27 사용자 결정). 챕터 1~9의 필요 잼은 870, 1,120, 1,260, 1,600, 1,980, 2,205, 2,700, 3,300, 3,960이고, 넘친 잼은 이월한다.

## 구현 계획 (2026-11-28, 현재 코드 기준으로 다시 씀)

정책 대시보드(`/admin/policy-dashboard`)의 카탈로그를 전환 결과에 맞춘다. 단일 원천은 상위 티켓 20261127_1720의 «정책 대시보드 `policiesData.ts` 동기화 대상» 표다. 새 문장은 **이미 끝난 티켓의 완료 기록에 적힌 사실만** 쓴다(A3 20261127_1723 보상 확정값, B1 1724, B2 1725, B3 1726, C1 1728, C2a 1729, C2b 1730, C3a 1731, C3b 1732, C5a 1734, C5b 1735, C8 1738, C9a 1739, C9b 1740과 `docs/service/prd/chapter/PRD.md`, `docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md`). 아직 끝나지 않은 티켓(C11 미션·배지 조건, C12 알림·크론, C13 큐레이션 태그)에 걸린 사실은 «전환 단계 진행 중»으로 짧게 적고 단정하지 않는다. 확인하지 못한 수치는 «미검증»으로 적는다.

1. `jam-web/src/lib/admin/policyDashboard/policiesData.ts`(1,701줄): 상위 티켓 표의 행마다 처리한다.
   - `ch1-core-loop`(17행): «캡슐·잠금 해금» 문구를 진행값(잼)→챕터 승급→챕터 오름 보상 흐름으로 교체.
   - `ch4-service-jam`(324)·`ch4-jam-condition-sum`(344): «잼이 곧바로 캡슐을 채워요» 계열을 «이번 챕터 진행값에 쌓여요» 계열로 교체하고 `nodes`의 `capsule`을 새 노드로 바꾼다(노드 정의는 `lib/admin/ecosystem/nodes.ts`이고 C10b가 정리한다. 이 티켓에서 노드 파일은 건드리지 않고, 새 노드 id가 필요하면 기존 `chapter` 계열 노드를 쓴다).
   - `ch5-costs-by-chapter`(363): «챕터별 필요 잼»(870, 1,120, 1,260, 1,600, 1,980, 2,205, 2,700, 3,300, 3,960, 챕터 10은 필요 잼 없음, 넘친 잼은 이월)으로 교체한다. `dbTable: 'chapter_definitions'`, `dbColumn: 'required_jam'`, `adminLink.href: '/admin/balance#chapter'`.
   - 챕터 보상 항목: `ch5-guaranteed-count`·`ch5-other-tribe-prob`·`ch5-rarity-probabilities`·`ch5-pity-epic`(522~572)을 «챕터 오름 보상» 항목으로 교체한다. 개수(마친 챕터 1~3은 3개, 4~6은 4개, 7~9는 5개: `chapter_definitions.reward_count`), 등급 확률(Common 30·Rare 40·Epic 22·Mystic 8), 다른 트라이브 확률 20%(트라이브 구성은 캡슐 규칙을 옮긴 가정), Epic 보정 15번(챕터 보상은 최대 9번이라 새 유저는 닿기 어렵다는 점 포함). `dbTable: 'chapter_reward_policy'`(개수는 `chapter_definitions`), `adminLink.href: '/admin/balance#chapter_reward'`. `ch5-feed-exclusion`(574)은 챕터 보상으로 받은 아이템 배지의 피드 처리 실제 동작을 C3b 기록으로 확인해 맞게 고친다.
   - 옛 캡슐 동작 항목 `ch5-auto-fill`(381)·`ch5-jam-forfeit`(427)·`ch5-forfeit-weekly`(444)·`ch5-capsule-alerts`(459)·`ch5-unseen-result`(507): 전환 뒤 동작하지 않는 것은 항목을 지우지 말고 `currentSpec`에 «기록 보존, 전환으로 더는 쓰이지 않음(제거는 D단계)»로 표시하거나(타입에 상태 칸이 있으면 그것을 쓴다) 상위 티켓 표대로 삭제한다. 어느 쪽이든 «캡슐이 가득 차면…» 같은 현재형 서술이 남지 않게 한다. 대기 보상 항목 `ch5-pending-reward`(396)·`ch5-claim-pending`(411)·`ch5-inventory-full-block`(476)은 챕터 오름 보상이 인벤토리 부족으로 대기될 때의 실제 동작(C3b·C5b 기록)으로 다시 쓴다. `ch5-gauge-notice`(492)는 새 챕터 게이지 카드(필요 잼 숫자가 바 안 오른쪽 끝, 모은 잼 숫자가 채움 끝을 따름)와 막힘 안내 설명으로 교체한다.
   - 문구 정리: `ch6-common-streak`(630)·`ch7-locked-roll-prob`(673)·`ch7-locked-open-score`(721)·`ch7-locked-open-feed`(740)의 «동기화·캡슐 합산», «캡슐을 채움», «캡슐에서 나온 잠긴 개체».
   - `ch12-advance-count`(1097)와 `ch12-score-thresholds`(1114): «챕터별 캡슐 100% 횟수»와 «누적 요구 점수표(죽은 값)»를 필요 잼 항목으로 교체(위 `ch5-costs-by-chapter`와 중복되면 하나로 합치고 id 하나를 지운다)하고 점수표는 삭제한다. `dbTable`·`dbColumn`·`adminLink`(`/admin/balance#capsule`)를 새 구역으로 바꾼다.
   - `ch16-suspension-capsule-hold`(1286): 이용 정지 중 동작을 C2a·C2b 기록으로 확인해 «진행값 적립 차단»으로 교체한다(기록에 없으면 «미검증»).
   - `ch18-probability-page`(1548): `capsule_policy` 읽기를 `chapter_reward_policy`·`chapter_definitions.reward_count`·`jam_policy` 읽기로 교체한다(C8 기록: 전환 날짜 한 줄은 SQL 369를 전환 배포 때 실행).
   - `ch19-kpi-capsule-speed`(1614): 챕터 오름 속도 KPI로 교체한다. 기존 `ch19-kpi-chapter-reach`(1627)와 중복이면 하나로 합치거나 역할을 나눠 적는다.
   - 새 항목: 챕터 게이지 카드 표시 규칙, 진행값 적립 규칙(승급·이월), 챕터 오름 보상(개수·확률·대기). 위 교체 항목으로 이미 채워지면 중복해서 더하지 않는다. 새 `id`는 고유해야 한다.
2. `jam-web/src/lib/admin/policyDashboard/liveValues.ts`(33줄)와 `jam-web/src/app/api/admin/policy-dashboard/route.ts`(`getCapsulePolicy` 병합 4곳): 실시간 값에 `getCapsulePolicy`를 쓰는 곳을 `lib/chapter/reward/policy.ts`의 `getChapterRewardPolicy`(같은 열 이름 `rarity_*`·`other_tribe_probability`·`pity_epic_threshold`)로 바꾼다. 다른 묶음(`ambient_drop_config`의 `rarity_*` 등)과 키가 겹치는지 확인하고, 겹치면 대시보드가 값을 고르는 방식(`dbColumn`·`dbTable`)을 읽어 올바른 쪽을 보게 한다. 한 묶음이 실패해도 던지지 않는 기존 규칙을 지킨다.
3. `jam-web/src/lib/admin/policyDashboard/__tests__/policiesData.test.ts`(544줄)와 `liveValues`·정책 대시보드 API 시험: 새 구조에 맞춘다. 단언: 정책 카탈로그에 «캡슐» 기능 용어가 현재형으로 남아 있지 않다(기록 보존 표시한 항목의 «기록 보존» 문구는 허용 목록으로 한정), 필요 잼 항목의 값이 870 … 3,960과 같고 `adminLink`가 `/admin/balance#chapter`를 가리킨다, 챕터 보상 항목의 값이 A3 확정 값과 같고 `adminLink`가 `#chapter_reward`를 가리킨다, 모든 `id`가 유일하다, 모든 `adminLink`의 구역 키가 `BALANCE_SECTIONS`에 있다(`#capsule`은 C10b까지 구역이 남아 있어 허용하되 새 항목은 쓰지 않는다).
4. 문서: `docs/service/prd/admin-ui/ADMIN_PRD.md`의 정책 대시보드 서술에 «캡슐» 항목이 있으면 맞춘다. 정책·밸런스 수치 규칙(`CLAUDE.md` 규칙 2)에 따라 이 티켓이 `policiesData.ts` 동기화 자체다.
5. 어드민은 채원 판정 제외(shadcn 표준). 아현·민지는 격리 워크트리에서 실렌더를 시도하지 않는다. 실렌더 검증은 카리나가 머지 뒤 push 전에 한다(패턴 13).
6. **하지 않는 것**: `lib/admin/ecosystem/nodes.ts`·밸런스 대시보드(`balanceDashboard/*`)·어드민 «캡슐» 구역 제거(C10b), `lib/capsule/*` 삭제(D), DB·SQL 변경, 확률·필요 잼 값 변경(문구와 연결만 바꾼다), 미션·배지 조건 항목(C11), 큐레이션 태그 항목(C13), 알림·크론 항목(C12).

## 완료 조건

- `policiesData.ts`에서 캡슐 항목 id가 0개이고 새 항목이 추가돼 있으며, `policiesData.test.ts`가 통과한다.
- 챕터별 필요 잼 항목이 DB 값(870~3,960)과 같고 `adminLink`가 새 구역을 가리킨다.
- 정책 대시보드 화면(`/admin/policy-dashboard`)에서 카리나가 실렌더로 확인했다.

## 규모와 체크포인트

- 규모: 파일 5~6개(`policiesData.ts` 큰 수정, `liveValues.ts`, API route, 시험 2~3, ADMIN_PRD), 약 600줄(추정, 미검증). 분할된 첫 조각
- 체크포인트: admin 유형: 머지 뒤 카리나 실렌더 검증.

## 주요 의사결정 / 핵심 메모

- 상위 티켓의 사용자 확정 결정과 «하지 않을 것»을 따른다. 확인하지 않은 수치는 «미검증»이다.
- 계획 반환 면제 전제: 이 티켓은 파일 5개 초과 또는 100줄 이상이 예상돼 위 «구현 계획»을 파일 단위로 적었다. 사용자가 이 방식을 승인했다(2026-11-27). `/jam-work` 호출 때 카리나가 `planOnlyWaiver`로 넘기고, 면제 사유를 여기에 이어서 남긴다.
- 결정 반영(2026-11-27, A3 20261127_1723): 챕터 보상 항목은 «미정» 표시가 아니라 후보 E의 값(개수와 등급 확률)으로 채운다. 트라이브 구성(내 80%, 다른 20%)은 캡슐 규칙을 옮긴 가정으로 표시한다.
