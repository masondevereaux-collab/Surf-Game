import * as THREE from 'three';

// ── World constants ────────────────────────────────────────────────────────────
export const BREAK_ZONE_Z   = 8;
export const FACE_TOP_Z     = 4;
export const FACE_BOTTOM_Z  = 16;
export const LINEUP_Z       = -14;
export const SHORE_Z        = 32;
export const A_PEEL_SPEED   = 6.5;

// ──────────────────────────────────────────────────────────────────────────────
// WAVE DESIGN — A-frame peak, fully closing barrel (tube)
//
// The crest lip has TWO displacements:
//   dZ = pow(hNorm,4) × 12   → forward throw (shoreward, horizontal)
//   dY = −smoothstep(0.7,1)² × 6  → downward fold  (lip curls TOWARD trough)
//
// Net result at hNorm=1.0 (lip tip, raw h=6.5m):
//   dZ = +12.0 m  →  worldZ = 3 + 12 = 15 m  (reaches wave base)
//   dY = −6.0 m   →  finalY = 6.5 − 6.0 = 0.5 m  (tip touches water surface)
//   → barrel is CLOSED — a genuine tube you ride through
//
// At hNorm=0.90: dZ=7.2, dY=−3.3 → ceiling at (worldZ≈10.5, y≈2.6)
// At hNorm=0.80: dZ=3.7, dY=−0.9 → ceiling at (worldZ≈7.1, y≈4.3)
// (Concave bowl kept by −sin(π×hNorm)×2.2 term)
//
// A-frame: gaussian xPeak centred at X=0 tapers height left and right.
// The tube only forms near the peak; shoulders have steep open faces.
// ──────────────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
precision highp float;
#define PI  3.14159265359
#define G   9.81

uniform float uTime;

varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vFoam;
varying float vBarrel;
varying float vDepth;
varying float vFaceH;

// ── Wave crest profile ────────────────────────────────────────────────────────
float crestH(float lz) {
  float dz = lz + 5.0;
  float w  = dz < 0.0 ? 22.0 : 4.8;
  return 6.5 * exp(-0.5 * pow(dz / w, 2.0));
}
float troughH(float lz) {
  return -1.4 * exp(-0.5 * pow((lz - 20.0) / 6.0, 2.0));
}
float zEnv(float lz) {
  return smoothstep(-45.0, -10.0, lz) * (1.0 - smoothstep(18.0, 38.0, lz));
}

// ── A-frame X-envelope ────────────────────────────────────────────────────────
float xPeak(float x) {
  return 0.28 + 0.72 * exp(-pow(x / 52.0, 2.0));
}

// ── Raw wave height at (lz, xp) ───────────────────────────────────────────────
float waveH(float lz, float xp) {
  float lb  = 1.0 + 0.10 * smoothstep(14.0, 0.0, abs(lz + 5.0));
  float env = zEnv(lz);
  return max((crestH(lz)*env + troughH(lz)*env) * xp * lb, 0.0);
}

// ── Full displacement: returns (finalY, dZ) ───────────────────────────────────
// dZ  : lip thrown shoreward  (power-4 forward throw + concave bowl)
// dY  : lip curled downward   (smoothstep fold, only top 30 % of wave)
// Together they form a closing tube at the A-frame peak.
vec2 displace(float lz_s, float xp_s) {
  float h   = waveH(lz_s, xp_s);
  float hN  = clamp(h / 6.5, 0.0, 1.0);

  // Forward throw: power-4 explodes near the tip; sine keeps mid-face concave
  float dz  = pow(hN, 4.0) * 20.0 - sin(PI * hN) * 2.2;

  // Downward fold: starts at hN=0.82 (later = higher ceiling for surfer)
  float tf  = smoothstep(0.82, 1.0, hN);
  float dy  = -tf * tf * 6.0;

  return vec2(h + dy, dz);  // .x = finalY,  .y = dZ offset
}

