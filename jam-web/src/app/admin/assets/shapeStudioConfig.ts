/**
 * Shape Studio v2 설정·프리셋·셰이더·거리장(EDT)·기하·검증 모듈 (티켓 20261022_1318)
 *
 * 원본 프로토타입 `docs/assets/prototypes/20261022_shape-studio.html`의 상수·프리셋·GLSL 셰이더·
 * EDT 거리장·기하 계산·무작위 생성·JSON 프리셋 검증 로직을 이식한다.
 */

export const REF = 640
export const GT = 512
export const GRANGE = 128
export const VIDEO_SEC = 15

export type SegmentItem = {
  h: number
  rt: number
  rb: number
  w: number
}

export type ShapePreset = {
  id: string
  name: string
  width: number
  overlap: number
  metaball: boolean
  merge: number
  segments: SegmentItem[]
  glyph?: undefined
}

export type GlyphDefinition = {
  box: [number, number, number, number]
  d?: string
  mask?: Uint8Array
}

export type GlyphPreset = {
  id: string
  name: string
  glyph: string
  width: number
  segments?: undefined
}

export type AnyShapePreset = ShapePreset | GlyphPreset

export type GradientPreset = {
  id: string
  name: string
  c: [string, string, string, string, string]
  rim: string
  bgA: string
  bgB: string
  bgAngle?: number
  dir?: number
}

export type CanvasRatio = '1:1' | '4:5' | '9:16' | '16:9'
export type BackgroundMode = 'gradient' | 'solid' | 'transparent'
export type StudioEngineMode = 'shape' | 'ribbon'

export type ShapeStudioState = {
  version: 2
  shape: string
  glyph: string | null
  segments: SegmentItem[]
  width: number
  overlap: number
  metaball: boolean
  merge: number
  soft: number
  scale: number
  rotation: number
  warp: number
  grad: string
  colors: [string, string, string, string, string, string]
  direction: number
  flow: number
  shift: number
  contour: number
  rim: number
  bgMode: BackgroundMode
  bgA: string
  bgB: string
  bgAngle: number
  grain: number
  ratio: CanvasRatio
  animate: boolean
  speed: number
  metal: number
  vivid: number
  seed: number
}

export type RandomOptionKey =
  | 'count'
  | 'heights'
  | 'radii'
  | 'overlap'
  | 'metaball'
  | 'colors'
  | 'size'
  | 'rotation'
  | 'warp'
  | 'soft'

export type RandomToggleState = Record<RandomOptionKey, boolean>

export function seg(h: number, rt: number, rb: number, w = 100): SegmentItem {
  return { h, rt, rb, w }
}

export function cloneState<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: 'hourglass',
    name: 'Hourglass',
    width: 250,
    overlap: 28,
    metaball: true,
    merge: 36,
    segments: [seg(190, 20, 400), seg(190, 400, 20)],
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    width: 400,
    overlap: 28,
    metaball: true,
    merge: 36,
    segments: [seg(182, 154, 63), seg(207, 363, 120)],
  },
]

const J_D =
  'M136.018 128.585C136.018 170.589 101.954 204.628 59.944 204.628H0V128.585H42.24C52.026 128.585 59.957 120.657 59.957 110.875L59.957 54.735L0 54.862L0 0H136.018V128.585Z'
const A_D =
  'M269.482 182.524C256.793 194.814 245.244 198.652 227.75 202.969C224.373 203.801 218.643 203.937 216.196 204.628H207.921C203.311 203.78 198.198 203.255 193.8 201.8C160.946 190.932 146.353 164.238 152.673 131.356C161.898 83.356 205.54 71.094 248.466 71.197H273.506V51.798L216.196 51.78C205.44 51.777 194.205 51.969 183.491 51.766C183.29 41.759 183.141 31.751 183.043 21.743C182.998 15.212 183.136 6.399 182.707 0H275.358C312.019 0 341.736 29.713 341.736 66.366V204.628H269.482V182.524ZM270.516 115.825C270.327 135.451 268.264 147.483 248.151 153.776C240.018 156.231 230.837 156.221 223.443 150.952C210.709 141.878 213.108 127.457 225.366 119.279C228.722 117.04 232.923 116.408 236.936 115.825C247.148 115.825 260.755 115.825 270.516 115.825Z'
