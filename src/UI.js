import { STATE } from './Surfer.js';

export class UI {
  constructor() {
    this._score       = document.getElementById('total-score');
    this._speedFill   = document.getElementById('speed-fill');
    this._waveState   = document.getElementById('wave-state');
    this._trickFeed   = document.getElementById('trick-feed');
    this._barrelOvl   = document.getElementById('barrel-overlay');
    this._barrelTimer = document.getElementById('barrel-timer');
    this._judgePanel  = document.getElementById('judge-panel');
    this._judgeScore  = document.getElementById('judge-score');
    this._judgeLabel  = document.getElementById('judge-label');
    this._wipeoutMsg  = document.getElementById('wipeout-msg');

    this._trickQueue = [];
    this._judgeTimeout = null;
    this._wipeoutTimeout = null;
  }

  update(dt, surfer, tricks) {
    // Total score
    if (this._score) {
      const displayScore = (tricks.waveScore / 100).toFixed(1);
      this._score.textContent = displayScore;
    }

    // Speed bar (0-18 m/s range)
    if (this._speedFill) {
      const pct = Math.min(100, (surfer.speed / 16) * 100);
      this._speedFill.style.width = pct + '%';
      // Color: teal → yellow → red at max speed
      if (pct > 80) this._speedFill.style.background = 'linear-gradient(90deg, #ffaa00, #ff4400)';
      else if (pct > 60) this._speedFill.style.background = 'linear-gradient(90deg, #00ffaa, #ffcc00)';
      else this._speedFill.style.background = 'linear-gradient(90deg, #00ccff, #00ffaa)';
    }

    // State label
    if (this._waveState) {
      const labels = {
        [STATE.WAITING]:    'LINEUP',
        [STATE.PADDLING]:   'PADDLING IN',
        [STATE.RIDING]:     'RIDING',
        [STATE.AERIAL]:     'AERIAL',
        [STATE.BARREL]:     'BARREL',
        [STATE.WIPEOUT]:    'WIPEOUT',
        [STATE.TRANSITION]: 'PADDLE BACK',
      };
      this._waveState.textContent = labels[surfer.state] || surfer.state;
    }

    // Barrel overlay
    const inBarrel = surfer.state === STATE.BARREL;
    if (this._barrelOvl) {
      this._barrelOvl.style.opacity = inBarrel ? '1' : '0';
    }
    if (this._barrelTimer) {
      if (inBarrel) {
        this._barrelTimer.textContent = surfer.barrelTime.toFixed(1) + 's';
        this._barrelTimer.style.opacity = '1';
      } else {
        this._barrelTimer.style.opacity = '0';
      }
    }

    // Wipeout message
    if (surfer.state === STATE.WIPEOUT && !this._wipeoutShown) {
      this._wipeoutShown = true;
      if (this._wipeoutMsg) {
        this._wipeoutMsg.style.opacity = '1';
        this._wipeoutTimeout = setTimeout(() => {
          if (this._wipeoutMsg) this._wipeoutMsg.style.opacity = '0';
          this._wipeoutShown = false;
        }, 1800);
      }
    }
    if (surfer.state === STATE.RIDING) this._wipeoutShown = false;
  }

  showTrick(name, pts) {
    if (!this._trickFeed) return;

    const entry = document.createElement('div');
    entry.className = 'trick-entry';
    entry.innerHTML = `${name} <span class="trick-pts">+${pts}</span>`;
    this._trickFeed.insertBefore(entry, this._trickFeed.firstChild);

    // Max 4 tricks visible
    while (this._trickFeed.children.length > 4) {
      this._trickFeed.removeChild(this._trickFeed.lastChild);
    }

    setTimeout(() => {
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    }, 2200);
  }

  showWaveScore(score, label) {
    if (!this._judgePanel) return;

    this._judgeScore.textContent = score;
    this._judgeLabel.textContent = label;
    this._judgePanel.style.opacity = '1';

    clearTimeout(this._judgeTimeout);
    this._judgeTimeout = setTimeout(() => {
      if (this._judgePanel) this._judgePanel.style.opacity = '0';
    }, 3000);
  }
}
