// ---------------------------------------------------------------------------
// Horario de la tienda.
//
//   GET /api/store/schedule
//
// El endpoint publica HECHOS, no frases: `isOpen`, la hora de cierre del turno en
// curso, la proxima apertura y los siete dias con sus turnos. Redactar el estado y
// agrupar los dias es presentacion, y la presentacion es de la tienda — de ahi
// scheduleLabel() y formatShifts().
//
// Todo se resuelve en la zona de la tienda: el reloj del visitante no es el de
// Cancun, y de eso depende que "abre a las 09:00" sea hoy o manana.
// ---------------------------------------------------------------------------

const STORE_TIME_ZONE = 'America/Cancun';

/** Lunes = 1 … domingo = 7, como ISO-8601. */
const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/**
 * El ano EN LA TIENDA. Lo pide el aviso de derechos del pie, que no puede
 * escribirse a mano: envejeceria solo y nadie se acuerda de un numero que solo
 * miente una vez al ano.
 *
 * Vive aqui porque aqui vive la zona de la tienda. El servidor corre en UTC, asi
 * que las primeras cinco horas del 1 de enero adelantarian un ano que en Cancun
 * todavia no empezo.
 */
export function storeYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric' }).format(now),
  );
}

export interface ScheduleShift {
  start: string;
  end: string;
  /** El turno cierra al dia siguiente. La base no valida el orden de las horas. */
  crossesMidnight?: boolean;
}

export interface ScheduleDay {
  dayOfWeek?: number;
  name: string;
  /** Vacio es "cerrado", y llega vacio a proposito: un dia que falta obliga a adivinar. */
  shifts: ScheduleShift[];
}

export interface StoreSchedule {
  /** `null` es "no se sabe", que no es lo mismo que cerrado. */
  isOpen: boolean | null;
  /** Hora de cierre del turno en curso. `null` cerrado, o turno de 24 h. */
  closesAt: string | null;
  /** Proxima apertura. `null` si esta abierto o si no hay ningun turno. */
  opensAt: { dayOfWeek: number; time: string; inMinutes: number } | null;
  /** Los siete dias, en orden ISO. Vacio cuando no hay horario. */
  days: ScheduleDay[];
}

/**
 * Forma que llega por la API. Los tres ultimos campos son del contrato anterior:
 * ver normalizeSchedule().
 */
interface RawSchedule extends Partial<StoreSchedule> {
  label?: string | null;
  hours?: Array<{ days: string; shifts: string[] }>;
}

/**
 * Normaliza la respuesta al contrato vigente.
 *
 * TRANSITORIO: staging todavia sirve el contrato anterior —`label` y `hours`, con
 * los dias ya agrupados y los turnos como `"09:00-23:00"`—, asi que se traduce
 * para no quedarse sin horario mientras se despliega el nuevo. En cuanto la API
 * devuelva `days`, esta rama y `RawSchedule.hours` se pueden borrar.
 */
export function normalizeSchedule(raw: RawSchedule): StoreSchedule {
  if (raw.days) {
    return {
      isOpen: raw.isOpen ?? null,
      closesAt: raw.closesAt ?? null,
      opensAt: raw.opensAt ?? null,
      days: raw.days,
    };
  }

  const days: ScheduleDay[] = (raw.hours ?? []).map((group) => ({
    name: group.days,
    shifts: group.shifts.map((shift) => {
      const [start = '', end = ''] = shift.split('-');
      return { start, end };
    }),
  }));

  return { isOpen: raw.isOpen ?? null, closesAt: null, opensAt: null, days, ...legacy(raw) };
}

/** El `label` del contrato anterior, para no perderlo mientras siga llegando. */
function legacy(raw: RawSchedule): { legacyLabel?: string } {
  return raw.label ? { legacyLabel: raw.label } : {};
}

/** Minutos transcurridos del dia EN LA TIENDA, no en el navegador de quien mira. */
function storeMinutesOfDay(now: Date): number {
  const [hour, minute] = new Intl.DateTimeFormat('es-MX', {
    timeZone: STORE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);

  return (hour ?? 0) * 60 + (minute ?? 0);
}

/**
 * La tienda esta cerrada AHORA MISMO.
 *
 * `null` —sin horario, o con uno sin turnos— no es cerrado: es "no se sabe", y de
 * eso no se deduce nada. Lo consultan las pantallas para apagar el pedido, asi que
 * la pregunta se responde en un solo sitio.
 */
export function isClosed(schedule: StoreSchedule | null | undefined): boolean {
  return schedule?.isOpen === false;
}

/**
 * Cuando vuelve a abrir, en palabras: "hoy", "manana", "el lunes". `null` si no
 * hay proxima apertura —abierta ahora, o sin ningun turno configurado—.
 *
 * Los minutos deciden el dia, no el nombre: un turno del mismo dia de la semana
 * puede caer dentro de siete dias.
 */
export function nextOpeningDay(schedule: StoreSchedule, now = new Date()): string | null {
  const { opensAt } = schedule;
  if (!opensAt) return null;

  const offset = Math.floor((storeMinutesOfDay(now) + opensAt.inMinutes) / 1440);

  if (offset === 0) return 'hoy';
  if (offset === 1) return 'manana';

  return `el ${WEEKDAYS[opensAt.dayOfWeek - 1] ?? 'proximo dia'}`;
}

/**
 * El estado en una frase. `null` cuando no se sabe: entonces no se afirma nada.
 *
 *   Abierto hasta las 23:00
 *   Abierto las 24 horas
 *   Cerrado · Abre hoy a las 18:00
 *   Cerrado · Abre manana a las 09:00
 *   Cerrado · Abre el lunes a las 09:00
 */
export function scheduleLabel(schedule: StoreSchedule, now = new Date()): string | null {
  // Mientras la API mande su propia frase, se respeta: es la que ya usa el panel.
  const inherited = (schedule as { legacyLabel?: string }).legacyLabel;
  if (inherited) return inherited;

  if (schedule.isOpen === null) return null;

  if (schedule.isOpen) {
    return schedule.closesAt ? `Abierto hasta las ${schedule.closesAt}` : 'Abierto las 24 horas';
  }

  const { opensAt } = schedule;
  if (!opensAt) return 'Cerrado';

  return `Cerrado · Abre ${nextOpeningDay(schedule, now)} a las ${opensAt.time}`;
}

/**
 * Los turnos de un dia, listos para pintar. Cadena vacia si esta cerrado: quien
 * llama decide como rotularlo.
 *
 * El `+1 dia` avisa de los turnos que cruzan medianoche. Sin el, un "22:00 a
 * 02:00" se lee como un error de captura.
 */
export function formatShifts(day: ScheduleDay): string {
  return day.shifts
    .map((shift) => {
      // 00:00-00:00 es el turno continuo: no hay tramo que enunciar.
      if (shift.start === shift.end) return '24 horas';

      return `${shift.start} a ${shift.end}${shift.crossesMidnight ? ' +1 dia' : ''}`;
    })
    .join(' · ');
}