const M_D =
  'M553.548 0C588.829 0 617.432 28.591 617.432 63.857V204.628H540.911V99.29H527.912V204.628H451.39V99.29H438.394V204.628H361.87V63.857C361.872 28.591 390.475 0 425.754 0C461.035 0 489.638 17.505 489.638 52.772C489.638 17.493 518.241 0 553.522 0H553.548Z'

export const BUILTIN_GLYPHS: Record<string, GlyphDefinition> = {
  J: { box: [0, 0, 136.018, 204.628], d: J_D },
  A: { box: [146.353, 0, 341.736, 204.628], d: A_D },
  M: { box: [361.87, 0, 617.432, 204.628], d: M_D },
  JAM: { box: [0, 0, 617.432, 204.628], d: `${J_D} ${A_D} ${M_D}` },
}

export const GLYPH_PRESETS: GlyphPreset[] = (['J', 'A', 'M', 'JAM'] as const).map((k) => ({
  id: `glyph-${k}`,
  name: k,
  glyph: k,
  width: k === 'JAM' ? 520 : 380,
}))

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'morning', name: 'Morning', c: ['#6938ef', '#f8667f', '#ff9446', '#6f8cff', '#1c4fe0'], rim: '#9db4ff', bgA: '#3f78f2', bgB: '#f8607f' },
  { id: 'pulse', name: 'Pulse', c: ['#16d99a', '#1fb5e8', '#0371de', '#4a5cf2', '#7a9ef9'], rim: '#8fd8ff', bgA: '#1f74f0', bgB: '#22d69c' },
  { id: 'heart', name: 'Heart', c: ['#3b5cf0', '#6938ef', '#f8667f', '#ff8a5e', '#2563eb'], rim: '#a9a8ff', bgA: '#6938ef', bgB: '#f8667f' },
  { id: 'ember', name: 'Ember', c: ['#f0302e', '#f8667f', '#ff9446', '#ffb44a', '#e0305a'], rim: '#ffc0a8', bgA: '#f5603c', bgB: '#ff9aa2' },
  { id: 'rising', name: 'Rising', c: ['#f8667f', '#8a3ff0', '#2b5cf0', '#0371de', '#6938ef'], rim: '#9db0ff', bgA: '#6938ef', bgB: '#2f6cf0' },
  { id: 'locker', name: 'Locker', c: ['#e0529f', '#7a6cf0', '#0b5fe0', '#2a8cf0', '#6938ef'], rim: '#a8c4ff', bgA: '#d6559e', bgB: '#5a63e8' },
  { id: 'sunrise', name: 'Sunrise', c: ['#ffb454', '#fe8d47', '#fe745c', '#fe7980', '#ff87a8'], rim: '#ffd2b0', bgA: '#ffd2a0', bgB: '#ffa9c0', bgAngle: 140, dir: 25 },
  { id: 'sunset', name: 'Sunset', c: ['#f6a14f', '#f97f51', '#f36879', '#8a68aa', '#1671da'], rim: '#ffc8a8', bgA: '#ffb98a', bgB: '#8fb2f5', bgAngle: 140, dir: 25 },
  { id: 'aurora', name: 'Aurora', c: ['#3dcf9f', '#20c29e', '#129bbd', '#0477d7', '#217fe7'], rim: '#a5e8d8', bgA: '#a5bcfa', bgB: '#6be3b8', bgAngle: 140, dir: 25 },
  { id: 'pop', name: 'Pop', c: ['#e96a89', '#ba50af', '#703be6', '#3c53e8', '#0d70e3'], rim: '#f0a8d8', bgA: '#ffa0b8', bgB: '#8fa8ff', bgAngle: 140, dir: 25 },
  { id: 'tropic', name: 'Tropic', c: ['#ee954f', '#a8af5d', '#3cce8e', '#17a6b4', '#0477d7'], rim: '#ffd0a0', bgA: '#ffc08a', bgB: '#7fd3f0', bgAngle: 140, dir: 25 },
  { id: 'twilight', name: 'Twilight', c: ['#b86a98', '#8f95e8', '#716ef2', '#713ce9', '#c354a6'], rim: '#c8c0ff', bgA: '#d9a0d0', bgB: '#9aa8ff', bgAngle: 140, dir: 25 },
  { id: 'lagoon', name: 'Lagoon', c: ['#1fb8af', '#30d09d', '#50bac1', '#6fa6e8', '#5f91f3'], rim: '#b8f0e0', bgA: '#7be6c8', bgB: '#8fb4ff', bgAngle: 140, dir: 25 },
  { id: 'indigo', name: 'Indigo', c: ['#7a76f0', '#7062f1', '#683bef', '#6e50f3', '#7a7bf0'], rim: '#c0b8ff', bgA: '#a39cff', bgB: '#8fb0ff', bgAngle: 140, dir: 25 },
]

