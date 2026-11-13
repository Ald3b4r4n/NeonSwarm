import './rebirth-shell.css';

export type LaunchChoice = {
  id: string;
  name: string;
  description: string;
  image?: string;
};

type LaunchScreenProps = {
  cover: string;
  characters: readonly LaunchChoice[];
  biomes: readonly LaunchChoice[];
  character: string;
  biome: string;
  onCharacter: (id: string) => void;
  onBiome: (id: string) => void;
  onPlay: () => void;
  loading?: boolean;
  record: number;
  onLogoTap?: () => void;
};

function ChoiceCards({
  group,
  items,
  selected,
  onSelect,
}: {
  group: string;
  items: readonly LaunchChoice[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rebirth-cards" role="group" aria-label={group}>
      {items.map((item) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'rebirth-card rebirth-card--active' : 'rebirth-card'}
            aria-pressed={active}
            onClick={() => onSelect(item.id)}
          >
            {item.image ? (
              <img className="rebirth-card__thumb" src={item.image} alt="" loading="lazy" />
            ) : null}
            <span className="rebirth-card__name">{item.name}</span>
            <span className="rebirth-card__desc">{item.description}</span>
            <span className="rebirth-card__state">{active ? 'Selecionado' : 'Selecionar'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LaunchScreen({
  cover,
  characters,
  biomes,
  character,
  biome,
  onCharacter,
  onBiome,
  onPlay,
  loading,
  record,
  onLogoTap,
}: LaunchScreenProps) {
  return (
    <section className="rebirth-screen" aria-labelledby="rebirth-title">
      <div className="rebirth-masthead">
        <h1 onClick={onLogoTap} id="rebirth-title" className="rebirth-title">
          NEON SWARM <span>EXPEDIÇÃO ÍON</span>
        </h1>
        <p className="rebirth-standfirst">
          Doze minutos para romper o enxame e derrubar a Rainha de Cromo.
        </p>
        <p className="rebirth-record">
          Recorde <strong>{record}</strong>
        </p>
      </div>

      <div className="rebirth-grid">
        <figure className="rebirth-cover">
          <img src={cover} alt="Arte de capa de Neon Swarm Rebirth" />
        </figure>

        <div className="rebirth-picks">
          <section aria-labelledby="rebirth-chars">
            <h2 id="rebirth-chars" className="rebirth-section">Escolha a unidade</h2>
            <ChoiceCards
              group="Personagens"
              items={characters}
              selected={character}
              onSelect={onCharacter}
            />
          </section>

          <section aria-labelledby="rebirth-biomes">
            <h2 id="rebirth-biomes" className="rebirth-section">Escolha o bioma</h2>
            <ChoiceCards group="Biomas" items={biomes} selected={biome} onSelect={onBiome} />
          </section>

          <button type="button" className="rebirth-play" onClick={onPlay} disabled={loading} aria-busy={loading}>
            {loading ? 'CARREGANDO…' : 'JOGAR'}
          </button>
        </div>
      </div>
    </section>
  );
}
