# KP FIGHTER

Juego de lucha arcade para navegador. Portada → modo 1/2 jugadores → selección de luchadores → selección de escenario → combate → ganador y GAME OVER → nombre → ranking general. Cada paso ocupa una sola pantalla.

## Jugar

La versión publicada está disponible en:

**https://sebastiandc99.github.io/KPFighter/**

## Controles

- `A` / `D` o flechas: mover
- `W` / flecha arriba: salto sin atacar
- `S` / flecha abajo (mantener): agacharse
- `I` / `Shift` (mantener): cubrirse
- `J`: golpe / panzazo; manteniendo `S` o flecha abajo, gancho ascendente
- `K`: patada voladora; agachado, patada baja
- `L`: proyectil especial (35 de energía)
- `H`: teletransporte de Blotta o salto aplastante de La Tunki (30 de energía)
- `Espacio`: pausar y reanudar; también funciona durante la introducción y entre rounds
- `Enter`: avanzar desde la portada y confirmar la selección

En teléfonos y tablets aparecen controles táctiles con soporte para varios dedos y un botón de pausa. El juego se presenta en horizontal: al iniciar solicita pantalla completa y orientación horizontal cuando el navegador lo permite. Si el teléfono mantiene la orientación vertical, el tablero gira para aprovechar el lado largo de la pantalla. Al girar el dispositivo, el diseño se adapta automáticamente.

Los cuatro luchadores realizan un **gancho ascendente** al mantener agacharse y pulsar puño (`S` + `J`, o **AGACHARSE** + **GOLPE** en celular). Tiene postura propia, puede alcanzar a un rival en el aire y lo levanta al conectar. Se puede bloquear de frente y no consume energía.

Mantener agacharse y cubrirse permite defender los ataques bajos. La guardia protege de frente: los golpes normales bloqueados no hacen daño y los proyectiles bloqueados quitan 1 de vida. Agacharse también permite esquivar ataques altos.

El humo transporta a Blotta detrás del rival. Mantener izquierda o derecha al pulsarlo permite elegir esa dirección. Durante la desaparición no recibe golpes; reaparece con una breve recuperación.

La Tunki lanza flores con `L`. Con `H` salta hacia el rival y cae con un aplastamiento; si ya está en el aire, pasa directamente al descenso. Se puede esquivar alejándose o bloquear con guardia de pie. La guardia agachada no detiene este ataque desde arriba. En celular, el botón **APLASTAR** activa el mismo movimiento.

## Personajes

- **Sergio:** panzazo, patada voladora y proyectiles de asado o fernet.
- **Blotta:** golpes de karate, patada voladora, energía de karate y teletransporte con humo.
- **La Tunki:** proyectiles de flores, patadas y salto aplastante. Conserva la ropa negra y rosa y la panza prominente de su diseño.
- **Marechal:** alto y delgado, con sombrero de paja y atuendo blanco y azul. Camina, salta, golpea, patea, se agacha y se cubre con los controles básicos. Lanza rayos desde las manos con `L` o **PODER** en celular (35 de energía).

En 1 jugador, el rival se elige entre los demás luchadores y lo controla la máquina. En 2 jugadores cada participante elige su personaje, incluso el mismo que el rival, y ambos juegan en el mismo dispositivo. Cuando Blotta participa, al iniciar el combate lanza su desafío: “Te voy a echar”. Los tres rounds usan sus nuevas grabaciones: **Round 1**, **Round 2** y **Final Round**. El desempate muestra **FINAL ROUND**. Los títulos y “¡PELEA!” siguen los tiempos de voz de cada archivo; se precargan las tres grabaciones y respetan el silencio y la pausa. La configuración está en `ROUND_AUDIO`.

## Rounds y escenarios

Gana el primero en conseguir **dos rounds**: el combate puede terminar 2–0 o decidirse en el tercero. Cada round dura 60 segundos; al agotarse el tiempo, gana quien conserve más vida. Los empates, incluido un doble K.O., se repiten sin sumar victorias. El marcador muestra los rounds ganados junto a las barras.

El siguiente round empieza automáticamente después del resultado. Se reinician vida, energía, posiciones y efectos, manteniendo los mismos luchadores y escenario. Después del ranking, Nueva partida vuelve a la elección del modo y reinicia los puntajes.

Después de elegir luchador se puede seleccionar **Patio Arcade**, **Galería Subterránea** o **Planta Newmont**, con vista previa, flechas/Enter o controles táctiles. Las dos imágenes aportadas se conservan en sus proporciones y se encuadran para la pantalla horizontal; el cartel de Newmont permanece visible. `Esc` o **VOLVER** regresa a la selección de personaje.

## Desarrollo

Sitio estático, sin dependencias. El motor avanza en pasos fijos de 1/120 s e interpola posiciones, transformaciones corporales y proyectiles. Las poses tienen transiciones breves; los pasos siguen la distancia recorrida y se invierten al retroceder. Los ataques tienen preparación, contacto y recuperación visual progresiva; se pueden almacenar entradas durante 180 ms y encadenar un golpe conectado con patada o especial.

Las hojas de ataques y movimiento incorporan caminar, agacharse, guardia, salto y posturas propias de cada luchador. Sergio y La Tunki tienen una contextura ancha y panza prominente en todos sus sprites. Los nombres, atributos y habilidades están en el catálogo `stats`; la portada no depende del plantel.

