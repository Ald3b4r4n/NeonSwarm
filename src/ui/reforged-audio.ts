import type { GameState } from '../game/contracts.js';

type Voice = 'fire' | 'hurt' | 'pulse' | 'arc';
const envelopes = {
  fire: { start: 440, end: 74, time: .105, gain: .047, type: 'triangle' },
  hurt: { start: 99, end: 43, time: .17, gain: .12, type: 'triangle' },
  pulse: { start: 75, end: 290, time: .28, gain: .089, type: 'sine' },
  arc: { start: 380, end: 1220, time: .08, gain: .026, type: 'sawtooth' },
} satisfies Record<Voice, { start: number; end: number; time: number; gain: number; type: OscillatorType }>;

export class ReforgedAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private previous?: GameState;
  private last = { fire: 0, hurt: 0, pulse: 0, arc: 0 };
  private enabled = false;

  /** Call only from a user gesture; lack of audio never blocks gameplay. */
  async enable() {
    try {
      const context = this.context ?? new AudioContext();
      this.context = context;
      if (!this.output) {
        const gain = context.createGain();
        gain.gain.value = .55;
        const compressor = context.createDynamicsCompressor();
        gain.connect(compressor).connect(context.destination);
        this.output = gain;
      }
      await context.resume();
      this.enabled = true;
    } catch { /* Browser audio is optional. */ }
  }

  disable() {
    this.enabled = false;
    this.previous = undefined;
  }

  reset() { this.previous = undefined; }

  update(state: GameState) {
    if (!this.enabled) return;
    const previous = this.previous;
    this.previous = state;
    if (!previous || state === previous || state.time < previous.time || !state.run) return;
    if (state.player.hp < previous.player.hp) this.play('hurt');
    if (state.stats.shotsFired > previous.stats.shotsFired) this.play('fire', state.run.ranks.coil ?? 1);
    const oldImpact = previous.nextId;
    for (const impact of state.impacts) {
      if (impact.id < oldImpact) continue;
      if (impact.kind === 'pulse') this.play('pulse', impact.rank);
      if (impact.kind === 'arc') this.play('arc', impact.rank);
    }
  }

  dispose() {
    this.disable();
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.output = undefined;
  }

  private play(voice: Voice, rank = 1) {
    const context = this.context, output = this.output;
    if (!context || !output || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - this.last[voice] < .062) return;
    this.last[voice] = now;
    const e = envelopes[voice];
    const pitch = 1 + .08 * (rank - 1);
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = e.type;
    osc.frequency.setValueAtTime(e.start * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(e.end * pitch, now + e.time);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(e.gain, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + e.time);
    osc.connect(gain).connect(output);
    osc.start(now);
    osc.stop(now + e.time + .01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
