---
id: 20260811_006
category: BadgeEngine
status: CLOSED
created: 2026-08-11
closed: 2026-08-11
---

# [BadgeEngine] POI 배지 반경 오탐 근본 수정 + 전수 재검증

## 배경 / 문제 정의
20260811_004(전체 감사)에서 "지하철역 POI 44개 500m 오탐 반경으로 인한 과다발급"을 전수 재검증하라는 잔여 이슈로 남겨뒀던 것을 실행. 조사 결과 2026-07-31에 있었던 수정(SERVICE_OPERATIONS_20260731_1930.md)은 **그 시점까지 존재하던 행만 되돌린 데이터 패치**였고, 원인이 된 코드(`drops/route.ts`의 자동수집 파이프라인이 모든 신규 POI를 `radius_meters: 500`으로 하드코딩)는 고쳐지지 않은 채 남아 있었다. 그 결과 2026-08-10(수정 하루 전날)까지도 지하철역 POI가 계속 500m로 생성되고 있었다 — 아직 배지에 연결되지 않아 실피해는 없었지만 재발 대기 상태였음.

전수 재검증 결과 신고 들어와 처리된 계정(sihyunrr) 외에 **`jae_everydae` 계정도 같은 방식으로 7건 과다발급**된 것을 확인.

## 구현 내용 요약

### 근본 원인 수정 (코드)
카테고리별 "정확 매칭 반경" 정책을 `src/lib/poi/radius-policy.ts`로 단일화(`transit: 50m`, `mountain: 150m` — 사용자 확정값)하고, POI 반경이 쓰이는 3개 지점 전부에서 이 정책이 최종값을 강제하도록 수정:
1. `drops/route.ts` — 자동수집(T2) 파이프라인이 POI를 새로 만들 때 하드코딩된 500 대신 카테고리별 정책 적용
2. `admin/poi/route.ts`(POST), `admin/poi/[id]/route.ts`(PUT) — 어드민이 수동으로 POI를 만들거나 수정할 때도 정책이 최종값을 덮어씀(사람이 실수로 넓은 반경을 넣어도 방어)
3. **`admin/badges/[id]/poi-links/route.ts`(PUT)** — 실제 버그가 발생했던 지점. 어드민이 POI를 배지에 연결하는 순간(`linked_badge_id` 설정), 그 카테고리가 정확 매칭 대상이면 반경을 자동으로 좁히도록 추가. 이 라우트가 반경을 전혀 건드리지 않았던 게 원래 버그의 진짜 원인.

### 데이터 정정
- 지하철(`transit`) 카테고리 전체: `radius_meters <> 50` → `50`으로 정정 (미연결 14개 포함, 964개 전부 50m)
- 산(`mountain`) 카테고리 전체: `radius_meters <> 150` → `150`으로 정정 (853개 전부 150m)
- `jae_everydae` 계정의 과다발급 배지 획득 기록 7건(`답십리역 5호선` 4건, `신답역 2호선` 3건, 전부 반경 수정 이전 시각) — `user_poi_badge_earns`에서 삭제(회수)

## 변경된 파일
```
jam-web/src/lib/poi/radius-policy.ts                         — 신규, 카테고리별 반경 정책
jam-web/src/app/api/drops/route.ts                            — 자동수집 시 정책 적용
jam-web/src/app/api/admin/poi/route.ts                        — 수동 생성 시 정책 적용
jam-web/src/app/api/admin/poi/[id]/route.ts                   — 수동 수정 시 정책 적용
jam-web/src/app/api/admin/badges/[id]/poi-links/route.ts      — 배지 연결 시 정책 적용(근본 원인 지점)
(DB) poi.radius_meters 일괄 정정 (transit 964건, mountain 853건)
(DB) user_poi_badge_earns 7건 삭제 (jae_everydae, 과다발급분)
```

## 테스트 결과
- [x] `npx tsc --noEmit` — 오류 없음
- [x] `npx vitest run` — 134/134 통과
- [x] DB 쿼리로 정정 후 `transit` 전량 50m, `mountain` 전량 150m 확인

### 배포 정보
- 배포일: 2026-08-11
- 환경: production
- 커밋: (git push 시 기록)

### 주요 의사결정 / 핵심 메모
- **반경값 확정 근거**: 사용자가 직접 "transit 50m, 산 POI 150m"로 확정 — 기존에 이미 다수 POI가 이 값으로 정정돼 있던 사실상의 관행값과 일치시킴.
- **정책을 "강제 덮어쓰기"로 설계**: 어드민이 실수로 다른 반경을 입력해도 정확 매칭 카테고리는 정책값으로 강제 — "사람이 기억해서 맞는 값을 넣어야 하는" 구조(DEV_PROCESS_GUARDRAILS.md 패턴 6)를 근본적으로 없앰.
- **과다발급 배지 회수 기준**: 반경 수정 이전 시각(`earned_at < 2026-07-31 12:00`)에 발급된 건은 무조건 회수 — POI 배지는 반복 획득 방식이라 "진짜 방문"과 구분이 어렵지만, 사용자가 "최근 배지 정책에 맞춰 조정"을 명시적으로 지시해 일괄 회수로 결정.

### 잔여 이슈
- 없음
