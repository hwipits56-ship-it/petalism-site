// ═══════════════════════════════════════════════════════════════════════════
// 누비 v40 weave 시스템 통합 (B5, 2026-05-14)
// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE.md 5.6.1 의 시스템 2 (`_applyWeaveEnhance`) + 시스템 4 (`makeUiTile` 7 layer) 통합.
// 본 앱 (작품 캔버스, UI 배경) + 에디터 (palette_editor splash PNG) 모두 사용.
//
// 이전 (B5 전): 함수 분산
//   - js/render/render.js: _vHash, _vNoise, _bayer4, _applyWeaveEnhance, buildBgWeaveTile
//   - js/ui/ui-theme.js: hexToRgb, luminance, _brightenHex, _boostSaturation,
//                        _uiVHash, _uiVNoise, applyUiBgPat, applyUiWeavePat,
//                        applyUiWeave, applyUiGrain, makeUiTile
//   - palette_editor.html: 위 함수들 본체 copy (_splash* prefix, ~250 줄)
//
// 현재 (B5): js/lib/weave.js 단일 모듈
//   - 본 앱 + palette_editor 모두 이 file import 가능
//   - 함수 copy 제거 (단일 진실 source)
//   - 글로벌 namespace (window 전역) — 다른 file 의 호출자 변경 X
//
// 로드 순서: js/lib/utils.js 다음, js/render/render.js 보다 먼저
// 의존:
//   - UI_THEME 객체 (makeUiTile 안 — 글로벌 변수, ui-theme.js 또는 palette_editor 자체 정의)
//   - PALETTES, P, ACTIVE_PALETTE (applyBgWeaveTile 안 — render.js 의 도구 함수)
// ═══════════════════════════════════════════════════════════════════════════

// ─── 색 유틸 (ui-theme.js 에서 이동) ───

