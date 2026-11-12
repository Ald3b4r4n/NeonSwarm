import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGame, stepGame, applyUpgrade } from '../game/engine.js';
import { ARENA_HEIGHT, ARENA_WIDTH, type GameState, type UpgradeId, type CharacterId, type BiomeId } from '../game/contracts.js';
import { drawRebirth } from './rebirth-render.js';
import { artUrl, loadArenaArt, type ArenaArt } from './rebirth-art.js';
import { LaunchScreen } from './rebirth-shell.js';
import { WEAPONS } from '../game/rebirth-weapons.js';
import { readMotion, readRecord, saveMotion, saveRecord } from './storage.js';

const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const characters = [
  { id: 'vesper', name: 'Vesper', description: 'Batedora ágil. Começa com a Bobina.', image: artUrl('vesper') },
  { id: 'rook', name: 'Rook', description: 'Engenheiro blindado. Começa com a Dispersora.', image: artUrl('rook') },
];
const biomes = [
  { id: 'station', name: 'Estação Íon', description: 'Trilhos partidos, chuva e passagens abertas.', image: artUrl('station') },
  { id: 'nursery', name: 'Viveiro Rubro', description: 'Laboratório tomado por esporos e feras.', image: artUrl('nursery') },
];

export function App() {
  const [snapshot, setSnapshot] = useState<GameState>(() => createGame());
  const game = useRef<GameState>(snapshot);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [character, setCharacter] = useState<CharacterId>('vesper');
  const [biome, setBiome] = useState<BiomeId>('station');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const art = useRef<ArenaArt | null>(null);
  const loadingRef = useRef(false);
  const [record, setRecord] = useState(readRecord);
  const [reduced, setReduced] = useState(readMotion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const pulse = useRef(false);
  const controls = useRef({ started, paused, reduced });
  controls.current = { started, paused, reduced };
  const clearInput = () => { keys.current.clear(); stick.current = { x: 0, y: 0 }; pulse.current = false; pointer.current = null; };
  const publish = () => setSnapshot(game.current);
  function choose(id: UpgradeId) { game.current = applyUpgrade(game.current, id); clearInput(); publish(); field.current?.focus(); }
  async function begin() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(false);
    try {
      art.current = await loadArenaArt(biome);
      game.current = createGame(Date.now() >>> 0, { character, biome });
      clearInput();
      setPaused(false);
      setStarted(true);
      publish();
      requestAnimationFrame(() => field.current?.focus());
    } catch {
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }
  function resume() { clearInput(); setPaused(false); field.current?.focus(); }

  useEffect(() => {
    const node = canvas.current!;
    const resize = () => {
      const width = node.getBoundingClientRect().width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      node.width = Math.max(1, Math.round(width * dpr));
      node.height = Math.max(1, Math.round(width * ARENA_HEIGHT / ARENA_WIDTH * dpr));
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame = 0, previous = 0, accumulator = 0, lastHud = 0;
    const ctx = node.getContext('2d', { alpha: false });
    const tick = (now: number) => {
      const current = controls.current;
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
      const before = game.current.phase;
      if (current.started && !current.paused && before === 'playing') {
        accumulator += dt;
        while (accumulator >= 1 / 60 && game.current.phase === 'playing') {
          const pressed = keys.current;
          const x = Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft')) + stick.current.x;
          const y = Number(pressed.has('s') || pressed.has('arrowdown')) - Number(pressed.has('w') || pressed.has('arrowup')) + stick.current.y;
          game.current = stepGame(game.current, { move: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }, pulse: pulse.current }, 1 / 60);
          pulse.current = false; accumulator -= 1 / 60;
        }
      } else accumulator = 0;
      if (before !== game.current.phase || now - lastHud >= 100) { setSnapshot(game.current); lastHud = now; }
      if (ctx && art.current && current.started) drawRebirth(ctx, game.current, art.current, current.reduced);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const autoPause = () => { clearInput(); if (controls.current.started && game.current.phase === 'playing') setPaused(true); };
    const visibility = () => { if (document.hidden) autoPause(); };
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('input, select, textarea')) return;
      const key = event.key.toLowerCase();
      if (!controls.current.started) return;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) && !(event.target as HTMLElement).closest('button')) event.preventDefault();
      if (event.repeat) return;
      if (key === 'escape' || key === 'p') { if (game.current.phase === 'playing') { clearInput(); setPaused(value => !value); } return; }
      if (controls.current.paused) return;
      if (game.current.phase === 'upgrade') { const option = game.current.upgradeOptions[Number(key) - 1]; if (option) choose(option.id); return; }
      if ((event.target as HTMLElement).closest('button')) return;
      keys.current.add(key); if (key === ' ') pulse.current = true;
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', autoPause); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', autoPause); document.removeEventListener('visibilitychange', visibility); clearInput(); };
  }, []);

  useEffect(() => {
    if (started && (snapshot.phase === 'gameover' || snapshot.phase === 'victory')) {
      setRecord(previous => {
        const next = { version: 1 as const, highScore: Math.max(previous.highScore, snapshot.score), bestWave: Math.max(previous.bestWave, snapshot.wave.number) };
        if (next.highScore !== previous.highScore || next.bestWave !== previous.bestWave) saveRecord(next);
        return next;
      });
    }
  }, [snapshot.phase, snapshot.score, snapshot.wave.number, started]);
  useEffect(() => { if (paused || snapshot.phase !== 'playing') { clearInput(); primary.current?.focus(); } }, [paused, snapshot.phase]);

  const active = started && !paused && snapshot.phase === 'playing';
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!active || pointer.current || event.button !== 0) return;
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = pointer.current; if (!origin || origin.id !== event.pointerId) return;
    const x = (event.clientX - origin.x) / 45, y = (event.clientY - origin.y) / 45, length = Math.max(1, Math.hypot(x, y));
    stick.current = { x: x / length, y: y / length };
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) { if (pointer.current?.id === event.pointerId) { pointer.current = null; stick.current = { x: 0, y: 0 }; } }
  const p = snapshot.player;
  const boss = snapshot.enemies.find(enemy => enemy.variant === 'queen');
  return <main className="shell">
    {!started && <LaunchScreen cover={artUrl('cover')} characters={characters} biomes={biomes}
      character={character} biome={biome} record={record.highScore}
      onCharacter={id => { if (id === 'vesper' || id === 'rook') setCharacter(id); }}
      onBiome={id => { if (id === 'station' || id === 'nursery') setBiome(id); }} onPlay={begin} />}
    {loading && <p className="load-state" role="status">Carregando ilustrações da arena…</p>}
    {loadError && <p className="load-state" role="alert">Falha ao carregar a arena. Tente jogar novamente.</p>}
    <div hidden={!started} className="match">
    <header className="masthead"><a className="brand" href="#arena">NEON<span>SWARM</span></a><span className="edition">REBIRTH</span></header>
    <section className="dashboard" aria-label="Painel da partida">
      <div className="vitals"><span>VIDA <strong data-testid="health">{Math.ceil(p.hp)} / {p.maxHp}</strong></span><meter aria-label="Vida" min={0} max={p.maxHp} value={p.hp} /><span>ENERGIA <strong>{Math.floor(p.energy)} / {p.maxEnergy}</strong></span><meter className="energy" aria-label="Energia" min={0} max={p.maxEnergy} value={p.energy} /></div>
      <div className="metric"><span>NÍVEL</span><strong data-testid="level">{p.level.toString().padStart(2, '0')}</strong><meter aria-label="Experiência até o próximo nível" max={p.xpToNext} value={Math.min(p.xp, p.xpToNext)} /></div>
      <div className="metric"><span>ONDA</span><strong data-testid="wave">{snapshot.wave.number.toString().padStart(2, '0')}</strong></div>
      <div className="metric"><span>TEMPO</span><strong data-testid="time">{clock(snapshot.stats.timeAlive)}</strong></div>
      <div className="metric"><span>INIMIGOS</span><strong>{snapshot.enemies.length}</strong></div>
      <div className="metric record"><span>RECORDE</span><strong data-testid="record">{record.highScore.toLocaleString('pt-BR')}</strong></div>
    </section>
    <section className="arsenal" aria-label="Arsenal">
      {Object.entries(snapshot.run?.ranks ?? {}).map(([id, rank]) => <span key={id}>{WEAPONS[id as keyof typeof WEAPONS].title} <strong>{rank}</strong></span>)}

    </section>
    {boss && <section className="boss-status" aria-label="Rainha de Cromo">
      <strong>RAINHA DE CROMO</strong><meter aria-label="Vida da Rainha" max={boss.maxHp} value={Math.max(0, boss.hp)} />
    </section>}
    <div id="arena" ref={field} className={`arena ${active ? 'active' : ''}`} tabIndex={0} aria-label="Campo de jogo" data-player-x={p.pos.x} data-player-y={p.pos.y} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
      <canvas ref={canvas} aria-label="Arena" data-testid="arena" data-player-x={p.pos.x} data-player-y={p.pos.y} width={960} height={720}>Arena de NEON SWARM. Use WASD ou setas para mover e Espaço para pulso.</canvas>
      {(paused || snapshot.phase !== 'playing') && <div className="overlay" onPointerDown={event => event.stopPropagation()}><section className="dialog" aria-label={paused ? 'Jogo pausado' : snapshot.phase === 'upgrade' ? 'Escolha uma melhoria' : 'Fim de partida'}>
        {paused ? <><p className="eyebrow">SISTEMA EM ESPERA</p><h2>Pausado</h2><p>Respire. A arena espera por você.</p><button ref={primary} className="primary" onClick={resume}>Retomar</button></> : snapshot.phase === 'upgrade' ? <><p className="eyebrow">NÍVEL {p.level}</p><h2>Escolha sua evolução</h2><p>Selecione uma melhoria para continuar.</p><div className="upgrades">{snapshot.upgradeOptions.map((option, index) => <button ref={index === 0 ? primary : undefined} key={option.id} onClick={() => choose(option.id)}><span className="eyebrow">{index + 1} · NÍVEL {option.nextLevel}</span><strong>{option.title}</strong><span>{option.description}</span></button>)}</div></> : <><p className="eyebrow">SINAL ENCERRADO</p><h2>{snapshot.phase === 'victory' ? 'Setor recuperado' : 'Fim de jogo'}</h2><p className="score">{snapshot.score.toLocaleString('pt-BR')} <span>pontos</span></p><p>Onda {snapshot.wave.number} · {clock(snapshot.stats.timeAlive)} · {snapshot.stats.kills} abates</p><p>Recorde: {record.highScore.toLocaleString('pt-BR')} · Melhor onda: {record.bestWave}</p><button ref={primary} className="primary" onClick={begin}>Jogar novamente</button><button className="secondary" onClick={() => { setStarted(false); setPaused(false); }}>Voltar à seleção</button></>}
      </section></div>}
    </div>
    <footer className="toolbar"><div><span className="status-dot" />{paused ? 'PAUSADO' : snapshot.phase === 'upgrade' ? 'EVOLUÇÃO DISPONÍVEL' : snapshot.phase === 'gameover' ? 'PARTIDA ENCERRADA' : `PONTOS ${snapshot.score.toLocaleString('pt-BR')}`}</div><div className="actions"><button disabled={!active} onClick={() => { pulse.current = true; field.current?.focus(); }}>Pulso <kbd>Espaço</kbd></button><button aria-label={paused ? 'Retomar' : 'Pausar'} disabled={!started || snapshot.phase !== 'playing'} onClick={() => { clearInput(); if (paused) resume(); else setPaused(true); }}>{paused ? 'Retomar' : 'Pausar'} <kbd>P</kbd></button></div></footer>
    <div className="preferences"><span>WASD / setas · arraste para mover · 1–3 para evoluir</span><label><input type="checkbox" checked={reduced} onChange={event => { setReduced(event.target.checked); saveMotion(event.target.checked); }} /> Reduzir efeitos</label></div>
    </div>
  </main>;
}
