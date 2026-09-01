import TopNav from '@/components/ui/TopNav'

/**
 * 개인정보 처리방침 페이지 (티켓 20260901_2217).
 *
 * `(main)/philosophy/page.tsx`(20260901_2125)의 레이아웃·타이포 패턴을 그대로 따른다 —
 * TopNav + 단일 컬럼 서버 컴포넌트, 본문은 --text-body + --leading-reading(정책 문서용,
 * typography.css 정의), 문단 간격 --spacing-32, 상단 여백 --spacing-64. 커버 이미지·태그 없음.
 * (문단 간격은 항 단위 컨테이너 사이에 적용하고, 소제목-표 묶음처럼 밀접한 요소끼리는
 * --spacing-8로 더 좁게 묶어 서열을 준다.)
 *
 * 원고 출처는 `Service Plan/Specs/PRIVACY_POLICY.md`의 "1. 개인정보의 처리 목적" ~
 * "12. 개인정보 처리방침의 변경" 섹션이다. "게시 전 확인 필요 사항"(내부 메모)은 옮기지 않는다.
 * 원고와 달리 마크다운 표는 앱 컬럼(398px)에서 가로 스크롤 없이 읽히도록 dt/dd 카드형
 * 레이아웃으로 재구성했다(가로 스크롤 표 금지).
 *
 * 플레이스홀더 확정 내역(20260901_2217):
 * - 사업자 등록 정보(상호/대표자/사업자등록번호 등)는 비움으로 확정 — 항목 자체를 생략.
 * - 개인정보 보호책임자 연락처: sihyunrr@gmail.com로 확정(성명은 미확정이라 표기하지 않음).
 * - 시행일/개정 이력 적용일: 이 티켓의 실제 배포일로 채운다(완료 기록과 동일한 값 유지).
 *
 * 표(단락 3, 5, 6)는 별도 컴포넌트로 뽑지 않고 이 파일 안에서만 쓰는 작은 헬퍼로 둔다 —
 * 이 페이지 밖에서 재사용할 일이 없는 1회성 정적 문서 레이아웃이라 MODULAR 승격 대상이 아니다.
 */

const PAGE_TITLE = '개인정보 처리방침'

/** 시행일 — 이 티켓 배포일과 동일해야 한다. 배포일이 바뀌면 완료 기록과 함께 갱신할 것. */
const EFFECTIVE_DATE = '2026. 9. 1.'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[var(--spacing-16)]">
      <h2 className="text-[length:var(--text-h4)] leading-[var(--leading-h4)] font-[number:var(--weight-h4)] tracking-[var(--tracking-h4)]">
        {title}
      </h2>
      <div className="flex flex-col gap-[var(--spacing-32)]">{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-body)] leading-[var(--leading-reading)] text-text/90 [word-break:keep-all] break-words">
      {children}
    </p>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60 [word-break:keep-all] break-words border-l-2 border-border pl-[var(--spacing-12)]">
      {children}
    </p>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[length:var(--text-body-l)] leading-[var(--leading-body-l)] font-medium text-text/90 [word-break:keep-all] break-words">
      {children}
    </h3>
  )
}

function OrderedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-[var(--spacing-8)] list-decimal pl-[var(--spacing-24)]">
      {items.map((item, i) => (
        <li key={i} className="text-[length:var(--text-body)] leading-[var(--leading-reading)] text-text/90 [word-break:keep-all] break-words">
          {item}
        </li>
      ))}
    </ol>
  )
}

