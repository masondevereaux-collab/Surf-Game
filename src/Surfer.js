import * as THREE from 'three';
import { BREAK_ZONE_Z, FACE_TOP_Z, FACE_BOTTOM_Z, A_PEEL_SPEED } from './WaveMesh.js';

export const STATE = {
  RIDING:     'RIDING',
  AERIAL:     'AERIAL',
  BARREL:     'BARREL',
  // kept for TrickSystem compatibility but never entered:
  WAITING:    'WAITING',
  WIPEOUT:    'WIPEOUT',
  TRANSITION: 'TRANSITION',
};

export class Surfer {
  constructor(scene, waveMesh) {
    this.wave  = waveMesh;
    this.state = STATE.RIDING;

    this.x       = 4;     // start near A-frame peak (X=0)
    this.faceT   = 0.45;  // 0 = top of face (crest), 1 = bottom (trough)
    this.speed   = 7.0;
    this.dir     = 1;     // +1 = right, −1 = left; updates from player input

    this.position = new THREE.Vector3(this.x, 0, BREAK_ZONE_Z);

    // Aerial physics
    this.velocity  = new THREE.Vector3();
    this.spinAngle = 0;
    this.grabActive= false;

    this.barrelTime  = 0;
    this.rideTime    = 0;
    this._stateTime  = 0;
    this._lastHInput = 0;

    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  get worldZ() {
    return FACE_TOP_Z + this.faceT * (FACE_BOTTOM_Z - FACE_TOP_Z);
  }

  update(dt, input, waveTime) {
    this._stateTime  += dt;
    this._lastHInput  = input.horizontal;

    switch (this.state) {
      case STATE.RIDING: this._riding(dt, input, waveTime); break;
      case STATE.AERIAL: this._aerial(dt, input, waveTime); break;
      case STATE.BARREL: this._barrel(dt, input, waveTime); break;
    }

    this._animateMesh();
  }

  // ── Riding — always on the wave, no wipeouts ──────────────────────────────
  _riding(dt, input, waveTime) {
    this.rideTime += dt;

    // Lateral movement — direction follows player input for A-frame choice
    if (input.horizontal > 0.2)  this.dir =  1;
    else if (input.horizontal < -0.2) this.dir = -1;

    this.x += input.horizontal * (this.speed + 3) * dt;
    this.x = Math.max(-120, Math.min(120, this.x));

    // Face position: gravity pulls toward shore, player pumps up/down
    this.faceT += 0.22 * dt;
    this.faceT -= input.vertical * 2.0 * dt;

    // Speed from slope: upper face = accelerate, lower face = decelerate
    const slopeAccel = (0.35 - this.faceT) * 10.0;
    this.speed += slopeAccel * dt;
    this.speed  = Math.max(4, Math.min(24, this.speed));

    // Clamp to wave face
    this.faceT = Math.max(0.04, Math.min(0.96, this.faceT));

    // Snap Y to wave surface
    const wz = this.worldZ;
    const wy = Math.max(this.wave.getHeightAt(this.x, wz, waveTime), 0);
    this.position.set(this.x, wy, wz);

    // Enter barrel when high on face AND wave is tall enough to have an overhang
    // (only possible near the A-frame peak — shoulders are too small to barrel)
    if (this.faceT < 0.30 && wy > 3.5 && Math.abs(this.x - this.wave.breakX) < 18) {
      this._setState(STATE.BARREL);
      this.barrelTime = 0;
      return;
    }

    // Aerial launch from the very top of face
    if (this.faceT < 0.14 && input.jump && this.speed > 7) {
      this._launchAerial(waveTime);
    }
  }

  // ── Barrel — riding inside the lip on the static wave ────────────────────
  _barrel(dt, input, waveTime) {
    this.barrelTime += dt;

    // Player steers — speed carries through so surfer can race the barrel
    this.x += input.horizontal * (this.speed + 2) * dt;
    this.x      = Math.max(-120, Math.min(120, this.x));
    this.faceT += input.vertical * 1.2 * dt;
    this.faceT  = Math.max(0.08, Math.min(0.85, this.faceT));

    const wz = this.worldZ;
    const wy = Math.max(this.wave.getHeightAt(this.x, wz, waveTime), 0);
    this.position.set(this.x, wy, wz);

    // Exit barrel when surfer drops too low or stays too long
    if (this.faceT > 0.72 || this.barrelTime > 10) {
      this._setState(STATE.RIDING);
    }
  }

  // ── Aerial ───────────────────────────────────────────────────────────────
  _aerial(dt, input, waveTime) {
    this.velocity.y -= 9.81 * dt;
    this.position.addScaledVector(this.velocity, dt);

    if (input.spinLeft)  this.spinAngle -= 200 * dt;
    if (input.spinRight) this.spinAngle += 200 * dt;
    this.grabActive = input.grab;

    if (this._stateTime > 0.35) {
      const wz      = this.worldZ;
      const groundY = Math.max(this.wave.getHeightAt(this.position.x, wz, waveTime), 0);
      if (this.position.y <= groundY + 0.3) {
        // Always land successfully — no wipeout
        this.x     = this.position.x;
        this.faceT = Math.max(0.1, Math.min(0.9, this.faceT + 0.1));
        this.speed = Math.max(8, this.speed * 0.8);
        this._setState(STATE.RIDING);
      }
    }

    // Safety: if airborne too long just land
    if (this._stateTime > 5.0) {
      this.x      = this.position.x;
      this.faceT  = 0.45;
      this.speed  = 7.0;
      const wz    = this.worldZ;
      const wy    = Math.max(this.wave.getHeightAt(this.x, wz, waveTime), 0);
      this.position.set(this.x, wy, wz);
      this._setState(STATE.RIDING);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  _launchAerial(waveTime) {
    this._setState(STATE.AERIAL);
    this.spinAngle  = 0;
    this.grabActive = false;
    const norm = this.wave.getNormalAt(this.x, this.worldZ, waveTime);
    this.velocity.set(this.dir * this.speed * 0.55, this.speed * 0.65 + 2, 0);
    this.velocity.addScaledVector(norm, 2.5);
  }

  _setState(s) {
    this.state      = s;
    this._stateTime = 0;
  }

  // ── Mesh ──────────────────────────────────────────────────────────────────
  _buildMesh() {
    const g = new THREE.Group();

    const bGeo = new THREE.BoxGeometry(0.50, 0.06, 1.85, 2, 1, 6);
    const bPos = bGeo.attributes.position;
    for (let i = 0; i < bPos.count; i++) {
      const t = Math.abs(bPos.getZ(i)) / 0.925;
      bPos.setX(i, bPos.getX(i) * (1 - t * t * 0.55));
    }
    bPos.needsUpdate = true;
    bGeo.computeVertexNormals();
    const board = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.28 }));
    g.add(board);

    const fGeo = new THREE.BoxGeometry(0.035, 0.11, 0.12);
    const fMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    [[-0.16,-0.09,-0.65],[0.16,-0.09,-0.65],[0,-0.09,-0.72]].forEach(([x,y,z])=>{
      const f=new THREE.Mesh(fGeo,fMat); f.position.set(x,y,z); f.rotation.x=0.14; g.add(f);
    });

    const sm = new THREE.MeshStandardMaterial({ color:0x112233, roughness:0.7 });
    const sk = new THREE.MeshStandardMaterial({ color:0xd4926a, roughness:0.6 });
    const add = (geo,mat,x,y,z,rx=0,rz=0,name='')=>{
      const m=new THREE.Mesh(geo,mat); m.name=name;
      m.position.set(x,y,z); m.rotation.set(rx,0,rz); g.add(m); return m;
    };
    add(new THREE.CylinderGeometry(0.16,0.13,0.58,8),sm, 0,0.88,0.04);
    add(new THREE.CylinderGeometry(0.14,0.12,0.22,8),sm, 0,0.54,0.03);
    add(new THREE.SphereGeometry(0.125,10,8),sk,       0,1.30,0.00, 0,0,'head');
    add(new THREE.CylinderGeometry(0.055,0.065,0.10,6),sk,0,1.17,0);
    this._lLeg=add(new THREE.CylinderGeometry(0.072,0.062,0.37,6),sm,-0.10,0.24,0, 0.28,-0.08,'lLeg');
    this._rLeg=add(new THREE.CylinderGeometry(0.072,0.062,0.37,6),sm, 0.10,0.24,0, 0.28, 0.08,'rLeg');
    add(new THREE.CylinderGeometry(0.062,0.052,0.33,6),sm,-0.11,-0.06,0.06, 0.5,-0.08);
    add(new THREE.CylinderGeometry(0.062,0.052,0.33,6),sm, 0.11,-0.06,0.06, 0.5, 0.08);
    this._lArm=add(new THREE.CylinderGeometry(0.052,0.042,0.56,6),sm,-0.24,0.93,0, 0.08,0.55,'lArm');
    this._rArm=add(new THREE.CylinderGeometry(0.052,0.042,0.56,6),sm, 0.24,0.93,0, 0.08,-0.55,'rArm');
    add(new THREE.SphereGeometry(0.055,6,5),sk,-0.42,0.70,0.07);
    add(new THREE.SphereGeometry(0.055,6,5),sk, 0.42,0.70,0.07);

    g.scale.setScalar(0.88);
    return g;
  }

