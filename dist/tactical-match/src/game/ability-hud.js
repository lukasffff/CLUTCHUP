import { AGENTS, SLOTS, agentId, preferredAgent, rememberAgent } from './agents.js';

function describe(ability) {
  const duration = ability.duration ? ' · ' + ability.duration + ' s' + (ability.type === 'flash' ? ' fuse' : '') : '';
  const recharge = ability.cooldown ? ' · ' + ability.cooldown + ' s cooldown between charges' : '';
  const budget = ability.ultimate ? ' · once per match' : ' · ' + ability.charges + ' per round';
  return ability.details + ' ' + ability.range + ' m reach' + duration + recharge + budget + '.';
}

export class AbilityHUD {
  constructor(game, cast, selected) {
    this.game = game;
    this.cast = cast;
    this.selected = agentId(selected || preferredAgent());
    const start = document.querySelector('#hud-start');
    this.selection = document.createElement('section');
    this.selection.id = 'agent-selection';
    this.selection.innerHTML = '<label for="harbor-agent">Choose an agent</label><select id="harbor-agent"></select><p></p><ul></ul>';
    this.select = this.selection.querySelector('select');
    for (const [id, agent] of Object.entries(AGENTS)) {
      this.select.add(new Option(agent.name + ' · ' + agent.role, id));
    }
    this.select.value = this.selected;
    this.select.disabled = !!game.coaching?.benchmark;
    this.select.addEventListener('change', () => {
      this.selected = agentId(this.select.value);
      rememberAgent(this.selected);
      this.preview();
    });
    start?.parentNode.insertBefore(this.selection, start);
    this.preview();

    this.panel = document.createElement('section');
    this.panel.id = 'ability-hud';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Agent abilities');
    this.buttons = SLOTS.map((action, slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = '<kbd></kbd><i aria-hidden="true"></i><b></b><small></small>';
      button.addEventListener('pointerdown', event => { if (game.input.touchMode) event.stopPropagation(); });
      button.addEventListener('click', () => { if (game.input.touchMode) this.cast(slot); });
      this.panel.append(button);
      return button;
    });
    this.notice = document.createElement('p');
    this.notice.setAttribute('role', 'status');
    this.panel.append(this.notice);
    document.body.append(this.panel);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './ability-hud.css';
    document.head.append(css);
  }

  preview() {
    const agent = AGENTS[this.selected];
    this.selection.querySelector('p').textContent = agent.summary;
    const list = this.selection.querySelector('ul');
    list.replaceChildren(...agent.kit.map((ability, index) => {
      const item = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = this.game.settings.getLabel(SLOTS[index]) + ' · ' + ability.name;
      item.append(name, document.createTextNode(' — ' + describe(ability)));
      return item;
    }));
  }

  render(state, time, phase, alive) {
    this.panel.hidden = !state || !['freeze', 'live', 'planted'].includes(phase);
    if (this.panel.hidden) return;
    this.panel.classList.toggle('touch', this.game.input.touchMode);
    for (const [slot, ability] of AGENTS[state.id].kit.entries()) {
      const button = this.buttons[slot];
      const cooldown = Math.ceil(state.ready[slot] - time);
      const active = state.active[slot] > time;
      const charges = state.charges[slot];
      let availability = 'Ready';
      if (!alive) availability = 'Unavailable';
      else if (phase === 'freeze') availability = 'Buy phase';
      else if (active) availability = 'Active ' + Math.ceil(state.active[slot] - time) + 's' + (charges && cooldown > 0 ? ' / CD ' + cooldown + 's' : '');
      else if (!charges) availability = ability.ultimate ? 'Spent this match' : 'Depleted';
      else if (cooldown > 0) availability = 'Cooldown ' + cooldown + 's';
      button.dataset.state = active ? 'active' : availability === 'Ready' ? 'ready' : 'unavailable';
      button.disabled = !alive || phase === 'freeze' || !charges || cooldown > 0;
      const lines = [this.game.settings.getLabel(SLOTS[slot]), ability.icon, ability.name, charges + ' · ' + availability];
      for (const [index, text] of lines.entries()) {
        if (button.children[index].textContent !== text) button.children[index].textContent = text;
      }
      const details = describe(ability);
      if (button.title !== details) button.title = details;
    }
  }
}