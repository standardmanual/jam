# JAM! Phase 12 프로젝트 스펙 — 잼 포인트 시스템 (1a단계)

> 작성일: 2026-07-23

---

## 1. 기술 스택 (기존 유지)

| 영역 | 선택 | 근거 |
|------|------|------|
| 잔액·원장 저장 | Postgres 테이블 + RPC 함수 (`award_points`) | 잔액-원장 정합성을 애플리케이션 레벨이 아니라 DB 트랜잭션으로 보장 — 동시 요청에도 안전 |
| reason 컬럼 타입 | `TEXT + CHECK` (Postgres `ENUM` 타입 아님) | `missions.reward_type`(011) 선례와 동일. `ENUM`은 값 추가마다 `ALTER TYPE`이 필요해 1b/2단계에서 `sink_redemption`/`trade_sell`/`trade_buy` 추가할 때 더 번거로움 |
| 설정값 관리 | **지급/회수 사유 목록은 코드에 고정** (`reasons.ts`), 어드민 편집 테이블 만들지 않음 | `drop_policy`/`abusing_policy`가 테이블인 이유는 확률·가중치처럼 운영 중 수시로 튜닝해야 해서다. 지급/회수 사유는 **회계 분류 코드**에 가깝다 — 자주 바뀌면 오히려 과거 원장의 `admin_reason_label` 집계가 뒤섞여 감사가 어려워진다. 새 사유가 필요해지면 코드 배포로 추가(마이그레이션 CHECK 제약 갱신 포함) — 배포 비용보다 "사유 목록이 함부로 안 바뀐다"는 보장이 더 중요하다고 판단 |
| 어드민 화면 패턴 | 기존 admin 라우트 패턴 (서버 컴포넌트 + API route) | `admin/abusing`, `admin/drop-policy` 화면이 참조 구현 |

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/045_point_system.sql
  # point_wallets, point_transactions, point_treasury 생성
  # badges.point_reward 컬럼 추가
  # award_points() RPC 함수

[포인트 모듈 — src/lib/points/]
index.ts           # awardPoints() 헬퍼(RPC 래핑), getWallet(userId), listTransactions(userId, cursor)
reasons.ts          # 어드민 지급/회수 사유 목록 상수 (신규) — CS 보상/오류 정정/이벤트·프로모션 지급/어뷰징 적발 회수/과거 데이터 소급 반영/기타

[연동 지점 — 기존 파일 수정]
src/lib/badge-engine/index.ts        # 배지 발급 직후 awardPoints() 호출 (526번 줄 부근)
src/lib/drop-engine/index.ts         # 아이템배지 발급 직후 awardPoints() 호출 (395번 줄 부근)
src/lib/missions/checker.ts          # 미션 완료 판정 시 reward_type='points'면 awardPoints() 호출 (92번 줄 부근)
src/lib/activity-feed/index.ts       # FeedEventMeta.badge_earned에 point_reward?: number 추가

[유저 UI]
src/app/(main)/profile/page.tsx          # 이메일 아래 잔액 표시 (수정)
src/app/(main)/points/page.tsx           # 포인트 내역 (신규)
src/app/api/points/route.ts              # 본인 잔액·내역 조회 API (신규)
src/app/(main)/badges/[id]/page.tsx      # point_reward 안내 문구 (수정)

