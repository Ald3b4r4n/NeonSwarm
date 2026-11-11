# NEON SWARM

Um arena survivor 2D em uma arena cyberpunk. A nave dispara automaticamente no inimigo mais próximo. Desvie dos enxames, recolha energia e escolha upgrades conforme a pressão aumenta.

## Jogar

- **Computador** — WASD ou setas para mover. Espaço ativa o pulso. Esc ou P pausa.
- **Celular** — arraste sobre a arena para mover. Use os botões na tela para pulso, pausa e upgrades.
- **Evolução** — escolha um upgrade ao subir de nível. O recorde fica no armazenamento local do navegador.

## Desenvolvimento

Requer Node.js 24.

```sh
npm ci
npm run dev
```

React cuida dos menus, do HUD e da entrada. O Canvas desenha a arena e as entidades. O motor TypeScript é determinístico e isolado do DOM. Os tipos compartilhados ficam em `src/game/contracts.ts`. [Arquitetura](docs/arquitetura.md)

## Validação

```sh
npm run build
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Os testes E2E servem o build de produção. O jogo funciona no navegador, com gráficos procedurais e persistência local.

## Créditos

Projeto desenvolvido como desafio operacional do Hivemind. Codex CLI coordenou pelo MCP. Claude Code definiu os contratos, OpenCode Go trabalhou no motor e Codex CLI trabalhou na interface como fallback do Muse Code. Os resultados de cada executor e a situação da publicação estão no relatório P004.
