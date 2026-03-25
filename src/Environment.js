import * as THREE from 'three';
import { SHORE_Z, LINEUP_Z } from './WaveMesh.js';

// Sky gradient + sun disk + beach + underwater ambient
export class Environment {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;

    this._buildSky(scene);
    this._buildSun(scene);
    this._buildBeach(scene);
    this._buildRocks(scene);
    this._buildOceanFloor(scene);
    this._buildLighting(scene);
    this._buildHorizonWater(scene);
  }

  _buildSky(scene) {
    // Large sphere skybox with gradient shader
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);

    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTopColor:    { value: new THREE.Color(0x1a3a72) },
        uMidColor:    { value: new THREE.Color(0x3d7ec8) },
        uHorizonColor:{ value: new THREE.Color(0xffb36a) },
        uSunDir:      { value: new THREE.Vector3(0.4, 0.4, 0.5).normalize() },
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        varying vec3 vPos;

        void main() {
          float h     = clamp(vPos.y, 0.0, 1.0);
          // Golden hour sky
          vec3 skyCol = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.25, h));
          skyCol      = mix(skyCol, uTopColor, smoothstep(0.25, 0.8, h));

          // Sun glow halo
          float sunDot  = max(0.0, dot(normalize(vPos), uSunDir));
          float halo    = pow(sunDot, 6.0) * 0.5;
          float corona  = pow(sunDot, 32.0) * 1.2;
          skyCol += vec3(1.0, 0.8, 0.4) * (halo + corona);

          gl_FragColor = vec4(skyCol, 1.0);
        }
      `,
      side: THREE.BackSide,
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
  }

  _buildSun(scene) {
    // Bright sun disk
    const sunGeo = new THREE.CircleGeometry(6, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    // Position sun in sky (along sun direction)
    const sunDir = new THREE.Vector3(0.4, 0.4, 0.5).normalize();
    sun.position.copy(sunDir).multiplyScalar(350);
    sun.lookAt(0, 0, 0);
    scene.add(sun);

    // Lens flare glow rings
    const glowGeo = new THREE.CircleGeometry(14, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff9933,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(sun.position).multiplyScalar(0.999);
    glow.lookAt(0, 0, 0);
    scene.add(glow);
  }

  _buildBeach(scene) {
    // Sandy shoreline
    const beachGeo = new THREE.PlaneGeometry(300, 50, 30, 8);
    beachGeo.rotateX(-Math.PI / 2);

    // Slightly uneven terrain
    const pos = beachGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > 0) {
        pos.setY(i, Math.random() * 0.15 - 0.05);
      }
    }
    pos.needsUpdate = true;
    beachGeo.computeVertexNormals();

    const beachMat = new THREE.MeshStandardMaterial({
      color:     0xe8d5a0,
      roughness: 0.95,
      metalness: 0.0,
    });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.position.set(0, -0.5, SHORE_Z + 16);
    beach.receiveShadow = true;
    scene.add(beach);

    // Wet sand at shoreline (darker strip)
    const wetGeo = new THREE.PlaneGeometry(300, 8, 20, 2);
    wetGeo.rotateX(-Math.PI / 2);
    const wetMat = new THREE.MeshStandardMaterial({
      color:     0xbfaa70,
      roughness: 0.7,
      metalness: 0.05,
    });
    const wetSand = new THREE.Mesh(wetGeo, wetMat);
    wetSand.position.set(0, -0.48, SHORE_Z + 2);
    scene.add(wetSand);
  }

  _buildRocks(scene) {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x6a6055, roughness: 0.9, metalness: 0.0,
    });

    const addRock = (x, z, sx, sy, sz) => {
      const geo = new THREE.DodecahedronGeometry(1, 0);
      // Randomize vertices for organic look
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + (Math.random()-0.5)*0.3);
        pos.setY(i, pos.getY(i) + (Math.random()-0.5)*0.2);
        pos.setZ(i, pos.getZ(i) + (Math.random()-0.5)*0.3);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, -0.3, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.castShadow = true;
      scene.add(mesh);
    };

    // Reef / rocks near break zone
    addRock(-30,  8, 1.5, 0.8, 1.2);
    addRock( 45,  5, 2.0, 1.0, 1.5);
    addRock(-45, 12, 1.0, 0.6, 0.9);
    addRock( 20, 14, 1.3, 0.7, 1.1);
    // Shore rocks
    addRock(-55, SHORE_Z+5,  2.5, 1.5, 2.0);
    addRock( 60, SHORE_Z+3,  3.0, 1.8, 2.5);
    addRock(  5, SHORE_Z+8,  1.8, 1.0, 1.4);
  }

  _buildOceanFloor(scene) {
    const floorGeo = new THREE.PlaneGeometry(300, 120, 40, 20);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color:     0x1a4455,
      roughness: 0.9,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -8, LINEUP_Z);
    scene.add(floor);
  }

  _buildHorizonWater(scene) {
    // Far ocean plane (no Gerstner, just flat reflection surface)
    const farGeo  = new THREE.PlaneGeometry(500, 120, 2, 2);
    farGeo.rotateX(-Math.PI / 2);
    const farMat  = new THREE.MeshStandardMaterial({
      color:     0x0a2a45,
      roughness: 0.05,
      metalness: 0.3,
      envMapIntensity: 1.0,
    });
    const farWater = new THREE.Mesh(farGeo, farMat);
    farWater.position.set(0, -0.2, LINEUP_Z - 60);
    scene.add(farWater);
  }

  _buildLighting(scene) {
    // Ambient: cool blue-sky fill
    const ambient = new THREE.AmbientLight(0x8ab4d4, 0.6);
    scene.add(ambient);

    // Directional sun: warm golden hour
    const sun = new THREE.DirectionalLight(0xffcc77, 2.2);
    sun.position.set(80, 60, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 1;
    sun.shadow.camera.far    = 400;
    sun.shadow.camera.left   = -100;
    sun.shadow.camera.right  = 100;
    sun.shadow.camera.top    = 100;
    sun.shadow.camera.bottom = -100;
    scene.add(sun);

    // Rim/fill light from water bounce
    const rimLight = new THREE.DirectionalLight(0x44aaff, 0.4);
    rimLight.position.set(-40, 5, -30);
    scene.add(rimLight);
  }
}
