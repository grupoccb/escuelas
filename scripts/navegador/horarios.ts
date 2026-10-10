// Horarios de grupo de los datos de prueba cuando la prueba necesita que la clase de HOY ya haya empezado (el pase de lista no se toma antes de la hora de inicio:
// «La clase de ese día todavía no empieza»). V10b-fix: un horario fijo como 16:00 o 18:00 hacía que la prueba pasara o fallara según la hora de la máquina (de madrugada,
// o antes de la hora de la clase, fallaba). Una clase que empieza a las 00:00 ya empezó a CUALQUIER hora del día, también si la corrida cruza la medianoche.
export const HORARIO_DE_CLASE_YA_EMPEZADA = { hora_inicio_min: 0, hora_fin_min: 60 } as const;
