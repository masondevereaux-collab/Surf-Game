export class Input {
  constructor() {
    this.keys = {};
    this._justPressed = {};
    this.touchActive = false;
    this.touchX = 0;
    this.touchY = 0;
    this.touchStartX = 0;
    this.touchStartY = 0;

    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this._justPressed[e.code] = true;
      this.keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    window.addEventListener('touchstart', e => {
      this.touchActive = true;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchX = 0; this.touchY = 0;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      this.touchX = (e.touches[0].clientX - this.touchStartX) / 60;
      this.touchY = (e.touches[0].clientY - this.touchStartY) / 60;
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', e => {
      this.touchActive = false;
      this.touchX = 0; this.touchY = 0;
      e.preventDefault();
    }, { passive: false });
  }

  isDown(code) { return !!this.keys[code]; }

  justPressed(code) {
    const v = !!this._justPressed[code];
    return v;
  }

  flushJustPressed() {
    this._justPressed = {};
  }

  // -1 to 1: along wave (left/right)
  get horizontal() {
    let h = 0;
    if (this.isDown('ArrowLeft') || this.isDown('KeyA')) h -= 1;
    if (this.isDown('ArrowRight') || this.isDown('KeyD')) h += 1;
    if (this.touchActive) h = Math.max(-1, Math.min(1, this.touchX));
    return h;
  }

  // -1 to 1: up/down wave face
  get vertical() {
    let v = 0;
    if (this.isDown('ArrowUp') || this.isDown('KeyW')) v += 1;
    if (this.isDown('ArrowDown') || this.isDown('KeyS')) v -= 1;
    if (this.touchActive) v = Math.max(-1, Math.min(1, -this.touchY));
    return v;
  }

  get jump() { return this.isDown('Space'); }
  get spinLeft() { return this.isDown('KeyQ'); }
  get spinRight() { return this.isDown('KeyE'); }
  get grab() { return this.isDown('KeyF'); }
  get cameraSwitch() { return this.justPressed('KeyC'); }
}
