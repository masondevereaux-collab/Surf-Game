import { STATE } from './Surfer.js';

// Trick definitions
const TRICKS = {
  CUTBACK:      { name: 'Cutback',         pts: 350  },
  SNAP:         { name: 'Snap',            pts: 450  },
  FLOATER:      { name: 'Floater',         pts: 400  },
  AIR:          { name: 'Air',             pts: 700  },
  AIR_GRAB:     { name: 'Air Grab',        pts: 1000 },
  SPIN_180:     { name: '180 Air',         pts: 800  },
  SPIN_360:     { name: '360 Air',         pts: 1600 },
  SPIN_540:     { name: '540 Air',         pts: 2400 },
  SPIN_720:     { name: '720 Air',         pts: 3500 },
  ALLEY_OOP:    { name: 'Alley-Oop',       pts: 1900 },
  BARREL_EXIT:  { name: 'Barrel Exit!',    pts: 2200 },
  DEEP_BARREL:  { name: 'Deep Barrel!',    pts: 3500 },
  PUMP:         { name: 'Rail Work',       pts: 100  },
};

export class TrickSystem {
  constructor() {
    this.waveScore      = 0;
    this.totalScore     = 0;
    this.currentTricks  = [];   // tricks performed this wave
    this.lastTrickType  = null;
    this.combo          = 0;
    this.multiplier     = 1.0;
    this.specialMeter   = 0;    // 0-1
    this._prevState     = null;
    this._prevFaceT     = 0;
    this._cutbackState  = 0;    // 0=none, 1=initiated
    this._cutbackDir    = 0;
    this._aerial        = { spins: 0, grabbed: false };

    this.onTrick = null;  // callback(trickName, pts)
  }

  update(dt, surfer, input) {
    const state = surfer.state;

    // Track aerial details
    if (state === STATE.AERIAL) {
      this._aerial.spins   = Math.abs(surfer.spinAngle) / 180;
      this._aerial.grabbed = surfer.grabActive;
    }

    // AERIAL → RIDING landing
    if (this._prevState === STATE.AERIAL && state === STATE.RIDING) {
      this._scoreAerial(surfer);
    }

    // Barrel tracking
    if (state === STATE.BARREL) {
      // Handled by barrel bonus on exit
    }

    // BARREL → RIDING exit
    if (this._prevState === STATE.BARREL && state === STATE.RIDING) {
      const barrelTime = surfer.barrelTime;
      const trick = barrelTime > 2.5 ? TRICKS.DEEP_BARREL : TRICKS.BARREL_EXIT;
      const pts   = Math.round(trick.pts * (1 + barrelTime * 0.3));
      this._award(trick.name + (barrelTime > 0.5 ? ` (${barrelTime.toFixed(1)}s)` : ''), pts);
    }

    // Cutback detection
    if (state === STATE.RIDING) {
      const dFaceT = surfer.faceT - this._prevFaceT;
      // Quick direction reversal = snap
      if (Math.abs(input.horizontal) > 0.8 && surfer.speed > 8) {
        if (!this._snapCooldown) {
          this._award(TRICKS.SNAP.name, Math.round(TRICKS.SNAP.pts * this.multiplier));
          this._snapCooldown = 1.2;
        }
      }
    }
    if (this._snapCooldown > 0) this._snapCooldown -= dt;

    // Wipeout: reset wave score
    if (state === STATE.WIPEOUT && this._prevState !== STATE.WIPEOUT) {
      this._endWave(false);
    }

    // Transition: end wave
    if (state === STATE.TRANSITION && this._prevState === STATE.WIPEOUT) {
      // already handled
    }

    this._prevState  = state;
    this._prevFaceT  = surfer.faceT;

    // Decay special meter slightly
    this.specialMeter = Math.max(0, this.specialMeter - dt * 0.04);
  }

  _scoreAerial(surfer) {
    const spins   = this._aerial.spins;
    const grabbed = this._aerial.grabbed;
    let trick;
    let pts;

    const spinDeg = Math.abs(surfer.spinAngle);
    if      (spinDeg >= 640) { trick = TRICKS.SPIN_720; pts = TRICKS.SPIN_720.pts; }
    else if (spinDeg >= 460) { trick = TRICKS.SPIN_540; pts = TRICKS.SPIN_540.pts; }
    else if (spinDeg >= 300) { trick = TRICKS.SPIN_360; pts = TRICKS.SPIN_360.pts; }
    else if (spinDeg >= 140) { trick = TRICKS.SPIN_180; pts = TRICKS.SPIN_180.pts; }
    else if (grabbed)        { trick = TRICKS.AIR_GRAB; pts = TRICKS.AIR_GRAB.pts; }
    else                     { trick = TRICKS.AIR;      pts = TRICKS.AIR.pts;      }

    // Grab bonus
    if (grabbed && spinDeg >= 140) pts = Math.round(pts * 1.35);

    // Combo bonus for variety
    const isRepeat = this.lastTrickType === trick.name;
    if (isRepeat) pts = Math.round(pts * 0.5);

    pts = Math.round(pts * this.multiplier);

    this._award(trick.name, pts);
    this.lastTrickType = trick.name;

    // Special meter fill
    if (!isRepeat) this.specialMeter = Math.min(1, this.specialMeter + 0.3);
    this.multiplier = 1.0 + this.specialMeter * 1.5;

    this._aerial = { spins: 0, grabbed: false };
  }

  _award(name, pts) {
    this.waveScore += pts;
    this.currentTricks.push({ name, pts });
    if (this.onTrick) this.onTrick(name, pts);
  }

  _endWave(clean) {
    // Judge score 0-10 based on wave score
    const judgeScore = Math.min(10, this.waveScore / 800);
    this.totalScore += this.waveScore;

    const displayScore = judgeScore.toFixed(1);
    const label = judgeScore >= 9.5 ? 'PERFECT!' :
                  judgeScore >= 8.0 ? 'EXCELLENT' :
                  judgeScore >= 6.5 ? 'GOOD' :
                  judgeScore >= 4.0 ? 'AVERAGE' : 'POOR';

    if (this.onWaveEnd) this.onWaveEnd(displayScore, label);

    // Reset per-wave state
    this.waveScore     = 0;
    this.currentTricks = [];
    this.lastTrickType = null;
    this.multiplier    = 1.0;
    this.combo         = 0;
  }

  resetWave() {
    this.waveScore     = 0;
    this.currentTricks = [];
    this.lastTrickType = null;
    this.multiplier    = 1.0;
    this._snapCooldown = 0;
    this._aerial       = { spins: 0, grabbed: false };
    this.specialMeter  = 0;
  }
}
