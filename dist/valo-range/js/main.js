import { boot } from './game.js';
boot();

// desktop-only: touch-only devices get the gate instead of a broken trainer
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
  document.getElementById('deskblock')?.classList.add('on');
}
