import sharp from 'sharp'
import { buildMaskPng, extractJson, validateEditPlan } from '../edit'

describe('buildMaskPng', () => {
  it('원본 크기 회색조에 0·255만 있고 상자 안만 255다', async () => {
    const mask = await buildMaskPng(1024, 1024, [[0.5, 0.5, 0.75, 0.75]])
    const meta = await sharp(mask).metadata()
    expect(meta.width).toBe(1024)
    expect(meta.height).toBe(1024)
    expect(meta.channels).toBe(1)
    const { data } = await sharp(mask).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
    expect(new Set(data)).toEqual(new Set([0, 255]))
    expect(data[640 * 1024 + 640]).toBe(255)
    expect(data[100 * 1024 + 100]).toBe(0)
  })
})

describe('validateEditPlan', () => {
  const ok = { operation: 'erase', boxes: [[0.1, 0.1, 0.4, 0.4]], reason_ko: '지움' }

  it('올바른 erase 계획을 받아들인다', () => {
    expect(validateEditPlan(ok).operation).toBe('erase')
  })

  it('잘못된 operation을 거른다', () => {
    expect(() => validateEditPlan({ ...ok, operation: 'blur' })).toThrow()
  })

  it('범위 밖·뒤집힌 상자와 개수 오류를 거른다', () => {
    expect(() => validateEditPlan({ ...ok, boxes: [[0.1, 0.1, 1.4, 0.4]] })).toThrow()
    expect(() => validateEditPlan({ ...ok, boxes: [[0.4, 0.1, 0.1, 0.4]] })).toThrow()
    expect(() => validateEditPlan({ ...ok, boxes: [] })).toThrow()
    expect(() => validateEditPlan({ ...ok, boxes: Array(5).fill([0.1, 0.1, 0.2, 0.2]) })).toThrow()
  })

  it('inpaint·outpaint·restyle은 빈 prompt를 거른다', () => {
    expect(() => validateEditPlan({ ...ok, operation: 'inpaint', prompt: ' ' })).toThrow()
    expect(() => validateEditPlan({ operation: 'outpaint', prompt: '', zoom_out: 30 })).toThrow()
    expect(() => validateEditPlan({ operation: 'restyle', prompt: 'x'.repeat(1001), strength: 0.3 })).toThrow()
  })

  it('범위 밖 zoom_out·strength를 끝값으로 맞춘다', () => {
    expect(validateEditPlan({ operation: 'outpaint', prompt: 'a cup', zoom_out: 90 }).zoom_out).toBe(60)
    expect(validateEditPlan({ operation: 'outpaint', prompt: 'a cup', zoom_out: 1 }).zoom_out).toBe(10)
    expect(validateEditPlan({ operation: 'restyle', prompt: 'a cup', strength: 0.9 }).strength).toBe(0.6)
    expect(validateEditPlan({ operation: 'restyle', prompt: 'a cup', strength: 0 }).strength).toBe(0.1)
  })
})

describe('extractJson', () => {
  it('앞뒤 글이 섞여도 JSON을 읽고, JSON이 없으면 오류를 낸다', () => {
    expect(extractJson('sure {"a":1} done')).toEqual({ a: 1 })
    expect(() => extractJson('no json')).toThrow()
    expect(() => extractJson('{broken')).toThrow()
  })
})
