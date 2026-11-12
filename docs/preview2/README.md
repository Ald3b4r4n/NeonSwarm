# REBIRTH — Preview 2

A edição horizontal usa um campo Canvas 4:3 centralizado, sem distorção, com a altura da tela e controles nas laterais. No celular, gire o aparelho ou escolha continuar no retrato. Arraste o joystick virtual para mover; toque no botão de pulso para afastar o enxame. No desktop, WASD/setas, Espaço e P continuam disponíveis.

O menu e a pausa permitem escolher a qualidade gráfica. O modo automático começa em Médio e baixa a resolução interna e efeitos secundários se a taxa de quadros permanecer abaixo de 46 FPS. Baixo, Médio e Alto limitam o DPR a 1, 1,45 e 2. Os avisos de combate essenciais permanecem visíveis.

O painel local pode ser aberto no menu ou com a partida pausada: Ctrl+Shift+D, ou cinco toques rápidos no logotipo. A senha é uma barreira de interface inspecionável no cliente. Ações do painel marcam a partida como MODO TESTE; seus resultados não entram nos recordes. Use Reiniciar partida para voltar ao jogo normal.

## Arte e reprodução

Os onze arquivos editáveis em [art/blender](../../art/blender/) foram produzidos com malhas, materiais e articulações próprias. As silhuetas mantêm o contraste entre aço escuro, ciano para equipamento aliado e tons quentes para unidades hostis. Os cenários da Preview 1 continuam como fundos e recebem objetos Blender animados. Os personagens têm espelhamento lateral com câmera ortográfica fixa. Os clipes de quatro quadros usam pivôs animados; não dependem de GLB, de texturas externas ou de um motor 3D no navegador.

Com Blender 4.5.4 e Python com Pillow, a partir da raiz do projeto:

```powershell
blender -b --factory-startup --python scripts/build-blender.py -- --root .
python scripts/pack-blender.py
npm run build
```

A primeira etapa gera as fontes .blend e quadros PNG temporários em .hivemind/blender-frames. A segunda corta e empacota cada personagem em uma folha WebP (4 colunas de 96 px). Vesper, Rook e as seis famílias hostis têm idle, movimento, ataque, dano, morte e especial; a Rainha tem ainda entrada e preparação. Os dois objetos de cenário têm uma linha cada. Os assets animados originais seguem os termos do repositório. Nenhum serviço externo é necessário durante o jogo.

## Evidências

- [Arena 780 × 360](landscape-780x360.jpg), [896 × 414](landscape-896x414.jpg) e [915 × 412](landscape-915x412.jpg)
- [Menu](menu.jpg), [Painel local](painel.jpg), [Bobina rank 1](bobina-rank-1.jpg) e [Rainha com Bobina rank 5](bobina-rank-5-rainha.jpg)
- [Vídeo de combate](evolucao-bobina.webm), gravado no Canvas do build em Chromium

Para reproduzir as capturas, execute npm run build e node scripts/capture-preview2.mjs com Chrome disponível. As medições de desktop com viewport móvel são indicativas; desempenho, recortes e conforto do toque no POCO X8 Pro aguardam o teste físico.

No Chrome de desktop em viewport móvel de 915 × 412 e DPR 2, a captura da onda 8 registrou 59,9 callbacks de quadro/s durante 4,5 s, p95 de 16,8 ms e 26 inimigos ao final. É uma amostra curta com o Canvas sendo gravado, não um benchmark do aparelho. Cinco partidas determinísticas produziram duas vitórias (664 s e 665 s), três derrotas e pico de 45 inimigos. O build estático ocupa cerca de 1,94 MB; os 11 atlas animados somam 717 kB.
