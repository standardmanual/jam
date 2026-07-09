# JAM! 어드민 — PRD (Product Requirements Document)

> 생성일: 2026-07-09

---

## 1. 제품 개요

### 한 줄 요약
배지·POI·아이템북을 등록·관리하고, 가상 액티비티로 배지 발급~아이템 드랍~아이템북 완성까지 전체 파이프라인을 시뮬레이션할 수 있는 내부 관리 도구.

### 해결하는 문제
현재 배지/POI/아이템북은 Supabase 대시보드에서 SQL로 직접 INSERT해야 한다. 배지 발급 조건(condition_json)을 바꿀 때마다 실제 Strava 활동이 있어야만 테스트가 가능하다.  
→ **어드민 UI + 시뮬레이터**로 비개발자도 컨텐츠를 관리하고, 가상 데이터로 즉시 검증할 수 있게 한다.

---

## 2. 사용자

- **운영자 (1명~소수)**: Strava·개발 지식 없이 배지 컨텐츠를 기획하고 등록하는 사람
- **개발자**: 배지 조건 로직 변경 후 회귀 테스트를 시뮬레이터로 빠르게 검증

---

## 3. 핵심 기능

| 기능 | 설명 | 우선순위 |
|------|------|---------|
| 어드민 인증 | 허용 이메일 목록 기반 구글 로그인 접근 제어 | P0 |
| 배지 CRUD | 배지 목록·등록·수정·삭제, condition_json 폼 편집기 | P0 |
| POI 관리 | POI 목록·등록·수정·삭제, 연결 배지 설정 | P0 |
| 아이템북 관리 | 레시피 등록·수정·삭제, reward_badge 연결 | P0 |
| 시뮬레이터 | 가상 액티비티 입력 → 전체 파이프라인 실행 → 결과 리포트 | P0 |
| 유저 조회 | 유저 목록·Strava 연동 상태·보유 배지 현황 조회 | P1 |

---

## 4. 화면 구성

```
/admin                    ← 대시보드 (통계 요약)
/admin/badges             ← 배지 목록
/admin/badges/new         ← 배지 등록
/admin/badges/[id]        ← 배지 수정·삭제
/admin/poi                ← POI 목록
/admin/poi/new            ← POI 등록
/admin/poi/[id]           ← POI 수정·삭제
/admin/itembooks          ← 아이템북 목록
/admin/itembooks/new      ← 아이템북 등록
/admin/itembooks/[id]     ← 아이템북 수정·삭제
/admin/simulator          ← 시뮬레이터 메인
/admin/users              ← 유저 목록 (P1)
/admin/users/[id]         ← 유저 상세 (P1)
```

---

## 5. 기능 상세

### 5-1. 어드민 인증

- 기존 Supabase Auth + Google OAuth 재사용
- 미들웨어에서 `/admin/*` 경로를 보호
- 환경변수 `ADMIN_EMAILS`(쉼표 구분 이메일 목록)에 등록된 계정만 접근 허용
- 미허용 계정은 403 페이지로 리다이렉트

### 5-2. 배지 CRUD

**목록 화면**
- 배지 이름, 타입(activity/item), 희귀도, 발급 조건 여부, 패치 가능 여부 표시
- 타입·희귀도 필터, 이름 검색

**등록·수정 폼 필드**

| 필드 | 입력 방식 | 필수 |
|------|----------|------|
| name | 텍스트 | O |
| description | 텍스트 에어리어 | O |
| type | 드롭다운 (activity / item) | O |
| rarity | 드롭다운 (common / rare / legendary / mythic) | O |
| image_url | URL 입력 | O |
| activity_types | 복수 체크박스 (cycling / running / hiking / walking) | O |
| patch_available | 토글 | O |
| patch_price_krw | 숫자 입력 (patch_available=true 시 활성) | X |
| condition_json | **조건 빌더** (아래 별도 설명) | X (item 타입은 불필요) |

**condition_json 조건 빌더**
- `distance_km`, `total_count`, `elevation_gain_m`, `min_speed_kmh`, `streak_days` 각 항목을 숫자 입력 필드로 제공
- `activity_type` 드롭다운
- `poi_id` 텍스트 입력 (POI ID 직접 입력)
- 설정된 조건 JSON 미리보기 패널 표시

### 5-3. POI 관리

**목록 화면**
- POI 이름, 카테고리, 위도/경도, 반경(m), 연결 배지 이름 표시

**등록·수정 폼 필드**

