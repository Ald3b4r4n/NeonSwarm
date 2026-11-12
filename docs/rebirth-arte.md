# NEON SWARM REBIRTH — Guia de arte (menu)

Identidade editorial indie sci-fi para a tela de lançamento. Escopo: só menu e este guia.

## Paleta

- Fundo: `#060a10` (quase preto azulado).
- Tinta: `#e8f4f8` texto principal, `#93a7b5` texto secundário.
- Cyan: `#6deff5` — ações, seleção ativa, destaques.
- Âmbar: `#f5b53f` — recorde, foco visível, selo editorial.

Contraste: tinta sobre fundo acima de 12:1. Cyan e âmbar usados como acento, nunca como único sinal de estado (sempre com `aria-pressed` e rótulo "Selecionado").

## Tipografia

- Títulos: sistema condensada com `letter-spacing` — `Impact, 'Arial Narrow', sans-serif` para o título de capa, peso 900.
- Corpo e UI: `Inter, 'Segoe UI', Arial, sans-serif`, herdada da página.
- Hierarquia: selo de edição → título → linha de apoio → seções de escolha → ação JOGAR.

## Composição da tela de lançamento

1. Faixa de capa (`cover`): imagem local integrada por outra tarefa, com legenda editorial e selo "REBIRTH".
2. Coluna de escolha: dois grupos — personagens e biomas — cada cartão com nome, descrição curta e miniatura local opcional (`image?`).
3. Ação única: botão `JOGAR`. Estado selecionado via `aria-pressed="true"`.

## Voz (português)

Curta e direta. Exemplos: "Escolha a unidade", "Escolha o bioma", "Recorde", "Jogar a missão".

## Regras de integração de arte

- Arte de capa, sprites e biomas chegam como arquivos locais por outra tarefa. Este menu só referencia `cover` e `image?` via props.
- Proibido nesta entrega: placeholders, imagens externas, SVG decorativo e estilos globais.
- Todo CSS usa o prefixo `rebirth-`. Foco visível sempre em âmbar (`outline: 2px solid #f5b53f`).
- Layout adaptativo a partir de 320px: coluna única no estreito, duas colunas acima de 900px. Respeita `prefers-reduced-motion`.
