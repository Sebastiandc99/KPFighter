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


## Barras de vida y dificultad

Las barras de vida son aproximadamente el doble de gruesas, con espacio para el puntaje y los controles. La CPU decide cada 110–250 ms, detecta proyectiles desde un poco más lejos, se defiende con mayor frecuencia y elige mejor el alcance de los ataques. Puede usar patadas bajas contra una guardia de pie; sigue teniendo probabilidades de equivocarse. Solo cambia el rival automático del modo individual.

Daño normal: puño/panzazo 3, patada baja 4, patada 4 y gancho 5. Los poderes dañinos quitan más vida: carne 10, botella 12, energía/rayo 13, flores 14 y aplastamiento 18. Este balance se aplica a ambos jugadores y a la CPU.


## Facu · Bigote boomerang

Facu es el quinto luchador y está disponible para ambos jugadores y la CPU. Conserva pelo oscuro, piel clara, contextura delgada, buzo negro, pantalón oscuro y zapatillas de su referencia. Tiene todas las acciones básicas, incluido el gancho agachado.

Con L (1P), 9 (2P) o PODER en celular lanza su bigote por 35 de energía. Sale físicamente del rostro, gira y vuelve al alcanzar su recorrido, un borde o al conectar/bloquearse. Sigue al dueño incluso si se mueve, salta o se agacha. Solo hace daño una vez por lanzamiento (13) y no permite otro bigote hasta recuperarlo. La cara se dibuja sin bigote durante el vuelo y lo recupera al atraparlo. Fin de round y salida limpian el proyectil.

El sonido de boomerang es un efecto procedural de aire giratorio (assets/boomerang.wav), con una voz independiente por lanzamiento. Comienza al ejecutar el poder, se pausa con la pelea y termina al recuperar el bigote. El ranking compartido admite victorias de Facu.

El atlas conserva las caras afeitadas y el motor compone el bigote como una pieza independiente antes de mezclar poses. El fondo de exportación se elimina al cargar cada cuadro, sin modificar las siluetas. Imágenes generadas a partir de la referencia de Facu: atlas de 12 posturas, rostro sin bigote, ropa negra y dirección derecha; retrato con bigote prominente y fondo azul.

## Flor y barras finas

Flor es petiza y esbelta, con uniforme de hockey y palo presente en las doce poses. Seleccionable en ambos modos, incluyendo espejo. L / 9 / PODER lanza una bocha recta (35 de energía, 13 de daño; bloqueo frontal reduce a 1). El sonido de palo comienza al ejecutar el poder, conserva un transitorio audible a corta distancia y respeta pausa, impacto, borde y fin de round. Sus victorias se guardan en el ranking global.

Barras de vida reducidas a un tercio del grosor anterior, conservando su longitud. Barra de poder de 3–5 px. Se mantiene el daño reducido de golpes básicos.

Arte generado con la herramienta integrada: assets/flor-atlas-v1.png y assets/flor-portrait-v1.png. Brief: Flor de la referencia, baja y esbelta, rubia, camiseta negra con franja blanca, shorts verdes, medias rayadas, palo en todas las poses; atlas de 12 poses y retrato arcade. El render recorta siluetas completas y elimina el fondo del atlas sin modificar el PNG original. Sonido assets/hockey-hit.wav sintetizado como golpe seco de palo.

## Evasión libre y torneo individual

- Evasión sin energía: **O** para 1P, **5** o numpad 5 para 2P, botón **RODAR** en celular. Avanza atravesando al rival; desde un borde busca el centro. Dura 0,5 s, con protección durante el giro y recuperación vulnerable. Puede repetirse al terminar; no usa enfriamiento de poderes. En el aire o durante un golpe recibido/ataque espera a volver a una postura disponible.
- Blotta evade con **HUMO**, gratis y sin enfriamiento de poder. También conserva H / 6 como atajo. La Tunki conserva APLASTAR como poder separado.
- Individual: torneo de cinco rivales distintos (todos excepto el elegido), orden aleatorio sin repetición, cada pelea al mejor de tres. Tras dos rounds ganados avanza automáticamente. Dificultad NORMAL → MEDIA → AVANZADA → DIFÍCIL → EXPERTO, con mejores tiempos de reacción, defensa, movimiento y decisiones.
- Puntaje acumulado: golpes, defensa y bonos de round multiplicados por 1 / 1,25 / 1,5 / 1,75 / 2 según rival. Cada victoria agrega 2.000 × número de rival además del bono normal de pelea; al completar todos se agregan 10.000, sujetos al multiplicador del nivel. El marcador muestra rival, dificultad y multiplicador.
- GAME OVER y registro al terminar el torneo o perder una pelea. Se guarda el puntaje del jugador humano incluso al perder, para valorar cuánto avanzó; luego se muestra automáticamente el ranking global. Dos jugadores conserva una única pelea al mejor de tres y registra al ganador.

Ajuste de dificultad inicial: el primer rival toma decisiones cada 0,38–0,63 s, actúa con mayor frecuencia, se mueve más rápido y defiende/usa poderes más que antes. Los cinco niveles aumentan gradualmente en todas esas capacidades; el nivel experto conserva su exigencia.