| 필드 | 입력 방식 | 필수 |
|------|----------|------|
| name | 텍스트 | O |
| latitude | 소수 입력 | O |
| longitude | 소수 입력 | O |
| radius_meters | 숫자 입력 (기본값 50) | O |
| category | 드롭다운 (mountain / bike_route / trail / park / other) | O |
| linked_badge_id | 배지 검색·선택 드롭다운 | X |

### 5-4. 아이템북 관리

**등록·수정 폼 필드**

| 필드 | 입력 방식 | 필수 |
|------|----------|------|
| name | 텍스트 | O |
| description | 텍스트 에어리어 | O |
| required_activity_badge_id | 배지 검색·선택 (type=activity만 표시) | O |
| required_item_badge_ids | 배지 다중 검색·선택 (type=item만 표시) | O |
| reward_badge_id | 배지 검색·선택 (완성 시 발급 배지) | X |

### 5-5. 시뮬레이터

**목표**: 실제 Strava 계정 없이 가상 GPX 파일을 업로드해 배지 발급 파이프라인 전체를 테스트.

**GPX 파일 선택 이유**
- GPX 한 파일에 경로 좌표(트랙포인트)·타임스탬프·고도가 모두 포함됨
- 업로드 즉시 거리·이동시간·고도상승·평균속도·경로 좌표를 자동 파싱 → 수작업 입력 불필요
- POI 반경 매칭 테스트에 실제 경로 데이터 활용 가능
- 실제 Strava에서 내보낸 GPX 파일로 현실적인 시뮬레이션 가능

**입력 패널**

| 필드 | 설명 | 비고 |
|------|------|------|
| 대상 유저 | 유저 이메일/이름 검색·선택 | 필수 |
| GPX 파일 업로드 | `.gpx` 파일 드래그앤드롭 또는 파일 선택 | 필수 |
| 활동 종류 | cycling / running / hiking / walking | GPX에 없으므로 직접 선택 |
| 활동 횟수 배수 | 이 활동을 N회 반복 처리 (누적 횟수 배지 테스트용) | 기본값 1 |

**GPX 파싱 결과 미리보기** (업로드 직후 자동 표시)
```
파일명: hangang_ride.gpx
─────────────────────────────────
거리:       35.2 km
이동 시간:  1시간 14분
고도 상승:  120 m
평균 속도:  28.5 km/h
시작 시각:  2026-07-09 08:32
트랙포인트: 1,842개
시작점:     37.5326° N, 126.9903° E
```

**실행 모드**

| 모드 | 설명 |
|------|------|
| 미리보기 (Dry Run) | DB 반영 없음. 어떤 배지가 발급될지 결과만 표시 |
| 실제 실행 (Apply) | 선택한 유저의 DB에 배지·아이템 드랍·아이템북 완성 결과 실제 반영 |

**결과 리포트 패널**

```
[시뮬레이션 결과]
─────────────────────────────────
대상 유저: 홍길동 (hong@example.com)
GPX 파일:  hangang_ride.gpx
파싱 결과: 자전거 / 35.2km / 고도 120m / 28.5 km/h / 1,842 트랙포인트

■ 배지 발급 (3개)
  ✅ 한강 라이더 (rare) — 조건: 거리 30km 이상
  ✅ 스피드 킹 (legendary) — 조건: 평균 속도 25km/h 이상
  ✅ 30일 연속 라이더 (mythic) — 조건: 연속 30일 (기존 활동 포함)

■ POI 매칭 (경로 내 통과 POI)
  📍 뚝섬 한강공원 (bike_route) — 반경 50m 통과 확인

■ 아이템 드랍
  🎲 롤 결과: rare (확률 25%)
  🏷️ 서울 야경 패치 (rare) — 드랍됨

■ 아이템북 완성
  📖 서울 라이더 컬렉션 — 완성! (reward: 골드 라이더 배지 발급)

■ 미발급 배지 (조건 미충족)
  ❌ 100km 울트라라이더 — 거리 부족 (35.2km / 100km 필요)
─────────────────────────────────
[미리보기 모드 — DB 반영 안 됨]  [실제 적용하기]
```

**시뮬레이터 구현 원칙**
- GPX 파싱은 클라이언트 사이드에서 수행 (파일을 서버에 업로드하지 않음)
- 파싱 결과(`NormalizedActivity` + 경로 좌표 배열)를 JSON으로 API에 전송
- Dry Run: `evaluateBadges`, `tryItemDrop`, `checkItemBookCompletion` 로직을 그대로 실행하되 INSERT를 skip하고 결과만 반환
- Apply: 동일 로직을 실제 DB에 반영
- 미발급 배지도 조건별 미충족 이유(실제값 vs 필요값) 함께 표시

