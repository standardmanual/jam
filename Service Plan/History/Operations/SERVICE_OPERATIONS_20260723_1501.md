# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 15:01)

> **이 버전의 변경 내용:** 잼 포인트 시스템 1a단계(체계) 신규 구축 — 유저별 잔액(`point_wallets`)·불변 원장(`point_transactions`)·발행 장부(`point_treasury`)와 `award_points()` RPC(마이그레이션 045), 배지/아이템배지/미션 발급 지점의 포인트 적립 연동, 내 프로필 잔액·포인트 내역 화면, `/admin/points` 대시보드 + 유저 지급/회수 공용 폼(어드민 유저 상세에도 임베드), 배지 에디터 `포인트 보상` 필드, 미션 에디터 배지 보상 포인트 경고. 포인트 상점(1b)·유저 간 거래(2단계)는 범위 아님.
> 이전 버전: SERVICE_OPERATIONS_20260723_1435.md

---

## [신규] 잼 포인트 데이터 모델 (마이그레이션 045)

`supabase/migrations/045_point_system.sql`:

- **`badges.point_reward`** (INTEGER, DEFAULT 0, CHECK ≥ 0) — 배지 발급 시 함께 지급하는 포인트. 0이면 없음. 발급 시점 값으로 1회 지급되며, 이후 값을 바꿔도 이미 지급된 포인트는 소급 변경되지 않음.
- **`point_wallets`** (PK=user_id, balance, updated_at) — 유저별 잔액 캐시. lazy 생성(첫 지급 시 upsert). RLS: 본인 SELECT만, 쓰기 경로 없음.
- **`point_transactions`** (append-only 원장) — amount(≠0, +적립/−차감), reason(TEXT+CHECK: `badge_point_reward`/`mission_point_reward`/`admin_grant`/`admin_deduct`), source_badge_id/source_mission_id, admin_reason_label/admin_reason_note. 수정·삭제 없음(정정은 반대 부호 새 행). RLS: 본인 SELECT만.
- **`point_treasury`** (싱글톤 id=1) — total_minted/total_reclaimed 누계. 상한 없음(마이너스 허용). RLS 정책 없음 = 운영 전용.
- **`award_points()` RPC** (SECURITY DEFINER, `search_path=public`) — 잔액 변경의 **유일한 경로**. ①원장 삽입 ②잔액 upsert ③treasury 집계를 하나의 트랜잭션으로 처리. `anon`/`authenticated` 실행권한 REVOKE, `service_role`만 GRANT.

> **정합성 불변식(운영 감시):** `Σ point_wallets.balance = treasury.total_minted − total_reclaimed = Σ point_transactions.amount`. 세 값이 어긋나면 원장 버그 → `/admin/points`가 매번 비교해 경고 배너 노출.

### ⚠ 배포 시 반드시 확인

- **마이그레이션 045는 원격 Supabase에 아직 적용되지 않음** (이번 작업 환경엔 로컬 Docker/Supabase가 없어 SQL 파일만 작성). 배포 전 `supabase db push` 또는 대시보드 SQL Editor로 045를 적용해야 포인트 기능이 동작한다.
- 045 적용 직후, **이미 `reward_type='points'`로 설정돼 활성 상태인 미션**이 있으면 그 미션 완료자부터 즉시 실제 적립이 시작된다(소급 지급은 없음 — 적용 이후 신규 완료분만).

---

## [신규] 포인트 적립 연동 (서버 로직)

`src/lib/points/index.ts` — `awardPoints(userId, amount, reason, opts)`(RPC 얇은 래퍼, **amount=0이면 호출 스킵**), `getWallet(userId)`, `listTransactions(userId, cursor)`. `reasons.ts` — 어드민 사유 고정 목록 + 기준액 상수(`HIGH_VALUE_THRESHOLD=1000`). `summary.ts` — 대시보드 집계.

기존 발급 지점 3곳에 적립 호출을 나란히 추가(발급 성공을 전제로 지급, 0이면 스킵):