/** 마크다운 표 → 세로형 정의 카드. 앱 컬럼 폭에서 가로 스크롤 표를 만들지 않기 위함. */
function DefCard({ fields }: { fields: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="rounded-[var(--radius-cards)] bg-surface-elevated p-[var(--spacing-16)] flex flex-col gap-[var(--spacing-12)]">
      {fields.map(({ label, value }, i) => (
        <div key={i} className="flex flex-col gap-[var(--spacing-4)]">
          <dt className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text/50">{label}</dt>
          <dd className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/90 [word-break:keep-all] break-words">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={PAGE_TITLE} />

      <article className="px-[var(--spacing-16)] pt-[var(--spacing-64)] pb-[var(--spacing-64)] flex flex-col gap-[var(--spacing-48)]">
        <div className="flex flex-col gap-[var(--spacing-16)]">
          <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-[number:var(--weight-h3)] tracking-[var(--tracking-h3)]">
            {PAGE_TITLE}
          </h1>
          <P>
            JAM!은(는) 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이 정한
            바를 준수하여, 적법하게 개인정보를 처리하고 안전하게 관리하고 있습니다. 이에
            「개인정보 보호법」 제30조에 따라 정보주체에게 개인정보의 처리와 보호에 관한 절차 및
            기준을 안내하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여
            다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </P>
        </div>

        <Section title="1. 개인정보의 처리 목적">
          <P>
            JAM!은(는) 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는
            다음의 목적 외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보
            보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
          </P>
          <OrderedList
            items={[
              <>
                <strong>회원 가입 및 관리</strong> — 구글(Google) 계정을 통한 회원 가입 의사 확인,
                본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지, 각종 고지·통지, 고충 처리
              </>,
              <>
                <strong>핵심 서비스 제공(액티비티 인증·배지 획득·아이템 드랍)</strong> — 위치 기반
                관심지점(POI) 체크인 판정, 스트라바(Strava) 연동을 통한 운동 활동 인증, 활동
                배지·아이템 배지의 획득/드랍/픽업 처리, 사용자 프로필·활동 기록의 제공
              </>,
              <>
                <strong>서비스 문의 및 고객지원(VOC)</strong> — 문의·건의·오류 신고 접수 및 답변,
                처리 결과 안내
              </>,
              <>
                <strong>서비스 개선 및 부정이용 방지</strong> — 서비스 이용 통계 분석, GPS 조작 등
                어뷰징 탐지, 서비스 안정성 확보
              </>,
            ]}
          />
          <Note>
            참고 — 서비스 내 공개되는 정보: JAM!은(는) 다른 이용자와 활동을 공유하는 소셜
            서비스로, 닉네임(사용자명), 프로필 사진, 획득한 배지·아이템, 활동/체크인 기록 일부는
            서비스 내에서 다른 이용자에게 공개될 수 있습니다. 비공개를 원하는 항목이 있다면
            10항의 개인정보 보호책임자 연락처로 문의해 주세요.
          </Note>
        </Section>

        <Section title="2. 처리하는 개인정보의 항목">
          <P>JAM!은(는) 다음과 같은 법적 근거로 정보주체의 개인정보를 수집 및 이용합니다.</P>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(1) 회원 가입 시 — 구글로부터 제공받는 항목</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제4호(계약 체결·이행)' },
                { label: '수집 항목', value: '이메일 주소, 프로필 사진(구글 계정 프로필 이미지)' },
                { label: '수집 방법', value: '구글(Google) OAuth 소셜 로그인을 통해 구글로부터 제공받아 수집' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(2) 서비스 이용 과정에서 이용자가 직접 입력하는 항목</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제4호(계약 체결·이행)' },
                {
                  label: '수집 항목',
                  value:
                    '사용자명(닉네임), 표시 이름, 활동 지역, 선호 활동 유형, 프로필 사진(직접 업로드 시 구글 프로필 사진을 대체)',
                },
              ]}
            />
          </div>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(3) 위치정보</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제1호(동의) — 브라우저/단말기의 위치 접근 권한 허용 시 수집' },
                { label: '수집 항목', value: 'GPS 좌표(위도·경도)' },
                { label: '수집 방법 및 목적', value: '지도상 현재 위치 표시, 관심지점(POI) 근접 여부 실시간 판정을 위해 이용 중 자동 수집' },
                { label: '보유 기간', value: '위치 판정 즉시 사용 후 별도 보관하지 않음(체크인 성사 시 체크인 기록에 결과만 저장)' },
              ]}
            />
            <P>
              위치정보 접근은 이용자가 브라우저/단말기 설정에서 언제든지 거부할 수 있으며, 거부 시
              위치 기반 기능 이용이 제한될 수 있습니다.
            </P>
          </div>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(4) 스트라바(Strava) 연동 시 — 스트라바로부터 제공받는 항목</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제1호(동의)' },
                {
                  label: '수집 항목',
                  value: '스트라바 계정 식별정보, 액세스/리프레시 토큰, 운동 활동 기록(운동 종류, 거리, 시간, GPS 경로 스트림 등)',
                },
                { label: '수집 방법', value: '이용자가 스트라바 계정 연동에 직접 동의(OAuth)한 경우에 한해 스트라바로부터 제공받아 수집' },
              ]}
            />
            <P>
              액세스/리프레시 토큰은 AES-256으로 암호화하여 저장합니다. 연동 해제 시 즉시 토큰을
              파기하며, 이후 스트라바로부터의 신규 데이터 수집을 중단합니다.
            </P>
          </div>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(5) 문의(VOC) 접수 시</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제1호(동의)' },
                { label: '수집 항목', value: '이메일 주소, 문의 내용, 기기·브라우저 정보, 첨부 스크린샷(선택)' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-[var(--spacing-8)]">
            <H3>(6) 서비스 이용 과정에서 자동으로 생성·수집되는 정보</H3>
            <DefCard
              fields={[
                { label: '법적 근거', value: '「개인정보 보호법」 제15조제1항제4호(계약 체결·이행)' },
                { label: '수집 항목', value: '접속 로그, 서비스 이용 기록(체크인·배지 획득·아이템 거래 등 활동 이력)' },
              ]}
            />
          </div>
          <P>
            JAM!은(는) 광고 목적의 맞춤형 쿠키, 방문 추적 스크립트(예: 구글 애널리틱스 등)를
            사용하지 않으며, 로그인 상태 유지를 위한 필수 인증 쿠키만 사용합니다(자세한 내용은
            8항 참조). 위 (1)~(6) 항목 외에 정보주체의 동의 없이 처리하는 고유식별정보·민감정보는
            없습니다.
          </P>
        </Section>

        <Section title="3. 개인정보의 처리 및 보유 기간">
          <P>
            ① JAM!은(는) 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터 개인정보를 수집
            시 동의받은 개인정보 보유·이용 기간 내에서 개인정보를 처리·보유합니다.
          </P>
          <P>② 각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.</P>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            <DefCard fields={[{ label: '회원 가입 및 관리', value: '회원 탈퇴 시까지' }]} />
            <DefCard fields={[{ label: '스트라바 연동 정보(토큰)', value: '연동 해제 또는 회원 탈퇴 시 즉시 파기' }]} />
            <DefCard fields={[{ label: '위치정보(GPS 좌표)', value: '실시간 판정 목적 달성 즉시 미보관(체크인 결과만 활동 기록에 남음)' }]} />
            <DefCard fields={[{ label: '문의(VOC) 접수 내용', value: '문의 처리 완료 후 3년(전자상거래법상 소비자 불만·분쟁처리 기록 준용)' }]} />
            <DefCard fields={[{ label: '관계 법령 위반에 따른 수사·조사 진행 중인 경우', value: '해당 수사·조사 종료 시까지' }]} />
          </div>
          <P>
            ③ 회원 탈퇴 시 계정 정보는 삭제되나, 다른 이용자와 결부된 활동 기록(체크인 스냅샷,
            아이템 거래 이력 등)은 소유자 식별 관계만 해제(anonymize)된 채 서비스 무결성 유지를
            위해 보존될 수 있습니다.
          </P>
        </Section>

        <Section title="4. 개인정보의 파기 절차 및 방법">
          <P>
            ① JAM!은(는) 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게
            되었을 때에는 지체없이 해당 개인정보를 파기합니다.
          </P>
          <P>
            ② 정보주체로부터 동의받은 개인정보 보유기간이 경과하거나 처리목적이 달성되었음에도
            불구하고 다른 법령에 따라 개인정보를 계속 보존하여야 하는 경우에는, 해당 개인정보를
            별도의 데이터베이스(DB)로 옮기거나 보관 장소를 달리하여 보존합니다.
          </P>
          <P>③ 개인정보 파기의 절차 및 방법은 다음과 같습니다.</P>
          <OrderedList
            items={[
              <>
                <strong>파기절차</strong> — 파기 사유가 발생한 개인정보를 선정하고, 개인정보
                보호책임자의 승인을 받아 파기합니다.
              </>,
              <>
                <strong>파기방법</strong> — 전자적 파일 형태로 기록·저장된 개인정보는 기술적
                방법을 이용하여 복구 및 재생이 불가능하도록 영구 삭제합니다.
              </>,
            ]}
          />
        </Section>

        <Section title="5. 개인정보 처리업무의 위탁에 관한 사항">
          <P>
            JAM!은(는) 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리 업무를 국내
            수탁업체에 위탁하고 있습니다. 위탁 계약 체결 시 「개인정보 보호법」 제26조에 따라
            위탁업무 수행 목적 외 개인정보 처리 금지, 기술적·관리적 보호조치, 재위탁 제한,
            수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을 명시하고 있습니다.
          </P>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            <DefCard
              fields={[
                { label: '수탁자', value: 'Supabase, Inc.' },
                { label: '위탁 업무', value: '회원 인증, 데이터베이스 운영, 파일(프로필 사진 등) 저장 — 서버는 대한민국 서울(ap-northeast-2) 리전에 소재' },
              ]}
            />
            <DefCard
              fields={[
                { label: '수탁자', value: 'Vercel Inc.' },
                { label: '위탁 업무', value: '웹 서비스 호스팅 및 배포' },
              ]}
            />
            <DefCard
              fields={[
                { label: '수탁자', value: '네이버클라우드플랫폼(주)' },
                { label: '위탁 업무', value: '지도 표시, 장소(POI) 검색 API 제공' },
              ]}
            />
          </div>
          <P>
            위탁업무의 내용이나 수탁자가 변경될 경우에는 지체없이 본 개인정보 처리방침을
            통하여 공개하겠습니다. 개인정보 처리 업무를 국외에 위탁하는 사항은 6항에서 안내하고
            있습니다.
          </P>
        </Section>

        <Section title="6. 개인정보의 국외 수집 및 이전에 관한 사항">
          <P>
            JAM!은(는) 서비스 제공을 위하여 아래와 같이 개인정보 처리 업무의 일부를 국외에
            위탁하거나 이전하고 있습니다. 정보주체는 언제든지 관련 기능 이용을 중단하거나 회원
            탈퇴를 통해 이전을 거부할 수 있으나, 이 경우 해당 기능(구글 로그인, 스트라바 연동
            등) 이용이 제한됩니다.
          </P>
          <div className="flex flex-col gap-[var(--spacing-8)]">
            <DefCard
              fields={[
                { label: '이전받는 자', value: 'Google LLC' },
                { label: '이전 목적', value: '구글 소셜 로그인 인증' },
                { label: '이전 항목', value: '이메일 주소, 프로필 사진' },
                { label: '이전 국가', value: '미국' },
                { label: '이전 방법', value: '서비스 이용(로그인) 시 암호화된 네트워크(TLS/SSL)를 통해 이전' },
                { label: '보유·이용 기간', value: '회원 탈퇴 또는 연동 해제 시까지' },
              ]}
            />
            <DefCard
              fields={[
                { label: '이전받는 자', value: 'Strava, Inc.' },
                { label: '이전 목적', value: '운동 활동 데이터 연동' },
                { label: '이전 항목', value: '스트라바 계정 식별정보, 액세스/리프레시 토큰, 활동 기록' },
                { label: '이전 국가', value: '미국' },
                { label: '이전 방법', value: '이용자의 연동 동의(OAuth) 시 암호화된 네트워크를 통해 이전' },
                { label: '보유·이용 기간', value: '연동 해제 시까지' },
              ]}
            />
            <DefCard
              fields={[
                { label: '이전받는 자', value: 'Google LLC' },
                { label: '이전 목적', value: '문의(VOC) 내용 보관·조회(Google Sheets)' },
                { label: '이전 항목', value: '문의 내용, 이메일 주소, 기기·브라우저 정보' },
                { label: '이전 국가', value: '미국' },
                { label: '이전 방법', value: '문의 접수 시 암호화된 네트워크를 통해 이전' },
                { label: '보유·이용 기간', value: '문의 처리 완료 후 3년' },
              ]}
            />
            <DefCard
              fields={[
                { label: '이전받는 자', value: 'Vercel Inc.' },
                { label: '이전 목적', value: '웹 서비스 호스팅(글로벌 엣지 네트워크)' },
                { label: '이전 항목', value: '접속 로그 등 서비스 이용 과정에서 발생하는 정보' },
                { label: '이전 국가', value: '미국 등 글로벌 리전' },
                { label: '이전 방법', value: '서비스 이용 시 암호화된 네트워크를 통해 이전' },
                { label: '보유·이용 기간', value: '위탁계약 종료 시까지' },
              ]}
            />
          </div>
          <Note>
            참고: Supabase는 데이터베이스·인증 서버 자체는 대한민국(서울) 리전에 물리적으로
            저장·운영되나, 서비스를 제공하는 법인(Supabase, Inc.)이 미국 소재 회사이므로 투명성
            확보 차원에서 참고로 기재합니다(5항 국내 위탁 참조).
          </Note>
        </Section>

        <Section title="7. 개인정보의 안전성 확보조치에 관한 사항">
          <P>JAM!은(는) 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</P>
          <OrderedList
            items={[
              <>
                <strong>관리적 조치</strong> — 개인정보 접근 권한을 관리자로 한정, 관리자 계정에
                대한 별도 인증
              </>,
              <>
                <strong>기술적 조치</strong> — 개인정보처리시스템에 대한 접근 권한 관리, 스트라바
                연동 토큰 등 민감한 인증정보의 암호화(AES-256) 저장, 전송 구간 암호화(TLS/SSL),
                데이터베이스 접근 통제(Row Level Security)
              </>,
              <>
                <strong>물리적 조치</strong> — 데이터센터는 위탁업체(Supabase, Vercel)의 물리적
                보안 정책을 따름
              </>,
            ]}
          />
        </Section>

        <Section title="8. 개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항">
          <P>
            ① JAM!은(는) 로그인 상태 유지 등 서비스 제공에 반드시 필요한 목적으로만 쿠키를
            사용하며, 광고·행태정보 수집을 위한 쿠키나 제3자 분석 스크립트(구글 애널리틱스 등)는
            사용하지 않습니다.
          </P>
          <P>
            ② 쿠키는 웹사이트 운영에 이용되는 서버가 이용자의 브라우저에 보내는 소량의 정보로,
            이용자의 브라우저에 저장되며 서비스 접속 시 서버로 자동 전송됩니다.
          </P>
          <P>
            ③ 이용자는 브라우저 옵션 설정을 통해 쿠키 저장을 거부할 수 있습니다. 다만 로그인
            유지에 필요한 필수 쿠키를 거부할 경우 로그인이 필요한 서비스 이용이 제한될 수
            있습니다.
          </P>
          <OrderedList
            items={[
              '크롬(Chrome): 오른쪽 상단 ⋮ → 설정 → 개인정보 보호 및 보안 → 쿠키 및 기타 사이트 데이터',
              '사파리(Safari): 설정 → Safari → 고급 → 모든 쿠키 차단',
              '엣지(Edge): 오른쪽 상단 … → 설정 → 쿠키 및 사이트 권한',
            ]}
          />
        </Section>

        <Section title="9. 정보주체와 법정대리인의 권리·의무 및 행사방법">
          <P>
            ① 정보주체는 JAM!에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 및 동의 철회 등을
            요구(이하 &quot;권리 행사&quot;)할 수 있습니다.
          </P>
          <P>
            ② 권리 행사는 아래 10항의 연락처로 서면, 전자우편 등을 통하여 하실 수 있으며,
            JAM!은(는) 「개인정보 보호법 시행령」 제41조에 따라 지체없이 조치합니다.
          </P>
          <OrderedList
            items={[
              '정보주체는 서비스 내 프로필 설정 화면에서 닉네임·표시 이름·프로필 사진·활동 지역 등을 직접 조회·수정할 수 있습니다.',
              '회원 탈퇴 및 그에 따른 개인정보 삭제 요청, 스트라바 연동 해제 요청은 현재 별도 자동화 기능이 준비되기 전까지 10항의 연락처로 요청해 주시면 지체없이 처리합니다.',
            ]}
          />
          <P>
            ③ 권리 행사는 정보주체의 법정대리인이나 위임을 받은 대리인을 통하여도 할 수 있으며,
            이 경우 위임장을 제출하여야 합니다.
          </P>
          <P>
            ④ 다른 법령에서 그 개인정보가 수집 대상으로 명시되어 있는 경우에는 해당 개인정보의
            삭제를 요구할 수 없습니다.
          </P>
          <P>⑤ JAM!은(는) 권리 행사를 한 자가 본인이거나 정당한 대리인인지를 확인합니다.</P>
          <Note>
            14세 미만 아동: JAM!은(는) 현재 14세 미만 아동을 위한 별도의 법정대리인 동의 절차를
            갖추고 있지 않으며, 14세 미만 아동의 회원가입을 허용하지 않습니다.
          </Note>
        </Section>

        <Section title="10. 개인정보 보호책임자에 관한 사항">
          <P>
            JAM!은(는) 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한
            정보주체의 불만처리 및 피해구제 등을 위하여 개인정보 보호책임자를 지정하고 있습니다.
          </P>
          <DefCard fields={[{ label: '연락처', value: 'sihyunrr@gmail.com' }]} />
          <P>
            정보주체는 JAM! 서비스를 이용하시면서 발생한 모든 개인정보 보호 관련 문의,
            불만처리, 피해구제에 관한 사항을 위 연락처로 문의할 수 있으며, JAM!은(는) 지체없이
            답변 및 처리합니다.
          </P>
        </Section>

        <Section title="11. 정보주체의 권익침해에 대한 구제방법">
          <P>
            정보주체는 개인정보침해로 인한 구제를 받기 위하여 아래 기관에 분쟁해결이나 상담 등을
            신청할 수 있습니다.
          </P>
          <OrderedList
            items={[
              '개인정보 분쟁조정위원회: (국번없이) 1833-6972 (www.kopico.go.kr)',
              '개인정보침해 신고센터: (국번없이) 118 (privacy.kisa.or.kr)',
              '대검찰청: (국번없이) 1301 (www.spo.go.kr)',
              '경찰청: (국번없이) 182 (ecrm.police.go.kr)',
            ]}
          />
        </Section>

        <Section title="12. 개인정보 처리방침의 변경">
          <P>① 이 개인정보 처리방침은 {EFFECTIVE_DATE}부터 적용됩니다.</P>
          <P>
            ② 법령·정책 또는 보안기술의 변경에 따라 내용의 추가·삭제 및 변경이 있을 시에는
            지체없이 본 페이지를 통하여 고지합니다.
          </P>
          <DefCard fields={[{ label: `v1.0 · ${EFFECTIVE_DATE}`, value: '최초 제정' }]} />
        </Section>
      </article>
    </div>
  )
}