  _animateMesh() {
    if (!this.mesh) return;

    this.mesh.position.copy(this.position);
    this.mesh.position.y += 0.04;

    const N = this.wave.getNormalAt(this.position.x, this.position.z, this.wave.time);
    const fwd = new THREE.Vector3(this.dir, 0, 0);
    const right = new THREE.Vector3().crossVectors(fwd, N).normalize();
    const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();
    this.mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(fwd, up, right.negate()));

    if (this.state === STATE.RIDING || this.state === STATE.BARREL) {
      this.mesh.rotateZ(-0.18 + this.faceT * 0.22);
    }

    if (this.state === STATE.AERIAL) {
      this.mesh.rotateY(THREE.MathUtils.degToRad(this.spinAngle));
      if (this.grabActive && this._lLeg) {
        this._lLeg.rotation.x = THREE.MathUtils.lerp(this._lLeg.rotation.x, -0.85, 0.15);
        this._rLeg.rotation.x = THREE.MathUtils.lerp(this._rLeg.rotation.x, -0.85, 0.15);
      }
    } else if (this._lLeg) {
      this._lLeg.rotation.x = THREE.MathUtils.lerp(this._lLeg.rotation.x,  0.28, 0.1);
      this._rLeg.rotation.x = THREE.MathUtils.lerp(this._rLeg.rotation.x,  0.28, 0.1);
    }

    if (this.state === STATE.BARREL) this.mesh.scale.setScalar(0.80);
    else this.mesh.scale.setScalar(0.88);
  }
}
