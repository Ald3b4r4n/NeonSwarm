# REFORGED — diagnóstico da Preview 2

O aceite físico no POCO X8 Pro reprovou a apresentação da Preview 2. Os testes da versão validavam regras do jogo e controles; não mediam qualidade visual.

| Camada | Causa observada na baseline 0094e8422d67 | Contrato para a reconstrução |
| --- | --- | --- |
| Modelos | As fontes Blender combinam primitivas com pivôs. Não preservam malha, materiais e rig no navegador. | GLB com malha e skin importado em runtime. Fontes editáveis, PBR e clipes nomeados. |
| Animação | Quatro quadros renderizados por ação. A folha limita a pose, os ângulos e as transições a imagens predefinidas. | Ações esqueléticas interpoladas, reação à direção, recoil e dano. |
| Render | Workbench gera imagens 128 × 128 que são recortadas em células WebP de 96 × 96. O Canvas desenha a arte achatada. | Babylon WebGL, câmera ortográfica oblíqua, luz, superfícies e profundidade na cena. |
| Cenários | Imagem 2D com props animados em cima. Campo Canvas limitado a 4:3. | Piso e estruturas no mundo 3D; proporção adaptada à viewport e o jogador no enquadramento. |
| Combate | Ranks mudam números e traços, mas a arma não se move com o disparo. | Arma ligada ao rig; trajetória, preparação, impacto e leitura da evolução visíveis na partida. |

A vertical slice é a primeira etapa. Deve mostrar Vesper, drone, Estação Íon e Bobina em combate. O motor determinístico em src/game continua sendo a fonte das regras; a cena lê seu estado, sem decidir dano, acertos ou recordes. A câmera e os efeitos não alteram as coordenadas da simulação. A expansão depende do parecer visual e do aceite físico; o rótulo de produto completo não se aplica à demonstração.

## Reprodução dos modelos

Blender 4.5.4, a partir da raiz:

```powershell
blender -b --factory-startup --python-exit-code 1 --python scripts/build-reforged.py -- --root . --capture docs/reforged
node scripts/inspect-reforged-assets.mjs
```

A malha usa anéis perfilados, chanfrados e agrupados por material, com peso rígido por peça para a armadura. A textura de abrasão é produzida pelo script e incorporada ao arquivo. Não há imagens de terceiros. Os materiais usam metalness, roughness e emissão. Os arquivos GLB têm pé na origem, eixo Y para cima, frente +Z e nenhuma dependência externa. As capturas do Blender são renders Cycles de referência, separadas das capturas do jogo.
