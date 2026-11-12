import { useId, useState, type FormEvent } from 'react';
import {
  BIOMES,
  CHARACTERS,
} from '../game/rebirth-encounters';
import type { GameState, WeaponId } from '../game/contracts';
import {
  WEAPONS,
  WEAPON_EVOLUTIONS,
  WEAPON_IDS,
  WEAPON_MAX_RANK,
} from '../game/rebirth-weapons';
import type { DeveloperAction } from '../game/developer';
import './developer-panel.css';

const DEVELOPER_PASSWORD = 'Aldebaran';
const ENEMY_CHOICES = [
  { id: 'drone', label: 'Drone' },
  { id: 'brute', label: 'Bruto' },
  { id: 'shooter', label: 'Atirador' },
  { id: 'spore', label: 'Esporo' },
  { id: 'hound', label: 'Cão' },
  { id: 'elite', label: 'Elite' },
  { id: 'queen', label: 'Rainha' },
] as const;

/** Props documentadas para futura integração do painel com o App. */
export interface DeveloperPanelProps {
  /** Estado imutável atual da partida exibido pelos controles. */
  state: GameState;
  /** Recebe ações de estado e contratos de sessão definidos em game/developer. */
  onAction: (action: DeveloperAction) => void;
  /** Fecha o painel; o App decide se o desmonta ou apenas o oculta. */
  onClose: () => void;
  /** Libera o painel quando a camada App já autenticou o operador. */
  unlocked: boolean;
  /** Notifica o App quando a senha local correta for informada. */
  onUnlock: () => void;
}

