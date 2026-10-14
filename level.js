// ============================================================================
// VECTOR BEAT — Mundo 01 · Jardines del cielo
// Mapa del nivel hecho a mano sobre la pista «Nivel 13» (92,5 BPM, desfase 0,02 s).
// Cada evento cae en un acento real de la canción (medido con análisis de audio).
// Para editar el nivel basta con cambiar esta lista: «b» es el pulso (0 a 128).
//
// Estructura de la canción:
//   0–15 intro tranquila · 16–27 crece · 28–31 subida · 32–95 explosión
//   (golpes fuertes en 32 y 64, contratiempos sincopados) · 96–119 pausa con
//   un bombo cada 8 pulsos · 120–127 subida final.
//
// Tipos de evento:
//   jump    salto en el suelo; obs: 'one' (1 obstáculo), 'two' (2), 'gap' (hueco), 'three' (3 + doble salto)
//   double  hueco largo: salto en b y doble salto en b+0,5
//   ring    salto en b y anillo de ritmo en b+0,5 sobre un hueco muy largo
//   spring  trampolín automático hacia una ruta alta con notas violetas
//   cjump / cring   lo mismo, corriendo por el techo (gravedad invertida)
//   portal  kind: 'speed' (aviso de velocidad), 'flip'/'unflip' (gravedad), 'fly'/'land' (vuelo)
//   fly     tramo de vuelo entre from y to (mantén para subir)
//   secretRing  anillo opcional (no se califica)
//   crystal     cristal secreto (hay 3)
// ============================================================================
window.LEVEL = {
  bpm: 92.5, offset: .02, endBeat: 128,
  speeds: [170, 186, 202, 218],                 // px por pulso en cada tramo
  sections: [
    {name: 'Nubes suaves',            sky: ['#c9c5e9', '#f5d6df', '#ffedd6'], aurora: ['#72cdb7', '#bb9bd5', '#edb4cb']},
    {name: 'Jardines del ritmo',      sky: ['#a9dccf', '#f6dccd', '#fff1d8'], aurora: ['#5fc2a4', '#f0b37e', '#f29bb4']},
    {name: 'Cristales en movimiento', sky: ['#aebbee', '#dccff3', '#f6e6f4'], aurora: ['#8fb4f0', '#c49be3', '#9ee3e0']},
    {name: 'El último impulso',       sky: ['#e9b4c8', '#f8cdb6', '#ffe7c0'], aurora: ['#f39a8f', '#f7c873', '#c79ae0']},
  ],
  // Acentos de la canción: destellos y pequeños golpes de cámara (potencia 0–1)
  accents: [[4, .3], [16, 1], [30.5, .35], [31, .3], [32, 1], [38, .29], [42, .29], [44, .29], [46, .29],
            [56.5, .31], [57.5, .3], [64, 1], [70, .32], [71.5, .29], [78, .29], [96, 1], [112, .3], [120, 1], [127.5, .32]],
  events: [
    // Tramo 1 · intro y subida (170 px/pulso)
    {t: 'jump', b: 8, obs: 'one'},
    {t: 'jump', b: 12, obs: 'one'},
    {t: 'jump', b: 16, obs: 'gap'},            // empieza a crecer la canción
    {t: 'jump', b: 18, obs: 'one'},
    {t: 'spring', b: 20},
    {t: 'crystal', b: 22.6, y: 238},           // secreto 1: salta desde la segunda isla de la ruta alta
    {t: 'double', b: 24},
    {t: 'jump', b: 28, obs: 'one'},
    {t: 'ring', b: 30},                        // el anillo cae en el golpe de bombo 30,5
    // Tramo 2 · la explosión (186 px/pulso)
    {t: 'portal', b: 32, kind: 'speed'},
    {t: 'jump', b: 34, obs: 'two'},
    {t: 'spring', b: 36},
    {t: 'double', b: 40},
    {t: 'jump', b: 44, obs: 'two'},
    {t: 'jump', b: 46, obs: 'gap'},
    {t: 'portal', b: 48, kind: 'fly'},
    {t: 'fly', from: 48, to: 56},              // contratiempos sincopados: notas en cada «y»
    {t: 'crystal', b: 51.9, y: 240},           // secreto 2: sube pegado al techo tras la columna
    {t: 'portal', b: 56, kind: 'land'},
    {t: 'jump', b: 57.5, obs: 'one'},          // acento a contratiempo
    {t: 'ring', b: 60},
    // Tramo 3 · cristales (202 px/pulso)
    {t: 'portal', b: 64, kind: 'speed'},
    {t: 'jump', b: 64.5, obs: 'one'},
    {t: 'jump', b: 66, obs: 'one'},
    {t: 'spring', b: 68},
    {t: 'jump', b: 72, obs: 'two'},
    {t: 'jump', b: 74, obs: 'one'},
    {t: 'portal', b: 76, kind: 'flip'},
    {t: 'cjump', b: 78, obs: 'two'},
    {t: 'cjump', b: 80, obs: 'one'},
    {t: 'cring', b: 82},
    {t: 'cjump', b: 85.5, obs: 'one'},
    {t: 'secretRing', b: 87},
    {t: 'crystal', b: 87.65, y: 350},          // secreto 3: toca el anillo escondido del techo
    {t: 'portal', b: 88, kind: 'unflip'},
    {t: 'double', b: 90},
    {t: 'jump', b: 94, obs: 'one'},
    // Tramo 4 · pausa y final (218 px/pulso)
    {t: 'portal', b: 96, kind: 'speed'},
    {t: 'jump', b: 96.5, obs: 'two'},
    {t: 'jump', b: 98.5, obs: 'one'},
    {t: 'ring', b: 100.5},
    {t: 'double', b: 104},
    {t: 'jump', b: 108, obs: 'three'},
    {t: 'spring', b: 112},
    {t: 'jump', b: 116, obs: 'one'},
    {t: 'jump', b: 118, obs: 'two'},
    {t: 'jump', b: 120, obs: 'two'},           // vuelve la energía
    {t: 'jump', b: 122, obs: 'gap'},
    {t: 'jump', b: 124, obs: 'one'},
    {t: 'ring', b: 126},                       // gran salto final hacia el portal
  ],
};
