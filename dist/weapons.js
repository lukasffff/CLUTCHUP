"use strict";
(function (root) {
  const rifles = {
    strike: { label: "STRIKE", type: "Auto rifle", mag: 25, reserve: 50, rate: 9.75, reload: 2.5, spread: .24, climb: 4.9, sway: 1.8, damage: [160, 40, 34], falloff: 1 },
    veil: { label: "VEIL", type: "Suppressed rifle", mag: 30, reserve: 60, rate: 11, reload: 2.5, spread: .2, climb: 3.8, sway: 1.45, damage: [156, 39, 33], falloff: .8 },
    marshal: { label: "SENTRY", type: "Semi-auto sidearm", mag: 12, reserve: 36, rate: 6.5, reload: 1.65, spread: .38, climb: 2.8, sway: 1.15, damage: [78, 26, 22], falloff: .8, semi: true }
  };
  const radians = degrees => degrees * Math.PI / 180;
  const damp = (from, to, speed, dt) => to + (from - to) * Math.exp(-speed * dt);
  function create(id) {
    const spec = rifles[id];
    return { id, spec, ammo: spec.mag, reserve: spec.reserve, reloadEnd: 0, firedAt: -999, streak: 0, kick: 0, yawKick: 0, sign: 1, turnAt: 0 };
  }
  function reload(weapon, now) {
    if (weapon.ammo === weapon.spec.mag || weapon.reserve <= 0 || weapon.reloadEnd) return false;
    weapon.reloadEnd = now + weapon.spec.reload;
    return true;
  }
  function update(weapon, now, dt) {
    if (weapon.reloadEnd && now >= weapon.reloadEnd) {
      const refill = Math.min(weapon.reserve, weapon.spec.mag - weapon.ammo);
      weapon.ammo += refill;
      weapon.reserve -= refill;
      weapon.reloadEnd = 0;
    }
    if (now - weapon.firedAt > .16) {
      weapon.kick = damp(weapon.kick, 0, 14, dt);
      weapon.yawKick = damp(weapon.yawKick, 0, 13, dt);
    }
  }
  function error(weapon, motion, streak = weapon.streak) {
    const { crouched, airborne, speed, ads } = motion;
    const movement = airborne ? 7 : speed < .27 ? 0 : speed < .58 ? 2.4 : 5.8;
    const stance = (crouched ? .78 : 1) * (ads ? .72 : 1);
    return weapon.spec.spread * stance + movement + Math.min(4.4, Math.max(0, streak - 2) * .29) * stance;
  }
  function shot(weapon, now, motion, view, random = Math.random) {
    const { spec } = weapon;
    if (weapon.reloadEnd || !weapon.ammo || now - weapon.firedAt + .0001 < (motion.ads && !spec.semi ? 1.1 : 1) / spec.rate) return null;
    if (now - weapon.firedAt >= .38) weapon.streak = 0;
    if (now - weapon.firedAt >= .38 || (weapon.streak >= 6 && now >= weapon.turnAt)) {
      weapon.sign = random() < .5 ? -1 : 1;
      weapon.turnAt = now + .27 + random() * .32;
    }
    const spread = error(weapon, motion);
    const radius = radians(spread) * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const output = {
      yaw: view.yaw + weapon.yawKick + Math.cos(angle) * radius,
      pitch: view.pitch + weapon.kick + Math.sin(angle) * radius,
      height: view.height,
      damage: spec.damage,
      falloff: spec.falloff
    };
    const run = motion.speed > .58 || motion.airborne ? 1.35 : 1;
    const stance = (motion.crouched ? .85 : 1) * (motion.ads ? .8 : 1);
    weapon.streak += 1;
    weapon.ammo -= 1;
    weapon.firedAt = now;
    const climb = spec.climb * stance * run;
    weapon.kick = radians(Math.min(climb, weapon.kick / radians(1) + (.43 + Math.min(weapon.streak, 6) * .11) * stance * run));
    const sway = (weapon.streak < 5 ? .34 : spec.sway) * stance * run;
    weapon.yawKick = damp(weapon.yawKick, radians(weapon.sign * sway), 7, 1 / spec.rate);
    return output;
  }
  root.ClutchWeapons = { rifles, create, reload, update, shot, error, damp };
})(typeof module === "undefined" ? window : module.exports);
