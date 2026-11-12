# Rebirth preview 1

## Implementação e arte

O motor P004 recebe uma configuração opcional de campanha. Sem configuração, a API mantém a simulação clássica. Rebirth usa os catálogos de armas e encontros do DeepSeek, execução de combate a 60 passos por segundo e um Canvas independente do React. O carregador decodifica a arena e os sprites antes de começar. Os recordes continuam no formato local P004.

A capa, os dois terrenos e as nove silhuetas vieram de três ilustrações originais produzidas com ImageGen para o projeto. Nenhuma imagem externa é solicitada durante a partida. `scripts/build-art.py` recorta o atlas e gera WebP. Instale Pillow e passe os PNGs de sprites, terrenos e capa, nessa ordem. As animações usam movimento e deformação dos sprites no Canvas. A referência do gênero orientou a composição, sem entrar no build como arquivo de arte. O build não inclui assets de terceiros.

## Equipe

O job Hivemind `c97b94412c623d7dbb0b52df97f47cf4` foi coordenado pelo Codex CLI com GPT-6.1 Sol, effort low. Claude Code Sonnet 5.5 low produziu a arquitetura (`8d123a9`). OpenCode Go DeepSeek V4.1 Flash low executou em paralelo os catálogos de armas (`4a54b00`) e encontros (`4e6daf0`) em worktrees distintas. O menu e guia de arte vieram de Muse Spark 1.3 low em sessão Antares via MSP (`e20a598`, integrado como `c3e22f3`). O operador coordenou essa sessão e integrou o commit. Muse Ember 1.0 low revisou o gameplay em sessão Antares somente leitura. O operador corrigiu a entrada dos esporos, a velocidade dos hounds, o teto de elites e o aviso da Rainha. Os fixtures isolados de edição headless de Spark e Ember geraram `1fabe94` e `6a077bb`.

## Validação

`node scripts/check-balance.mjs` executa cinco cenários determinísticos e grava snapshots na pasta local ignorada. As seeds 73 e 99 venceram no Viveiro e a 123 venceu na Estação, em 720 s. O maior enxame observado teve 47 inimigos. A média do passo do motor em Windows ficou na ordem de 0,01 ms, sem incluir renderização. Os cenários exercitam progressão e limites. A amostra não mede taxa de vitória de jogadores. O teste touch roda no Chrome emulado em 320 CSS px. Falta validação física no POCO X8 Pro.

As capturas de horda e chefe renderizam snapshots produzidos pelo motor em navegador. As imagens de menu, início e resultado mostram o aplicativo em execução. `scripts/capture-rebirth.mjs` captura as telas e o clipe a partir dos snapshots locais.

## Publicação

O build Vite usa URLs relativas. Para reproduzir a prévia do GitHub Pages, gere `dist/` e publique seu conteúdo apenas em `rebirth/` na branch `gh-pages`, com `build-info.json` registrando o SHA de origem. O deploy na Vercel pode usar o preset Vite com saída `dist` em um projeto novo.
