import * as THREE from 'three';
import { STATE } from './Surfer.js';

const MAX_SPRAY    = 600;
const MAX_FOAM     = 300;
const MAX_MIST     = 200;

export class ParticleSystem {
  constructor(scene) {
    this.spray  = this._makePool(scene, MAX_SPRAY,  0xeef8ff, 0.06, true);
    this.foam   = this._makePool(scene, MAX_FOAM,   0xffffff, 0.12, false);
    this.mist   = this._makePool(scene, MAX_MIST,   0xd0e8ff, 0.09, false);

    this._sprayTimer = 0;
    this._foamTimer  = 0;
    this._prevPos    = new THREE.Vector3();
    this._prevSpeed  = 0;
  }

  _makePool(scene, count, color, size, additive) {
    const positions = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i*3]   = 0; positions[i*3+1] = -999; positions[i*3+2] = 0;
      opacities[i]     = 0;
      velocities.push(new THREE.Vector3());
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('opacity',  new THREE.BufferAttribute(opacities, 1));

    const mat = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity:     0.7,
      sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    return { geo, mat, points, velocities, positions, opacities, count, head: 0 };
  }

  _emit(pool, x, y, z, vx, vy, vz, lifetime) {
    const i = pool.head % pool.count;
    pool.head++;
    pool.positions[i*3]   = x;
    pool.positions[i*3+1] = y;
    pool.positions[i*3+2] = z;
    pool.opacities[i]     = lifetime;
    pool.velocities[i].set(vx, vy, vz);
  }

  emitSpray(x, y, z, surfSpeed, turnIntensity, count = 12) {
    for (let j = 0; j < count; j++) {
      const a = Math.random() * Math.PI * 2;
      const s = surfSpeed * 0.3 + Math.random() * 3;
      this._emit(this.spray,
        x + (Math.random()-0.5)*0.4,
        y + Math.random()*0.2,
        z + (Math.random()-0.5)*0.4,
        Math.cos(a)*s * 0.4 + (Math.random()-0.5)*2,
        1.5 + Math.random() * 2.5 * turnIntensity,
        Math.sin(a)*s * 0.3,
        0.8 + Math.random() * 0.6,
      );
    }
  }

  emitFoam(x, y, z, count = 6) {
    for (let j = 0; j < count; j++) {
      this._emit(this.foam,
        x + (Math.random()-0.5)*1.5,
        y + 0.1,
        z + (Math.random()-0.5)*1.0,
        (Math.random()-0.5)*0.5,
        0.1 + Math.random()*0.3,
        (Math.random()-0.5)*0.5,
        1.5 + Math.random() * 1.0,
      );
    }
  }

  emitMist(x, y, z, count = 4) {
    for (let j = 0; j < count; j++) {
      this._emit(this.mist,
        x + (Math.random()-0.5)*3,
        y + 1 + Math.random()*1.5,
        z + (Math.random()-0.5)*1.5,
        (Math.random()-0.5)*0.3,
        0.05 + Math.random()*0.15,
        (Math.random()-0.5)*0.3,
        2.5 + Math.random() * 1.5,
      );
    }
  }

  update(dt, surfer) {
    const state = surfer.state;
    const pos   = surfer.position;
    const speed = surfer.speed || 0;
    const hInput = Math.abs(surfer._lastHInput || 0);

    // Spray on hard turns while riding
    if (state === STATE.RIDING || state === STATE.BARREL) {
      this._sprayTimer -= dt;
      if (this._sprayTimer <= 0) {
        const intensity = hInput * speed / 10;
        const cnt = Math.floor(intensity * 15 + 3);
        if (speed > 5) {
          this.emitSpray(pos.x, pos.y, pos.z, speed, intensity, cnt);
          this._sprayTimer = 0.05;
        }
      }
      this._foamTimer -= dt;
      if (this._foamTimer <= 0 && speed > 4) {
        this.emitFoam(pos.x - speed*0.1, pos.y, pos.z, 3);
        this._foamTimer = 0.1;
      }
    }

    // Mist near breaking wave
    if (state === STATE.BARREL) {
      this.emitMist(pos.x, pos.y + 1, pos.z - 1, 2);
    }

    // Update all pools
    for (const pool of [this.spray, this.foam, this.mist]) {
      for (let i = 0; i < pool.count; i++) {
        if (pool.opacities[i] <= 0) continue;

        pool.opacities[i] -= dt;
        pool.positions[i*3]   += pool.velocities[i].x * dt;
        pool.positions[i*3+1] += pool.velocities[i].y * dt;
        pool.positions[i*3+2] += pool.velocities[i].z * dt;

        // Gravity on spray
        if (pool === this.spray) {
          pool.velocities[i].y -= 4.5 * dt;
          pool.velocities[i].x *= 0.97;
          pool.velocities[i].z *= 0.97;
        }
        if (pool === this.foam) {
          pool.velocities[i].y -= 0.5 * dt;
        }
        // Kill if below water
        if (pool.positions[i*3+1] < -2) pool.opacities[i] = 0;
      }
      pool.geo.attributes.position.needsUpdate = true;
    }

    this._prevPos.copy(pos);
    this._prevSpeed = speed;
  }
}
