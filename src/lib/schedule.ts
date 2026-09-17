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

/*
|--------------------------------------------------------------------------
| Abierto o cerrado, calculado aqui desde los rangos
|--------------------------------------------------------------------------
|
| POR QUE. `isOpen`, `closesAt` y `opensAt` los resuelve el backend en el instante
| en que responde, asi que caducan al minuto y obligan a volver a preguntar. Los
| RANGOS no: el horario de la semana es el mismo el lunes que el viernes. Calculando
| el estado aqui, la respuesta se puede guardar una semana (ver src/lib/cache.ts) y
| ademas el rotulo deja de ir hasta medio minuto tarde.
|
| LA REGLA, que es la del panel y la de `ScheduleAvailability` en el backend:
|
|   - Se opera DENTRO de cualquiera de los rangos del dia. Un dia con dos
|     —09:00-14:00 y 18:00-23:00— esta abierto en cada uno y cerrado entre ellos.
|   - Fuera de todos los rangos, cerrado. Un dia sin rangos esta cerrado entero.
|   - El inicio cuenta y el final no: 12:00-23:30 abre a las 12:00:00 y a las
|     23:30:00 YA ESTA CERRADO.
|   - `end <= start` cierra al dia siguiente (22:00-02:00), y `end === start` es el
|     turno continuo de 24 h. Hoy ningun rango los usa, pero el contrato los admite.
|   - Sin ningun rango en toda la semana no se afirma nada: `isOpen: null`.
|
| Todo en `America/Cancun`, que no tiene horario de verano.
|
| MIENTRAS TANTO SE COMPARA. scheduleMismatch() enfrenta esto con lo que dice el
| servidor cada vez que se pide el horario fresco: son dos implementaciones de la
| misma regla y la unica forma de enterarse de que se separaron es mirarlas juntas.
*/

const WEEK_MINUTES = 7 * 1440;

/** El estado que el backend publica, pero resuelto aqui. */
export interface ResolvedSchedule {
  isOpen: boolean | null;
  closesAt: string | null;
  opensAt: { dayOfWeek: number; time: string; inMinutes: number } | null;
  /** Cuando cambia el estado: el inicio o el final de rango mas cercano. */
  nextChangeAt: Date | null;
}

/** Un rango colocado en la semana, en minutos desde el lunes a las 00:00. */
interface WeekRange {
  start: number;
  /** Exclusivo, y puede pasar de la semana: el rango que cruza medianoche sigue en el dia siguiente. */
  end: number;
  dayOfWeek: number;
  startTime: string;
  /** La hora de cierre tal cual, o `null` en el turno continuo de 24 h. */
  closesAt: string | null;
}

/** "18:30" en minutos, o `null` si no es una hora. */
function parseTime(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/** El minuto de la semana en la tienda: 0 es el lunes a las 00:00. */
function storeMinuteOfWeek(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const index = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value('weekday'));

  return (index < 0 ? 0 : index) * 1440 + Number(value('hour')) * 60 + Number(value('minute'));
}

/**
 * Los rangos de los siete dias, colocados en la semana.
 *
 * Devuelve `null` cuando los dias no traen `dayOfWeek` —la forma vieja de la API, que
 * agrupaba dias por nombre—: sin saber que dia es cada uno no hay nada que calcular, y
 * quien llama se queda con lo que diga el servidor.
 */
function weekRanges(days: ScheduleDay[]): WeekRange[] | null {
  const ranges: WeekRange[] = [];

  for (const day of days) {
    const dayOfWeek = day.dayOfWeek;
    if (typeof dayOfWeek !== 'number' || dayOfWeek < 1 || dayOfWeek > 7) return null;

    const base = (dayOfWeek - 1) * 1440;

    for (const shift of day.shifts ?? []) {
      const start = parseTime(shift.start);
      const end = parseTime(shift.end);

      if (start === null || end === null) continue;

      // Tres formas, y el orden de las horas es lo que las distingue: el turno normal,
      // el continuo de 24 h (`end === start`) y el que cierra al dia siguiente.
      const length = end > start ? end - start : end === start ? 1440 : 1440 - start + end;

      ranges.push({
        start: base + start,
        end: base + start + length,
        dayOfWeek,
        startTime: shift.start,
        closesAt: end === start ? null : shift.end,
      });
    }
  }

  return ranges;
}

/** Si el minuto cae dentro del rango, contando el inicio y no el final. */
function covers(range: WeekRange, minute: number): boolean {
  return (
    (minute >= range.start && minute < range.end) ||
    // La semana da la vuelta: el rango del domingo que cruza medianoche cubre el lunes.
    (minute + WEEK_MINUTES >= range.start && minute + WEEK_MINUTES < range.end)
  );
}