function hexToRgb(hex){
  const n=parseInt(hex.slice(1),16);
  return[(n>>16)&255,(n>>8)&255,n&255];
}
function rgbToHex(r,g,b){return'#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}
function luminance(hex){const[r,g,b]=hexToRgb(hex);return(r*299+g*587+b*114)/1000}
function adjustBrightness(hex,amt){
  const[r,g,b]=hexToRgb(hex);
  return rgbToHex(Math.max(0,Math.min(255,r+amt)),Math.max(0,Math.min(255,g+amt)),Math.max(0,Math.min(255,b+amt)));
}
function hexToRgba(hex,a){const[r,g,b]=hexToRgb(hex);return`rgba(${r},${g},${b},${a})`}

// 명도 보정: hex 색을 n만큼 밝게
function _brightenHex(hex,n){
  const h=hex.replace('#','');
  const r=Math.min(255,parseInt(h.slice(0,2),16)+n);
  const g=Math.min(255,parseInt(h.slice(2,4),16)+n);
  const b=Math.min(255,parseInt(h.slice(4,6),16)+n);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

// 채도 보정: 이미지 전체 채도를 n% 올림
function _boostSaturation(ctx,w,h,n){
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const factor=1+n/100;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    const gray=0.299*r+0.587*g+0.114*b;
    d[i]=Math.max(0,Math.min(255,gray+factor*(r-gray)));
    d[i+1]=Math.max(0,Math.min(255,gray+factor*(g-gray)));
    d[i+2]=Math.max(0,Math.min(255,gray+factor*(b-gray)));
  }
  ctx.putImageData(img,0,0);
}

// ─── 노이즈 유틸 (render.js + ui-theme.js 중복 통합) ───

// value noise 해시 (Knuth multiplicative)
function _vHash(x, y){
  let n = (x|0) * 374761393 + (y|0) * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}
// 2D value noise (smoothstep 보간)
function _vNoise(x, y){
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = _vHash(ix, iy);
  const b = _vHash(ix + 1, iy);
  const c = _vHash(ix, iy + 1);
  const d = _vHash(ix + 1, iy + 1);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
// 4x4 bayer matrix (ordered dithering)
const _bayer4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];

// ─── 시스템 2: _applyWeaveEnhance (pixel weave noise) ───
// canvas_lab Phase 3-1 흡수 — 직조 강화 noise (cell stagger + bayer + hash + wave + 천 주름)
// 픽셀 통합 패스 1번. cell stagger는 RGB scale (채도 보존), 나머지는 RGB delta (명도 변동).
function _applyWeaveEnhance(d, w, h, zcell, opts){
  opts = opts || {};
  const bayerStrength = opts.bayer ?? 5;
  const pxHashStrength = opts.hash ?? 10;
  const rowWaveStrength = opts.wave ?? 1;
  const wrinkleStrength = opts.wrinkle ?? 1;
  const cellStagAmt = opts.stagger ?? 20;
  const satBoost = opts.sat ?? 1.50;
  const lumBoost = opts.lum ?? 1.30;
  // 2026-05-14 B5 step 2: grainSize 옵션 (palette_editor splash PNG 통합용 — DPR 비례 알갱이 크기)
  const grainSize = Math.max(1, opts.grainSize ?? 1);
  const doSat = satBoost !== 1.0;
  const doLum = lumBoost !== 1.0;
  for(let oy=0; oy<h; oy++){
    const rowWaveBase = Math.sin(oy * 0.18) * rowWaveStrength;
    const wrinkleY = Math.sin(oy * 0.005) * wrinkleStrength;
    const cellPy = Math.floor(oy / zcell);
    const gy = Math.floor(oy / grainSize);  // bayer + vHash 알갱이 좌표 y
    for(let ox=0; ox<w; ox++){
      const i = (oy*w + ox) << 2;
      const cellPx = Math.floor(ox / zcell);
      const cellHash = ((cellPy*7 + cellPx*13 + 31337) >>> 0) & 7;
      const cellStagMul = 1 + ((cellHash / 7) * 2 - 1) * cellStagAmt / 100;
      const gx = Math.floor(ox / grainSize);  // 알갱이 좌표 x
      let delta = 0;
      delta += (_bayer4[(gy & 3) * 4 + (gx & 3)] / 15 - 0.5) * bayerStrength * 2;
      delta += (_vHash(gx, gy) - 0.5) * pxHashStrength * 2;
      delta += rowWaveBase * Math.cos(ox * 0.12);
      delta += wrinkleY * Math.cos(ox * 0.003);
      let r = d[i]   * cellStagMul + delta;
      let g = d[i+1] * cellStagMul + delta;
      let b = d[i+2] * cellStagMul + delta;
      if(doSat){
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * satBoost;
        g = avg + (g - avg) * satBoost;
        b = avg + (b - avg) * satBoost;
      }
      if(doLum){
        r *= lumBoost;
        g *= lumBoost;
        b *= lumBoost;
      }
      d[i]   = Math.max(0, Math.min(255, r));
      d[i+1] = Math.max(0, Math.min(255, g));
      d[i+2] = Math.max(0, Math.min(255, b));
    }
  }
}

// 배경 UI 직조 tile 빌더 — 작은 캔버스에 plain weave + cell stagger + bayer + hash 적용
// wave/wrinkle 제외 (tile 반복 시 이음새 끊김 방지)
function buildBgWeaveTile(bgRgb, size, zcell){
  size = size || 128;
  zcell = zcell || 1;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const d = imgData.data;
  const r = bgRgb.r, g = bgRgb.g, b = bgRgb.b;
  const weftDark = 0.85;
  for(let y = 0; y < size; y++){
    for(let x = 0; x < size; x++){
      const i = (y * size + x) << 2;
      const cy = Math.floor(y / zcell);
      const cx = Math.floor(x / zcell);
      const isWarp = (cy + cx) % 2 === 0;
      const mul = isWarp ? 1.0 : weftDark;
      d[i]   = r * mul;
      d[i+1] = g * mul;
      d[i+2] = b * mul;
      d[i+3] = 255;
    }
  }
  _applyWeaveEnhance(d, size, size, zcell, {wave: 0, wrinkle: 0});
  ctx.putImageData(imgData, 0, 0);
  return cv.toDataURL('image/png');
}

// ─── 시스템 4: makeUiTile (UI 배경 7 layer) ───
// UI 배경패턴 (check/stripe/dot 등)
// 2026-05-14 B5 step 2: scale 인자 (DPR 비례) — palette_editor splash PNG 통합용
function applyUiBgPat(ctx,w,h,baseColor,scale){
  const pat=UI_THEME.bgPat;
  if(pat==='none') return;
  scale = scale || 1;
  const [br,bg,bb]=hexToRgb(baseColor);
  const lum=(br*299+bg*587+bb*114)/1000;
  const shift=lum>128?-10:10;
  const pr=Math.max(0,Math.min(255,br+shift));
  const pg=Math.max(0,Math.min(255,bg+shift));
  const pb=Math.max(0,Math.min(255,bb+shift));
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const sp=Math.round(6*scale);
  for(let r=0;r<h;r++){
    for(let c=0;c<w;c++){
      let hit=false;
      switch(pat){
        case 'check':   hit=(Math.floor(r/sp)+Math.floor(c/sp))%2===0; break;
        case 'stripe':  hit=c%sp<2; break;
        case 'hstripe': hit=r%sp<2; break;
        case 'diagonal':hit=(r+c)%(sp+1)<2; break;
        case 'zigzag':  hit=(r+((c%(sp*2)<sp)?c%sp:sp-1-c%sp))%sp<2; break;
        case 'wave':    hit=Math.abs(r-Math.round(Math.sin(c*0.25)*3))%sp<2; break;
        case 'dot':     hit=r%sp<1&&c%sp<1; break;
        case 'grid':    hit=r%sp<1||c%sp<1; break;
      }
      if(hit){
        const i=(r*w+c)*4;
        d[i]=Math.round(d[i]*0.3+pr*0.7);
        d[i+1]=Math.round(d[i+1]*0.3+pg*0.7);
        d[i+2]=Math.round(d[i+2]*0.3+pb*0.7);
      }
    }
  }
  ctx.putImageData(img,0,0);
}

// UI 직조패턴 (plain/twill/satin/basket — 실 교차 구조)
// 2026-05-14 B5 step 2: scale 인자 (DPR 비례)
function applyUiWeavePat(ctx,w,h,scale){
  const pat=UI_THEME.weavePat;
  if(pat==='none') return;
  scale = scale || 1;
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const cell=Math.round(4*scale);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const gy=Math.floor(y/cell),gx=Math.floor(x/cell);
      let warp=false;
      switch(pat){
        case 'plain':  warp=(gy+gx)%2===0; break;
        case 'twill':  warp=((gx-gy+900)%3)!==0; break;
        case 'herringbone': {
          const band=Math.floor(gy/4);
          const shift=(band%2===0)?(gx-gy):(gx+gy);
          warp=((shift+900)%3)!==0;
          break;
        }
        case 'satin':  warp=(gy*3+gx)%5===0; break;
        case 'basket': warp=(Math.floor(gy/2)+Math.floor(gx/2))%2===0; break;
      }
      const fy=y%cell, fx=x%cell;
      let shift=warp?(fy<cell/2?4:-4):(fx<cell/2?3:-3);
      if(fy===0||fx===0) shift-=3;
      const i=(y*w+x)*4;
      d[i]=Math.max(0,Math.min(255,d[i]+shift));
      d[i+1]=Math.max(0,Math.min(255,d[i+1]+shift));
      d[i+2]=Math.max(0,Math.min(255,d[i+2]+shift));
    }
  }
  ctx.putImageData(img,0,0);
}

