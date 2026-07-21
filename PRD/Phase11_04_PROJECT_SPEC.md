# JAM! Phase 11 프로젝트 스펙 — 드랍엔진 v2

> 작성일: 2026-07-21

---

## 1. 기술 스택 (기존 유지)

| 영역 | 선택 | 근거 |
|------|------|------|
| 엔진 | `src/lib/drop-engine/` TypeScript (기존 파일 교체) | 프로젝트 표준. 순수 함수 분리로 테스트 가능하게 |
| 설정값 | `drop_policy` 싱글톤 테이블 | `abusing_policy` 패턴 검증됨 — 배포 없이 어드민 튜닝 |
| 세계관 | 기존 `factions` 재사용 | 10개 시드 완료. 신규 worlds 테이블 금지 |
| 어드민 | 기존 admin 라우트 패턴 (서버 컴포넌트 + API route) | admin/abusing 화면이 참조 구현 |

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/034_drop_engine_v2_schema.sql   # faction_adjacency + user_drop_state + drop_policy + serial DEFAULT 제거

[엔진 — src/lib/drop-engine/]
index.ts          # tryItemDrop 재작성 (3레이어 오케스트레이션)
policy.ts         # getDropPolicy() (신규, getAbusingPolicy 패턴)
layers.ts         # 순수 함수: rollRarity(policy,state,ctx) / pickFaction(...) / pickBook(...) / pickBadge(...)  (신규)
context.ts        # 맥락 오버라이드 매칭 (신규, Step D)
serial.ts         # 난수 일련번호 생성+재시도 (신규)
__tests__/        # 레이어별 순수 함수 테스트

[어드민]
src/app/admin/drop-policy/page.tsx + DropPolicyForm.tsx   # 파라미터 편집 (신규)
src/app/api/admin/drop-policy/route.ts                    # GET/PUT (신규)
src/app/admin/factions/[id]/page.tsx                      # 인접 세계관 편집 추가 (수정)
src/app/api/admin/factions/[id]/route.ts                  # adjacency 저장 추가 (수정)

[서비스 UI — Step D]
활동 피드 드랍 카드                                        # 세계관 명·마지막 파편 강조 (수정)
```

## 3. 구현 규칙

- **순수 함수 우선**: 추첨 로직(layers.ts)은 `(policy, state, context, randomFn)` 입력의 순수 함수로 작성 — randomFn 주입으로 결정론적 테스트. DB 접근은 index.ts 오케스트레이션에만.
- **drop_policy는 매 드랍 시 조회** (abusing_policy와 동일) — 캐싱은 성능 문제 확인 후.
- **user_drop_state는 lazy upsert** — 없으면 기본값 생성. 기존 유저 마이그레이션 금지 (전원 테스트 유저).
- 가중치 합 검증: momentum+adjacent+explore ≤ 1.0 — 어드민 저장 시 validation.
- **일련번호**: INSERT 시 난수 부여, 23505 충돌 시 재생성 (최대 5회). 기존 행 번호 재부여 금지.
- **v1 가드 유지**: `isDroppableForActivity`(누적조건 제외), is_active 필터, valid_from/until, 인벤토리 슬롯, 섀도우밴 — 삭제 금지.
- completion 계산은 "인벤토리 보유 distinct 배지 기준" (슬롯 장착 무관) — Phase11_02 §4.
- 미스터리 헌터 faction은 이름이 아닌 **id 상수 또는 factions 플래그**로 식별 (이름 변경에 취약하지 않게 — sort_order=10 의존 금지).
- 각 Step 배포 커밋마다 `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성 (CLAUDE.md 규칙).
- 배지 로직 변경이므로 `PRD/badge/BADGE_ENGINE_UNIFIED.md`도 구현 상태(⚠️설계→✅구현) 갱신.

## 4. 절대 하지 마

- 신규 worlds 테이블 생성 (factions 재사용)
- 액티비티배지 엔진(badge-engine) 수정
- "활성 세계관 N개" 등 명시적 제한을 유저 UI에 노출
- 세계관 선택·전환 UI 추가
- 기존 inventory_items 일련번호 재부여
- v1 안전 가드(isDroppableForActivity·슬롯·섀도우밴) 제거
- Step 순서 건너뛰기 (B 배포 전 C 코드 활성화 금지 — 플래그·별도 커밋로 분리)
- 강수 오버라이드 구현 (외부 날씨 API 범위 밖)

## 5. 검증 도구

- **시뮬레이터 확장** (admin/simulator): 가상 유저 N명 × 활동 M회 드랍 시뮬레이션 → rarity 분포·세계관 수렴률·북 완성 소요 리포트 — Step B·C 완료 기준 검증의 핵심 도구
- 단위 테스트: 레이어별 순수 함수 (기존 __tests__ 컨벤션)
- `npx tsc --noEmit` 0 에러 (node_modules 설치됨)

## 6. 완료 체크리스트 (전체)

- [ ] Step 0: 033 적용 + 시드 상태 확인
- [ ] Step A: 마이그레이션 034 + 일련번호 난수 + getDropPolicy
- [ ] Step B: Layer 1 (확정 드랍·pity·보너스·복귀) + 테스트
- [ ] Step C: Layer 2·3 + 어드민 (drop-policy 화면·인접 편집) + 수렴률 ≥70%
- [ ] Step D: 맥락 오버라이드 + 드랍 UI 강조
- [ ] BADGE_ENGINE_UNIFIED.md 구현 상태 갱신 + SERVICE_OPERATIONS 문서
- [ ] 전체 tsc 0 에러 + commit/push