export const COLOR_LABELS = ['Top', 'Mid 1', 'Mid 2', 'Mid 3', 'Base', 'Rim'] as const

export const RAND_SEG_OPTS: ReadonlyArray< readonly [RandomOptionKey, string] > = [
  ['count', 'Segment count'],
  ['heights', 'Heights'],
  ['radii', 'Corner radii'],
  ['overlap', 'Overlap'],
  ['metaball', 'Metaball'],
  ['colors', 'Gradient'],
]

export const RAND_GLYPH_OPTS: ReadonlyArray< readonly [RandomOptionKey, string] > = [
  ['size', 'Size'],
  ['rotation', 'Rotation'],
  ['warp', 'Organic warp'],
  ['soft', 'Edge softness'],
  ['colors', 'Gradient'],
]

export const INITIAL_RAND_TOGGLES: RandomToggleState = {
  count: true,
  heights: true,
  radii: true,
  overlap: true,
  metaball: true,
  colors: true,
  size: true,
  rotation: true,
  warp: true,
  soft: false,
}

export function makeState(sp: ShapePreset, gr: GradientPreset): ShapeStudioState {
  return {
    version: 2,
    shape: sp.id,
    glyph: null,
    segments: cloneState(sp.segments),
    width: sp.width,
    overlap: sp.overlap,
    metaball: sp.metaball,
    merge: sp.merge,
    soft: 38,
    scale: 100,
    rotation: 0,
    warp: 0,
    grad: gr.id,
    colors: [...gr.c, gr.rim],
    direction: 0,
    flow: 100,
    shift: 0,
    contour: 72,
    rim: 42,
    bgMode: 'gradient',
    bgA: gr.bgA,
    bgB: gr.bgB,
    bgAngle: 0,
    grain: 12,
    ratio: '1:1',
    animate: false,
    speed: 100,
    metal: 60,
    vivid: 38,
    seed: 7,
  }
}

export const INITIAL_STATE: ShapeStudioState = makeState(SHAPE_PRESETS[1], GRADIENT_PRESETS[0])
export const DEFAULT_STATE: ShapeStudioState = INITIAL_STATE

export const VERTEX_SHADER = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}'