// UI 위빙 강도 (UI_THEME.weave 가 true 일 때만)
// 2026-05-14 B5 step 2: cellScale 인자 (DPR 비례)
function applyUiWeave(ctx,w,h,level,cellScale){
  cellScale = cellScale || 1;
  const cell=Math.round(6*cellScale);
  const scale={low:0.4,med:1,high:1.6}[level||'med']||1;
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const gy=Math.floor(y/cell),gx=Math.floor(x/cell);
      const fy=y%cell,fx=x%cell;
      const warp=(gy+gx)%2===0;
      let shift=warp?(fy<cell/2?3:-3):(fx<cell/2?2:-2);
      if(fy===0||fx===0) shift-=4;
      shift=Math.round(shift*scale);
      const idx=(y*w+x)*4;
      d[idx]=Math.max(0,Math.min(255,d[idx]+shift));
      d[idx+1]=Math.max(0,Math.min(255,d[idx+1]+shift));
      d[idx+2]=Math.max(0,Math.min(255,d[idx+2]+shift));
    }
  }
  ctx.putImageData(img,0,0);
}

// UI grain — 2-octave value noise (섬유 clump 질감)
// 2026-05-14 B5 step 2: scale 인자 (DPR 비례 — noise 좌표 ÷scale 로 알갱이 N 배)
function applyUiGrain(ctx,w,h,lo,hi,warm,scale){
  scale = scale || 1;
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const range=(hi-lo);
  const mid=(hi+lo)*0.5;
  const sFine = 0.35 / scale;
  const sCoarse = 0.1 / scale;
  const sWr = 0.06 / scale;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const nFine=_vNoise(x*sFine, y*sFine);
      const nCoarse=_vNoise(x*sCoarse+100, y*sCoarse+100);
      const combined=(nFine+nCoarse)*0.5;
      const grain=(mid+(combined-0.5)*range)|0;
      const wr=warm&&_vNoise(x*sWr+300, y*sWr+300)>0.92?1:0;
      const r=d[i],g=d[i+1],b=d[i+2];
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(mx===mn){
        d[i]=Math.max(0,Math.min(255,r+grain+(wr?6:0)));
        d[i+1]=Math.max(0,Math.min(255,g+grain+(wr?5:0)));
        d[i+2]=Math.max(0,Math.min(255,b+grain+(wr?3:0)));
      }else{
        const l=(mx+mn)/2;
        const nl=Math.max(0,Math.min(255,l+grain));
        const diff=nl-l;
        d[i]  =Math.max(0,Math.min(255,r+diff+(wr?6:0)));
        d[i+1]=Math.max(0,Math.min(255,g+diff+(wr?5:0)));
        d[i+2]=Math.max(0,Math.min(255,b+diff+(wr?3:0)));
      }
    }
  }
  ctx.putImageData(img,0,0);
}

