---
id: 20260908_0529
category: Service
priority: P2
status: CLOSED
created: 2026-09-08
closed: 2026-09-08
---

# [Service] 원인분석 — eye loader(WanderingEyesLoader) 과다 노출로 체감 속도 저하

## 배경 / 문제 정의
서비스 전반에서 `WanderingEyesLoader`(눈 모양 로더)가 너무 자주, 너무 오래 보여서
"서비스가 느리다"는 인식을 심어주고 있다는 사용자 제보. 코드 변경 없이 원인만
조사하는 `research` 유형 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
- `WanderingEyesLoader` 사용처 전수 조사 (`design-system/`, `src/` 전체)
- 각 사용처의 표시 트리거 조건(즉시 표시 vs 지연 후 표시)과 최소/최대 표시 시간 정책 확인
- 표시 시간이 길어지는 근본 원인(네트워크 왕복, 순차 비동기 체인 등) 확인

## 구현 계획
해당 없음 (조사 전용, 코드 변경 없음)

---
## 완료 기록

### 구현 내용 요약
코드 변경 없음. 원인 조사만 수행.

### 변경된 파일
```
- (없음)
```

### 주요 의사결정 / 핵심 메모

**사용처 전수 (9곳)**: `NavigationLoader.tsx`, `MissionStatusClient.tsx`,
`BadgeShareButton.tsx`, `BadgeRevealOverlay.tsx`(호출부: `StravaConnectReveal.tsx`,
`SyncButton.tsx`) 등.

**핵심 원인 — 표시 정책이 사용처마다 다르다.**

`NavigationLoader.tsx`(라우트 전환용)만 유일하게 정교한 디바운스 정책을 갖고 있다:
- `SHOW_DELAY_MS=1000` — 전환이 1초 안에 끝나면 로더를 아예 띄우지 않음
- `MIN_VISIBLE_MS=400` — 일단 뜨면 최소 400ms는 유지 (깜빡임 방지)
- `MAX_VISIBLE_MS=8000` — 안전장치

반면 나머지 사용처는 **디바운스가 전혀 없다 — 비동기 작업 시작과 동시에 즉시 표시**:
- `MissionStatusClient.tsx`: 페이지가 먼저 렌더된 뒤 `useEffect`에서
  `/api/missions/[id]/status`를 클라이언트 사이드로 호출(서버 컴포넌트에서 미리
  받아오지 않음). 응답이 아무리 빨라도(예: 150ms) 로더가 한 번은 반드시 보인다.
- `BadgeShareButton.tsx`: 공유 버튼 클릭 시 `setState({kind:'loading'})`을 동기로
  실행한 뒤, `/api/badges/[id]/share-data` 페치 → `buildBadgeShareBlob`(캔버스
  합성) **순차 2단계**를 거친다. 각 단계 자체는 빠를 수 있어도 합산 지연이 누적되고,
  디바운스가 없어 항상 로더부터 보인다.
- `StravaConnectReveal.tsx`: Strava 연동 완료 리다이렉트 직후 `setPhase('loading')`을
  동기 실행한 뒤 `/api/badges/recent-earned`를 페치. 동일하게 디바운스 없음.

**결론**: eye loader 자체(애니메이션은 `infinite` 루프이며 자체적으로 최소 노출
시간을 강제하지 않음)의 문제가 아니라, **`NavigationLoader`를 제외한 모든 사용처가
"지연 후 표시" 없이 비동기 작업 시작과 동시에 즉시 로더를 띄우는 것**이 원인이다.
빠르게 끝나는 요청에도 매번 로더가 스치듯 노출되어, 실제 응답 속도와 무관하게
"항상 뭔가를 기다린다"는 인상을 준다. `BadgeShareButton`은 여기에 더해 페치+캔버스
합성이라는 순차 비동기 체인이라 다른 곳보다 노출 시간 자체도 길다.

(참고: `vercel.json`의 `regions`는 이미 `["icn1"]`(서울)로 설정돼 있어, 과거
메모리에 있던 "리전이 미국이라 왕복 200ms 추가" 이슈는 현재 원인이 아님을 확인했다.)

### 잔여 이슈
- 개선 방향 후보(이번 조사 범위 밖, 별도 티켓 필요):
  1. `MissionStatusClient` 등 클라이언트 사이드 페치 화면을 서버 컴포넌트로 전환해
     첫 렌더에 데이터를 함께 내려보내 로더 자체를 없애는 방향
  2. `NavigationLoader`의 디바운스 패턴(SHOW_DELAY_MS/MIN_VISIBLE_MS)을 공용 훅으로
     추출해 `MissionStatusClient`·`BadgeShareButton`·`StravaConnectReveal`에도 적용
  3. `BadgeShareButton`의 페치+캔버스 합성 체인 자체를 단축(예: share-data 프리페치)
