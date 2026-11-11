# NEON SWARM — Arquitetura e contratos

## Camadas
- `src/game/contracts.ts`: tipos e constantes compartilhados (fonte da verdade; mudanças exigem acordo entre os dois executores).
- `src/game/engine.ts` (executor A): motor puro. Sem DOM, React, `Math.random`, `Date`, nem I/O. Exporta `createGame(seed?)`, `stepGame(state, input, dtSeconds)`, `applyUpgrade(state, id)`. Importa apenas de `contracts.ts`.
- `src/ui/*` + `src/App.tsx` (executor B): React + Canvas, entrada, HUD, menus, pausa, persistência. Importa o motor somente pela API acima. Para desenvolver em paralelo, B pode usar um stub local de `engine.ts` até a entrega de A.
- Sem novas dependências.

## Regras do motor
- Funções puras e imutáveis (retornam novo estado; não mutam entrada). Determinístico: PRNG interno em `state.rng` (seed padrão fixa se omitida).
- `dt` limitado a `[0, MAX_DT]`; a UI pode chamar o motor várias vezes por frame (acumulador de passo fixo recomendado, 1/60 s).
- Coordenadas em unidades lógicas `ARENA_WIDTH × ARENA_HEIGHT` (960×720). Jogador é contido em `bounds`; inimigos nascem fora/na borda e entram; projéteis expiram ao sair ou por `ttl`.
- Inimigos: `drone` (rápido, frágil, contato), `brute` (lento, muito HP, contato forte), `shooter` (mantém distância, dispara projéteis `owner:'enemy'`).
- Disparo automático no inimigo mais próximo (`player.aim`); `pulse` gasta energia, empurra/fere inimigos próximos; energia regenera com XP coletado.
- XP: abates soltam `XpOrb`; atração por `magnetRadius`; ao atingir `xpToNext` → `phase='upgrade'` com 3 `upgradeOptions` distintas (menos se restarem poucas) e impacto `levelUp`.
- Ondas: `wave.number` cresce; intervalo (`intermission`) entre ondas; dificuldade e mix de tipos escalam por onda; bônus de pontuação ao completar.
- `hp<=0` → `phase='gameover'`. Em `upgrade`/`gameover`, `stepGame` não altera o estado.
- `impacts` são efeitos visuais com `ttl`, decaídos e removidos pelo motor.

## Regras da camada React
- **Pausa**: estado só da UI (`paused`), não faz parte de `GameState`. Pausado = não chamar `stepGame` e zerar o acumulador. Pausa por `Esc`/`P`, botão, `visibilitychange` (aba oculta) e perda de foco da janela. Retomar não gera salto de tempo (descartar delta acumulado). Não pausar durante `upgrade`/`gameover` (já parados); upgrade é escolhido por clique/toque/teclas 1–3.
- **Entrada**: WASD/setas + ponteiro (arrastar → vetor relativo ao ponto inicial, clamp a [-1,1]); `pulse` com Espaço/botão na tela, enviado por um passo apenas. Soltar teclas/ponteiro, perder foco → `move` zero.
- **Persistência**: `localStorage[STORAGE_KEY]` como `SavedData` JSON. Ler com try/catch e validação (versão, números finitos ≥0); dado inválido → zeros. Gravar ao entrar em `gameover` se `score>highScore` ou `wave.number>bestWave`; falhas de escrita são ignoradas. Nenhum dado sai do navegador.
- **Reinício**: `createGame(novaSeed)` (seed por `Date.now()` só na UI).
- **Canvas**: tamanho CSS responsivo, proporção 4:3, `devicePixelRatio` aplicado, funcional em 320 CSS px de largura sem rolagem horizontal. Textos em português. `prefers-reduced-motion` reduz efeitos.

## Critérios de aceitação
Jogabilidade:
1. `createGame()` → `phase='playing'`, jogador centralizado, hp=maxHp, onda 1, sem inimigos ativos até o primeiro spawn.
2. Mesma seed + mesma sequência de inputs/dt → estados idênticos (teste).
3. Jogador nunca sai de `bounds`; movimento diagonal não excede `moveSpeed`.
4. Os três `EnemyKind` aparecem até a onda ~5; dano de contato respeita `invuln`.
5. Disparo automático acerta inimigos, aplica `damage`, `pierce`, e gera orbes e pontuação ao abater.
6. Subir de nível produz 1–3 opções distintas; `applyUpgrade` altera `stats`/`upgrades`, retorna a `playing`; id inválido ou fase errada não altera o estado.
7. hp<=0 → `gameover`; `stats` e `score` finais coerentes (kills = soma de `killsByKind`).
8. Partida de 5 min com entrada simulada: sem NaN, arrays limitados (inimigos ≤ ~200, projéteis ≤ ~400), passo < 1 ms em média.

Integração:
9. UI usa apenas tipos/constantes de `contracts.ts` e as 3 funções do motor; `engine.ts` não importa nada fora de `contracts.ts`.
10. Pausa congela o jogo (estado idêntico antes/depois); aba oculta pausa automaticamente.
11. Recorde persiste após recarregar; JSON corrompido não quebra o app.
12. Menu de upgrade, game over (com estatísticas, pontuação, recorde) e reinício funcionam por mouse, toque e teclado.
13. Layout sem rolagem horizontal em 320 px; `npm run build` e testes passam; `tsc` sem erros em modo strict.
