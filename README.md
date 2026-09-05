# KP FIGHTER

Juego de lucha arcade para navegador. Portada → selección de luchador → selección de escenario → combate contra la máquina. Cada paso ocupa una sola pantalla.

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
- `Espacio`: pausar y reanudar; también funciona durante la introducción y entre rounds
- `Enter`: avanzar desde la portada y confirmar la selección

En teléfonos y tablets aparecen controles táctiles con soporte para varios dedos y un botón de pausa. El juego se presenta en horizontal: al iniciar solicita pantalla completa y orientación horizontal cuando el navegador lo permite. Si el teléfono mantiene la orientación vertical, el tablero gira para aprovechar el lado largo de la pantalla. Al girar el dispositivo, el diseño se adapta automáticamente.

Mantener agacharse y cubrirse permite defender los ataques bajos. La guardia protege de frente: los golpes normales bloqueados no hacen daño y los proyectiles bloqueados quitan 1 de vida. Agacharse también permite esquivar ataques altos.

El humo transporta a Blotta detrás del rival. Mantener izquierda o derecha al pulsarlo permite elegir esa dirección. Durante la desaparición no recibe golpes; reaparece con una breve recuperación.

La Tunki lanza flores con `L`. Con `H` salta hacia el rival y cae con un aplastamiento; si ya está en el aire, pasa directamente al descenso. Se puede esquivar alejándose o bloquear con guardia de pie. La guardia agachada no detiene este ataque desde arriba. En celular, el botón **APLASTAR** activa el mismo movimiento.

## Personajes

- **Sergio:** panzazo, patada voladora y proyectiles de asado o fernet.
- **Blotta:** golpes de karate, patada voladora, energía de karate y teletransporte con humo.
- **La Tunki:** proyectiles de flores, patadas y salto aplastante. Conserva la ropa negra y rosa y la panza prominente de su diseño.
- **Marechal:** alto y delgado, con sombrero de paja y atuendo blanco y azul. Camina, salta, golpea, patea, se agacha y se cubre con los controles básicos. Lanza rayos desde las manos con `L` o **PODER** en celular (35 de energía).

El rival se elige entre los demás luchadores y es controlado por la máquina. Cuando Blotta participa, al iniciar el combate lanza su desafío: “Te voy a echar”. Los tres rounds usan sus nuevas grabaciones: **Round 1**, **Round 2** y **Final Round**. El desempate muestra **FINAL ROUND**. Los títulos y “¡PELEA!” siguen los tiempos de voz de cada archivo; se precargan las tres grabaciones y respetan el silencio y la pausa. La configuración está en `ROUND_AUDIO`.

## Rounds y escenarios

Gana el primero en conseguir **dos rounds**: el combate puede terminar 2–0 o decidirse en el tercero. Cada round dura 60 segundos; al agotarse el tiempo, gana quien conserve más vida. Los empates, incluido un doble K.O., se repiten sin sumar victorias. El marcador muestra los rounds ganados junto a las barras.

El siguiente round empieza automáticamente después del resultado. Se reinician vida, energía, posiciones y efectos, manteniendo los mismos luchadores y escenario. La revancha reinicia el marcador con el mismo rival y escenario.

Después de elegir luchador se puede seleccionar **Patio Arcade**, **Galería Subterránea** o **Planta Newmont**, con vista previa, flechas/Enter o controles táctiles. Las dos imágenes aportadas se conservan en sus proporciones y se encuadran para la pantalla horizontal; el cartel de Newmont permanece visible. `Esc` o **VOLVER** regresa a la selección de personaje.

## Desarrollo

Sitio estático, sin dependencias. El motor avanza en pasos fijos de 1/120 s e interpola posiciones, transformaciones corporales y proyectiles. Las poses tienen transiciones breves; los pasos siguen la distancia recorrida y se invierten al retroceder. Los ataques tienen preparación, contacto y recuperación visual progresiva; se pueden almacenar entradas durante 180 ms y encadenar un golpe conectado con patada o especial.

Las hojas de ataques y movimiento incorporan caminar, agacharse, guardia, salto y posturas propias de cada luchador. Sergio y La Tunki tienen una contextura ancha y panza prominente en todos sus sprites. Los nombres, atributos y habilidades están en el catálogo `stats`; la portada no depende del plantel.

El impulso del salto normal aumentó un 25%, logrando aproximadamente un 55% más de altura. Los poderes tienen estelas, carga en las manos y destellos de impacto. Las patadas dejan arcos de movimiento; los saltos, aterrizajes y aplastamientos generan ondas y polvo. El asado y el fernet se dibujan con gráficos propios, consistentes en PC y celular. Los efectos tienen límites de cantidad y se detienen durante la pausa.

La escala de los luchadores se redujo un 10%, con zonas de contacto y efectos ajustados a su tamaño. El dibujado se adapta a la densidad de pantalla, conserva el arte original y añade iluminación suave y sombras de contacto. Las barras de vida llegan a los bordes del área de juego y tienen mayor grosor, también en el diseño horizontal de celular; el reloj queda encima del encuentro entre ambas.

Pruebas de lógica y entrada: `node --test tests/combat.test.cjs`.
