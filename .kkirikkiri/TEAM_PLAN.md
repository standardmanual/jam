# 팀 작업 계획

- 팀명: kkirikkiri-development-phase17
- 목표: `Service Plan/History/Phase17_01_PRD.md` 요구사항대로 JAM 메뉴 개편(POI 배지 지도 노출) 구현
- 생성 시각: 2026-07-31
- PRD 원문: `Service Plan/History/Phase17_01_PRD.md`

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| 메인세션(팀장) | 팀장 | Opus | 계획/태스크 배분/코드 리뷰/빌드·타입체크 검증/통합 |
| dev-server | 개발자 1 | Opus | 서버: `/api/poi-badges` 신설, 그리드 클러스터링 순수 함수, earned 조인 |
| dev-client | 개발자 2 | Opus | 화면: MapView 마커 리디자인(드랍 20px/배지 30px), 클러스터 렌더링, idle 디바운스 재조회, DropsClient 연동, "JAM" 메뉴명, 공유카드 기능 전체 제거 |
| tester | 테스터 | Sonnet | 그리드 클러스터링 + earned 판정 로직 단위테스트 (dev-server 완료 후 착수) |

## 파일 소유권 (충돌 방지 — 같은 파일 동시 수정 금지)
- dev-server 전담: `jam-web/src/app/api/poi-badges/route.ts`(신규), `jam-web/src/lib/poi/badge-clustering.ts`(신규, 순수함수)
- dev-client 전담: `jam-web/src/components/map/MapView.tsx`, `jam-web/src/app/(main)/drops/DropsClient.tsx`, 하단 탭/네비 라벨 파일, `jam-web/src/app/(main)/badges/[id]/page.tsx`, `jam-web/src/app/(main)/badges/[id]/ShareCardModal.tsx`(삭제), `jam-web/src/app/api/share-card/`(삭제)
- tester 전담: `jam-web/src/lib/poi/__tests__/badge-clustering.test.ts`(신규)
- 공통 참고(수정 금지): `jam-web/src/types/database.ts` — 타입 추가 필요하면 팀장에게 먼저 보고

## PRD 핵심 요구사항 요약 (Phase17_01_PRD.md 기준)
1. 메뉴 라벨 "드랍"→"JAM" (라우트 `/drops` 유지)
2. 드랍/픽업 마커: 20px 서클, 픽업 가능=포인트컬러/불가=그레이, 내부에 네거티브 컬러 아이콘
3. POI 배지 마커: 30px 원형 배지 이미지, 미획득=그레이(탭 비활성), 획득=원본+탭시 `/badges/[id]` 이동
4. `GET /api/poi-badges?swLat=&swLng=&neLat=&neLng=&zoom=` — zoom>13 개별 목록, zoom<=13 서버 그리드 클러스터 `{lat,lng,count}`만 반환
5. 클라이언트: idle 이벤트 디바운스 + 이전 조회 범위 벗어날 때만 재호출
6. 배지 상세화면 공유카드(`ShareCardModal`) 활동/아이템/POI 전 타입에서 완전 제거, `/api/share-card` 라우트도 삭제
7. 기존 드랍/픽업 API(`/api/drops`, `/api/drops/poi/[poiId]`, `/api/drops/[dropId]/pickup`)는 무변경

## 태스크 목록
- [ ] T1: 서버 — poi-badges 뷰포트 조회 + 클러스터링 API 구현 → dev-server
- [ ] T2: 서버 로직 단위테스트 → tester (T1 완료 후)
- [ ] T3: 지도 마커 리디자인 + 뷰포트 연동(클라이언트) → dev-client
- [ ] T4: 메뉴명 "JAM" 변경 → dev-client
- [ ] T5: 공유카드 기능 전체 제거 → dev-client
- [ ] T6: 통합 검증(tsc, 기존 드랍/픽업 회귀 확인) → 팀장

## 주요 결정사항
- T2(클러스터링 단위테스트) 중단: 프로젝트에 테스트 러너(jest/vitest)가 애초에 설치돼 있지 않고 기존 `__tests__` 파일들도 실행된 적 없는 상태(이번 작업과 무관한 기존 문제)임을 확인. 유저 확인 결과 "테스트 생략하고 바로 통합"으로 결정 → 태스크 삭제, T6(통합 검증)으로 바로 진행.
