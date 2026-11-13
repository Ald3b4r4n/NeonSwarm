import { applyDeveloperAction, setDeveloperFreeze, type DeveloperAction, type DeveloperStateAction } from '../game/developer.js';
import { DeveloperPanel } from './developer-panel.js';
import { QUALITY_PRESETS, readQuality, saveQuality, type FixedQuality, type Quality } from './quality.js';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGame, stepGame, applyUpgrade } from '../game/engine.js';
import { type GameState, type UpgradeId, type CharacterId, type BiomeId, type WeaponId } from '../game/contracts.js';
import { WORLD_NAMES } from '../game/ion-station.js';
import { CombatAudio } from './combat-audio.js';
import { drawRebirth } from './rebirth-render.js';
import { artUrl, loadArenaArt, type ArenaArt } from './rebirth-art.js';
import { LaunchScreen } from './rebirth-shell.js';
import { EXTRACTION_DEADLINE, RUN_SECONDS } from '../game/rebirth-encounters.js';
import { WEAPONS, WEAPON_IDS } from '../game/rebirth-weapons.js';
import { readMotion, readRecord, saveMotion, saveRecord } from './storage.js';

const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const characters = [
  { id: 'vesper', name: 'Vesper', description: 'Batedora ágil. Começa com a Bobina.', image: artUrl('vesper') },
  { id: 'rook', name: 'Rook', description: 'Engenheiro blindado. Começa com a Dispersora.', image: artUrl('rook') },
];
const biomes = [
  { id: 'station', name: 'Ermos de Íon', description: 'Planície industrial aberta, com destroços espalhados.', image: artUrl('station') },
  { id: 'nursery', name: 'Viveiro Rubro', description: 'Terreno orgânico aberto, tomado por esporos e feras.', image: artUrl('nursery') },
];

