import * as THREE from 'three';
import { EffectComposer }    from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }        from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }   from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }        from 'three/addons/postprocessing/ShaderPass.js';

import { WaveMesh }     from './WaveMesh.js';
import { Surfer }       from './Surfer.js';
import { GameCamera }   from './GameCamera.js';
import { TrickSystem }  from './TrickSystem.js';
import { ParticleSystem }from './Particles.js';
import { Environment }  from './Environment.js';
import { Input }        from './Input.js';
import { UI }           from './UI.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace   = THREE.SRGBColorSpace;
renderer.toneMapping        = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

// ── Scene & Camera ────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.fog    = new THREE.FogExp2(0x8ac0d8, 0.006);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(22, 3, 18);   // shore side, low angle — wave looms large
camera.lookAt(28, 4, 3);          // looking up at wave face / lip

// ── Post-processing ───────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,   // strength
  0.55,   // radius
  0.78,   // threshold
);
composer.addPass(bloom);

// Color grade pass (warm golden hour)
const colorGradePass = new ShaderPass({
  uniforms: {
    tDiffuse:   { value: null },
    uSaturation:{ value: 1.12 },
    uVignette:  { value: 0.45 },
    uContrast:  { value: 1.08 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uContrast;
    varying vec2 vUv;

    vec3 saturation(vec3 c, float s) {
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(lum), c, s);
    }

    void main() {
      vec4 col  = texture2D(tDiffuse, vUv);
      vec3 c    = col.rgb;

      // Contrast
      c = (c - 0.5) * uContrast + 0.5;
      // Saturation
      c = saturation(c, uSaturation);
      // Warm tint
      c.r *= 1.04; c.b *= 0.96;
      // Vignette
      vec2 uv2  = vUv * (1.0 - vUv.yx);
      float vig = pow(uv2.x * uv2.y * 18.0, uVignette);
      c *= vig;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
});
composer.addPass(colorGradePass);

// ── Game Systems ──────────────────────────────────────────────────────────────
const env       = new Environment(scene, renderer);
const waveMesh  = new WaveMesh(scene);
const surfer    = new Surfer(scene, waveMesh);
const gameCam   = new GameCamera(camera);
const tricks    = new TrickSystem();
const particles = new ParticleSystem(scene);
const input     = new Input();
const ui        = new UI();

// Wire up callbacks
tricks.onTrick   = (name, pts)         => ui.showTrick(name, pts);
tricks.onWaveEnd = (score, label)      => ui.showWaveScore(score, label);

// ── Wake ribbons behind fins ──────────────────────────────────────────────────
const wakeGeo    = new THREE.BufferGeometry();
const _wakePos   = new Float32Array(30 * 3);
wakeGeo.setAttribute('position', new THREE.BufferAttribute(_wakePos, 3));
const wakeMat = new THREE.LineBasicMaterial({
  color: 0xaaeeff, transparent: true, opacity: 0.4, linewidth: 1,
});
const wakeLine = new THREE.Line(wakeGeo, wakeMat);
scene.add(wakeLine);

const wakeHistory = Array.from({length: 30}, () => new THREE.Vector3(0, -999, 0));
let wakeIdx = 0;

function updateWake() {
  const sp = surfer.position;
  wakeHistory[wakeIdx % 30].set(sp.x, sp.y, sp.z);
  wakeIdx++;
  const pts = wakeGeo.attributes.position;
  for (let i = 0; i < 30; i++) {
    const h = wakeHistory[(wakeIdx - 1 - i + 60) % 30];
    pts.setXYZ(i, h.x, h.y - 0.05, h.z);
  }
  pts.needsUpdate = true;
}

// ── Barrel interior glow light ─────────────────────────────────────────────────
const barrelLight = new THREE.PointLight(0x00ffaa, 0, 8);
scene.add(barrelLight);

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();

function loop() {
  requestAnimationFrame(loop);

  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime  = now;

  // Store last horizontal input for particles
  surfer._lastHInput = input.horizontal;

  // Update wave
  waveMesh.update(dt);
  waveMesh.updateCameraPos(camera.position);

  // Update surfer
  surfer.update(dt, input, waveMesh.time);

  // Update tricks
  tricks.update(dt, surfer, input);

  // Update camera
  gameCam.update(dt, surfer);

  // Barrel light
  const inBarrel = surfer.state === 'BARREL';
  barrelLight.position.copy(surfer.position).add(new THREE.Vector3(1, 1.5, 0));
  barrelLight.intensity = THREE.MathUtils.lerp(barrelLight.intensity, inBarrel ? 2.5 : 0, 0.1);

  // Camera switch
  if (input.cameraSwitch) {
    gameCam.cycleModes();
  }

  // Update particles
  particles.update(dt, surfer);

  // Wake ribbon
  updateWake();

  // Update UI
  ui.update(dt, surfer, tricks);

  // Flush just-pressed keys
  input.flushJustPressed();

  composer.render();
}

loop();

// ── Ocean Audio via Web Audio API ─────────────────────────────────────────────
(function initAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  let ctx;
  const start = () => {
    if (ctx) return;
    ctx = new AudioContext();

    // Brown noise ocean ambience
    const bufSize = ctx.sampleRate * 4;
    const buf     = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data    = buf.getChannelData(0);
    let lastOut   = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i]     = (lastOut + 0.02 * white) / 1.02;
      lastOut     = data[i];
      data[i]    *= 4.5;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.08;

    const filter = ctx.createBiquadFilter();
    filter.type      = 'lowpass';
    filter.frequency.value = 380;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  };

  window.addEventListener('click',     start, { once: true });
  window.addEventListener('touchstart',start, { once: true });
  window.addEventListener('keydown',   start, { once: true });
})();
