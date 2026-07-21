# JAM! Phase 11 구현 단계 — 드랍엔진 v2 (단계 릴리즈)

> 작성일: 2026-07-21  
> 각 Step은 독립 배포 가능. Step 완료 기준 충족 후 다음 Step 진행.

---

## Step 0: 전제조건

- [ ] `033_reseed_activity_badges_v3.sql` DB 적용 (Dashboard SQL Editor 또는 supabase db push)
- [ ] 019 시드 상태 확인: factions 10 / item_books 100 / item 배지 ~900 존재 확인

## Step A: 스키마 + 일련번호 (마이그레이션 034)

- `faction_adjacency` 생성 + xlsx '세계관 인접' 시트 기반 시드
- `user_drop_state` 생성 (기존 유저 마이그레이션 없음 — lazy 생성)
- `drop_policy` 생성 + 초기값 1행
- `inventory_items.serial_number` DEFAULT 제거
- 드랍엔진에 난수 일련번호 부여 로직 추가 (범위 1~999,999, 충돌 재시도)
- `getDropPolicy()` 헬퍼 (`src/lib/drop-engine/policy.ts`) — getAbusingPolicy 패턴

**완료 기준**: 마이그레이션 적용 후 기존 v1 드랍 정상 동작(회귀 없음) + 신규 드랍 일련번호 무작위

## Step B: Layer 1 — 빈도 (드랍엔진 교체 1차)

- `tryItemDrop` 재작성:
  - 활동당 1개 확정 (rollRarity의 "드랍 없음 20%" 제거)
  - rarity 분포 drop_policy 값 사용 (60/28/9/3)
  - `common_streak` 기반 rare+ pity
  - 보너스 드랍 (15% / 고강도 30% — duration·elevation은 activity에서 판단)
  - 당일 4번째 활동부터 rarity 하향 (daily_drop_count/date)
  - 복귀(7일+, 유저 마지막 활동일 기준) rare+ 확정
  - 주간 첫 활동 rare+ 확률 2배
  - `user_drop_state` upsert
- 세계관·북 선택은 아직 v1 방식(플랫 풀) 유지 — 리스크 분리
- 테스트: rarity 분포·pity·보너스·일일 하향 단위 테스트 (순수 함수로 추출)

**완료 기준**: 시뮬레이션 1,000회에서 드랍 0개 없음, rarity 분포 오차 ±3%p, pity 동작 확인

## Step C: Layer 2·3 — 서사 + 페이싱 (드랍엔진 교체 2차)

- 세계관 선택: 모멘텀 50 / 인접 25 / 탐험 15 (faction_adjacency 사용)
  - 신규 유저 첫 3드랍: 작심삼일 클럽 + 주 활동종목 매핑 세계관
  - 미스터리 헌터: legendary·mythic에서만 등장 (모멘텀 대상 제외)
- 아이템북 선택: completion 감쇠(0.7) × 직전 북 페널티(0.5), 완성 북 ×0.3 잔류
- 마지막 조각 pity (last_piece_pity, 세계관 내 5드랍)
- 배지 선택: 미보유 우선 → rarity 인접 폴백
- **어드민**:
  - `admin/drop-policy` 설정 화면 (abusing 화면 패턴) — 전 파라미터 편집
  - `admin/factions/[id]`에 인접 세계관 편집 UI 추가
  - (선택) 시뮬레이터에 드랍 v2 시뮬레이션 모드 추가 — 세계관 수렴률 검증용
- 테스트: 모멘텀 분포(동일+인접 ≥70%), 완성 감쇠, 마지막 조각 pity

**완료 기준**: 시뮬레이션에서 연속 드랍 동일/인접 세계관 비율 ≥ 70%, 북 완성 소요 드랍 12~18개 범위

## Step D: 맥락 오버라이드 + UI 강조

- 맥락 매칭 (강수 제외):
  - 온도 ≤ -10°C / ≥ 33°C → 아스팔트 레인저 (Strava average_temp)
  - 새벽 05~07시 → 비트 마에스트로/셔터 마피아, 심야 23~04시 → 낭만 미식가/숲속의 갱단 (startDateLocal)
  - 고고도 상승 → 낭만 미식가/비트 마에스트로
  - 7일+ 복귀 (최우선) → 작심삼일 클럽
  - 러너스 하이(고강도 장시간) → 미스터리 헌터 (rare+ 한정)
- 발동률 60% (drop_policy.context_override_rate)
- **서비스 UI**:
  - 드랍 피드/알림에 세계관 명 노출 ("아스팔트 레인저의 파편을 주웠어요")
  - 마지막 조각 드랍 시 "○○ 아이템북의 마지막 파편!" 강조 (피드 이벤트 payload 확장)
- 문서: `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 (각 Step 배포 시마다)

**완료 기준**: 새벽 활동 시뮬레이션에서 해당 세계관 드랍 ~60% 수렴, 복귀 시나리오 E2E 확인

---

## 릴리즈 순서 요약

```
Step 0 (전제) → A (스키마·일련번호) → B (빈도) → C (서사·페이싱·어드민) → D (맥락·UI)
```

각 Step 배포 후 지표 확인: 드랍 수/유저/일, rarity 분포, (C 이후) 세계관 수렴률, 북 완성 소요.

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 강수 오버라이드 (외부 날씨 API) | 날씨 API 도입 결정 시 |
| 중복 배지 경제 (트레이드·양도·분해) | 완성 유저 누적 후 |
| 시즌별 인접 그래프 로테이션 | 운영 안정화 후 |