export function App() {
  const [snapshot, setSnapshot] = useState<GameState>(() => createGame());
  const game = useRef<GameState>(snapshot);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [quality, setQuality] = useState(readQuality);
  const [fpsShown, setFpsShown] = useState(false);
  const [fps, setFps] = useState(0);
  const testRun = useRef(false);
  const developer = useRef({ open: false, speed: 1, fps: false, limit: 0 as 0 | 30 | 60 | 120 });
  const selected = useRef<{ character: CharacterId; biome: BiomeId; weapon?: WeaponId }>({ character: 'vesper', biome: 'station' });
  const taps = useRef({ at: 0, count: 0 });
  const [portraitTouch, setPortraitTouch] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 });
  const [character, setCharacter] = useState<CharacterId>('vesper');
  const [biome, setBiome] = useState<BiomeId>('station');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const art = useRef<ArenaArt | null>(null);
  const loadingRef = useRef(false);
  const [record, setRecord] = useState(readRecord);
  const [reduced, setReduced] = useState(readMotion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<CombatAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const joystickPointer = useRef<{ id: number; centerX: number; centerY: number; radius: number } | null>(null);
  const pulse = useRef(false);
  const controls = useRef({ started, paused, reduced, quality, portraitBlocked: false });
  controls.current = { started, paused, reduced, quality, portraitBlocked: portraitTouch && !portraitDismissed };
  const clearInput = () => {
    keys.current.clear();
    stick.current = { x: 0, y: 0 };
    pulse.current = false;
    pointer.current = null;
    joystickPointer.current = null;
    setJoystickOffset({ x: 0, y: 0 });
  };
  const publish = () => setSnapshot(game.current);
  function toggleSound() {
    if (muted) void audio.current?.enable();
    else audio.current?.disable();
    setMuted(!muted);
    field.current?.focus();
  }
  function choose(id: UpgradeId) { game.current = applyUpgrade(game.current, id); clearInput(); publish(); field.current?.focus(); }
  async function begin(options?: { test: true; action?: DeveloperStateAction; frozen?: boolean }) {
    if (loadingRef.current) return;
    audio.current ??= new CombatAudio();
    audio.current.reset();
    if (!muted) void audio.current.enable();
    loadingRef.current = true;
    setLoading(true);
    setLoadError(false);
    try {
      const chosen = options ? { ...selected.current } : { character, biome };
      art.current = await loadArenaArt(chosen.biome);
      game.current = createGame(Date.now() >>> 0, { ...chosen, expedition: true });
      if (options && "weapon" in chosen && chosen.weapon) {
        game.current = applyDeveloperAction(game.current, { type: 'weapon/set-rank', weapon: chosen.weapon, rank: 1 });
      }
      if (options?.action) game.current = applyDeveloperAction(game.current, options.action);
      if (options?.frozen) game.current = setDeveloperFreeze(game.current, true);
      testRun.current = Boolean(options);
      setTestMode(Boolean(options));
      if (!options) {
        developer.current.speed = 1;
        developer.current.fps = false;
        developer.current.limit = 0;
        setFpsShown(false);
        closeDeveloper();
      }
      clearInput();
      setPaused(Boolean(options));
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
  async function tryLandscape() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> };
      await orientation?.lock?.('landscape');
    } catch { /* Rotation and portrait controls remain available. */ }
  }

  function openDeveloper() {
    const current = controls.current;
    if (current.started && !current.paused && game.current.phase === 'playing') return;
    if (current.started && game.current.run) {
      selected.current = { ...selected.current, character: game.current.run.character, biome: game.current.run.biome };
    } else if (!testRun.current) {
      selected.current = { character, biome };
    }
    developer.current.open = true;
    clearInput();
    setDeveloperOpen(true);
  }
  function closeDeveloper() {
    developer.current.open = false;
    setDeveloperOpen(false);
  }
  function logoTap() {
    const now = performance.now();
    taps.current.count = now - taps.current.at < 850 ? taps.current.count + 1 : 1;
    taps.current.at = now;
    if (taps.current.count < 5) return;
    taps.current.count = 0;
    openDeveloper();
  }
  function handleDeveloperAction(action: DeveloperAction) {
    if (action.type === 'session/restart') {
      selected.current = { character, biome };
      void begin();
      return;
    }
    if (action.type !== 'session/set-fps-visible' && action.type !== 'session/set-fps-limit') {
      testRun.current = true;
      setTestMode(true);
    }
    switch (action.type) {
      case 'session/set-sim-speed':
        developer.current.speed = Math.max(.25, Math.min(4, action.speed));
        break;
      case 'session/set-fps-limit':
        developer.current.limit = action.fps;
        break;
      case 'session/set-fps-visible':
        developer.current.fps = action.visible;
        setFpsShown(action.visible);
        break;
      case 'session/set-frozen':
        if (!controls.current.started || !game.current.run) void begin({ test: true, frozen: action.frozen });
        else { game.current = setDeveloperFreeze(game.current, action.frozen); publish(); }
        break;
      case 'session/select-character':
        selected.current.character = action.character;
        void begin({ test: true });
        break;
      case 'session/select-biome':
        selected.current.biome = action.biome;
        void begin({ test: true });
        break;
      case 'session/select-weapon':
        selected.current.weapon = action.weapon;
        if (!controls.current.started || !game.current.run) void begin({ test: true });
        else {
          game.current = applyDeveloperAction(game.current, { type: 'weapon/set-rank', weapon: action.weapon, rank: 1 });
          publish();
        }
        break;
      default:
        if (!controls.current.started || !game.current.run) void begin({ test: true, action });
        else {
          game.current = applyDeveloperAction(game.current, action);
          publish();
        }
    }
  }

  function resume() { clearInput(); setPaused(false); field.current?.focus(); }

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const updateOrientation = () => {
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      setPortraitTouch(coarsePointer.matches && portrait);
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    coarsePointer.addEventListener('change', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      coarsePointer.removeEventListener('change', updateOrientation);
    };
  }, []);

  useEffect(() => {
    const node = canvas.current!;
    let automatic: FixedQuality = 'medium';
    let applied: FixedQuality | undefined;
    const resize = () => {
      const { width, height } = node.getBoundingClientRect();
      applied = controls.current.quality === 'auto' ? automatic : controls.current.quality;
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[applied].dpr);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (node.width !== pixelWidth) node.width = pixelWidth;
      if (node.height !== pixelHeight) node.height = pixelHeight;
    };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame = 0, previous = 0, accumulator = 0, lastHud = 0, lastDraw = 0;
    let sampleStart = 0, sampleFrames = 0, slowSamples = 0, deathAt = 0;
    const ctx = node.getContext('2d', { alpha: false });
    const tick = (now: number) => {
      const current = controls.current;
      if (current.started && !current.paused && !current.portraitBlocked && !developer.current.open && game.current.phase === 'playing') {
        if (!sampleStart) sampleStart = now;
        sampleFrames++;
        if (now - sampleStart >= 900) {
          const measured = Math.round(1000 * sampleFrames / (now - sampleStart));
          if (developer.current.fps) setFps(measured);
          slowSamples = measured < 46 ? slowSamples + 1 : 0;
          if (slowSamples >= 2 && current.quality === 'auto') automatic = 'low';
          sampleStart = now;
          sampleFrames = 0;
        }
      } else { sampleStart = 0; sampleFrames = 0; }
      if (applied !== (current.quality === 'auto' ? automatic : current.quality)) resize();
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
      const before = game.current.phase;
      if (current.started && !current.paused && !current.portraitBlocked && !developer.current.open && before === 'playing') {
        accumulator = Math.min(.22, accumulator + dt * developer.current.speed);
        while (accumulator >= 1 / 60 && game.current.phase === 'playing') {
          const pressed = keys.current;
          const x = Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft')) + stick.current.x;
          const y = Number(pressed.has('s') || pressed.has('arrowdown')) - Number(pressed.has('w') || pressed.has('arrowup')) + stick.current.y;
          game.current = stepGame(game.current, { move: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }, pulse: pulse.current }, 1 / 60);
          pulse.current = false; accumulator -= 1 / 60;
        }
      } else accumulator = 0;
      if (before !== game.current.phase || now - lastHud >= 100) { setSnapshot(game.current); lastHud = now; }
      if (game.current.phase === 'gameover') deathAt ||= now; else deathAt = 0;
      if (current.started && !current.paused) audio.current?.update(game.current);
      if (ctx && art.current && current.started && (!developer.current.limit || now - lastDraw >= 1000 / developer.current.limit - 1)) {
        drawRebirth(ctx, game.current, art.current, current.reduced || !QUALITY_PRESETS[applied ?? 'medium'].effects, deathAt ? Math.min(1, (now - deathAt) / 540) : 0);
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); audio.current?.dispose(); };
  }, []);

  useEffect(() => {
    const autoPause = () => { clearInput(); if (controls.current.started && game.current.phase === 'playing') setPaused(true); };
    const visibility = () => { if (document.hidden) autoPause(); };
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyD' && !event.repeat) {
        event.preventDefault();
        if (developer.current.open) closeDeveloper(); else openDeveloper();
        return;
      }
      if (developer.current.open) {
        if (event.key === 'Escape') closeDeveloper();
        return;
      }
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
    if (started && !testRun.current && (snapshot.phase === 'gameover' || snapshot.phase === 'victory')) {
      setRecord(previous => {
        const next = { version: 1 as const, highScore: Math.max(previous.highScore, snapshot.score), bestWave: Math.max(previous.bestWave, snapshot.wave.number) };
        if (next.highScore !== previous.highScore || next.bestWave !== previous.bestWave) saveRecord(next);
        return next;
      });
    }
  }, [snapshot.phase, snapshot.score, snapshot.wave.number, started]);
  useEffect(() => { if (paused || snapshot.phase !== 'playing') { clearInput(); primary.current?.focus(); } }, [paused, snapshot.phase]);

  const active = started && !paused && !controls.current.portraitBlocked && !developerOpen && snapshot.phase === 'playing';
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!active || joystickPointer.current || pointer.current || event.button !== 0) return;
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = pointer.current; if (!origin || origin.id !== event.pointerId) return;
    const x = (event.clientX - origin.x) / 45, y = (event.clientY - origin.y) / 45, length = Math.max(1, Math.hypot(x, y));
    stick.current = { x: x / length, y: y / length };
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) { if (pointer.current?.id === event.pointerId) { pointer.current = null; stick.current = { x: 0, y: 0 }; } }
  function joystickDown(event: PointerEvent<HTMLDivElement>) {
    if (!active || joystickPointer.current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointer.current = null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * .32;
    joystickPointer.current = { id: event.pointerId, centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2, radius };
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickMove(event);
  }
  function joystickMove(event: PointerEvent<HTMLDivElement>) {
    const origin = joystickPointer.current;
    if (!origin || origin.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - origin.centerX) / origin.radius;
    const dy = (event.clientY - origin.centerY) / origin.radius;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = dx / length;
    const y = dy / length;
    stick.current = { x, y };
    setJoystickOffset({ x: x * origin.radius, y: y * origin.radius });
  }
  function joystickEnd(event: PointerEvent<HTMLDivElement>) {
    if (joystickPointer.current?.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    joystickPointer.current = null;
    stick.current = { x: 0, y: 0 };
    setJoystickOffset({ x: 0, y: 0 });
  }
  const qualitySelect = <label className="quality-select">Gráficos <select aria-label="Qualidade gráfica" value={quality}
    onChange={event => { const next = event.target.value as Quality; setQuality(next); saveQuality(next); }}>
    <option value="auto">Automático</option><option value="low">Baixo</option>
    <option value="medium">Médio</option><option value="high">Alto</option>
  </select></label>;
  const p = snapshot.player;
  const boss = snapshot.enemies.find(enemy => enemy.variant === 'queen');
  return <main className="shell">
    {!started && <LaunchScreen cover={artUrl('cover')} characters={characters} biomes={biomes}
      character={character} biome={biome} record={record.highScore}
      onCharacter={id => { if (id === 'vesper' || id === 'rook') setCharacter(id); }}
      onBiome={id => { if (id === 'station' || id === 'nursery') setBiome(id); }} onPlay={() => { void begin(); }} onLogoTap={logoTap} loading={loading} />}
    {!started && qualitySelect}
    {loading && <p className="load-state" role="status">Carregando ilustrações da arena…</p>}
    {loadError && <p className="load-state" role="alert">Falha ao carregar a arena. Tente jogar novamente.</p>}
    <div hidden={!started} className={snapshot.run?.expedition ? 'match expedition' : 'match'}>
    <header className="masthead"><a className="brand" href="#arena" onClick={event => { event.preventDefault(); logoTap(); }}>NEON<span>SWARM</span></a><span className={testMode ? "edition test-edition" : "edition"}>{testMode ? "MODO TESTE" : "REBIRTH"}</span></header>
    <section className="dashboard" aria-label="Painel da partida">
      <div className="vitals"><span>VIDA <strong data-testid="health">{Math.ceil(p.hp)} / {p.maxHp}</strong></span><meter aria-label="Vida" min={0} max={p.maxHp} value={p.hp} /><span>ENERGIA <strong>{Math.floor(p.energy)} / {p.maxEnergy}</strong></span><meter className="energy" aria-label="Energia" min={0} max={p.maxEnergy} value={p.energy} /></div>
      <div className="metric"><span>NÍVEL</span><strong data-testid="level">{p.level.toString().padStart(2, '0')}</strong><meter aria-label="Experiência até o próximo nível" max={p.xpToNext} value={Math.min(p.xp, p.xpToNext)} /></div>
      <div className="metric"><span>ONDA</span><strong data-testid="wave">{snapshot.wave.number.toString().padStart(2, '0')}</strong></div>
      <div className="metric"><span>{snapshot.time >= RUN_SECONDS - 60 ? "EXTRAÇÃO EM" : "TEMPO"}</span><strong data-testid="time">{snapshot.time >= RUN_SECONDS - 60 ? clock(Math.max(0, Math.ceil(EXTRACTION_DEADLINE - snapshot.time))) : clock(snapshot.stats.timeAlive)}</strong></div>
      <div className="metric"><span>INIMIGOS</span><strong data-testid="enemy-count">{snapshot.enemies.length}</strong></div>
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
      {snapshot.run?.expedition && <div className="station-sector" data-testid="world-name">{WORLD_NAMES[snapshot.run.biome]}</div>}
      <div className="virtual-controls" data-testid="virtual-controls" aria-label="Controles por toque">
        <div className={`virtual-joystick ${active ? '' : 'disabled'}`} role="group" aria-label="Joystick virtual" onPointerDown={joystickDown} onPointerMove={joystickMove} onPointerUp={joystickEnd} onPointerCancel={joystickEnd} onLostPointerCapture={joystickEnd}>
          <span className="joystick-ring" />
          <span className="joystick-knob" style={{ transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)` }} />
        </div>
        <div className="touch-actions">
          <button type="button" aria-label="Pulso" disabled={!active} onPointerDown={event => event.stopPropagation()} onClick={() => { pulse.current = true; field.current?.focus(); }}>✦</button>
          <button type="button" aria-label={paused ? 'Retomar' : 'Pausar'} disabled={!started || snapshot.phase !== 'playing'} onPointerDown={event => event.stopPropagation()} onClick={() => { clearInput(); if (paused) resume(); else setPaused(true); }}>{paused ? '▶' : 'Ⅱ'}</button>
        </div>
      </div>
      {started && portraitTouch && !portraitDismissed && <aside className="portrait-prompt" role="status">
        <p className="eyebrow">MELHOR EM LANDSCAPE</p>
        <p>Gire o aparelho para ver mais da arena.</p>
        {document.fullscreenEnabled && <button type="button" onClick={() => { void tryLandscape(); }}>Tentar tela cheia</button>}
        <button type="button" onClick={() => setPortraitDismissed(true)}>Seguir no retrato</button>
      </aside>}
      {(paused || snapshot.phase !== 'playing') && <div className="overlay" onPointerDown={event => event.stopPropagation()}><section className="dialog" role="dialog" aria-modal="true" aria-label={paused ? 'Jogo pausado' : snapshot.phase === 'upgrade' ? 'Escolha uma melhoria' : 'Fim de partida'}>
        {paused ? <><p className="eyebrow">SISTEMA EM ESPERA</p><h2>Pausado</h2><p>Respire. A arena espera por você.</p>{qualitySelect}<button type="button" aria-pressed={muted} onClick={toggleSound}>{muted ? "Ativar som" : "Silenciar"}</button><button ref={primary} className="primary" onClick={resume}>Retomar</button></> : snapshot.phase === 'upgrade' ? <><p className="eyebrow">NÍVEL {p.level}</p><h2>Escolha sua evolução</h2><p>Selecione uma melhoria para continuar.</p><div className="upgrades">{snapshot.upgradeOptions.map((option, index) => <button ref={index === 0 ? primary : undefined} key={option.id} onClick={() => choose(option.id)}><span className="eyebrow">{index + 1} · NÍVEL {option.nextLevel}</span><strong>{option.title}</strong><span>{option.description}</span>{WEAPON_IDS.filter(id => option.id === `weapon-${id}`).map(id => {
          const stats = WEAPONS[id].stats(option.nextLevel);
          return <small key={id} className="upgrade-preview">{stats.damage} de dano · {stats.cooldown.toFixed(2).replace('.', ',')} s</small>;
        })}</button>)}</div></> : <><p className="eyebrow">SINAL ENCERRADO</p><h2>{snapshot.phase === 'victory' ? 'Setor recuperado' : 'Fim de jogo'}</h2><p>{snapshot.phase === "gameover" && snapshot.time >= EXTRACTION_DEADLINE ? "A janela de extração se fechou antes da derrota da Rainha." : null}</p><p className="score">{snapshot.score.toLocaleString('pt-BR')} <span>pontos</span></p><p>Onda {snapshot.wave.number} · {clock(snapshot.stats.timeAlive)} · {snapshot.stats.kills} abates</p><p>Recorde: {record.highScore.toLocaleString('pt-BR')} · Melhor onda: {record.bestWave}</p><button ref={primary} className="primary" onClick={() => { void begin(); }}>Jogar novamente</button><button className="secondary" onClick={() => { setStarted(false); setPaused(false); }}>Voltar à seleção</button></>}
      </section></div>}
    </div>
    <footer className="toolbar"><div><span className="status-dot" />{paused ? 'PAUSADO' : snapshot.phase === 'upgrade' ? 'EVOLUÇÃO DISPONÍVEL' : snapshot.phase === 'gameover' ? 'PARTIDA ENCERRADA' : `PONTOS ${snapshot.score.toLocaleString('pt-BR')}`}</div><div className="actions"><button type="button" aria-pressed={muted} onClick={toggleSound}>{muted ? "Ativar som" : "Silenciar"}</button><button disabled={!active} onClick={() => { pulse.current = true; field.current?.focus(); }}>Pulso <kbd>Espaço</kbd></button><button aria-label={paused ? 'Retomar' : 'Pausar'} disabled={!started || snapshot.phase !== 'playing'} onClick={() => { clearInput(); if (paused) resume(); else setPaused(true); }}>{paused ? 'Retomar' : 'Pausar'} <kbd>P</kbd></button></div></footer>
    <div className="preferences"><span>WASD / setas · arraste para mover · 1–3 para evoluir</span><label><input type="checkbox" checked={reduced} onChange={event => { setReduced(event.target.checked); saveMotion(event.target.checked); }} /> Reduzir efeitos</label></div>
    </div>
    {fpsShown && <output className="performance-display" aria-label="Desempenho">{fps} FPS</output>}
    {developerOpen && <DeveloperPanel state={snapshot} onAction={handleDeveloperAction} onClose={closeDeveloper}
      session={developer.current} /> }
  </main>;
}