[어드민 UI]
src/app/admin/points/page.tsx                    # 포인트 관리 대시보드 (신규)
src/app/admin/points/UserGrantForm.tsx           # 지급/회수 공용 폼 컴포넌트 (신규)
src/app/api/admin/points/route.ts                # 요약 통계 API (신규)
src/app/api/admin/points/grant/route.ts          # 지급/회수 실행 API (신규)
src/app/admin/users/[id]/page.tsx                # UserGrantForm 임베드 (수정)
src/app/admin/badges/[id]/page.tsx               # "포인트 보상" 필드 (수정)
src/app/admin/missions/MissionList.tsx           # 배지 보상 선택 시 경고 문구 (수정)
```

## 3. 구현 규칙

- **잔액은 반드시 `award_points()` RPC를 통해서만 변경한다.** `point_wallets`에 직접 `UPDATE`를 실행하는 코드를 어디에도 두지 않는다.
- **원장은 append-only.** `point_transactions` 행을 `UPDATE`/`DELETE`하는 코드를 두지 않는다. 정정은 반대 부호의 새 행을 `award_points()`로 추가.
- `awardPoints()` 호출 시 `amount`가 0이면 호출 자체를 하지 않는다(빈 원장 행 방지) — 배지·미션의 `point_reward`/`reward_points`가 0인 경우가 이에 해당.
- 배지 발급과 포인트 지급은 **같은 요청 흐름 안에서 순서대로** 호출한다(배지 발급 실패 시 포인트도 지급되지 않도록 — 배지 발급 성공을 지급의 전제조건으로 유지, 단 두 작업을 하나의 DB 트랜잭션으로 묶을 필요는 없음. 배지는 이미 발급됐는데 포인트 지급만 실패하는 경우는 로그를 남기고 알림 — 재시도는 이번 범위에서 수동 처리).
- `admin_reason_label`은 §2 `reasons.ts`에 정의된 값만 허용 — API 레벨에서 검증. "기타" 선택 시에만 `admin_reason_note` 필수.
- **큰 금액 지급/회수(기준액 1,000P, `reasons.ts`에 상수로 정의) — 차단하지 않고 "이중 확인 + 감사 표시"로 처리한다:**
  - 프론트: 기준액 이상 입력 시 확인 팝업(기존 §3 초안대로 유지)
  - **서버 API도 같은 기준액을 확인**해서, 기준액 이상인데 요청 바디에 `confirmed: true`가 없으면 그 요청을 거부한다(422) — 프론트를 건너뛰고 API를 직접 호출하는 실수·오남용을 막기 위한 최소 방어선. 완전 차단(승인자 별도 지정, 2인 승인 등)은 넣지 않는다 — 어드민은 신뢰된 소수이고, CS 상황에서 즉시 처리돼야 하는 경우가 많아 과도한 프로세스는 오히려 방해가 된다.
  - 기준액 이상 지급/회수 행은 `point_transactions`에 별도 플래그 컬럼 없이도 `amount`로 걸러낼 수 있으므로 스키마 변경은 하지 않는다. `/admin/points` 대시보드(Step D)에 "최근 고액 지급/회수" 목록을 별도 섹션으로 노출해 사후 감사를 쉽게 한다.
  - 근거: 완전 차단은 "정말 필요할 때 못 준다"는 새로운 문제를 만들고, 반대로 아무 제약이 없으면 오탈자 한 번(0을 하나 더 입력)에 대한 방어가 없다. 이중 확인 + 사후 가시성이 이번 단계엔 적절한 절충.
- `badges.point_reward` 변경은 **미래 발급분에만 영향**. 이미 발급된 `point_transactions` 행을 소급 수정하지 않는다.
- 각 Step 배포 커밋마다 `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성 (CLAUDE.md 규칙).

## 4. 절대 하지 마

- 포인트 상점(`PointSink`) 관련 테이블·화면 생성 — 1b단계
- 플리마켓·물물교환 관련 테이블·화면 생성 — 2단계
- `point_wallets.balance` 직접 `UPDATE`
- `point_transactions` 행 `UPDATE`/`DELETE`
- 기존 배지에 `point_reward` 소급 일괄 채우기(시드 스크립트로 대량 지급하는 행위 포함)
- 타인 프로필(`/[username]`)에 포인트 잔액 노출
- `reason` 컬럼을 Postgres `ENUM` 타입으로 변경
- `missions.reward_points`/`reward_type` 컬럼 구조 변경 (기존 필드 그대로 재사용)

## 5. 검증 도구

- 마이그레이션 적용 후 SQL Editor에서 `award_points()` 수동 호출 → 3개 값(유저 합계/treasury/원장 합계) 일치 확인
- 단위 테스트: `awardPoints()` 헬퍼가 amount=0일 때 호출 스킵하는지, reason 별 source 필드가 올바르게 채워지는지
- `npx tsc --noEmit` 0 에러

## 6. 완료 체크리스트 (전체)

- [ ] Step 0: 전제조건 확인
- [ ] Step A: 마이그레이션 045 + `award_points()` RPC + `src/lib/points/` 헬퍼
- [ ] Step B: 배지·드랍·미션 3개 지점 적립 연동 + 피드 메타 확장
- [ ] Step C: 내 프로필 잔액 표시(본인 전용) + 포인트 내역 화면 + 배지 상세 안내 문구
- [ ] Step D: `/admin/points` + 유저 지급/회수 공용 폼(양쪽 배치) + 배지·미션 에디터 확장
- [ ] `POINT_SYSTEM_OBJECT_MODEL.md`/`POINT_SYSTEM_INTERACTION_FLOW.md` 구현 상태 갱신 + SERVICE_OPERATIONS 문서
- [ ] 전체 `tsc` 0 에러 + commit/push