export const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uRes;uniform int uCount;uniform vec4 uGeo[4];uniform vec4 uRad[4];
uniform float uMetal,uVivid;
uniform float uScale,uRot,uBlend,uWarp,uTime,uSoft,uExt,uDir,uFlow,uShift,uContour,uRim,uGrain,uGrainPx,uSeed,uBgAngle;
uniform int uMode;uniform sampler2D uSdf;uniform float uSpanFull,uRangeW;
uniform vec3 uC[5];uniform vec3 uRimC;uniform vec3 uBgA;uniform vec3 uBgB;uniform int uBgMode;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031+uSeed*.0137);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float smin(float a,float b,float k){if(k<.0001)return min(a,b);float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
vec2 prof(float y,float hh,float hw,vec4 r){
  float yt=hh-r.y,yb=-hh+r.w;float w=hw,sl=0.;
  if(y>yt){float u=clamp((y-yt)/r.y,0.,.9995);float sq=sqrt(1.-u*u);w=hw-r.x*(1.-sq);sl=r.x*u/(r.y*sq);}
  else if(y<yb){float u=clamp((yb-y)/r.w,0.,.9995);float sq=sqrt(1.-u*u);w=hw-r.z*(1.-sq);sl=r.z*u/(r.w*sq);}
  return vec2(w,sl);
}
float segD(vec2 q,vec4 g,vec4 r){
  vec2 p=q-vec2(0.,g.x);float yc=clamp(p.y,-g.y,g.y);vec2 ws=prof(yc,g.y,g.z,r);
  float dxr=abs(p.x)-ws.x;float slc=min(ws.y,4.);
  float nrm=mix(sqrt(1.+slc*slc),1.,clamp(dxr*5.,0.,1.));
  float dx=dxr/nrm;float dy=abs(p.y)-g.y;
  return length(max(vec2(dx,dy),0.))+min(max(dx,dy),0.);
}
float glyphD(vec2 q){
  vec2 uv=q/uSpanFull+.5;vec2 c=clamp(uv,0.,1.);
  float v=texture2D(uSdf,c).r;float sd=(v-.5)*2.*uRangeW;
  return sd+length(max(abs(uv-.5)-.5,0.))*uSpanFull;
}
float field(vec2 q){if(uMode==1)return glyphD(q);float d=100.;for(int i=0;i<4;i++){if(i<uCount){d=smin(d,segD(q,uGeo[i],uRad[i]),uBlend);}}return d;}
vec3 ramp(float t){t=clamp(t,0.,1.)*4.;vec3 c=uC[0];c=mix(c,uC[1],smoothstep(0.,1.,t));c=mix(c,uC[2],smoothstep(1.,2.,t));c=mix(c,uC[3],smoothstep(2.,3.,t));c=mix(c,uC[4],smoothstep(3.,4.,t));return c;}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;float aspect=uRes.x/uRes.y;
  vec2 p=(gl_FragCoord.xy*2.-uRes)/uRes.y;p/=min(aspect,1.);p/=uScale;
  float cr=cos(uRot),sr=sin(uRot);p=mat2(cr,-sr,sr,cr)*p;
  vec2 q=p;q.x+=uWarp*.12*sin(q.y*4.+uTime*.6)*.5;q.y+=uWarp*.06*sin(q.x*5.-uTime*.5);
  float d=field(q);
  float soft=.004+uSoft*.11;
  float mask=1.-smoothstep(-soft,soft,d);
  float rb=.26+uExt*.22;
  float acc=clamp(d,-.24,.5)*1.4,wsum=1.4;
  for(int i=0;i<24;i++){
    float fi=float(i)+.5;float rr=sqrt(fi/24.)*rb;float a=fi*2.39996323;
    float w=exp(-1.6*rr*rr/(rb*rb));
    acc+=clamp(field(q+vec2(cos(a),sin(a))*rr),-.24,.5)*w;wsum+=w;
  }
  float db=acc/wsum;
  float depth=max(-db,0.);
  vec2 dv=vec2(sin(uDir),-cos(uDir));
  float t=.5+dot(q,dv)/(2.*uExt);
  float dn=clamp(depth/.24,0.,1.);dn=dn*dn*(3.-2.*dn);
  float cc=mix(clamp(t,0.,1.),1.-dn,uContour*.65);
  float x=cc*uFlow+uShift;
  x+=sin(uTime*.35)*.04*step(.001,uWarp+.001);
  float m=1.-abs(1.-mod(x,2.));
  vec3 col=ramp(m);
  float rimK=(1.-smoothstep(0.,.2+uExt*.1,depth));
  col=mix(col,uRimC,rimK*uRim*.6);
  if(uMetal>.001){
    float mm=1.-abs(1.-mod(cc*uFlow*1.2+uShift,2.));
    vec3 mc=ramp(mm);
    mc=(mc-.5)*1.1+.5;
    float sheen=exp(-pow((cc-.4)/.28,2.));
    mc+=sheen*.2;
    mc*=1.-.14*smoothstep(.55,1.,cc);
    mc=mix(mc,uRimC+.1,clamp(rimK*uRim*.9,0.,1.));
    mc+=rimK*uRim*.1;
    col=mix(col,clamp(mc,0.,1.),uMetal);
  }
  col=mix(vec3(dot(col,vec3(.299,.587,.114))),col,1.+uVivid*.65);
  col=(col-.5)*(1.+uVivid*.14)+.5;
  vec2 b=uv-.5;b.x*=aspect;
  float bt=clamp(dot(b/max(aspect,1.),vec2(cos(uBgAngle),sin(uBgAngle)))+.5,0.,1.);
  vec3 bg=mix(uBgA,uBgB,smoothstep(0.,1.,bt));
  bg=mix(vec3(dot(bg,vec3(.299,.587,.114))),bg,1.+uVivid*.35);
  vec2 gc=floor(gl_FragCoord.xy/uGrainPx);
  float n1=hash(gc)+hash(gc+vec2(37.7,91.3))-1.;
  float n2=hash(floor(gc*.5)+vec2(113.1,7.9))+hash(floor(gc*.5)+vec2(61.3,201.7))-1.;
  float n=(n1*.8+n2*.4)*uGrain*.26;
  col+=n;bg+=n;
  if(uBgMode==2){gl_FragColor=vec4(clamp(col,0.,1.),mask);}
  else{if(uBgMode==1)bg=uBgA+n;gl_FragColor=vec4(clamp(mix(bg,col,mask),0.,1.),1.);}
}`

export function edt(grid: Float64Array, w: number, h: number): Float64Array {
  const INF = 1e20
  const maxDim = Math.max(w, h)
  const f = new Float64Array(maxDim)
  const d = new Float64Array(maxDim)
  const v = new Int32Array(maxDim)
  const z = new Float64Array(maxDim + 1)

  const run = (n: number) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < n; q++) {
      let sx = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (sx <= z[k]) {
        k--
        sx = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = sx
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]
    run(h)
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]
    run(w)
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]
  }
  return grid
}

export function buildSdfFromMask(on: Uint8Array, size = GT, range = GRANGE): Uint8Array {
  const n = size * size
  const INF = 1e20
  const inside = new Uint8Array(n)
  const gOut = new Float64Array(n)
  const gIn = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const o = on[i] === 1
    inside[i] = o ? 1 : 0
    gOut[i] = o ? 0 : INF
    gIn[i] = o ? INF : 0
  }
  edt(gOut, size, size)
  edt(gIn, size, size)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const sd = inside[i] ? -Math.sqrt(gIn[i]) : Math.sqrt(gOut[i])
    out[i] = Math.round(Math.max(0, Math.min(1, 0.5 + sd / (2 * range))) * 255)
  }
  return out
}

export function buildGlyphSdf(
  k: string,
  glyphsMap: Record<string, GlyphDefinition>,
  cache: Record<string, Uint8Array>
): Uint8Array {
  if (cache[k]) return cache[k]
  const g = glyphsMap[k]
  if (!g) {
    throw new Error(`존재하지 않는 글자 쉐입: ${k}`)
  }
  let on: Uint8Array
  if (g.mask) {
    on = g.mask
  } else {
    const [x0, y0, x1, y1] = g.box
    const c = document.createElement('canvas')
    c.width = GT
    c.height = GT
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('2D 캔버스 컨텍스트를 생성할 수 없습니다.')
    const sc = (0.8 * GT) / Math.max(x1 - x0, y1 - y0)
    ctx.translate(GT / 2 - ((x0 + x1) / 2) * sc, GT / 2 - ((y0 + y1) / 2) * sc)
    ctx.scale(sc, sc)
    ctx.fillStyle = '#000'
    ctx.fill(new Path2D(g.d ?? ''), 'evenodd')
    const px = ctx.getImageData(0, 0, GT, GT).data
    on = new Uint8Array(GT * GT)
    for (let i = 0; i < on.length; i++) {
      on[i] = px[i * 4 + 3] > 127 ? 1 : 0
    }
  }
  const out = buildSdfFromMask(on, GT, GRANGE)
  cache[k] = out
  return out
}

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

export type ComputedGeometry = {
  geo: Float32Array
  rad: Float32Array
  ext: number
  fit: number
  spanFull?: number
  glyph?: boolean
}

export function glyphDims(
  k: string,
  glyphsMap: Record<string, GlyphDefinition> = BUILTIN_GLYPHS
): { w: number; h: number } {
  const def = glyphsMap[k] ?? BUILTIN_GLYPHS.J
  const [x0, y0, x1, y1] = def.box
  return { w: x1 - x0, h: y1 - y0 }
}

export function computeGeometry(
  s: ShapeStudioState,
  glyphsMap: Record<string, GlyphDefinition> = BUILTIN_GLYPHS
): ComputedGeometry {
  if (s.glyph) {
    const { w, h } = glyphDims(s.glyph, glyphsMap)
    const D = s.width
    const hpx = (D * h) / Math.max(w, h)
    const U1 = 1 / (REF / 2)
    return {
      geo: new Float32Array(16),
      rad: new Float32Array(16),
      ext: (hpx / 2) * U1,
      fit: 1,
      spanFull: ((D / 0.8) * U1) / 1,
      glyph: true,
    }
  }
  const segs = s.segments
  let total = segs.reduce((a, x) => a + x.h, 0) - s.overlap * (segs.length - 1)
  total = Math.max(total, 40)
  const fit = Math.min(1, 560 / total)
  const U1 = 1 / (REF / 2)
  const geo = new Float32Array(16)
  const rad = new Float32Array(16)
  let top = (total * fit) / 2
  segs.forEach((x, i) => {
    const H = x.h * fit
    const W = s.width * (x.w / 100) * fit
    const hw = W / 2
    const rtx = Math.max(1, Math.min(x.rt * fit, hw, H / 2))
    const rbx = Math.max(1, Math.min(x.rb * fit, hw, H / 2))
    const rty = rtx
    const rby = rbx
    geo.set([(top - H / 2) * U1, (H / 2) * U1, hw * U1, 0], i * 4)
    rad.set([rtx * U1, rty * U1, rbx * U1, rby * U1], i * 4)
    top -= H - s.overlap * fit
  })
  return { geo, rad, ext: ((total * fit) / 2) * U1, fit }
}

export function isGlyphPreset(preset: AnyShapePreset): preset is GlyphPreset {
  return typeof preset.glyph === 'string'
}

export function drawPresetThumb(
  c: HTMLCanvasElement,
  preset: AnyShapePreset,
  glyphsMap: Record<string, GlyphDefinition> = BUILTIN_GLYPHS
): void {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const S = c.width
  ctx.clearRect(0, 0, S, S)

  if (isGlyphPreset(preset)) {
    const g = glyphsMap[preset.glyph]
    if (!g) return
    if (g.mask) {
      const m = g.mask
      const tc = document.createElement('canvas')
      tc.width = GT
      tc.height = GT
      const tx = tc.getContext('2d')
      if (!tx) return
      const id = tx.createImageData(GT, GT)
      for (let i = 0; i < m.length; i++) {
        id.data[i * 4] = 79
        id.data[i * 4 + 1] = 106
        id.data[i * 4 + 2] = 59
        id.data[i * 4 + 3] = m[i] ? 255 : 0
      }
      tx.putImageData(id, 0, 0)
      ctx.drawImage(tc, 0, 0, GT, GT, 0, 0, S, S)
      return
    }
    const [x0, y0, x1, y1] = g.box
    const sc = (0.78 * S) / Math.max(x1 - x0, y1 - y0)
    ctx.save()
    ctx.translate(S / 2 - ((x0 + x1) / 2) * sc, S / 2 - ((y0 + y1) / 2) * sc)
    ctx.scale(sc, sc)
    ctx.fillStyle = '#4f6a3b'
    ctx.fill(new Path2D(g.d ?? ''), 'evenodd')
    ctx.restore()
    return
  }

  const segs = preset.segments
  const total = segs.reduce((a, x) => a + x.h, 0) - preset.overlap * (segs.length - 1)
  const k = Math.min((S * 0.78) / total, (S * 0.78) / preset.width)
  let y = (S - total * k) / 2
  ctx.fillStyle = '#4f6a3b'
  segs.forEach((x) => {
    const H = x.h * k
    const W = preset.width * (x.w / 100) * k
    const cx = S / 2
    const x0 = cx - W / 2
    const rtx = Math.min(x.rt * k, W / 2, H / 2)
    const rbx = Math.min(x.rb * k, W / 2, H / 2)
    const rty = rtx
    const rby = rbx
    ctx.beginPath()
    ctx.moveTo(x0 + rtx, y)
    ctx.lineTo(x0 + W - rtx, y)
    ctx.ellipse(x0 + W - rtx, y + rty, rtx, rty, 0, -Math.PI / 2, 0)
    ctx.lineTo(x0 + W, y + H - rby)
    ctx.ellipse(x0 + W - rbx, y + H - rby, rbx, rby, 0, 0, Math.PI / 2)
    ctx.lineTo(x0 + rbx, y + H)
    ctx.ellipse(x0 + rbx, y + H - rby, rbx, rby, 0, Math.PI / 2, Math.PI)
    ctx.lineTo(x0, y + rty)
    ctx.ellipse(x0 + rtx, y + rty, rtx, rty, 0, Math.PI, Math.PI * 1.5)
    ctx.closePath()
    ctx.fill()
    y += H - preset.overlap * k
  })
}

const rnd = (a: number, b: number, rng: () => number = Math.random) =>
  Math.round(a + rng() * (b - a))

function pickOther<T>(list: readonly T[], cur: T, rng: () => number = Math.random): T {
  const o = list.filter((x) => x !== cur)
  return o[rnd(0, o.length - 1, rng)]
}

export function hasActiveRandomOption(state: ShapeStudioState, randOn: RandomToggleState): boolean {
  const opts = state.glyph ? RAND_GLYPH_OPTS : RAND_SEG_OPTS
  return opts.some(([k]) => randOn[k])
}

export function randomizeState(
  prevState: ShapeStudioState,
  randOn: RandomToggleState,
  rng: () => number = Math.random
): ShapeStudioState {
  const next = cloneState(prevState)
  if (!next.glyph) {
    if (randOn.count) {
      const n = pickOther([2, 3, 4], next.segments.length, rng)
      const cur = next.segments
      while (cur.length < n) {
        cur.push(seg(rnd(90, 200, rng), rnd(10, 300, rng), rnd(10, 300, rng)))
      }
      cur.length = n
    }
    next.segments.forEach((s) => {
      if (randOn.heights) s.h = rnd(70, 230, rng)
      if (randOn.radii) {
        s.rt = rng() < 0.35 ? rnd(300, 400, rng) : rnd(8, 200, rng)
        s.rb = rng() < 0.35 ? rnd(300, 400, rng) : rnd(8, 200, rng)
      }
    })
    if (randOn.overlap) next.overlap = rnd(-10, 60, rng)
    if (randOn.metaball) {
      next.metaball = !next.metaball
      if (next.metaball && next.merge < 20) next.merge = rnd(24, 60, rng)
    }
    if (randOn.count || randOn.heights || randOn.radii || randOn.overlap || randOn.metaball) {
      next.shape = 'custom'
    }
  } else {
    if (randOn.size) next.width = next.glyph === 'JAM' ? rnd(360, 540, rng) : rnd(280, 460, rng)
    if (randOn.rotation) next.rotation = rnd(-25, 25, rng)
    if (randOn.warp) next.warp = rnd(10, 50, rng)
    if (randOn.soft) next.soft = rnd(10, 55, rng)
  }
  if (randOn.colors) {
    const pool = GRADIENT_PRESETS.filter((x) => x.id !== next.grad)
    const g = pool[rnd(0, pool.length - 1, rng)]
    next.grad = g.id
    next.colors = [...g.c, g.rim]
    next.bgA = g.bgA
    next.bgB = g.bgB
    next.bgAngle = g.bgAngle ?? 0
    const baseDirs = [0, 0, 0, 180, 90, -90]
    next.direction = (g.dir ?? baseDirs[rnd(0, 5, rng)]) + rnd(-12, 12, rng)
    next.shift = rnd(-30, 30, rng)
  }
  next.seed = rnd(1, 9999, rng)
  return next
}

export function validatePresetState(inp: unknown): ShapeStudioState {
  if (!inp || typeof inp !== 'object' || (inp as { version?: unknown }).version !== 2) {
    throw new Error('Shape Studio v2 설정 파일을 선택해주세요.')
  }
  const obj = inp as Record<string, unknown>
  const r = cloneState(INITIAL_STATE)
  const hex = /^#[a-f0-9]{6}$/i
  const num = (v: unknown, lo: number, hi: number, n: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`잘못된 값: ${n}`)
    }
    return Math.max(lo, Math.min(hi, v))
  }

  const lim = {
    width: [160, 1920],
    merge: [0, 140],
    overlap: [-40, 100],
    soft: [0, 100],
    scale: [50, 300],
    rotation: [-180, 180],
    warp: [0, 100],
    direction: [-180, 180],
    flow: [50, 300],
    shift: [-100, 100],
    contour: [0, 100],
    rim: [0, 100],
    bgAngle: [-180, 180],
    grain: [0, 20],
    speed: [10, 300],
    metal: [0, 100],
    vivid: [0, 100],
    seed: [1, 99999],
  } as const

  for (const [k, [lo, hi]] of Object.entries(lim) as Array<[keyof typeof lim, readonly [number, number]]>) {
    r[k] =
      k === 'speed' && obj[k] === undefined
        ? 100
        : k === 'metal' && obj[k] === undefined
          ? 60
          : k === 'vivid' && obj[k] === undefined
            ? 38
            : num(obj[k], lo, hi, k)
  }

  if (
    !Array.isArray(obj.colors) ||
    obj.colors.length !== 6 ||
    !obj.colors.every((c): c is string => typeof c === 'string' && hex.test(c))
  ) {
    throw new Error('색상 설정이 올바르지 않습니다.')
  }
  r.colors = [
    obj.colors[0],
    obj.colors[1],
    obj.colors[2],
    obj.colors[3],
    obj.colors[4],
    obj.colors[5],
  ]

  if (typeof obj.bgA !== 'string' || !hex.test(obj.bgA) || typeof obj.bgB !== 'string' || !hex.test(obj.bgB)) {
    throw new Error('배경색이 올바르지 않습니다.')
  }
  r.bgA = obj.bgA
  r.bgB = obj.bgB

  if (obj.bgMode !== 'gradient' && obj.bgMode !== 'solid' && obj.bgMode !== 'transparent') {
    throw new Error('배경 설정이 올바르지 않습니다.')
  }
  r.bgMode = obj.bgMode

  if (obj.ratio !== '1:1' && obj.ratio !== '4:5' && obj.ratio !== '9:16' && obj.ratio !== '16:9') {
    throw new Error('비율이 올바르지 않습니다.')
  }
  r.ratio = obj.ratio

  if (!Array.isArray(obj.segments) || obj.segments.length < 1 || obj.segments.length > 4) {
    throw new Error('세그먼트는 1~4개여야 합니다.')
  }
  r.segments = obj.segments.map((s) => {
    const item = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    return {
      h: num(item.h, 24, 340, 'h'),
      rt: num(item.rt, 0, 400, 'rt'),
      rb: num(item.rb, 0, 400, 'rb'),
      w: num(item.w, 40, 140, 'w'),
    }
  })

  r.metaball = Boolean(obj.metaball)
  r.animate = Boolean(obj.animate)
  r.glyph = typeof obj.glyph === 'string' && ['J', 'A', 'M', 'JAM'].includes(obj.glyph) ? obj.glyph : null
  r.shape = r.glyph ? `glyph-${r.glyph}` : 'custom'
  r.grad = 'custom'
  return r
}
