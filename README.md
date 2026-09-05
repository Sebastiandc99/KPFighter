# KP FIGHTER

Juego de lucha arcade para navegador. Portada → selección de luchador → combate contra la máquina, en una sola pantalla.

## Jugar

La versión publicada está disponible en:

**https://sebastiandc99.github.io/KPFighter/**

## Controles

- `A` / `D` o flechas: mover
- `W` / flecha arriba: salto sin atacar
- `S` / flecha abajo (mantener): agacharse
- `I` / `Shift` (mantener): cubrirse
- `J`: golpe / panzazo
- `K`: patada voladora; agachado, patada baja
- `L`: proyectil especial (35 de energía)
- `H`: teletransporte de Blotta o salto aplastante de La Tunki (30 de energía)
- `Espacio`: pausar y reanudar; también funciona durante la introducción
- `Enter`: avanzar desde la portada y confirmar la selección

En teléfonos y tablets aparecen controles táctiles con soporte para varios dedos y un botón de pausa. Se puede jugar en vertical; horizontal deja más espacio para ver el escenario.

Mantener agacharse y cubrirse permite defender los ataques bajos. La guardia protege de frente: los golpes normales bloqueados no hacen daño y los proyectiles bloqueados quitan 1 de vida. Agacharse también permite esquivar ataques altos.

El humo transporta a Blotta detrás del rival. Mantener izquierda o derecha al pulsarlo permite elegir esa dirección. Durante la desaparición no recibe golpes; reaparece con una breve recuperación.

La Tunki lanza flores con `L`. Con `H` salta hacia el rival y cae con un aplastamiento; si ya está en el aire, pasa directamente al descenso. Se puede esquivar alejándose o bloquear con guardia de pie. La guardia agachada no detiene este ataque desde arriba. En celular, el botón **APLASTAR** activa el mismo movimiento.

## Personajes

- **Sergio:** panzazo, patada voladora y proyectiles de asado o fernet.
- **Blotta:** golpes de karate, patada voladora, energía de karate y teletransporte con humo.
- **La Tunki:** proyectiles de flores, patadas y salto aplastante. Conserva la ropa negra y rosa y la panza prominente de su diseño.

El rival se elige entre los demás luchadores y es controlado por la máquina. Cuando Blotta participa, antes del combate lanza su desafío: “Te voy a echar”.

## Desarrollo

Sitio estático, sin dependencias. El motor avanza en pasos fijos de 1/120 s y dibuja posiciones interpoladas. Los ataques tienen preparación, contacto y recuperación; se pueden almacenar entradas durante 180 ms y encadenar un golpe conectado con patada o especial.

Las hojas de ataques y movimiento incorporan caminar, agacharse, guardia, salto y posturas propias de cada luchador. Sergio y La Tunki tienen una contextura ancha y panza prominente en todos sus sprites. Los nombres, atributos y habilidades están en el catálogo `stats`; la portada no depende del plantel.

Pruebas de lógica y entrada: `node --test tests/combat.test.cjs`.