/** Minutos que faltan para ese minuto de la semana, dando la vuelta si hace falta. */
function minutesUntil(minute: number, from: number): number {
  const delta = (((minute - from) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;

  return delta === 0 ? WEEK_MINUTES : delta;
}

/**
 * Abierto o cerrado ahora, con la hora de cierre, la proxima apertura y el momento en
 * que esto cambia. `null` cuando los dias no se pueden interpretar (ver weekRanges).
 */
export function resolveSchedule(days: ScheduleDay[], now: Date = new Date()): ResolvedSchedule | null {
  const ranges = weekRanges(days);
  if (!ranges) return null;

  if (ranges.length === 0) {
    // Ni un rango en toda la semana: es el `isOpen: null` del contrato —no hay horario, o
    // lo hay y esta vacio— y entonces el reloj no afirma nada.
    return { isOpen: null, closesAt: null, opensAt: null, nextChangeAt: null };
  }

  const minute = storeMinuteOfWeek(now);
  const covering = ranges.filter((range) => covers(range, minute));

  // El proximo cambio es el borde mas cercano, sea una apertura o un cierre. Si dos rangos
  // se tocan, ese borde no cambia nada y solo provoca una relectura de mas: barato.
  const nextChange = Math.min(
    ...ranges.flatMap((range) => [
      minutesUntil(range.start % WEEK_MINUTES, minute),
      minutesUntil(range.end % WEEK_MINUTES, minute),
    ]),
  );

  // Se ancla al minuto en curso, no al instante: los bordes son horas en punto, asi que el
  // cambio cae en el segundo 0 de su minuto.
  const nextChangeAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + nextChange * 60_000);

  if (covering.length > 0) {
    // Con rangos solapados manda el que cierra mas tarde, y el turno continuo no cierra.
    const open = covering.some((range) => range.closesAt === null)
      ? null
      : covering.reduce((latest, range) => (range.end > latest.end ? range : latest)).closesAt;

    return { isOpen: true, closesAt: open, opensAt: null, nextChangeAt };
  }

  const next = ranges.reduce((soonest, range) =>
    minutesUntil(range.start % WEEK_MINUTES, minute) <
    minutesUntil(soonest.start % WEEK_MINUTES, minute)
      ? range
      : soonest,
  );

  return {
    isOpen: false,
    closesAt: null,
    opensAt: {
      dayOfWeek: next.dayOfWeek,
      time: next.startTime,
      inMinutes: minutesUntil(next.start % WEEK_MINUTES, minute),
    },
    nextChangeAt,
  };
}

/**
 * Cuando cambia el estado de la tienda, para saber hasta cuando vale el catalogo: su
 * `available` lo resuelve el backend con este mismo horario. `null` si no hay rangos.
 */
export function nextScheduleChange(days: ScheduleDay[], now: Date = new Date()): Date | null {
  return resolveSchedule(days, now)?.nextChangeAt ?? null;
}

/**
 * En que se separan el estado del servidor y el calculado aqui, o `null` si dicen lo mismo.
 *
 * `opensAt` solo se compara con la tienda CERRADA: hoy el backend lo manda tambien abierta
 * —el 2026-09-17, `isOpen: true` con la apertura del dia siguiente dentro— y el contrato dice
 * que ahi va `null`, asi que compararlo marcaria una diferencia en cada lectura sin que nadie
 * se haya equivocado. Y `inMinutes` admite un minuto de holgura: los dos relojes no cuentan
 * el mismo segundo.
 */
export function scheduleMismatch(
  server: StoreSchedule,
  resolved: ResolvedSchedule,
): string | null {
  if (server.isOpen !== resolved.isOpen) {
    return `isOpen: servidor ${server.isOpen}, calculado ${resolved.isOpen}`;
  }

  if (server.isOpen === true && (server.closesAt ?? null) !== (resolved.closesAt ?? null)) {
    return `closesAt: servidor ${server.closesAt}, calculado ${resolved.closesAt}`;
  }

  if (server.isOpen === false) {
    const mine = resolved.opensAt;
    const theirs = server.opensAt;

    if (!mine || !theirs) return `opensAt: servidor ${JSON.stringify(theirs)}, calculado ${JSON.stringify(mine)}`;

    if (mine.dayOfWeek !== theirs.dayOfWeek || mine.time !== theirs.time) {
      return `opensAt: servidor ${theirs.dayOfWeek} ${theirs.time}, calculado ${mine.dayOfWeek} ${mine.time}`;
    }

    if (Math.abs(mine.inMinutes - theirs.inMinutes) > 1) {
      return `opensAt.inMinutes: servidor ${theirs.inMinutes}, calculado ${mine.inMinutes}`;
    }
  }

  return null;
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
