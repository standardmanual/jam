/**
 * lib/abusing/gpsSpoofAlert — GPS 조작 의심 운영자 알림 (티켓 20261022_0940, 운영 로직 16.5절, 정책 20번 4절)
 *
 * 고정하는 것:
 * - 글: 머리 «GPS 조작이 의심돼서 픽업을 거부했어요», 유저 ID·장소 이름·사유(속도 또는 하루 이동거리)·장소를 막은 시간,
 *   어드민 어뷰징 관리의 장소 블록에서 확인한 뒤 운영자가 정지를 정한다는 안내. 좌표·이메일·토큰은 싣지 않는다.
 * - 장소 차단·기록 저장이 실패했으면(`sanctionStored: false`) «막았고 기록을 남겼어요»라고 쓰지 않고 저장 실패를 알린다.
 * - 장소 이름은 슬랙 특수문자를 거르고 길면 자른다(외부 장소 검색에서 온 값).
 * - 발송: `postOpsSlack('alert', 글)`. 값이 없거나(`not_configured`) 실패하거나 던져도 서버 로그만 남기고 false, 던지지 않는다.
 * 실제 슬랙은 호출하지 않는다 — 발송 함수를 모킹한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/abusing/__tests__/gpsSpoofAlert.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postOpsSlackMock } = vi.hoisted(() => ({ postOpsSlackMock: vi.fn() }))

vi.mock('@/lib/admin/opsInbox/slack', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/opsInbox/slack')>('@/lib/admin/opsInbox/slack')
  return { ...actual, postOpsSlack: postOpsSlackMock }
})

import { alertGpsSpoof, formatGpsSpoofAlertMessage, type GpsSpoofAlertInput } from '../gpsSpoofAlert'

const SPEED_INPUT: GpsSpoofAlertInput = {
  userId: 'user-picker',
  poiName: '성수역',
  reason: 'speed',
  speedKmh: 412,
  blockHours: 72,
  sanctionStored: true,
}

const DAILY_INPUT: GpsSpoofAlertInput = {
  userId: 'user-picker',
  poiName: '성수역',
  reason: 'daily_distance',
  speedKmh: 12,
  dailyDistanceKm: 3200,
  blockHours: 72,
  sanctionStored: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  postOpsSlackMock.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('formatGpsSpoofAlertMessage', () => {
  it('속도 사유 글: 머리, 유저 ID·장소·속도, 차단 시간과 확인 안내가 들어간다', () => {
    expect(formatGpsSpoofAlertMessage(SPEED_INPUT)).toBe(
      [
        'GPS 조작이 의심돼서 픽업을 거부했어요',
        '• 유저(user-picker) · 장소 성수역 · 속도 412km/h',
        '• 이 장소는 72시간 막았고 기록을 남겼어요. 어드민 어뷰징 관리의 장소 블록에서 확인한 뒤 운영자가 정지를 정해요',
      ].join('\n')
    )
  })

  it('하루 이동거리 사유 글: 「하루 이동거리 3,200km」로 쓰고 속도는 쓰지 않는다', () => {
    const text = formatGpsSpoofAlertMessage(DAILY_INPUT)
    expect(text).toContain('• 유저(user-picker) · 장소 성수역 · 하루 이동거리 3,200km')
    expect(text).not.toContain('km/h')
  })

  it('sanctionStored가 참/거짓이면 셋째 줄이 각각 «막았고 기록을 남겼어요» / «저장하지 못했어요»다', () => {
    const stored = formatGpsSpoofAlertMessage({ ...SPEED_INPUT, sanctionStored: true })
    expect(stored.split('\n')[2]).toBe(
      '• 이 장소는 72시간 막았고 기록을 남겼어요. 어드민 어뷰징 관리의 장소 블록에서 확인한 뒤 운영자가 정지를 정해요'
    )

    const failed = formatGpsSpoofAlertMessage({ ...SPEED_INPUT, sanctionStored: false })
    expect(failed.split('\n')).toEqual([
      'GPS 조작이 의심돼서 픽업을 거부했어요',
      '• 유저(user-picker) · 장소 성수역 · 속도 412km/h',
      '• 장소 차단이나 기록을 저장하지 못했어요. 서버 로그를 확인하고, 필요하면 운영자가 정지를 정해요',
    ])
    expect(failed).not.toContain('72시간 막았고')
    expect(failed).not.toContain('기록을 남겼어요')
    expect(failed).not.toMatch(/\d+시간/)
  })

  it('차단 시간은 정책 값을 따른다', () => {
    expect(formatGpsSpoofAlertMessage({ ...SPEED_INPUT, blockHours: 24 })).toContain('이 장소는 24시간 막았고')
  })

  it('사유의 수치를 알 수 없으면 수치 없이 사유만 적는다', () => {
    expect(formatGpsSpoofAlertMessage({ ...SPEED_INPUT, speedKmh: undefined })).toContain('· 이동 속도 초과')
    expect(formatGpsSpoofAlertMessage({ ...DAILY_INPUT, dailyDistanceKm: undefined })).toContain('· 하루 이동거리 초과')
  })

  it('좌표·이메일·토큰을 싣지 않는다 (입력에 그 값이 없고, 글에 그런 모양이 없다)', () => {
    for (const input of [SPEED_INPUT, DAILY_INPUT]) {
      const text = formatGpsSpoofAlertMessage(input)
      expect(text).not.toMatch(/@/)
      expect(text).not.toMatch(/lat|lng|latitude|longitude|위도|경도|좌표/i)
      expect(text).not.toMatch(/xox[a-z]-|Bearer/i)
    }
  })

  it('장소 이름의 슬랙 특수문자는 걸러진다 (멘션·링크로 해석되지 않는다)', () => {
    const text = formatGpsSpoofAlertMessage({ ...SPEED_INPUT, poiName: '<!channel> A&B <https://evil.example|열기>' })
    expect(text).not.toContain('<!channel>')
    expect(text).not.toContain('<https://')
    expect(text).toContain('&lt;!channel&gt; A&amp;B &lt;https://evil.example|열기&gt;')
  })

  it('긴 장소 이름은 60자에서 자르고 줄바꿈은 공백 하나로 줄인다', () => {
    const long = '가'.repeat(80)
    const text = formatGpsSpoofAlertMessage({ ...SPEED_INPUT, poiName: long })
    expect(text).toContain(`장소 ${'가'.repeat(60)}… · `)
    expect(text).not.toContain('가'.repeat(61))

    const multiline = formatGpsSpoofAlertMessage({ ...SPEED_INPUT, poiName: '성수\n\n   역' })
    expect(multiline).toContain('장소 성수 역 · ')
    expect(multiline.split('\n')).toHaveLength(3)
  })
})

describe('alertGpsSpoof', () => {
  it('#jam-alert(alert 채널)로 글 한 건을 올리고 true를 돌려준다', async () => {
    await expect(alertGpsSpoof(SPEED_INPUT)).resolves.toBe(true)
    expect(postOpsSlackMock).toHaveBeenCalledTimes(1)
    expect(postOpsSlackMock).toHaveBeenCalledWith('alert', formatGpsSpoofAlertMessage(SPEED_INPUT))
  })

  it('환경변수가 없으면(not_configured) 서버 로그만 남기고 false다', async () => {
    postOpsSlackMock.mockResolvedValue({ ok: false, error: 'not_configured' })
    await expect(alertGpsSpoof(SPEED_INPUT)).resolves.toBe(false)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('[gps-spoof-alert]')
    expect((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('not_configured')
  })

  it('슬랙이 실패해도 서버 로그만 남기고 false다', async () => {
    postOpsSlackMock.mockResolvedValue({ ok: false, error: 'channel_not_found' })
    await expect(alertGpsSpoof(SPEED_INPUT)).resolves.toBe(false)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('발송이 던져도 삼키고 false다', async () => {
    postOpsSlackMock.mockRejectedValue(new Error('network down'))
    await expect(alertGpsSpoof(SPEED_INPUT)).resolves.toBe(false)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('[gps-spoof-alert]')
  })
})