- **`src/lib/badge-engine/index.ts`** — 배지 발급 직후 `point_reward>0`이면 `awardPoints(..., 'badge_point_reward', {sourceBadgeId})`. `badge_earned` 피드 메타에 `point_reward` 추가.
- **`src/lib/drop-engine/index.ts`** — 아이템배지 인벤 삽입 직후 동일 연동(배지 조회 select에 `point_reward` 추가).
- **`src/lib/missions/checker.ts`** — 미션 완료 판정 직후 `reward_type==='points' && reward_points>0`이면 `awardPoints(..., 'mission_point_reward', {sourceMissionId})`.
- **`src/lib/activity-feed/index.ts`** — `FeedEventMeta.badge_earned`에 `point_reward?: number` 필드 추가.

> 포인트 지급 실패는 예외를 던지지 않고 로그만 남긴다(배지 발급 등 본 흐름을 계속 이어가기 위함) — 재시도는 이번 범위에서 수동 처리.

---

## [신규] 유저 화면

- **내 프로필**(`/[username]`, 본인 조회 시): 이메일 바로 아래 잔액 노출 + `/points` 링크. **타인 프로필에는 노출 안 함**(조회조차 하지 않음 — 이메일급 비공개 정보).
- **포인트 내역**(`/points`, 신규): 잔액 + 최근 내역(사유·날짜·금액), 관련 배지/미션 링크, 빈 상태·에러+재시도·더보기(커서 페이지네이션). API `GET /api/points`(본인 전용).
- **배지 상세**(`/badges/[id]`): `point_reward>0`이면 안내 문구(획득 여부에 따라 과거/미래 시제).

---

## [신규] 어드민 화면

- **`/admin/points`**(신규): 요약(총 발행/회수/유통량/유저 보유 합계), **정합성 경고 배너**(세 값 불일치 시), 배지·미션별 발행량 순위, **최근 고액 지급/회수 목록**(기준액 이상 최근 20건, 사후 감사), 유저 검색 → 지급/회수. AdminNav에 "포인트 관리"(💎) 추가.
- **유저 지급/회수 공용 폼**(`UserGrantForm.tsx`) — `/admin/points`(검색 후)와 **`/admin/users/[id]`(섹션 임베드)** 양쪽에서 동일 컴포넌트/실행 로직 사용. 방향(지급/회수) + 금액 + 사유 드롭다운 + "기타" 시 자유 입력 + 기준액(1,000P) 이상 시 확인 팝업.
- **지급/회수 API**(`POST /api/admin/points/grant`) — 사유 목록 검증, "기타" 노트 필수, **기준액 이상인데 `confirmed:true` 없으면 422 거부**(프론트 우회·오탈자 방어선). `admin_reason_label`/`admin_reason_note`가 원장에 남음.
- **요약/검색/유저상세 API**(`GET /api/admin/points`) — 쿼리에 따라 요약 통계 / `?userId=`(대상 유저 잔액·내역) / `?q=`(유저 검색+잔액) 분기.
- **배지 에디터**(`/admin/badges/[id]`): "포인트 보상" 입력 필드 추가(POST/PUT API에 `point_reward` 저장, 0 미만·소수 방어).
- **미션 에디터**(`/admin/missions`): 보상 타입이 배지/아이템배지면 배지 선택 드롭다운 노출, 선택 배지에 `point_reward>0`이면 **"이 배지는 발급 시 자동으로 N 포인트도 함께 지급됩니다" 경고**(의도된 이중 지급 확인용).

---

## 참고 — 이번 범위가 아닌 것 (코드 없음)

- 포인트 상점(`PointSink`, 가방 칸 확장 등) — 1b단계
- 플리마켓(정가 매물)·물물교환(TradeOffer) — 2단계
- 기존 배지에 `point_reward` 소급 일괄 채우기 / 포인트 소급 지급 — 하지 않음

---

기타 섹션은 이전 버전과 동일.
