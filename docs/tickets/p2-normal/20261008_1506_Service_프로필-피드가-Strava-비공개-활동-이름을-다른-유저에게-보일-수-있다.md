---
id: "20261008_1506"
category: Service
priority: P2
status: OPEN
created: 2026-10-08
---

# [Service] 프로필 피드가 Strava 비공개 활동의 이름을 다른 유저에게 보여 줄 수 있다

## 핵심 요약
- 요구사항: 다른 유저의 프로필을 볼 때, 그 유저가 Strava에서 비공개(나만 보기 등)로 둔 활동의 제목이 피드 묶음 카드에 보이지 않게 한다. 먼저 Strava 활동의 공개 범위를 저장·판정할 방법을 정한다.
- 구현 계획: (미정 — 착수 시 작성) 동기화가 Strava 응답의 공개 범위 필드(`private`·`visibility` 등, 정확한 이름은 착수 때 Strava API 문서로 확인)를 `normalized`에 남기게 하고, 프로필 페이지는 `isOwnProfile`이 아니면 공개 활동의 이름만 `activityNames`에 넣는 방향. 이미 저장된 행의 공개 범위를 어떻게 채울지(백필 또는 이름 숨김 기본값)도 정한다. Strava API 약관이 다른 유저에게 보여 줄 수 있는 데이터 범위를 어떻게 정하는지도 함께 확인한다.
- 관련 파일: `jam-web/src/app/(main)/[username]/page.tsx` L340-360(`strava_activities`의 `normalized.name`을 `activityNames`로 모음, `isOwnProfile` 조건 없음) / `jam-web/src/app/api/strava/auth/route.ts`(스코프 `read,activity:read_all`) / 활동 정규화: `jam-web/src/lib/strava/` (착수 때 `normalized`를 만드는 함수 위치 확인)

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 15:06 KST, 코드 읽기와 읽기 전용 SQL)
- 프로필 페이지는 대상 유저의 피드에 연결된 Strava 활동 ID로 `strava_activities`를 서비스 클라이언트(RLS 우회)로 읽고, `normalized.name`을 `activityNames` prop으로 클라이언트 컴포넌트에 넘긴다. 보는 사람이 본인인지(`isOwnProfile`) 따지지 않는다.
- 연동 스코프는 `activity:read_all`이다. Strava 문서상 이 스코프는 "Only You" 활동과 프라이버시 존 데이터까지 읽는다.
- 운영 DB `strava_activities` 600행 중 583행의 `normalized`에 `name`이 있다. `normalized`에는 `private`·`visibility` 키가 한 행도 없다. 그래서 저장된 활동 중 무엇이 비공개인지 지금 데이터로는 알 수 없다.
- 2026-10-08 `/jam-ship` 5단계 민지 보안 점검(모드 ②)이 범위 밖 발견물 `[보안/참고]`로 지적했다. 이번 배포 범위에서 생긴 것은 아니다.

### 판단
- 유저가 Strava에서 비공개로 둔 활동의 제목(예: 장소·사적인 메모가 담긴 제목)이 로그인한 다른 유저에게 보일 수 있다(확신도 보통 — 비공개 활동이 실제로 저장돼 있는지는 공개 범위를 저장하지 않아 확인하지 못했다).
- Strava API 약관의 데이터 표시 범위와 관련될 수 있어 확인이 필요하다. **위험도: 주의, 확신도 보통.**

## 완료 조건
- (착수 시 구체화) 다른 유저 프로필의 `activityNames`에 비공개 활동의 이름이 들어가지 않는다는 것을 테스트로 고정한다. 본인 프로필은 지금처럼 모든 활동 이름이 보인다.