void main() {
  vec3  pos   = position;
  float origX = pos.x;
  float lz    = pos.z;
  float xp    = xPeak(origX);

  // ── Main displacement ─────────────────────────────────────────────────────
  vec2 d  = displace(lz, xp);
  pos.y   = d.x;
  pos.z   = lz + d.y;

  // ── Background swell (offshore only, no lateral drift) ────────────────────
  float bgMask  = smoothstep(-18.0, -32.0, lz);
  float kBg     = 2.0*PI / 14.0;
  pos.y += 0.50 * sin(kBg * lz - sqrt(G*kBg)*0.85 * uTime + 0.8) * bgMask;

  // ── Surface chop (three crossing directions → no net current) ────────────
  float kC = 2.0*PI / 5.0;
  float wC = sqrt(G * kC) * 1.05;
  pos.y += 0.07 * sin(kC * lz                     - wC      * uTime + 1.1)
         + 0.06 * sin(kC * (0.7*lz + 0.7*origX)   - wC*0.90 * uTime + 2.3)
         + 0.05 * sin(kC * (0.7*lz - 0.7*origX)   - wC*0.85 * uTime + 4.1);

  // ── 2-D finite-difference normals ─────────────────────────────────────────
  // Both the forward-throw (dZ) AND the downward-fold (dY) affect the normals.
  float eps = 0.55;

  // Z-direction tangent
  vec2 dZP  = displace(lz+eps, xp);
  vec2 dZM  = displace(lz-eps, xp);
  float TZ_Y = dZP.x - dZM.x;                      // dY/dlz  (×2eps)
  float TZ_Z = (2.0*eps) + (dZP.y - dZM.y);        // dZ/dlz  (×2eps)

  // X-direction tangent
  vec2 dXP  = displace(lz, xPeak(origX+eps));
  vec2 dXM  = displace(lz, xPeak(origX-eps));
  float TX_Y = dXP.x - dXM.x;
  float TX_Z = dXP.y - dXM.y;

  // N = TX × TZ, negated for outward direction
  float nx = -(TX_Y * TZ_Z - TX_Z * TZ_Y);
  float ny =  (2.0*eps) * TZ_Z;
  float nz = -(2.0*eps) * TZ_Y;
  vec3 N = normalize(vec3(nx, ny, nz));

  // ── Varyings ──────────────────────────────────────────────────────────────
  // Raw h (before fold) — used for colour/foam decisions
  float h_raw = waveH(lz, xp);

  // Foam: lip spray peels outward from A-frame center, plus base whitewash
  float foamTravel = abs(origX) * 0.09 - uTime * 1.8;
  float foamPatch  = smoothstep(0.2, 0.8, 0.5 + 0.5*sin(foamTravel))
                   * smoothstep(0.2, 0.8, 0.5 + 0.5*sin(foamTravel*1.7 + 2.1));
  float lipFoam    = smoothstep(5.0, 6.5, h_raw) * (0.55 + 0.45*foamPatch);
  float lipSpray   = smoothstep(6.0, 6.5, h_raw) * 0.9;
  float peakFoam   = smoothstep(6.2, 6.5, h_raw) * smoothstep(18.0, 0.0, abs(origX)) * 0.8;
  float baseWash   = smoothstep(2.8, 0.4, h_raw) * smoothstep(-1.5, 3.5, lz) * 0.48;
  vFoam = clamp(lipFoam + lipSpray + peakFoam + baseWash, 0.0, 1.0);

  // Barrel glow — strongest inside the tube (high raw h, near center peak)
  vBarrel = smoothstep(4.5, 6.2, h_raw);

  vDepth  = clamp(h_raw / 6.5, 0.0, 1.0);
  vFaceH  = crestH(lz) * zEnv(lz) * xp;

  vNormal   = normalize(normalMatrix * N);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

// ── Fragment shader ────────────────────────────────────────────────────────────
const FRAG = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uCamPos;

varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vFoam;
varying float vBarrel;
varying float vDepth;
varying float vFaceH;

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){ return noise(p)*0.5+noise(p*2.1+3.7)*0.25+noise(p*4.3+7.1)*0.125; }

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float NdotV = max(0.0, dot(N, V));
  float NdotL = max(0.0, dot(N, L));
  float NdotH = max(0.0, dot(N, H));

  float fresnel = mix(0.02, 1.0, pow(1.0 - NdotV, 4.0));

  // ── Water colour ──────────────────────────────────────────────────────────
  vec3 colDeep  = vec3(0.005, 0.020, 0.170);
  vec3 colMid   = vec3(0.010, 0.230, 0.420);
  vec3 colCrest = vec3(0.040, 0.720, 0.530);
  vec3 waterCol = mix(colDeep, colMid,    smoothstep(0.0,  0.45, vDepth));
  waterCol      = mix(waterCol, colCrest, smoothstep(0.45, 1.0,  vDepth));

  // ── Backlit green room — strongest inside the closed tube ─────────────────
  float backlit   = max(0.0, dot(V, -L));
  float waveThick = smoothstep(0.0, 1.0, vFaceH / 6.5);
  float scatter   = pow(backlit, 1.8) * waveThick * 1.6;
  waterCol += vec3(0.0, 0.92, 0.58) * scatter;

  // ── Barrel interior: vivid emerald ceiling glow ───────────────────────────
  // The underside of the folded lip is the barrel ceiling.
  // Render it with a strong emerald colour so the tube glows from within.
  vec3 barrelGlow = vec3(0.0, 0.82, 0.52) * vBarrel * 1.0;

  // ── Sky reflection ────────────────────────────────────────────────────────
  vec3 rD     = reflect(-V, N);
  vec3 refCol = mix(uSkyColor * 0.5, uSkyColor * 1.3, smoothstep(-0.2, 0.6, rD.y));

  float spec = pow(NdotH, 700.0) * 6.0 + pow(NdotH, 90.0) * 0.45;

  vec3 col = waterCol * (0.16 + 0.84 * NdotL);
  col = mix(col, refCol, fresnel * 0.40);
  col += uSunColor * spec;
  col += barrelGlow;

  // ── Foam ─────────────────────────────────────────────────────────────────
  vec2 fu1    = vWorldPos.xz * 0.12 + vec2(uTime*0.055, uTime*0.02);
  vec2 fu2    = vWorldPos.xz * 0.08 + vec2(-uTime*0.03, uTime*0.05);
  float foamT = smoothstep(0.28, 0.68, fbm(fu1)*0.6 + fbm(fu2)*0.4);
  col = mix(col, vec3(0.97, 0.99, 1.0), foamT * vFoam);

  // ── Fog ───────────────────────────────────────────────────────────────────
  float fog = 1.0 - exp(-length(vWorldPos - uCamPos) * 0.005);
  col = mix(col, uSkyColor * 0.78, fog * 0.38);

  // ── Barrel transparency — inside face lets light through ─────────────────
  // gl_FrontFacing = false on the inside of the folded lip (barrel ceiling).
  // Make those fragments semi-transparent so sky/ocean is visible through the tube.
  float alpha = 1.0;
  if (!gl_FrontFacing) {
    // Inside face: transparent proportional to barrel strength
    // vBarrel=0 (shoulders) stays opaque; vBarrel=1 (tube ceiling) → ~35% opaque
    alpha = mix(1.0, 0.30, vBarrel);
  }

  gl_FragColor = vec4(col, alpha);
}`;

// ── WaveMesh class ─────────────────────────────────────────────────────────────
export class WaveMesh {
  constructor(scene) {
    this.time      = 0;
    this.breakDist = 9999;

    this.uniforms = {
      uTime:     { value: 0 },
      uSunDir:   { value: new THREE.Vector3(0.3, 0.8, -0.35).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.68) },
      uSkyColor: { value: new THREE.Color(0.30, 0.54, 0.85) },
      uCamPos:   { value: new THREE.Vector3() },
    };

    // Extra Z segments (200) for smooth lip fold near the crest
    const geo = new THREE.PlaneGeometry(260, 120, 360, 200);
    geo.rotateX(-Math.PI / 2);

    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms:       this.uniforms,
      vertexShader:   VERT,
      fragmentShader: FRAG,
      side:           THREE.DoubleSide,
      transparent:    true,
      depthWrite:     true,
    }));
    this.mesh.position.set(0, 0, BREAK_ZONE_Z);
    scene.add(this.mesh);
  }

  // ── CPU mirror ────────────────────────────────────────────────────────────
  _crestH(lz) {
    const dz = lz + 5.0;
    const w  = dz < 0 ? 22.0 : 4.8;
    return 6.5 * Math.exp(-0.5 * (dz / w) ** 2);
  }
  _zEnv(lz) {
    function sm(e0, e1, x) {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }
    return sm(-45, -10, lz) * (1 - sm(18, 38, lz));
  }
  _xPeak(worldX) {
    return 0.28 + 0.72 * Math.exp(-((worldX / 52) ** 2));
  }

  getHeightAt(worldX, worldZ, t) {
    const lz = worldZ - BREAK_ZONE_Z;
    const h  = this._crestH(lz) * this._zEnv(lz) * this._xPeak(worldX);
    const kC = (2 * Math.PI) / 5.0;
    const wC = Math.sqrt(9.81 * kC) * 1.05;
    const chop = 0.07 * Math.sin(kC * lz - wC * t + 1.1)
               + 0.06 * Math.sin(kC * (0.7*lz + 0.7*worldX) - wC*0.9  * t + 2.3)
               + 0.05 * Math.sin(kC * (0.7*lz - 0.7*worldX) - wC*0.85 * t + 4.1);
    return Math.max(h + chop, 0);
  }

  getNormalAt(worldX, worldZ, t) {
    const e  = 0.5;
    const cy = this.getHeightAt(worldX,   worldZ,   t);
    const px = this.getHeightAt(worldX+e, worldZ,   t);
    const pz = this.getHeightAt(worldX,   worldZ+e, t);
    return new THREE.Vector3(cy - px, e, cy - pz).normalize();
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
  }

  updateCameraPos(pos) {
    this.uniforms.uCamPos.value.copy(pos);
  }
}