**GPX 파싱 스펙**
- 표준 GPX 1.1 형식 파싱 (`<trkpt lat="..." lon="..."><ele>...</ele><time>...</time></trkpt>`)
- 거리: 연속 트랙포인트 간 하버사인(Haversine) 공식으로 누적 계산
- 이동 시간: 첫 트랙포인트 ~ 마지막 트랙포인트 timestamp 차이
- 고도 상승: 연속 포인트 간 양(+)의 고도 차이 누적 합산
- 평균 속도: 거리 / 이동 시간
- 경로 좌표: 트랙포인트 `[lat, lng]` 배열 그대로 POI 매칭에 전달

### 5-6. 유저 조회 (P1)

- 유저 목록: 이메일, 닉네임, 가입일, Strava 연동 여부, 보유 배지 수, 마지막 동기화
- 유저 상세: 보유 배지 목록, 인벤토리 아이템, Strava 연동 상태

---

## 6. 기술 스펙

### 라우팅
- 기존 `jam-web` Next.js 앱에 `/admin` 경로 추가 (별도 앱 X)
- `src/app/admin/` 디렉터리 신규 생성
- `src/middleware.ts`에 어드민 경로 보호 로직 추가

### 인증 미들웨어 로직
```
1. /admin/* 요청 수신
2. Supabase Auth 세션 확인
3. 미로그인 → /login?redirect=/admin 으로 리다이렉트
4. 로그인 상태이지만 이메일이 ADMIN_EMAILS에 없음 → /admin/forbidden
5. 허용된 이메일 → 통과
```

### 새 환경변수
```
ADMIN_EMAILS=admin@example.com,dev@example.com
```

### 시뮬레이터 API
```
POST /api/admin/simulate
Body: {
  userId: string
  dryRun: boolean
  activity: {
    // GPX 클라이언트 파싱 결과
    activityType: 'cycling' | 'running' | 'hiking' | 'walking'
    distanceKm: number
    movingTimeSec: number
    elevationGainM: number
    averageSpeedKmh: number
    startDate: string          // ISO 8601
    route: [number, number][]  // [[lat, lng], ...] POI 매칭용
  }
  repeatCount: number          // 활동 반복 횟수 배수 (기본 1)
}
Response: {
  parsed: {                    // GPX 파싱 요약 (확인용 echo)
    distanceKm: number
    durationMin: number
    elevationGainM: number
    averageSpeedKmh: number
    trackpointCount: number
  }
  badgesEarned: { id: string; name: string; rarity: string; reason: string }[]
  badgesMissed: { id: string; name: string; reason: string; actual: string; required: string }[]
  poisMatched: { id: string; name: string }[]
  itemDrop: { badgeName: string; rarity: string } | null
  itemBooksCompleted: { bookName: string; rewardBadgeName: string | null }[]
  applied: boolean
}
```

### 스타일
- 어드민은 모바일 최적화보다 **데스크탑 우선** (1024px+ 기준)
- 기존 Tailwind CSS 재사용, 다크 테마 유지
- 사이드바 네비게이션 레이아웃

---

## 7. 성공 기준

- [ ] 허용 이메일 외 계정은 `/admin` 접근 불가
- [ ] 배지 등록 후 시뮬레이터에서 즉시 발급 조건 검증 가능
- [ ] Dry Run 결과와 Apply 결과가 동일하게 동작
- [ ] POI 등록 후 시뮬레이터 좌표 입력으로 POI 매칭 확인 가능
- [ ] 아이템북 완성 시 reward_badge 발급까지 전체 확인 가능

---

## 8. 안 만드는 것

- **실시간 대시보드** (DAU, MAU 통계) — 별도 분석 도구(Amplitude 등)로 대체
- **이미지 업로드** — 배지 이미지는 외부 URL 입력. Supabase Storage 업로드는 미포함
- **배지 일괄 CSV 업로드** — 초기에는 폼 등록으로 충분
- **알림 발송** — 어드민에서 푸시·이메일 직접 발송 기능 미포함

---

## 9. [NEEDS CLARIFICATION]

- [ ] ADMIN_EMAILS 목록에 들어갈 이메일 주소 확인 필요
- [ ] 시뮬레이터 Apply 모드 실행 시 "실제 유저에게 배지 발급됨" 경고 확인 UX 필요 여부
- [ ] 배지 이미지 URL — 현재 외부 URL 입력 방식으로 충분한지, 또는 Supabase Storage 업로드 추가할지
