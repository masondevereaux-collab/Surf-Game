import * as THREE from 'three';
import { STATE } from './Surfer.js';
import { BREAK_ZONE_Z } from './WaveMesh.js';

export const CAM_MODE = {
  FOLLOW:    'FOLLOW',
  BARREL:    'BARREL',
  AERIAL:    'AERIAL',
  SIDE:      'SIDE',
  CINEMATIC: 'CINEMATIC',
};

export class GameCamera {
  constructor(camera) {
    this.camera    = camera;
    this.mode      = CAM_MODE.FOLLOW;
    this._lookAt   = new THREE.Vector3();
    this._shake    = 0;
    this._t        = 0;
    this._autoMode = true; // auto-switch on state change
  }

  setMode(mode) {
    this.mode = mode;
    const el = document.getElementById('camera-mode');
    if (el) el.textContent = mode.replace('_',' ') + ' CAM';
  }

  cycleModes() {
    this._autoMode = false; // manual override
    const all = Object.values(CAM_MODE);
    this.setMode(all[(all.indexOf(this.mode) + 1) % all.length]);
  }

  addShake(amt) { this._shake = Math.max(this._shake, amt); }

  update(dt, surfer) {
    this._t += dt;
    const sp    = surfer.position;
    const speed = surfer.speed || 0;
    const dir   = surfer.dir || 1;

    // Auto-switch based on state
    if (this._autoMode) {
      if      (surfer.state === STATE.BARREL) this.setMode(CAM_MODE.BARREL);
      else if (surfer.state === STATE.AERIAL) this.setMode(CAM_MODE.AERIAL);
      else                                    this.setMode(CAM_MODE.FOLLOW);
    }

    let targetPos = new THREE.Vector3();
    let lookAt    = new THREE.Vector3();
    let fov       = 65;
    let posLerp   = 0.07;
    let lookLerp  = 0.09;

    switch (this.mode) {
      case CAM_MODE.FOLLOW: {
        // Low surf-photo angle: shore-side, low and close, looking up at wave
        const xOffset = -dir * 3.5;                  // slightly behind surfer
        const zOffset = 10;                           // shore side — wave face fills frame
        const yOffset = 1.5 + speed * 0.025;          // low — wave looms overhead
        targetPos.set(sp.x + xOffset, sp.y + yOffset, sp.z + zOffset);
        lookAt.set(sp.x + dir * 4, sp.y + 2.8, sp.z - 5); // look up at lip / crest
        fov = 65 + speed * 0.35;
        break;
      }
      case CAM_MODE.BARREL: {
        // Inside barrel: low behind surfer, looking TOWARD the exit opening
        // Exit is in the direction the surfer is traveling (dir), at wave base level
        targetPos.set(sp.x - dir * 2.5, sp.y + 1.2, sp.z + 2.5);
        lookAt.set(sp.x + dir * 18, sp.y - 0.5, sp.z - 1.0);  // toward bright exit
        fov = 78;
        posLerp  = 0.12;
        lookLerp = 0.14;
        break;
      }
      case CAM_MODE.AERIAL: {
        // Pull back wide during aerial
        targetPos.set(sp.x - dir * 7, sp.y + 5, sp.z + 14);
        lookAt.copy(sp);
        fov = 76;
        posLerp  = 0.05;
        lookLerp = 0.06;
        break;
      }
      case CAM_MODE.SIDE: {
        // Beach spectator — perpendicular to wave, fixed Z
        targetPos.set(sp.x, sp.y + 5, BREAK_ZONE_Z + 28);
        lookAt.copy(sp);
        fov = 52;
        posLerp  = 0.04;
        lookLerp = 0.05;
        break;
      }
      case CAM_MODE.CINEMATIC: {
        const r = 20, a = this._t * 0.22;
        targetPos.set(sp.x + Math.sin(a)*r, sp.y + 5, sp.z + Math.cos(a)*r*0.6 + 8);
        lookAt.copy(sp);
        fov = 56;
        posLerp  = 0.035;
        lookLerp = 0.045;
        break;
      }
    }

    // Camera shake
    if (this._shake > 0) {
      targetPos.x += (Math.random()-0.5) * this._shake;
      targetPos.y += (Math.random()-0.5) * this._shake * 0.4;
      this._shake  *= 0.82;
      if (this._shake < 0.01) this._shake = 0;
    }

    this.camera.position.lerp(targetPos, posLerp);
    this._lookAt.lerp(lookAt, lookLerp);
    this.camera.lookAt(this._lookAt);

    // Smooth FOV
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 0.06);
    this.camera.updateProjectionMatrix();
  }
}
