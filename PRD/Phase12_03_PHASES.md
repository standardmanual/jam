# JAM! Phase 12 구현 단계 — 잼 포인트 시스템 (1a단계, 단계 릴리즈)

> 작성일: 2026-07-23
> 각 Step은 독립 배포 가능. Step 완료 기준 충족 후 다음 Step 진행.

---

## Step 0: 전제조건

- [ ] 최신 마이그레이션(044)까지 DB 적용 확인
- [ ] `missions.reward_type`/`reward_points` 기존 데이터 확인 — 이미 'points' 타입으로 설정된 미션이 있는지 확인(있다면 Step B 배포 즉시 그 미션들이 실제 지급을 시작하게 됨을 인지)

## Step A: 스키마 + 원장 함수 (마이그레이션 045)

- `point_wallets` / `point_transactions` / `point_treasury` 생성 (Phase12_02 §3)
- `badges.point_reward` 컬럼 추가 (Phase12_02 §2)
- `award_points()` RPC 함수 생성 (Phase12_02 §4)
- `src/lib/points/index.ts` — `awardPoints()` 얇은 헬퍼 (RPC 호출 래핑), `getWallet(userId)`, `listTransactions(userId, cursor)`

**완료 기준**: 마이그레이션 적용 후 기존 기능 회귀 없음. RPC를 수동 호출(SQL Editor)해서 잔액·원장·treasury가 함께 갱신되는 것 확인.

## Step B: 적립 연동 (배지·미션)

- `src/lib/badge-engine/index.ts:526` 부근 — 배지 발급 직후, 해당 배지의 `point_reward > 0`이면 `awardPoints(userId, point_reward, 'badge_point_reward', { source_badge_id })` 호출
- `src/lib/drop-engine/index.ts:395` 부근 — 아이템배지 발급 직후 동일하게 연동(아이템배지도 `point_reward`를 가질 수 있음 — Phase12_02 §2는 `badges` 테이블 전체에 적용되므로 activity/item 배지 구분 없이 동작)
- `src/lib/missions/checker.ts:92` 부근 — 미션 완료 판정 시 `reward_type === 'points'`면 `awardPoints(userId, reward_points, 'mission_point_reward', { source_mission_id })` 호출
- `FeedEventMeta.badge_earned`(`src/lib/activity-feed/index.ts`)에 `point_reward?: number` 필드 추가 — 피드 카드가 "+N P" 표시할 수 있게. `mission_completed`는 기존 `reward_points` 필드 재사용(이미 있음)
- 테스트: `point_reward=0`인 배지는 지급 이벤트 자체가 발생하지 않는지(불필요한 0원 원장 방지) 확인

**완료 기준**: `point_reward`가 설정된 배지를 발급받으면 잔액이 정확히 증가하고 피드에 "+N P" 노출. `reward_type='points'`인 미션 완료 시 실제 잔액 증가(기존 화면 표시 금액과 일치).

## Step C: 유저 화면

- `src/app/(main)/profile/page.tsx` — 이메일 아래 잔액 표시 (본인 전용, `getWallet()` 사용)
- `src/app/(main)/[username]/page.tsx` — **변경 없음** (잔액 표시를 추가하지 않는 것 자체가 이번 요구사항 — 실수로 넣지 않도록 주의)
- `src/app/(main)/points/page.tsx`(신규) — 포인트 내역 화면: 잔액 + 최근 내역 목록, 항목별 관련 배지/미션 링크, 빈 상태·에러 상태
- `src/app/(main)/badges/[id]/page.tsx` — 배지에 `point_reward > 0`이면 안내 문구 추가

**완료 기준**: 본인 프로필에서만 잔액 노출 확인(다른 유저 계정으로 내 프로필 접속 시 안 보임). 포인트 내역 화면에서 최근 지급 내역과 사유가 올바르게 표시.

## Step D: 어드민 화면

- `src/app/admin/points/page.tsx`(신규) + `src/app/api/admin/points/route.ts`(신규) — 요약(발행량/회수량/유통량), 정합성 체크(Phase12_02 §5 세 값 비교, 어긋나면 경고 배너), 배지·미션별 발행량 순위, **최근 고액 지급/회수 목록**(기준액 이상 원장 최근 N건, 사후 감사용)
- 유저 지급/회수 컴포넌트(신규, 공용) — `src/app/admin/points/UserGrantForm.tsx` 같은 공유 컴포넌트를 만들어 아래 두 곳에서 재사용:
  - `src/app/admin/points/page.tsx` 내 유저 검색 결과에서 진입
  - `src/app/admin/users/[id]/page.tsx`에 섹션으로 추가
  - 폼: 사유 드롭다운(`reasons.ts` 고정 목록: CS 보상/오류 정정/이벤트·프로모션 지급/어뷰징 적발 회수/과거 데이터 소급 반영/기타) + "기타" 선택 시 자유 입력란 + 금액 + 기준액(1,000P) 이상이면 확인 팝업
  - API: `src/app/api/admin/points/grant/route.ts`(신규) — `awardPoints()` 호출, `admin_reason_label`/`admin_reason_note` 기록. 기준액 이상인데 `confirmed: true`가 없으면 422 반환(Phase12_04 §3)
- `src/app/admin/badges/[id]/page.tsx` — "포인트 보상" 입력 필드 추가
- `src/app/admin/missions/MissionList.tsx` — 보상으로 배지를 선택했고 그 배지가 `point_reward > 0`이면 "이 배지는 발급 시 자동으로 N 포인트도 함께 지급됩니다" 안내 문구

**완료 기준**: `/admin/points`와 `/admin/users/[id]` 양쪽에서 동일 유저에게 지급/회수 실행 가능, 결과가 즉시 두 화면 모두에 반영. 정합성 경고 배너가 실제로 어긋난 상태를 만들어 테스트했을 때 노출됨(수동으로 원장 없이 잔액만 바꾸는 등 의도적 불일치 재현 후 확인, 확인 후 롤백). 기준액 이상 지급을 `confirmed` 없이 API 직접 호출 시 422로 거부되는지 확인.

---

## 릴리즈 순서 요약

```
Step 0 (전제) → A (스키마·원장함수) → B (적립 연동) → C (유저 화면) → D (어드민 화면)
```

각 Step 배포 후 확인: 잔액=원장 합계 일치 여부, 신규 지급 이벤트가 피드에 정상 노출되는지.

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 포인트 상점(PointSink, 가방 칸 확장 등) | 1b단계 |
| 플리마켓(정가 매물) | 2단계 |
| 물물교환 제안(TradeOffer) | 2단계 — 범위(아이템+포인트 혼합 허용 여부 등)는 그때 재논의 |
| 실물 패치 스토어 연동 | 최후순위 |
