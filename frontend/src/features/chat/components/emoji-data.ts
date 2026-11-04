/** Emojis por categoría, con palabras clave en español para buscar. Formato: [emoji, 'nombre y sinónimos']. */
export type EmojiEntry = readonly [emoji: string, keywords: string];
export interface EmojiCategory { id: string; label: string; icon: string; emojis: EmojiEntry[] }

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'caras', label: 'Caras', icon: '😀', emojis: [
      ['😀', 'sonrisa feliz contento'], ['😃', 'sonrisa grande alegre'], ['😄', 'sonrisa ojos alegre'], ['😁', 'dientes sonrisa radiante'], ['😆', 'risa carcajada'],
      ['😅', 'sudor nervioso risa alivio'], ['🤣', 'carcajada suelo reir llorar'], ['😂', 'lagrimas risa reir'], ['🙂', 'sonrisa leve'], ['🙃', 'al reves ironia'],
      ['😉', 'guino complicidad'], ['😊', 'sonrojo timido feliz'], ['😇', 'angel inocente'], ['🥰', 'enamorado corazones amor'], ['😍', 'ojos corazon enamorado encanta'],
      ['🤩', 'estrellas asombro increible'], ['😘', 'beso corazon'], ['😗', 'beso'], ['😚', 'beso ojos cerrados'], ['😋', 'rico delicioso lengua'],
      ['😛', 'lengua'], ['😜', 'guino lengua broma'], ['🤪', 'loco divertido'], ['😝', 'lengua ojos cerrados'], ['🤗', 'abrazo'],
      ['🤭', 'mano boca secreto risita'], ['🤫', 'silencio shh secreto'], ['🤔', 'pensando duda hmm'], ['🤨', 'ceja duda escepticismo'], ['😐', 'neutral serio'],
      ['😑', 'sin expresion'], ['😶', 'sin boca callado'], ['😏', 'picardia sonrisa lado'], ['😒', 'fastidio aburrido'], ['🙄', 'ojos arriba fastidio'],
      ['😬', 'incomodo dientes'], ['😌', 'alivio tranquilo'], ['😔', 'triste pensativo'], ['😪', 'sueno cansado'], ['😴', 'dormir sueno zzz'],
      ['😷', 'mascarilla enfermo'], ['🤒', 'fiebre enfermo termometro'], ['🤕', 'venda herido'], ['🤢', 'nauseas asco'], ['🤧', 'estornudo resfriado'],
      ['🥵', 'calor sofocado'], ['🥶', 'frio helado'], ['🥴', 'mareado'], ['😵', 'mareo aturdido'], ['🤯', 'mente explota sorpresa'],
      ['🤠', 'vaquero'], ['🥳', 'fiesta celebracion cumpleanos'], ['😎', 'lentes gafas genial'], ['🤓', 'nerd estudioso'], ['🧐', 'monoculo revisar'],
      ['😕', 'confundido'], ['😟', 'preocupado'], ['🙁', 'triste leve'], ['😮', 'sorpresa boca abierta'], ['😯', 'asombro'],
      ['😲', 'impactado'], ['😳', 'sonrojado verguenza'], ['🥺', 'suplica ojitos tierno'], ['😦', 'angustia'], ['😧', 'angustiado'],
      ['😨', 'miedo'], ['😰', 'ansiedad sudor frio'], ['😥', 'triste alivio'], ['😢', 'llorar lagrima triste'], ['😭', 'llanto llorar mucho'],
      ['😱', 'grito miedo susto'], ['😖', 'frustrado'], ['😞', 'decepcionado'], ['😓', 'sudor frio cansancio'], ['😩', 'agotado'],
      ['😫', 'cansado harto'], ['🥱', 'bostezo aburrido'], ['😤', 'enojo resoplar'], ['😡', 'enojado furia'], ['😠', 'enfadado'],
      ['🤬', 'insultos groseria'], ['💀', 'calavera muerto'], ['💩', 'caca'], ['🤡', 'payaso'], ['👻', 'fantasma'],
      ['👽', 'extraterrestre alien'], ['🤖', 'robot'],
    ],
  },
  {
    id: 'gestos', label: 'Gestos y personas', icon: '👍', emojis: [
      ['👍', 'bien pulgar arriba ok aprobado de acuerdo'], ['👎', 'mal pulgar abajo'], ['👌', 'perfecto ok'], ['✌️', 'paz victoria'], ['🤞', 'dedos cruzados suerte'],
      ['🤟', 'te quiero'], ['🤘', 'rock'], ['🤙', 'llamame'], ['👈', 'izquierda senalar'], ['👉', 'derecha senalar'],
      ['👆', 'arriba senalar'], ['👇', 'abajo senalar'], ['☝️', 'uno dedo arriba'], ['✋', 'mano alto detener'], ['🤚', 'mano atras'],
      ['🖐️', 'mano abierta'], ['🖖', 'vulcano saludo'], ['👋', 'saludo hola adios'], ['🤝', 'acuerdo trato apreton'], ['🙏', 'gracias por favor rezar'],
      ['👏', 'aplausos bravo'], ['🙌', 'manos arriba celebrar'], ['👐', 'manos abiertas'], ['🤲', 'palmas juntas'], ['💪', 'fuerza musculo animo'],
      ['🦾', 'brazo robotico'], ['✍️', 'escribir firma'], ['🤳', 'selfie'], ['💅', 'unas'], ['🧠', 'cerebro mente'],
      ['👀', 'ojos mirar atento'], ['👁️', 'ojo'], ['👅', 'lengua'], ['👄', 'boca labios'], ['🫶', 'corazon manos carino'],
      ['🙋', 'levantar mano pregunta'], ['🙆', 'ok gesto'], ['🤷', 'no se hombros'], ['🤦', 'facepalm error'], ['🙇', 'reverencia disculpa'],
      ['💁', 'informacion'], ['🧑‍💻', 'programador computadora trabajo'], ['🧑‍💼', 'oficinista ejecutivo'], ['👩‍💼', 'ejecutiva'], ['👨‍💼', 'ejecutivo'],
      ['👷', 'obrero construccion'], ['🕵️', 'detective investigar'], ['🦸', 'superheroe'],
    ],
  },
  {
    id: 'corazones', label: 'Corazones y símbolos', icon: '❤️', emojis: [
      ['❤️', 'corazon rojo amor'], ['🧡', 'corazon naranja'], ['💛', 'corazon amarillo'], ['💚', 'corazon verde'], ['💙', 'corazon azul'],
      ['💜', 'corazon morado'], ['🖤', 'corazon negro'], ['🤍', 'corazon blanco'], ['🤎', 'corazon cafe'], ['💔', 'corazon roto'],
      ['❣️', 'exclamacion corazon'], ['💕', 'dos corazones'], ['💞', 'corazones girando'], ['💓', 'corazon latiendo'], ['💗', 'corazon creciendo'],
      ['💖', 'corazon brillante'], ['💘', 'flecha corazon cupido'], ['💝', 'corazon regalo'], ['💯', 'cien perfecto'], ['💢', 'enojo'],
      ['💥', 'explosion choque'], ['💫', 'mareo estrella'], ['💦', 'gotas agua sudor'], ['💨', 'viento rapido'], ['💬', 'mensaje dialogo'],
      ['💭', 'pensamiento'], ['💤', 'dormir'], ['✅', 'listo hecho correcto check aprobado'], ['❌', 'error cruz incorrecto cancelar'], ['❎', 'cruz verde'],
      ['⭕', 'circulo'], ['❗', 'exclamacion importante'], ['❓', 'pregunta duda'], ['‼️', 'doble exclamacion'], ['⚠️', 'advertencia cuidado alerta'],
      ['🚫', 'prohibido'], ['⛔', 'no pasar'], ['🔴', 'rojo circulo'], ['🟠', 'naranja circulo'], ['🟡', 'amarillo circulo'],
      ['🟢', 'verde circulo'], ['🔵', 'azul circulo'], ['🟣', 'morado circulo'], ['⚫', 'negro circulo'], ['⚪', 'blanco circulo'],
      ['➕', 'mas sumar'], ['➖', 'menos restar'], ['➡️', 'flecha derecha'], ['⬅️', 'flecha izquierda'], ['⬆️', 'flecha arriba'],
      ['⬇️', 'flecha abajo'], ['🔄', 'actualizar repetir'], ['🔔', 'campana notificacion aviso'], ['🔕', 'silencio campana'], ['⭐', 'estrella favorito'],
      ['🌟', 'estrella brillante'], ['✨', 'brillos magia nuevo'], ['🔥', 'fuego caliente genial'], ['⚡', 'rayo rapido energia'],
    ],
  },
  {
    id: 'trabajo', label: 'Trabajo y objetos', icon: '💼', emojis: [
      ['📎', 'clip adjunto'], ['📄', 'documento hoja pagina'], ['📃', 'documento enrollado'], ['📑', 'paginas marcadores'], ['📊', 'grafico barras estadistica'],
      ['📈', 'grafico sube crecimiento'], ['📉', 'grafico baja caida'], ['📋', 'portapapeles lista'], ['📁', 'carpeta'], ['📂', 'carpeta abierta'],
      ['🗂️', 'archivo fichas'], ['🗃️', 'archivador'], ['🗄️', 'gabinete archivo'], ['📝', 'nota escribir memo'], ['✏️', 'lapiz'],
      ['🖊️', 'boligrafo'], ['📌', 'chincheta fijar importante'], ['📍', 'ubicacion lugar'], ['📅', 'calendario fecha'], ['📆', 'calendario'],
      ['🗓️', 'agenda calendario'], ['⏰', 'alarma reloj hora'], ['⏳', 'espera reloj arena plazo'], ['⌛', 'reloj arena'], ['🕒', 'hora reloj'],
      ['💼', 'maletin trabajo'], ['🏢', 'oficina edificio empresa'], ['🏦', 'banco'], ['💰', 'dinero bolsa'], ['💵', 'billete dolar dinero'],
      ['💳', 'tarjeta credito pago'], ['🧾', 'recibo factura comprobante'], ['🧮', 'abaco calculo'], ['📞', 'telefono llamada'], ['📱', 'celular movil'],
      ['💻', 'computadora laptop'], ['🖥️', 'computadora escritorio pc'], ['⌨️', 'teclado'], ['🖨️', 'impresora imprimir'], ['📧', 'correo email'],
      ['📨', 'correo entrante'], ['📩', 'correo flecha'], ['📤', 'enviar bandeja salida'], ['📥', 'recibir bandeja entrada'], ['📦', 'paquete caja envio'],
      ['🔒', 'candado cerrado seguro privado'], ['🔓', 'candado abierto'], ['🔑', 'llave clave'], ['🛠️', 'herramientas arreglar'], ['🔧', 'llave inglesa'],
      ['⚙️', 'engranaje configuracion'], ['🔍', 'buscar lupa'], ['💡', 'idea bombilla foco'], ['🎯', 'objetivo meta diana'], ['🏆', 'trofeo premio ganador'],
      ['🥇', 'medalla oro primero'], ['🎉', 'fiesta celebracion confeti'], ['🎊', 'confeti'], ['🎁', 'regalo'], ['🚀', 'cohete lanzamiento rapido'],
      ['✈️', 'avion viaje'], ['🚗', 'auto carro'], ['🚌', 'bus'], ['🏠', 'casa hogar'], ['🌎', 'mundo tierra'],
    ],
  },
  {
    id: 'comida', label: 'Comida y bebida', icon: '🍕', emojis: [
      ['☕', 'cafe taza'], ['🍵', 'te'], ['🥤', 'refresco vaso'], ['🍺', 'cerveza'], ['🍻', 'brindis cervezas'],
      ['🥂', 'brindis copas'], ['🍷', 'vino'], ['🍽️', 'plato cubiertos'], ['🍕', 'pizza'], ['🍔', 'hamburguesa'],
      ['🌭', 'hot dog'], ['🌮', 'taco'], ['🥪', 'sandwich'], ['🍗', 'pollo'], ['🥩', 'carne'],
      ['🍟', 'papas fritas'], ['🥗', 'ensalada'], ['🍝', 'pasta espagueti'], ['🍚', 'arroz'], ['🍜', 'sopa fideos'],
      ['🥘', 'guiso paella'], ['🍎', 'manzana'], ['🍌', 'banana platano'], ['🍇', 'uvas'], ['🍉', 'sandia'],
      ['🍓', 'frutilla fresa'], ['🥑', 'palta aguacate'], ['🥕', 'zanahoria'], ['🌽', 'maiz choclo'], ['🍞', 'pan'],
      ['🧀', 'queso'], ['🍰', 'pastel torta'], ['🎂', 'torta cumpleanos'], ['🍫', 'chocolate'], ['🍩', 'dona'],
      ['🍪', 'galleta'], ['🍦', 'helado'],
    ],
  },
  {
    id: 'naturaleza', label: 'Animales y naturaleza', icon: '🐶', emojis: [
      ['🐶', 'perro'], ['🐱', 'gato'], ['🐭', 'raton'], ['🐰', 'conejo'], ['🦊', 'zorro'],
      ['🐻', 'oso'], ['🐼', 'panda'], ['🦁', 'leon'], ['🐯', 'tigre'], ['🐮', 'vaca'],
      ['🐷', 'cerdo'], ['🐸', 'rana'], ['🐵', 'mono'], ['🙈', 'mono no ver'], ['🙉', 'mono no oir'],
      ['🙊', 'mono no hablar'], ['🐔', 'gallina'], ['🐧', 'pinguino'], ['🐦', 'pajaro'], ['🦅', 'aguila'],
      ['🦉', 'buho'], ['🐝', 'abeja'], ['🦋', 'mariposa'], ['🐢', 'tortuga lento'], ['🐍', 'serpiente'],
      ['🐙', 'pulpo'], ['🐬', 'delfin'], ['🐳', 'ballena'], ['🦈', 'tiburon'], ['🌱', 'planta brote'],
      ['🌳', 'arbol'], ['🌴', 'palmera'], ['🌵', 'cactus'], ['🌸', 'flor cerezo'], ['🌹', 'rosa'],
      ['🌻', 'girasol'], ['🍀', 'trebol suerte'], ['🌈', 'arcoiris'], ['☀️', 'sol'], ['🌙', 'luna noche'],
      ['⛅', 'nube sol'], ['☁️', 'nube'], ['🌧️', 'lluvia'], ['⛈️', 'tormenta'], ['❄️', 'nieve frio'],
      ['🌊', 'ola mar'],
    ],
  },
  {
    id: 'actividades', label: 'Actividades', icon: '⚽', emojis: [
      ['⚽', 'futbol pelota'], ['🏀', 'basquet'], ['🏈', 'futbol americano'], ['⚾', 'beisbol'], ['🎾', 'tenis'],
      ['🏐', 'voleibol'], ['🏓', 'ping pong'], ['🎱', 'billar'], ['🥊', 'boxeo'], ['🏊', 'natacion'],
      ['🚴', 'ciclismo bicicleta'], ['🏃', 'correr'], ['🧘', 'meditar yoga'], ['🎮', 'videojuego control'], ['🎲', 'dado juego'],
      ['♟️', 'ajedrez'], ['🎯', 'dardos objetivo'], ['🎵', 'musica nota'], ['🎶', 'musica notas'], ['🎤', 'microfono cantar'],
      ['🎧', 'audifonos'], ['🎸', 'guitarra'], ['🎬', 'cine claqueta'], ['🎨', 'arte pintura'], ['📚', 'libros estudiar'],
      ['📖', 'libro abierto leer'], ['🎓', 'graduacion birrete'], ['🏖️', 'playa vacaciones'], ['⛺', 'campamento'], ['🗺️', 'mapa viaje'],
    ],
  },
];

/** Todos los emojis con su categoría, para buscar sin importar tildes ni mayúsculas. */
export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function searchEmojis(query: string): EmojiEntry[] {
  const q = plain(query);
  if (!q) return [];
  const seen = new Set<string>();
  return ALL_EMOJIS.filter(([e, k]) => {
    if (seen.has(e) || !plain(k).includes(q)) return false;
    seen.add(e);
    return true;
  });
}