## Patadas aéreas y volea

Saltar + patada usa una pose con pierna diagonal hacia abajo y una zona de golpe inclinada: alcanza rivales por debajo, no por encima; se bloquea de pie. Atrás + patada, desde el suelo y sin agacharse, ejecuta una volea con giro. Atrás se interpreta respecto al rival, en ambos lados y para ambos jugadores. En el aire prevalece la patada diagonal; agachado se mantiene la patada baja. Ambas nuevas patadas hacen 4 de daño y usan el sonido general existente. Controles idénticos en teclado y multitouch.

Se generaron dos atlases de poses con la herramienta integrada: assets/kicks-classic-a-v1.png y assets/kicks-classic-b-v1.png. Brief: patada aérea con pierna extendida diagonal hacia abajo y volea con torso girado, conservando las seis identidades y prendas; Flor siempre con palo y Facu sin bigote en la base, compuesto por el motor según el estado de su boomerang. El motor recorta las siluetas completas y conserva los originales.

La dificultad inicial sube nuevamente: intervalo de decisión 0,30–0,50 s, mayor actividad y defensa. Los niveles siguientes mantienen una progresión creciente hasta experto.

Audio KO: grabación del usuario convertida a MP3 para compatibilidad. Comienza con el cartel K.O. en cada round ganado por nocaut, omitiendo 179 ms de silencio inicial; cartel y voz duran 1,24 s. Sin repetición en tiempo agotado o empate. Pausa/silencio conservan la posición; salir o comenzar round limpia la voz.

## Actualización 2026-09-07

- Galante: uniforme minero, entrada comiendo un sánguche, caminata más lenta, látigo de alcance completo con sonido y evasión de humo sin energía.
- Torneo de seis rivales con dificultad progresiva más alta desde el primero.
- CPU con escapes de esquina y escenario ampliado con cámara lateral.
- Verificación: `node --test tests/combat.test.cjs` (74 pruebas).

### Corrección visual de Galante

Sprites ilustrados con sombreado arcade para los 16 cuadros de combate, movimiento y entrada. Selección con el cuerpo completo recortado y fondo transparente, sin el póster, estadísticas ni carteles.

Arte generado con la herramienta de imágenes integrada. Brief: conservar cara, casco blanco, anteojos, barba, panza, uniforme Newmont amarillo y azul con reflectivos; igualar el detalle del sprite de Sergio; producir poses separadas sin textos ni escenario. Las hojas originales se normalizan con `scripts/build-galante-assets.cjs` (requiere Sharp), que convierte el fondo de croma en transparencia y organiza las poses en celdas de 270 px.

### Ajustes de escenario, selección y Galante — 2026-09-07

- Tercer escenario renombrado a Planta minera, con el logo retirado de la fachada.
- Eliminada la frase de entrada de Blotta.
- Selección simétrica en dos filas de cuatro: siete luchadores y elección al azar. Flechas verticales y horizontales disponibles.
- Galante basado en la nueva referencia caricaturesca, con la altura y escala de Sergio, uniforme sin marcas, látigo continuo de dos puntas con pinches y nuevo sonido de barrido, chasquido y cola metálica.
- Arte generado con la herramienta integrada; las poses se normalizan con `scripts/build-galante-assets.cjs SOURCE_SHEET`. Audio reproducible con `python3 scripts/build-whip-audio.py`.

### El Padrino
- Octavo luchador, disponible para ambos jugadores y como rival del torneo. Controles normales, incluyendo rodada gratuita.
- Poder: perro salchicha que viaja horizontalmente en la dirección del ataque, con estela naranja; puede bloquearse o esquivarse. Consume la misma energía que los demás poderes.
- Audio: primer ladrido del archivo proporcionado `Ladrido perro.m4a`, recortado desde 0.445 s durante 0.58 s, normalizado y con salida suave. El impacto cercano conserva medio segundo audible; pausa y salida lo detienen.
- Arte generado con la herramienta integrada, usando la referencia del usuario: «atlas arcade 4×4 de El Padrino con esmoquin negro, moño, rosa roja, 15 poses completas mirando a la derecha y un perro salchicha volando; fondo magenta uniforme, sin textos ni escenario». Normalización: `node scripts/build-padrino-assets.cjs SOURCE_SHEET`. Los recursos finales están en `assets/padrino-*-v1.webp` y `assets/padrino-bark-v1.wav`.
- Selección simétrica de ocho personajes en dos filas de cuatro; elección aleatoria debajo. El torneo incluye siete rivales y un último nivel de dificultad progresiva.

Rostro de El Padrino v2: herramienta integrada de edición de imágenes, usando el recorte facial proporcionado como identidad. Instrucción: modificar exclusivamente las cabezas de las 15 poses, cara más frontal, ojos claros, rostro ancho y sonrisa fieles a la referencia; conservar cuerpos y cuadrícula. Recursos activos: `assets/padrino-atlas-v2.webp` y `assets/padrino-portrait-v2.webp`.