/** Painel de desenvolvimento local, ainda sem acoplamento ao App ou à engine. */
export function DeveloperPanel({
  state,
  onAction,
  onClose,
  unlocked,
  onUnlock,
}: DeveloperPanelProps) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const [character, setCharacter] = useState(state.run?.character ?? 'vesper');
  const [biome, setBiome] = useState(state.run?.biome ?? 'station');
  const [startingWeapon, setStartingWeapon] = useState<WeaponId>(
    (WEAPON_IDS.find((weapon) => (state.run?.ranks[weapon] ?? 0) > 0) ?? 'coil'),
  );
  const [rankWeapon, setRankWeapon] = useState<WeaponId>(startingWeapon);
  const [simSpeed, setSimSpeed] = useState(1);
  const [frozen, setFrozen] = useState(false);
  const [fpsVisible, setFpsVisible] = useState(false);
  const [fpsLimit, setFpsLimit] = useState<0 | 30 | 60 | 120>(0);
  const [waveText, setWaveText] = useState(String(state.wave.number));
  const isUnlocked = unlocked || locallyUnlocked;

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== DEVELOPER_PASSWORD) {
      setPassword('');
      setPasswordError(true);
      return;
    }
    setPassword('');
    setPasswordError(false);
    setLocallyUnlocked(true);
    onUnlock();
  }

  function chooseCharacter(value: string) {
    const selected = value as keyof typeof CHARACTERS;
    setCharacter(selected);
    onAction({ type: 'session/select-character', character: selected });
  }

  function chooseBiome(value: string) {
    const selected = value as keyof typeof BIOMES;
    setBiome(selected);
    onAction({ type: 'session/select-biome', biome: selected });
  }

  function closePanel() {
    setLocallyUnlocked(false);
    onClose();
  }

  if (!isUnlocked) {
    return (
      <div className="developer-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePanel();
      }}>
        <section
          className="developer-panel developer-panel--locked"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-title`}
        >
          <header className="developer-header">
            <div>
              <span className="developer-kicker">NEON SWARM / LOCAL</span>
              <h2 id={`${id}-title`}>Acesso do operador</h2>
            </div>
            <button className="developer-icon-button" type="button" onClick={closePanel} aria-label="Fechar painel">×</button>
          </header>
          <form className="developer-unlock" onSubmit={handleUnlock}>
            <label htmlFor={`${id}-password`}>Senha</label>
            <input
              autoFocus
              id={`${id}-password`}
              type="password"
              value={password}
              autoComplete="current-password"
              aria-invalid={passwordError}
              aria-describedby={passwordError ? `${id}-error` : undefined}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
                setPasswordError(false);
              }}
            />
            {passwordError ? <span id={`${id}-error`} className="developer-error" role="alert">Senha inválida.</span> : null}
            <button className="developer-primary" type="submit">Desbloquear</button>
          </form>
        </section>
      </div>
    );
  }

  const setAction = (action: DeveloperAction) => onAction(action);
  const invincible = state.player.invuln > 10;
  const queenSpawned = state.enemies.some((enemy) => enemy.variant === 'queen');

  return (
    <div className="developer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closePanel();
    }}>
      <section
        className="developer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <header className="developer-header">
          <div>
            <span className="developer-kicker">NEON SWARM / LOCAL</span>
            <h2 id={`${id}-title`}>Painel de desenvolvimento</h2>
          </div>
          <button className="developer-icon-button" type="button" onClick={closePanel} aria-label="Fechar painel">×</button>
        </header>

        <div className="developer-status" aria-live="polite">
          <span><i className="developer-status-dot" />{state.phase.toUpperCase()}</span>
          <span>ONDA {state.wave.number}</span>
          <span>NÍVEL {state.player.level}</span>
          <span>INIMIGOS {state.enemies.length}</span>
        </div>

        <div className="developer-grid">
          <section className="developer-section" aria-labelledby={`${id}-player`}>
            <h3 id={`${id}-player`}>Jogador</h3>
            <label className="developer-toggle">
              <span><strong>Invencibilidade</strong><small>Imunidade a dano de contato</small></span>
              <input
                type="checkbox"
                checked={invincible}
                onChange={(event) => setAction({ type: 'player/set-invincibility', enabled: event.currentTarget.checked })}
              />
            </label>
            <div className="developer-control-row">
              <span><strong>Vida</strong><small>{Math.ceil(state.player.hp)} / {state.player.maxHp} PV</small></span>
              <div className="developer-button-group">
                <button type="button" onClick={() => setAction({ type: 'player/set-health', hp: Math.max(0, state.player.hp - 10) })}>−10</button>
                <button type="button" onClick={() => setAction({ type: 'player/set-health', hp: Math.min(state.player.maxHp, state.player.hp + 10) })}>+10</button>
                <button type="button" onClick={() => setAction({ type: 'player/set-health', hp: state.player.maxHp })}>Cheia</button>
              </div>
            </div>
            <div className="developer-control-row">
              <span><strong>Progressão</strong><small>{Math.floor(state.player.xp)} / {state.player.xpToNext} XP</small></span>
              <div className="developer-button-group">
                <button type="button" onClick={() => setAction({ type: 'player/add-xp', amount: 50 })}>+50 XP</button>
                <button type="button" onClick={() => setAction({ type: 'player/set-level', level: state.player.level + 1 })}>Nível +1</button>
              </div>
            </div>
            <label className="developer-field" htmlFor={`${id}-move-speed`}>
              <span><strong>Velocidade do jogador</strong><small>Unidades por segundo</small></span>
              <input
                id={`${id}-move-speed`}
                type="number"
                min="0"
                max="2000"
                step="10"
                value={state.player.stats.moveSpeed}
                onChange={(event) => setAction({ type: 'player/set-speed', speed: Number(event.currentTarget.value) })}
              />
            </label>
          </section>

          <section className="developer-section" aria-labelledby={`${id}-arsenal`}>
            <h3 id={`${id}-arsenal`}>Arsenal</h3>
            <label className="developer-field" htmlFor={`${id}-rank-weapon`}>
              <span><strong>Arma para ajustar</strong><small>{state.run ? 'Ranks ativos nesta partida' : 'Disponível em uma partida Rebirth'}</small></span>
              <select id={`${id}-rank-weapon`} value={rankWeapon} onChange={(event) => setRankWeapon(event.currentTarget.value as WeaponId)}>
                {WEAPON_IDS.map((weapon) => <option key={weapon} value={weapon}>{WEAPONS[weapon].title}</option>)}
              </select>
            </label>
            <div className="developer-ranks" role="group" aria-label={`Rank de ${WEAPONS[rankWeapon].title}`}>
              {Array.from({ length: WEAPON_MAX_RANK }, (_, index) => index + 1).map((rank) => {
                const active = (state.run?.ranks[rankWeapon] ?? 0) >= rank;
                return (
                  <button
                    key={rank}
                    type="button"
                    className={active ? 'developer-rank developer-rank--active' : 'developer-rank'}
                    aria-pressed={active}
                    disabled={!state.run}
                    onClick={() => setAction({ type: 'weapon/set-rank', weapon: rankWeapon, rank })}
                  >
                    {rank}
                  </button>
                );
              })}
              <button
                type="button"
                className="developer-rank developer-rank--zero"
                aria-label="Remover arma"
                disabled={!state.run || (state.run.ranks[rankWeapon] ?? 0) === 0}
                onClick={() => setAction({ type: 'weapon/set-rank', weapon: rankWeapon, rank: 0 })}
              >
                0
              </button>
            </div>
            <div className="developer-synergies">
              <span className="developer-label">Sinergias</span>
              {WEAPON_EVOLUTIONS.map((evolution) => (
                <button
                  key={evolution.id}
                  type="button"
                  disabled={!state.run}
                  onClick={() => setAction({ type: 'weapon/unlock-synergy', evolution: evolution.id })}
                  title={evolution.description}
                >
                  <span>{evolution.title}</span><small>Desbloquear</small>
                </button>
              ))}
            </div>
          </section>

          <section className="developer-section" aria-labelledby={`${id}-world`}>
            <h3 id={`${id}-world`}>Mundo</h3>
            <label className="developer-field" htmlFor={`${id}-wave`}>
              <span><strong>Onda</strong><small>Avançar para uma onda</small></span>
              <select
                id={`${id}-wave`}
                value={waveText}
                onChange={(event) => {
                  setWaveText(event.currentTarget.value);
                  setAction({ type: 'world/set-wave', wave: Number(event.currentTarget.value) });
                }}
              >
                {Array.from({ length: state.run ? 12 : 20 }, (_, index) => index + 1).map((wave) => (
                  <option key={wave} value={wave}>Onda {wave}</option>
                ))}
              </select>
            </label>
            <div className="developer-spawn-grid" role="group" aria-label="Invocar inimigo">
              {ENEMY_CHOICES.map((enemy) => (
                <button
                  key={enemy.id}
                  type="button"
                  className={enemy.id === 'queen' ? 'developer-spawn developer-spawn--queen' : 'developer-spawn'}
                  disabled={enemy.id === 'queen' && (!state.run || queenSpawned)}
                  onClick={() => setAction({ type: 'world/spawn', variant: enemy.id })}
                >
                  {enemy.label}
                </button>
              ))}
            </div>
            {!state.run ? <small className="developer-world-note">A Rainha requer uma partida Rebirth.</small> : null}
          </section>

          <section className="developer-section" aria-labelledby={`${id}-session`}>
            <h3 id={`${id}-session`}>Sessão</h3>
            <label className="developer-field" htmlFor={`${id}-sim-speed`}>
              <span><strong>Velocidade de simulação</strong><small>{simSpeed}×</small></span>
              <select
                id={`${id}-sim-speed`}
                value={simSpeed}
                onChange={(event) => {
                  const speed = Number(event.currentTarget.value);
                  setSimSpeed(speed);
                  setAction({ type: 'session/set-sim-speed', speed });
                }}
              >
                {[0.25, 0.5, 1, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
              </select>
            </label>
            <label className="developer-toggle">
              <span><strong>Congelar simulação</strong><small>Solicita pausa ao App</small></span>
              <input
                type="checkbox"
                checked={frozen}
                onChange={(event) => {
                  const value = event.currentTarget.checked;
                  setFrozen(value);
                  setAction({ type: 'session/set-frozen', frozen: value });
                }}
              />
            </label>
            <label className="developer-toggle">
              <span><strong>Contador de FPS</strong><small>Overlay de diagnóstico</small></span>
              <input
                type="checkbox"
                checked={fpsVisible}
                onChange={(event) => {
                  const value = event.currentTarget.checked;
                  setFpsVisible(value);
                  setAction({ type: 'session/set-fps-visible', visible: value });
                }}
              />
            </label>
            <label className="developer-field" htmlFor={`${id}-fps-limit`}>
              <span><strong>Limite de FPS</strong><small>0 remove o limite</small></span>
              <select
                id={`${id}-fps-limit`}
                value={fpsLimit}
                onChange={(event) => {
                  const fps = Number(event.currentTarget.value) as 0 | 30 | 60 | 120;
                  setFpsLimit(fps);
                  setAction({ type: 'session/set-fps-limit', fps });
                }}
              >
                <option value={0}>Sem limite</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
                <option value={120}>120 FPS</option>
              </select>
            </label>
            <div className="developer-session-selects">
              <label className="developer-field" htmlFor={`${id}-character`}>
                <span><strong>Personagem</strong></span>
                <select id={`${id}-character`} value={character} onChange={(event) => chooseCharacter(event.currentTarget.value)}>
                  {Object.values(CHARACTERS).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="developer-field" htmlFor={`${id}-biome`}>
                <span><strong>Bioma</strong></span>
                <select id={`${id}-biome`} value={biome} onChange={(event) => chooseBiome(event.currentTarget.value)}>
                  {Object.values(BIOMES).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <label className="developer-field" htmlFor={`${id}-starting-weapon`}>
                <span><strong>Arma inicial</strong></span>
                <select
                  id={`${id}-starting-weapon`}
                  value={startingWeapon}
                  onChange={(event) => {
                    const weapon = event.currentTarget.value as WeaponId;
                    setStartingWeapon(weapon);
                    setRankWeapon(weapon);
                    setAction({ type: 'session/select-weapon', weapon });
                  }}
                >
                  {WEAPON_IDS.map((weapon) => <option key={weapon} value={weapon}>{WEAPONS[weapon].title}</option>)}
                </select>
              </label>
            </div>
            <button className="developer-restart" type="button" onClick={() => setAction({ type: 'session/restart' })}>
              Reiniciar partida
            </button>
          </section>
        </div>

        <footer className="developer-footer">
          <span>Controles locais • ações de sessão encaminhadas ao App</span>
          <button type="button" onClick={closePanel}>Fechar painel</button>
        </footer>
      </section>
    </div>
  );
}