// UI tile 빌더 — 7 layer 누적 (cache key 포함)
// 2026-05-14 B5 step 2: scale 인자 (DPR 비례 — palette_editor splash PNG 의 cell/noise 크기 통합)
//   본 앱 (256×256 tile): scale 안 전달 (default 1) → 기존 동작.
//   palette_editor splash (1206×2622, DPR 3x): scale=3 전달 → cell/noise 3배.
const _uiTileCache={};
function makeUiTile(color,tw,th,scale){
  scale = scale || 1;
  // 캐시 키: color + 크기 + UI_THEME 파생 파라미터 + scale
  const uiSig=[
    UI_THEME.brightnessComp||0,
    UI_THEME.weavePat||'none',
    UI_THEME.bgPat||'none',
    UI_THEME.weave?1:0,
    UI_THEME.weaveLevel||'med',
    UI_THEME.grainLevel||'med',
    UI_THEME.grainType||'both',
    UI_THEME.saturationComp||0,
    'wEnh-ui-weak',
    'scale'+scale,
  ].join('|');
  const key=color+'|'+tw+'x'+th+'|'+uiSig;
  if(_uiTileCache[key]) return _uiTileCache[key];

  const c=document.createElement('canvas');
  c.width=tw;c.height=th;
  const ctx=c.getContext('2d');
  // 1. 색 fill + brightnessComp
  const bComp=UI_THEME.brightnessComp||0;
  ctx.fillStyle=bComp>0?_brightenHex(color,bComp):color;
  ctx.fillRect(0,0,tw,th);
  // 2. 위빙 패턴 (twill 등)
  if(UI_THEME.weavePat!=='none') applyUiWeavePat(ctx,tw,th,scale);
  // 3. 배경 패턴 (check 등)
  if(UI_THEME.bgPat!=='none') applyUiBgPat(ctx,tw,th,color,scale);
  // 4. 위빙 강도
  const wLvl=UI_THEME.weaveLevel||'med';
  if(UI_THEME.weave&&wLvl!=='off') applyUiWeave(ctx,tw,th,wLvl,scale);
  // 5. grain (paper + soft)
  const gLvl=UI_THEME.grainLevel||'med';
  const gScale={off:0,low:0.4,med:1,high:1.6}[gLvl]||1;
  const gt=UI_THEME.grainType||'both';
  if(gScale>0&&gt!=='none'){
    if(gt==='paper'||gt==='both') applyUiGrain(ctx,tw,th,Math.round(-12*gScale),Math.round(12*gScale),false,scale);
    if(gt==='soft'||gt==='both')  applyUiGrain(ctx,tw,th,Math.round(-6*gScale),Math.round(6*gScale),true,scale);
  }
  // 6. _applyWeaveEnhance UI 약함 + grainSize 비례
  const img = ctx.getImageData(0, 0, tw, th);
  _applyWeaveEnhance(img.data, tw, th, Math.round(scale), {bayer:3, hash:6, wave:0, wrinkle:0, stagger:12, sat:1.0, lum:1.0, grainSize: Math.round(scale)});
  ctx.putImageData(img, 0, 0);
  // 7. 채도 보정
  const sComp=UI_THEME.saturationComp||0;
  if(sComp>0) _boostSaturation(ctx,tw,th,sComp);
  const url=c.toDataURL('image/jpeg',0.85);
  _uiTileCache[key]=url;
  return url;
}
