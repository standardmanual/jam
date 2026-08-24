# 배지 이미지 자동 생성 프레임워크

Figma 디자인(배경 + 텍스트 자리)을 기반으로, DB row(POI/아이템 등)마다 텍스트만 바꿔
배지 이미지를 대량 생성하는 재사용 가능한 엔진.

## 구조

```
scripts/badge-image-gen/
├── generate.js              엔진 본체 — 디자인이 달라져도 수정하지 않음
├── configs/
│   └── *.config.js          디자인별 설정 (배경 SVG, 텍스트 위치/폰트, DB 조회, UPDATE SQL)
├── fonts/                   폰트 캐시 (자동 다운로드, git 커밋됨)
└── backgrounds/             배경 SVG 캐시 (자동 다운로드, git 커밋됨)
```

## 새 디자인 추가하는 법

1. Figma MCP로 새 디자인의 `get_design_context` / `get_screenshot`을 확인해 배경 SVG URL,
   텍스트 x/y/width/height/fontSize/color/align 값을 얻는다.
2. `configs/{design-name}.config.js`를 새로 작성한다 (`configs/metro-poi-badge.config.js` 참고).
   - `dataSource(supabase)`: 이미지를 만들 대상 row를 supabase-js 쿼리 빌더로 조회.
     반환하는 각 row의 `id`는 반드시 `badges.id`(PK)여야 한다 — 파일명과 UPDATE 매칭 키로 쓰인다.
   - `updateSqlTemplate`: `badges.image_url`을 반영할 SQL. `{{imagePathPrefix}}`가 치환된다.
3. 실행:
   ```bash
   node scripts/badge-image-gen/generate.js {design-name} --limit 5 --dry-run   # 먼저 소량 검증
   node scripts/badge-image-gen/generate.js {design-name}                       # 전체 실행
   ```
4. 실행 후 `supabase/seed/update_{design-name}_images.sql`이 생성된다 — 이 SQL을 Supabase에
   직접 실행해 `image_url`을 반영한다 ([[feedback_direct_sql_deploy]] 컨벤션).
5. 생성된 PNG(`public/{outputDir}/*.png`) + config + SQL 파일을 커밋한다.

## 텍스트 폭 측정 모드 — `text.measure`

디자인이 정한 폰트 크기를 그대로 유지하려면 `text.measure: 'font'`를 켠다.

| 값 | 동작 | 쓸 때 |
|---|---|---|
| (기본, 생략) | 모든 글자를 fontSize와 같은 정사각형으로 가정한 근사치 | 기존 config 호환 |
| `'font'` | 폰트의 실제 advance width로 정확히 계산 (`lib/measure-text.js`) | 새로 만드는 디자인 전부 |

근사치는 한글에서 실제보다 약 16% 과대 계산된다 (Pretendard Bold 한글 = 0.8643em). 그래서
Figma가 지정한 크기가 실제로는 폭에 들어가는데도 `autoShrink`가 불필요하게 축소해버린다.
실측 모드는 오차가 없어 안전 여유(`fitSafety`)도 1.0을 기본으로 쓴다 (근사 모드는 0.98).

## 텍스트 크기 자동 조절

- `autoShrink`: 폭을 넘치면 `minFontSize`까지 줄이고, 그래도 한 줄에 안 들어가면 자연스러운
  경계(공백/괄호/가운뎃점)에서 2줄 중앙정렬로 전환한다.
- `autoGrow`: 텍스트가 짧아 여백이 남으면 `maxFontSize`까지 키운다. **디자인이 정한 크기를
  고정하고 싶으면 켜지 않는다** — 배지마다 글자 크기가 달라지면 컬렉션으로 나열했을 때
  통일감이 깨진다.

## 필요 환경변수 (.env.local)
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 실행 시 TLS 에러가 나는 경우
샌드박스 환경은 Node 기본 CA 스토어 문제로 `unable to get local issuer certificate` 에러가 날 수 있다.
```bash
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem node scripts/badge-image-gen/generate.js {design-name}
```
