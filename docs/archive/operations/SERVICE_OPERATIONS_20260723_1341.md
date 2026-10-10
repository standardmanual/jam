# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 13:41)

> **이 버전의 변경 내용:** POI 앰비언트(시스템) 아이템배지 드랍 — 유저 행동과 무관하게 시스템이 주기적으로 POI에 아이템배지를 상시 배치하고, 목표 수량 대비 부족분을 자동 보충하는 기능 추가.
> 이전 버전: SERVICE_OPERATIONS_20260722_2308.md

---

## [신규] §6-4. 앰비언트(시스템) POI 드랍

**배경**: 기존 `poi_drops`는 유저가 자기 인벤토리에서 다른 유저를 위해 드랍하는 것만 지원했다(§6-1, §6-2). "돌아다니다 우연히 발견하는" 경험을 위해, 유저 행동 트리거 없이 시스템이 직접 POI에 아이템배지를 놓아두는 두 번째 출처를 추가했다.

**관련 파일:** `src/lib/ambient-drop/index.ts`(엔진), `src/lib/ambient-drop/policy.ts`(정책 로딩), `src/app/api/cron/ambient-drop-monitor/route.ts`(크론), `src/app/admin/ambient-drop-policy/`(어드민), `supabase/migrations/044_ambient_poi_drop.sql`

### 데이터 모델 변경

- `poi_drops.source` 컬럼 추가 (`'user' | 'system'`, 기본 `'user'`). `dropper_user_id`·`expires_at`을 nullable로 완화.
- CHECK 제약: `source='user'`면 `dropper_user_id`·`expires_at` 필수, `source='system'`이면 둘 다 반드시 NULL(만료 없음, 배치자 없음).
- `ambient_drop_policy` 싱글톤(id=1) 신규 — `drop_policy`(액티비티 드랍엔진)와 동일 패턴, 어드민 `/admin/ambient-drop-policy`에서 배포 없이 편집.

### 레어리티 분포 (mythic 제외)

| 등급 | 기본값 | 비고 |
|------|--------|------|
| common | 86% | 압도적 기본값 |
| rare | 12% | "가끔 보이는" |
| legendary | 2% | "극악의 확률" 구간 |

- mythic은 앰비언트 드랍 대상에서 완전히 제외 — 신화 등급의 희소성은 액티비티 성취(드랍엔진 v2)와 떠돌이 신화 아이템(§13) 전용으로 유지.
- 액티비티 드랍엔진(common 60/rare 28/legendary 9/mythic 3)보다 훨씬 common 편중 — 노력 없는 발견이 노력 기반 보상보다 기대값이 높아지지 않도록 함(내적 동기 침식 방지).

### 목표 수량 산정 (자동 스케일)

```
target_total = clamp(
  eligible_poi_count × target_coverage_ratio(기본 0.15),
  min_target_total(기본 20),
  max_target_total(기본 2000)
)
```

POI 풀이 커져도 고정 상수 없이 자동으로 목표치가 스케일된다.

### 보충 크론 로직

```
GET /api/cron/ambient-drop-monitor (매시간, CRON_SECRET 인증)

1. 활성 POI 수 → target_total 계산
2. 현재 활성 시스템 드랍 수(source='system' AND is_available=true) 카운트
3. 부족분 = target_total − 현재 활성 수, replenish_batch_size(기본 30)로 상한
4. 부족분만큼 반복:
   a. POI 선정: max_active_per_poi(기본 1) 미만인 POI 중,
      활성 드랍이 0개인 POI를 우선 선택(넓게 분산 — 특정 POI 독점 방지)
   b. 레어리티 추첨(위 분포)
   c. 해당 등급 type='item' 배지 중 랜덤 선택 (valid_from/until 필터)
   d. poi_drops INSERT { source: 'system', dropper_user_id: null, expires_at: null }
```

- 기존 `poi-cleanup` 크론(만료 정리)은 `expires_at IS NULL`인 앰비언트 드랍을 자연히 건너뛴다 (PostgreSQL NULL 비교 특성 — 코드 변경 불필요).

### 일련번호 범위 제한

- `assign_random_serial()` 트리거를 분기 처리: 픽업된 아이템의 `drop_id`가 `poi_drops.source='system'`을 가리키면 일련번호를 **50,001~999,999**로 제한. 그 외(액티비티 드랍·조합·유저 드랍 픽업·어드민 지급)는 기존과 동일하게 1~999,999 전체 범위.
- **부수 수정**: `pickup_drop` RPC가 `inventory_items` INSERT 시 `drop_id`를 채우지 않던 기존 누락을 함께 수정(위 분기 판별에 필요). 유저-간 드랍 픽업의 다른 동작에는 영향 없음.

### 픽업 흐름 (기존 §6-2와 동일 경로 재사용)

앰비언트 드랍도 `POST /api/drops/[dropId]/pickup`을 그대로 사용 — GPS 반경 50m 검증, GPS 조작 감지, 섀도우밴 정책이 유저 드랍과 동일하게 적용된다. `pickup_drop` RPC의 본인 드랍 방지 체크(`dropper_user_id = picker_id`)는 `source='system'`이면 `dropper_user_id`가 NULL이라 자연히 통과(누구나 픽업 가능).

### UI 표시

- `GET /api/drops/poi/[poiId]`, `GET /api/drops/[dropId]` 응답에 `is_ambient` 필드 추가. 앰비언트 드랍은 `dropper_name`을 null로 반환하고, 드랍 목록 UI(`DropsClient.tsx`)에서 "OOO님이 드랍" 대신 "이 근처에서 발견됨"으로 표시.

### 게이미피케이션·윤리 근거 (gamification-loops 스킬 검토)

- **FOMO 없음**: 앰비언트 스폰에 대한 푸시 알림 없음 — 앱을 열었을 때 지도 마커로만 노출.
- **만료 없음이지만 무한 축적은 아님**: 목표 수량 도달 시 신규 스폰이 멈춤. 단, 특정 POI에 장기 미픽업 아이템이 정체될 가능성은 있음 — 필요 시 후속으로 "장기 미픽업 시 재배치"(떠돌이 아이템과 유사) 로직을 옵션으로 추가 가능(현재 범위 밖).
- **어뷰징 방지**: 픽업은 기존 GPS 반경 검증을 그대로 통과해야 하므로 봇 스크립트로 원격 파밍 불가.

---

## §14 Cron 작업 — 표에 추가

| 경로 | 실행 주기 | 기능 |
|------|----------|------|
| `GET /api/cron/ambient-drop-monitor` | 매시간 | 앰비언트 POI 드랍 수량 모니터링 + 부족분 자동 보충 |

## §16 DB 테이블 전체 목록 — 갱신

| 테이블 | 설명 | 생성 마이그레이션 |
|--------|------|------------------|
| `poi_drops` | POI 드랍 기록 — **유저 주도(source='user') + 시스템 앰비언트(source='system', 만료 없음)** | 004, 044 |
| `ambient_drop_policy` | 앰비언트 드랍 정책 싱글톤 (id=1, 레어리티·목표 수량·POI당 상한) | 044 |

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_2308.md)과 동일.