El impulso del salto normal aumentó un 25%, logrando aproximadamente un 55% más de altura. Los poderes tienen estelas, carga en las manos y destellos de impacto. Las patadas dejan arcos de movimiento; los saltos, aterrizajes y aplastamientos generan ondas y polvo. El asado y el fernet se dibujan con gráficos propios, consistentes en PC y celular. Los efectos tienen límites de cantidad y se detienen durante la pausa.

La escala de los luchadores se redujo un 10%, con zonas de contacto y efectos ajustados a su tamaño. El dibujado se adapta a la densidad de pantalla, conserva el arte original y añade iluminación suave y sombras de contacto. Las barras de vida llegan a los bordes del área de juego y tienen mayor grosor, también en el diseño horizontal de celular; el reloj queda encima del encuentro entre ambas.

Pruebas de lógica y entrada: `node --test tests/combat.test.cjs`.

## Sonidos de combate

Los golpes de puño, ganchos y patadas usan **Golpe general**. El panzazo de Sergio usa **Panzazo Sergio**, aunque no alcance al rival. Los rayos de Marechal usan **Poder rayo** desde que salen de las manos; el asado de Sergio usa **Poder sergio carne** desde que se lanza. Cada ataque controla su audio: se corta al conectar, bloquearse, terminar el movimiento o tocar el borde visible. Los proyectiles mantienen el sonido durante todo su recorrido, aunque el luchador ya haya terminado la animación de lanzamiento.

Los audios respetan pausa, cambio de pestaña, silencio, interrupciones y fin de round. Las voces de ataques simultáneos son independientes. Se omite el silencio inicial medido de los archivos para que los golpes cortos se escuchen a tiempo.


## Dos jugadores, puntaje y ranking general

En PC, el Jugador 1 usa WASD, J/K/L, I y H. El Jugador 2 usa flechas, 7/8/9 para golpe/patada/poder, 0 para cubrirse y 6 para su habilidad. También puede usar el teclado numérico: 1/2/3 para ataques, 0 para cubrirse y 4 para habilidad. Espacio pausa para ambos.

En el mismo celular, cada jugador tiene su propio grupo de controles compactos en una esquina inferior. Los contactos se identifican por dedo y jugador; cancelar un contacto no suelta los del rival. Se reserva espacio debajo del escenario y se prioriza horizontal.

El puntaje se acumula durante toda la pelea: 10 puntos por vida realmente quitada, 25 por bloqueo, 1.000 por round ganado más 5 por segundo restante y 10 por vida conservada; ganar la pelea suma 2.000. Los fallos no suman. Cada jugador ve su propio puntaje.

Al conseguir dos rounds se muestra al ganador, luego GAME OVER y el formulario de nombre. El resultado se guarda por Internet en una base de datos compartida y permanente; no depende del navegador ni de almacenamiento local. Tras guardar, se carga automáticamente todo el ranking, ordenado por puntaje descendente. Si falla la conexión, se conserva el nombre y se permite reintentar sin duplicar el registro. Si gana la CPU, se muestra el ranking sin registrar un nombre humano. También se consulta desde la portada.

Servicio: https://kp-fighter-ranking.sebastiandc99.chatgpt.site/api/ranking. Es un ranking recreativo: valida datos y evita duplicados por partida, pero no verifica en servidor toda la simulación de combate. El nombre ingresado y el puntaje son públicos. La tabla tiene desplazamiento y carga automáticamente todas las páginas del historial.

La pausa incluye Continuar y Salir al menú principal sin recargar. Congela reloj, movimientos, animaciones, proyectiles y audio; salir descarta la partida actual.

## Música y poderes a corta distancia

**Musica seleccion de personajes** se repite durante ambas selecciones. Al iniciar una pelea se elige aleatoriamente **Sonido fighter 1** o **Sonido fighter 2**, en bucle hasta terminar el encuentro, incluidos los intervalos entre rounds. La música baja durante los anuncios y respeta pausa y silencio.

**Flores tunki** acompaña el proyectil de La Tunki. Los sonidos de flores, rayo y carne comienzan al ejecutar el poder, antes de recorrer distancia. Al impactar se detienen; si el impacto fue prácticamente instantáneo se permite únicamente un transitorio mínimo de 80 ms para que resulte audible. Se omite el silencio inicial y cada voz tiene su propio ciclo de vida. Pausar o salir detiene también ese transitorio y los sonidos arcade sintetizados.


## Ranking arcade y mezcla de audio

El ranking usa un escenario de cubierta nocturna inspirado en la referencia, sin paneles ni celdas coloreadas. El título RANKING y las filas doradas pixeladas tienen sombra azul; el orden visual es puesto (1ST, 2ND...), puntaje sin separadores y nombre completo. Los registros siguen siendo globales y se puede desplazar todo el historial. Las opciones del pie son texto sin botones rellenos.

La fuente KP Arcade Score, con remates y contornos de píxeles, se deriva de DejaVu Serif Bold; su licencia se incluye en assets/fonts. El script scripts/build-ranking-font.py permite regenerarla con Pillow y FontTools.

La grabación nueva de selección se sirve como assets/seleccion-v2.mp3 y se repite durante ambas selecciones. La música de pelea bajó de 0,48 a 0,36; la selección de 0,55 a 0,42. Rayos, carne y flores subieron de 1 a 1,35; también se reforzaron los efectos sintetizados de energía y humo. Los golpes mantienen su volumen reducido y la sincronización permanece igual.
