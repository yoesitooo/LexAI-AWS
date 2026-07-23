# Documento de Requerimientos — LexAI MVP

## Introducción

LexAI es una plataforma SaaS de trazabilidad procesal dirigida exclusivamente a abogados independientes en Colombia. La única fuente de datos es la Consulta de Procesos Nacional Unificada (CPNU) de la Rama Judicial de Colombia. El producto permite registrar procesos judiciales por su número de radicado de 23 dígitos, revisarlos automáticamente cada día hábil, detectar actuaciones nuevas, analizarlas con un modelo de lenguaje para identificar plazos procesales, calcular fechas límite en días hábiles colombianos y notificar al abogado por los canales que configure (in-app, email, WhatsApp), presentando todo en un tablero Kanban.

Este documento cubre el alcance de la Fase 1 (MVP): módulo de trazabilidad de procesos, autenticación real, módulo de configuración de canales de notificación, y la vista Kanban. Incluye además los requerimientos transversales de diseño UI/UX y accesibilidad (no negociables), los placeholders de los módulos fuera de alcance, y las restricciones de localización colombiana. La arquitectura de datos debe quedar preparada para extenderse a despachos (multi-tenant) y roles en Fase 2 sin refactor mayor, aunque esa funcionalidad no se construye ahora.

## Glosario

- **Sistema**: La plataforma LexAI en su conjunto (aplicación web, API y worker de revisión).
- **Cliente_CPNU**: Capa de cliente HTTP aislada (por ejemplo `lib/cpnu-client.ts`) responsable de toda comunicación con la API de la Rama Judicial de Colombia.
- **API_CPNU**: API REST pública de Consulta de Procesos Nacional Unificada de la Rama Judicial de Colombia. Endpoint de consulta por radicado confirmado: `GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion` con parámetros `numero`, `SoloActivos`, `pagina`. El endpoint de detalle de actuaciones (que devuelve el listado histórico completo de actuaciones de un proceso específico, consultado utilizando su `idProceso`) está pendiente de confirmación y se encapsula dentro de la capa Cliente_CPNU para poder ajustarse sin modificar la lógica de negocio.
- **Validador_Radicado**: Componente que valida el formato del número de radicado colombiano.
- **Radicado**: Identificador de proceso judicial colombiano de 23 dígitos numéricos con estructura: 5 dígitos DANE del municipio, 2 dígitos de entidad/jurisdicción, 2 dígitos de especialidad, 3 dígitos de despacho, y el resto para año y consecutivo.
- **Servicio_Autenticacion**: Componente de registro e inicio de sesión basado en NextAuth.js/Auth.js con credenciales email + contraseña.
- **Worker_Revision**: Proceso programado (cron con node-cron) que ejecuta la revisión diaria de procesos activos.
- **Analizador_IA**: Componente que envía el texto de una actuación a un proveedor LLM (intercambiable por variable de entorno) para determinar plazos.
- **Calculadora_Plazos**: Componente que calcula fechas límite en días hábiles colombianos.
- **Servicio_Festivos**: Fuente de días festivos nacionales de Colombia según la Ley 51 de 1983, cargada para el año en curso y siguientes.
- **Planificador_Notificaciones**: Componente que determina las fechas calendario en que se debe notificar un plazo.
- **Servicio_Notificaciones**: Componente que envía notificaciones por los canales activos (in-app, email, WhatsApp).
- **Tablero_Kanban**: Vista principal de la aplicación tras el inicio de sesión.
- **Sistema_Diseno**: Librería de componentes reutilizables accesibles (botón, input, tarjeta, badge de estado) y tokens de diseño.
- **Actuacion**: Registro de un movimiento del proceso judicial obtenido de la API_CPNU.
- **Plazo**: Término procesal a cargo del abogado derivado de una actuación.
- **Localizacion_CO**: Configuración fija de localización colombiana (español de Colombia, formato de fecha d/m/a, zona horaria America/Bogotá UTC-5 sin horario de verano).

## Requerimientos

### Requerimiento 1: Registro de usuario

**Historia de usuario:** Como abogado independiente, quiero crear una cuenta con mi correo y contraseña, para acceder de forma segura a mis procesos.

#### Criterios de aceptación

1. WHEN un visitante envía el formulario de registro con nombre entre 1 y 100 caracteres, correo electrónico válido de máximo 254 caracteres y contraseña válida, THE Servicio_Autenticacion SHALL crear un registro de usuario con la contraseña almacenada como hash y establecer la fecha de creación.
2. IF el correo electrónico enviado en el registro ya está asociado a un usuario existente, THEN THE Servicio_Autenticacion SHALL rechazar el registro y devolver un mensaje que indique que el correo ya está en uso, sin crear ningún registro de usuario.
3. IF la contraseña enviada tiene menos de 8 caracteres o más de 128 caracteres, THEN THE Servicio_Autenticacion SHALL rechazar el registro y devolver un mensaje que indique el requisito de longitud permitida (entre 8 y 128 caracteres).
4. IF el correo electrónico enviado no cumple el formato de dirección de correo válida, THEN THE Servicio_Autenticacion SHALL rechazar el registro y devolver un mensaje de formato inválido.
5. IF el nombre enviado está vacío o supera los 100 caracteres, THEN THE Servicio_Autenticacion SHALL rechazar el registro y devolver un mensaje que indique el requisito de longitud del nombre.
6. WHEN se crea un usuario nuevo, THE Sistema SHALL crear una configuración de usuario asociada con el canal in-app activo y los canales email y WhatsApp inactivos por defecto.
7. WHEN el registro de usuario se crea correctamente, THE Servicio_Autenticacion SHALL devolver una confirmación de registro exitoso al visitante en un máximo de 3 segundos.

### Requerimiento 2: Inicio y cierre de sesión

**Historia de usuario:** Como abogado independiente, quiero iniciar y cerrar sesión, para proteger el acceso a mi información procesal.

#### Criterios de aceptación

1. WHEN un usuario registrado envía credenciales correctas de correo y contraseña, THE Servicio_Autenticacion SHALL iniciar una sesión autenticada mediante NextAuth.js/Auth.js y redirigir al Tablero_Kanban en un máximo de 3 segundos.
2. IF un usuario envía credenciales de correo o contraseña incorrectas, THEN THE Servicio_Autenticacion SHALL rechazar el inicio de sesión, no crear ninguna sesión autenticada y devolver un mensaje genérico de credenciales inválidas sin revelar cuál campo falló.
3. WHILE un visitante no tiene una sesión autenticada, THE Sistema SHALL restringir el acceso al Tablero_Kanban, al registro de procesos y al módulo de configuración, y redirigir a la pantalla de inicio de sesión.
4. WHEN un usuario autenticado solicita cerrar sesión, THE Servicio_Autenticacion SHALL invalidar la sesión de forma efectiva y redirigir a la pantalla de inicio de sesión, de modo que el acceso posterior a rutas protegidas requiera un nuevo inicio de sesión.
5. IF un usuario acumula 5 intentos fallidos de inicio de sesión dentro de una ventana de 15 minutos, THEN THE Servicio_Autenticacion SHALL bloquear temporalmente nuevos intentos de inicio de sesión para ese correo y devolver un mensaje que indique el bloqueo temporal.
6. WHILE una sesión autenticada permanece 30 minutos sin actividad del usuario, THE Servicio_Autenticacion SHALL expirar la sesión y requerir un nuevo inicio de sesión para acceder a rutas protegidas.

### Requerimiento 3: Validación del número de radicado

**Historia de usuario:** Como abogado independiente, quiero que el sistema valide el radicado antes de consultarlo, para evitar registrar procesos con identificadores mal formados.

#### Criterios de aceptación

1. WHEN un usuario autenticado envía un número de radicado, THE Validador_Radicado SHALL aceptar la entrada únicamente si contiene exactamente 23 caracteres, todos ellos dígitos numéricos (0-9), sin espacios, guiones ni ningún otro separador.
2. IF el número de radicado enviado está vacío, contiene únicamente espacios en blanco, tiene una cantidad de caracteres distinta de 23, o incluye al menos un carácter no numérico, THEN THE Validador_Radicado SHALL rechazar la entrada, no registrar el proceso, y devolver un mensaje que indique el formato requerido de exactamente 23 dígitos numéricos.
3. THE Validador_Radicado SHALL interpretar la estructura del Radicado de 23 dígitos, de izquierda a derecha, como: 5 dígitos de código DANE de municipio, 2 dígitos de entidad, 2 dígitos de especialidad, 3 dígitos de despacho, 4 dígitos de año y 7 dígitos de consecutivo, sumando 23 dígitos en total.
4. IF los 4 dígitos correspondientes al año representan un valor menor a 1900 o mayor al año calendario actual, THEN THE Validador_Radicado SHALL rechazar la entrada, no registrar el proceso, y devolver un mensaje que indique que el año del radicado está fuera del rango permitido.
5. WHEN un radicado supera la validación de formato y de estructura, THE Validador_Radicado SHALL completar la validación y devolver el resultado en 2 segundos o menos.

### Requerimiento 4: Cliente de consulta a la Rama Judicial (CPNU)

**Historia de usuario:** Como abogado independiente, quiero que el sistema consulte la fuente oficial de la Rama Judicial, para obtener datos reales de mis procesos.

#### Criterios de aceptación

1. WHEN el Sistema necesita datos de un proceso, THE Cliente_CPNU SHALL consultar la API_CPNU mediante `GET` al endpoint de consulta por número de radicación usando los parámetros `numero`, `SoloActivos` y `pagina`.
2. IF el número de radicado a consultar no ha sido aceptado por el Validador_Radicado como exactamente 23 dígitos numéricos, THEN THE Cliente_CPNU SHALL abstenerse de consultar la API_CPNU y devolver un resultado de fallo que indique radicado inválido.
3. WHEN el Cliente_CPNU realiza una petición a la API_CPNU, THE Cliente_CPNU SHALL incluir los encabezados `Accept: application/json, text/plain, */*`, `Referer: https://consultaprocesos.ramajudicial.gov.co/` y un `User-Agent` de navegador estándar.
4. THE Cliente_CPNU SHALL limitar el ritmo de peticiones a la API_CPNU a un máximo de 2 peticiones por segundo sin ráfagas.
5. WHEN el Cliente_CPNU realiza una petición a la API_CPNU, THE Cliente_CPNU SHALL aplicar un tiempo máximo de espera de 30 segundos por petición.
6. WHEN la respuesta de la API_CPNU indica que hay más de una página en el objeto de paginación, THE Cliente_CPNU SHALL recuperar las páginas restantes iniciando el parámetro `pagina` en 1 e incrementándolo secuencialmente, aplicando el límite de ritmo de peticiones y recuperando como máximo 100 páginas por consulta.
7. IF una petición a la API_CPNU falla o devuelve un código de error, THEN THE Cliente_CPNU SHALL reintentar la petición hasta un máximo de 3 veces, y si se agotan los reintentos SHALL registrar el error y devolver un resultado de fallo sin interrumpir el procesamiento de otros procesos.
8. WHEN el Cliente_CPNU recibe una respuesta exitosa, THE Cliente_CPNU SHALL extraer de cada elemento de `procesos[]` los campos `idProceso`, `llaveProceso`, `despacho`, `departamento`, `sujetosProcesales` (demandante y demandado) y `fechaUltimaActuacion`.
9. WHEN el Sistema requiere el histórico de actuaciones de un proceso, THE Cliente_CPNU SHALL consultar el endpoint de detalle de actuaciones de la API_CPNU utilizando el `idProceso` obtenido en la consulta por radicado, y devolver el listado histórico completo de actuaciones del proceso.
10. THE Cliente_CPNU SHALL encapsular toda comunicación con la API_CPNU en una capa aislada para permitir su ajuste sin modificar la lógica de negocio.

### Requerimiento 5: Registro de un proceso

**Historia de usuario:** Como abogado independiente, quiero registrar un proceso por su radicado una sola vez, para que el sistema comience a hacerle seguimiento automático.

#### Criterios de aceptación

1. WHEN un usuario autenticado registra un radicado válido (aceptado por el Validador_Radicado como exactamente 23 dígitos numéricos), THE Sistema SHALL consultar la API_CPNU mediante el Cliente_CPNU y obtener partes procesales, juzgado, departamento, ciudad, tipo de proceso y el listado histórico completo de actuaciones recuperado a través de la capacidad de detalle de actuaciones del Cliente_CPNU descrita en el Requerimiento 4.
2. WHEN la consulta inicial devuelve al menos un proceso para el radicado enviado, THE Sistema SHALL crear un único registro de Proceso asociado al usuario que incluya número de radicado, juzgado, departamento, ciudad, tipo de proceso, partes procesales, estado actual y fecha de creación.
3. WHEN se crea el registro del Proceso, THE Sistema SHALL almacenar todas las actuaciones históricas devueltas por la consulta inicial marcándolas como no nuevas.
4. WHEN se completa el registro del Proceso, THE Sistema SHALL marcar el proceso como en seguimiento activo y asignarlo a la primera columna de entrada del Tablero_Kanban.
5. IF la consulta inicial a la API_CPNU no devuelve ningún proceso para el radicado enviado, THEN THE Sistema SHALL rechazar el registro, no crear ningún registro de Proceso, y devolver un mensaje que indique que no se encontró el proceso.
6. IF el usuario autenticado intenta registrar un radicado que ya tiene registrado en su propia cuenta, THEN THE Sistema SHALL rechazar el registro duplicado, no crear un segundo registro de Proceso, y devolver un mensaje que indique que el proceso ya está en seguimiento.
7. IF la consulta inicial a la API_CPNU falla o la fuente no está disponible (situación distinta de no encontrar el proceso), THEN THE Sistema SHALL rechazar el registro, no crear ningún registro de Proceso, y devolver un mensaje que indique que la consulta no pudo completarse y que se intente nuevamente más tarde.

### Requerimiento 6: Revisión diaria automática

**Historia de usuario:** Como abogado independiente, quiero que mis procesos se revisen automáticamente cada día hábil, para enterarme de nuevas actuaciones sin consultar manualmente.

#### Criterios de aceptación

1. WHILE un día es de lunes a viernes y no es festivo nacional de Colombia según el Servicio_Festivos, THE Worker_Revision SHALL ejecutar una única vez la revisión diaria de todos los procesos en seguimiento activo a las 06:00 en la zona horaria America/Bogotá (UTC-5).
2. IF un día es sábado, domingo o festivo nacional de Colombia, THEN THE Worker_Revision SHALL omitir la ejecución de la revisión diaria ese día.
3. WHEN el Worker_Revision revisa un proceso activo, THE Worker_Revision SHALL consultar la API_CPNU mediante el Cliente_CPNU aplicando un tiempo máximo de espera de 30 segundos por consulta y comparar las actuaciones obtenidas contra el histórico de actuaciones almacenado del proceso.
4. WHEN el Worker_Revision detecta una actuación que no existe en el histórico almacenado, THE Worker_Revision SHALL considerar cualquier actuación no registrada previamente como cambio relevante, sin filtrar por palabras clave.
5. WHEN el Worker_Revision detecta una actuación nueva, THE Worker_Revision SHALL almacenarla en el histórico marcándola como nueva e iniciar el análisis con el Analizador_IA.
6. WHEN el Worker_Revision finaliza la revisión de un proceso, THE Worker_Revision SHALL actualizar la fecha de última revisión del proceso.
7. IF la consulta a la API_CPNU para un proceso falla o la fuente no está disponible, THEN THE Worker_Revision SHALL reintentar la consulta hasta un máximo de 3 veces, y si se agotan los reintentos SHALL conservar el histórico de actuaciones almacenado del proceso sin cambios, registrar el error y continuar con la revisión de los demás procesos sin bloquearlos.
8. IF el análisis con el Analizador_IA de una actuación nueva falla, THEN THE Worker_Revision SHALL conservar la actuación nueva almacenada y continuar con la revisión de los demás procesos sin bloquearlos.
9. THE Worker_Revision SHALL ejecutarse como proceso programado automático sin requerir invocación manual.

### Requerimiento 7: Análisis de actuaciones con IA

**Historia de usuario:** Como abogado independiente, quiero que la IA lea cada actuación nueva, para saber si genera un plazo procesal a mi cargo.

#### Criterios de aceptación

1. WHEN se detecta una actuación nueva, THE Analizador_IA SHALL enviar el texto de la actuación al proveedor LLM configurado mediante variable de entorno, aplicando un tiempo máximo de espera de 30 segundos por solicitud.
2. THE Analizador_IA SHALL determinar a partir del texto de la actuación si esta implica un plazo o término procesal a cargo del abogado.
3. WHEN el Analizador_IA determina que la actuación implica un plazo, THE Analizador_IA SHALL extraer la duración del plazo como un número entero de días entre 1 y 365.
4. WHEN el Analizador_IA extrae un plazo, THE Analizador_IA SHALL clasificar el plazo como en días hábiles por defecto, salvo que el texto de la actuación indique explícitamente días calendario.
5. WHEN el Analizador_IA determina que la actuación implica un plazo con duración determinada entre 1 y 365 días, THE Sistema SHALL crear un registro de Plazo asociado a la actuación con la duración en días, el indicador de días hábiles y el estado pendiente.
6. IF el Analizador_IA determina que la actuación no implica ningún plazo a cargo del abogado, THEN THE Sistema SHALL marcar la actuación como analizada sin crear ningún registro de Plazo.
7. IF el Analizador_IA determina que la actuación implica un plazo pero su duración es indeterminada o no puede acotarse entre 1 y 365 días, THEN THE Sistema SHALL marcar la actuación como analizada con plazo indeterminado, sin calcular una fecha límite, y señalarla para revisión manual.
8. WHERE el proveedor LLM se define mediante variable de entorno, THE Analizador_IA SHALL usar el proveedor configurado sin requerir cambios de código para intercambiarlo.
9. IF la llamada al proveedor LLM falla, THEN THE Analizador_IA SHALL reintentar la solicitud hasta un máximo de 3 veces, y si se agotan los reintentos SHALL registrar el error, conservar la actuación almacenada con estado de análisis pendiente y no bloquear la revisión de otros procesos.

### Requerimiento 8: Cálculo de fecha límite en días hábiles

**Historia de usuario:** Como abogado independiente, quiero que el plazo se calcule en días hábiles de Colombia, para conocer la fecha límite real de cada término.

#### Criterios de aceptación

1. WHEN se crea un Plazo clasificado en días hábiles con una duración entera entre 1 y 365 días, THE Calculadora_Plazos SHALL calcular la fecha límite contando esa cantidad de días hábiles a partir de la fecha de inicio registrada del Plazo, excluyendo sábados, domingos y festivos nacionales de Colombia provistos por el Servicio_Festivos.
2. WHEN se crea un Plazo clasificado en días calendario con una duración entera entre 1 y 365 días, THE Calculadora_Plazos SHALL calcular la fecha límite contando esa cantidad de días calendario consecutivos a partir de la fecha de inicio registrada del Plazo.
3. THE Servicio_Festivos SHALL proveer los festivos nacionales de Colombia conforme a la Ley 51 de 1983 para el año en curso y al menos los dos años calendario siguientes.
4. IF la duración del Plazo no es un número entero entre 1 y 365 días, THEN THE Calculadora_Plazos SHALL abstenerse de calcular una fecha límite y señalar el Plazo para revisión manual.
5. IF el Servicio_Festivos no está disponible al momento de calcular un Plazo en días hábiles, THEN THE Calculadora_Plazos SHALL abstenerse de almacenar una fecha límite, registrar el error y señalar el Plazo para reintento posterior.
6. WHEN la Calculadora_Plazos determina correctamente la fecha límite, THE Sistema SHALL almacenarla en el registro de Plazo correspondiente.
7. THE Calculadora_Plazos SHALL realizar todos los cálculos de fechas en la zona horaria America/Bogotá (UTC-5) sin ajuste por horario de verano.

### Requerimiento 9: Programación de notificaciones de plazo

**Historia de usuario:** Como abogado independiente, quiero recibir avisos antes de que venza cada plazo, para no perder términos procesales por estar en fin de semana.

#### Criterios de aceptación

1. WHEN se calcula la fecha límite de un Plazo con al menos un día hábil restante, THE Planificador_Notificaciones SHALL programar una notificación para el día calendario inmediatamente anterior a cada día hábil restante del plazo, fijada a la hora configurada en la regla de notificación y en la zona horaria America/Bogotá (UTC-5).
2. WHERE la regla de notificación está definida como parámetro de configuración, THE Planificador_Notificaciones SHALL aplicar la regla parametrizada sin requerir cambios de código.
3. WHEN el Planificador_Notificaciones programa las notificaciones de un Plazo, THE Sistema SHALL registrar en el registro de Plazo cada notificación generada, incluyendo su fecha y hora programadas.
4. THE Planificador_Notificaciones SHALL calcular las fechas de notificación sobre el calendario real en la zona horaria America/Bogotá (UTC-5), incluyendo sábados, domingos y festivos cuando correspondan a un aviso previo a un día hábil del plazo.
5. IF al momento de programar el Plazo no queda ningún día hábil restante (la fecha límite es el mismo día o ya venció), THEN THE Planificador_Notificaciones SHALL registrar el Plazo sin programar notificaciones futuras y generar una alerta inmediata que indique que el término está vencido o vence el mismo día.
6. IF la programación de una notificación falla, THEN THE Planificador_Notificaciones SHALL conservar el registro del Plazo sin notificaciones parciales y registrar un indicador de error que señale que la programación no se completó.

### Requerimiento 10: Envío de notificaciones por canales configurados

**Historia de usuario:** Como abogado independiente, quiero recibir las notificaciones por los canales que active, para enterarme por el medio que prefiero.

#### Criterios de aceptación

1. WHEN llega la fecha calendario de una notificación programada, a las 07:00 hora de Colombia (America/Bogotá, UTC-5), THE Servicio_Notificaciones SHALL iniciar el envío de la notificación por cada canal activo en la configuración del usuario dueño del proceso y completar el intento de envío en un máximo de 5 minutos.
2. WHERE el canal in-app está activo, THE Servicio_Notificaciones SHALL registrar la notificación para su visualización dentro de la aplicación.
3. WHERE el canal email está activo y el usuario tiene un correo electrónico válido registrado, THE Servicio_Notificaciones SHALL enviar la notificación por correo electrónico al correo del usuario.
4. IF el canal email está activo pero el usuario no tiene un correo electrónico válido registrado, THEN THE Servicio_Notificaciones SHALL omitir el envío por email, registrar el error y continuar con los demás canales activos.
5. WHERE el canal WhatsApp está activo y el usuario tiene un número de WhatsApp registrado, THE Servicio_Notificaciones SHALL enviar la notificación por WhatsApp mediante el sandbox de Twilio.
6. IF el canal WhatsApp está activo pero el usuario no tiene un número de WhatsApp registrado, THEN THE Servicio_Notificaciones SHALL omitir el envío por WhatsApp, registrar el error y continuar con los demás canales activos.
7. IF el envío por un canal falla, THEN THE Servicio_Notificaciones SHALL reintentar el envío por ese canal hasta un máximo de 3 intentos, separados entre sí por al menos 60 segundos.
8. IF se agotan los 3 intentos de envío por un canal, THEN THE Servicio_Notificaciones SHALL registrar el error y continuar el envío por los canales restantes activos sin bloquearlos.

### Requerimiento 11: Módulo de configuración de canales de notificación

**Historia de usuario:** Como abogado independiente, quiero activar o desactivar mis canales de notificación, para controlar cómo me avisa el sistema.

#### Criterios de aceptación

1. WHEN un usuario autenticado abre el módulo de configuración, THE Sistema SHALL mostrar, en un plazo máximo de 3 segundos, el estado actual (activo o inactivo) de cada uno de los canales in-app, email y WhatsApp.
2. WHEN un usuario activa o desactiva un canal de notificación, THE Sistema SHALL persistir el nuevo estado en la configuración del usuario y mostrar una indicación visible de confirmación del cambio.
3. IF la persistencia del nuevo estado de un canal falla, THEN THE Sistema SHALL conservar el estado previo del canal y mostrar un mensaje de error que indique que el cambio no se guardó.
4. WHERE el usuario activa el canal WhatsApp, THE Sistema SHALL requerir un número de teléfono de WhatsApp en formato internacional válido (entre 8 y 15 dígitos, con prefijo de país) y almacenarlo asociado a la configuración del usuario.
5. IF el usuario intenta activar el canal WhatsApp sin un número de teléfono o con un número que no cumple el formato internacional válido, THEN THE Sistema SHALL rechazar la activación, mantener el canal WhatsApp en estado inactivo y mostrar un mensaje de error que indique que se requiere un número de WhatsApp válido.
6. THE Sistema SHALL almacenar el campo de frecuencia de revisión en el modelo de datos con el valor fijo diaria en días hábiles, sin permitir su edición por el usuario en esta fase.
7. THE Sistema SHALL restringir el módulo de configuración de esta fase a la gestión de canales de notificación, sin incluir gestión de roles ni permisos.

### Requerimiento 12: Vista Kanban de procesos

**Historia de usuario:** Como abogado independiente, quiero ver mis procesos en un tablero Kanban, para tener una vista clara del estado de cada uno.

#### Criterios de aceptación

1. WHEN un usuario autenticado accede a la aplicación tras iniciar sesión, THE Tablero_Kanban SHALL presentarse como pantalla principal en un tiempo no mayor a 3 segundos, mostrando únicamente los procesos cuyo propietario es el usuario autenticado y ninguno perteneciente a otros usuarios.
2. THE Tablero_Kanban SHALL organizar los procesos en exactamente las cinco columnas Nuevo, En seguimiento, Requiere acción, Vencido y Archivado, y asignar cada proceso a una sola columna a la vez.
3. THE Tablero_Kanban SHALL mostrar en cada tarjeta de proceso el número de radicado de 23 dígitos, las partes procesales demandante y demandado, el último estado o actuación, el juzgado y el departamento o ciudad.
4. WHEN un usuario abre una tarjeta de proceso, THE Sistema SHALL mostrar el histórico completo de actuaciones ordenado de la más reciente a la más antigua, junto con los plazos calculados que se encuentren activos para ese proceso.
5. WHEN un Plazo asociado a un proceso supera su fecha límite sin cumplirse, según la zona horaria America/Bogotá (UTC-5), THE Sistema SHALL asignar el proceso a la columna Vencido y marcar el estado del Plazo como vencido.
6. IF el usuario autenticado no tiene ningún proceso registrado, THEN THE Tablero_Kanban SHALL presentar las cinco columnas vacías junto con un mensaje que indique que no existen procesos registrados.

### Requerimiento 13: Módulos en standby (placeholders)

**Historia de usuario:** Como abogado independiente, quiero ver qué funciones vienen en el futuro, para conocer la evolución del producto sin que interfiera con lo actual.

#### Criterios de aceptación

1. WHILE el usuario tiene una sesión activa, THE Sistema SHALL mostrar en el menú de navegación un ítem etiquetado para el Kanban de tutelas que incluya de forma visible el texto "Próximamente".
2. WHILE el usuario tiene una sesión activa, THE Sistema SHALL mostrar en el menú de navegación un ítem etiquetado para la redacción de demandas y tutelas asistida por IA que incluya de forma visible el texto "Próximamente".
3. WHEN el usuario selecciona un ítem de navegación de un módulo en standby, THE Sistema SHALL permanecer en la vista actual o mostrar el indicador "Próximamente" sin cargar ninguna pantalla funcional y sin ejecutar ninguna operación sobre los datos de usuarios, procesos o actuaciones.
4. WHILE un módulo se encuentra en standby, THE Sistema SHALL deshabilitar cualquier interacción del ítem distinta de mostrar el indicador "Próximamente", de modo que no existan campos de entrada, botones de acción ni llamadas a servicios asociados a ese módulo.
5. THE Sistema SHALL diseñar el modelo de datos núcleo de forma que los módulos en standby puedan añadirse posteriormente sin requerir modificaciones a las columnas ni a las relaciones existentes de las tablas de usuarios, procesos y actuaciones.

### Requerimiento 14: Localización colombiana fija

**Historia de usuario:** Como abogado independiente en Colombia, quiero que la aplicación use el idioma, formato de fecha y zona horaria de Colombia, para que la información sea coherente con mi contexto.

#### Criterios de aceptación

1. THE Sistema SHALL presentar todo el texto de la interfaz visible al usuario en español de Colombia (código de configuración regional es-CO).
2. IF un elemento de texto de la interfaz no cuenta con traducción disponible en español de Colombia, THEN THE Sistema SHALL mostrar el texto de respaldo en español y registrar el elemento faltante, sin dejar la interfaz vacía ni mostrar identificadores técnicos.
3. THE Sistema SHALL mostrar las fechas en formato día/mes/año con dos dígitos para el día, dos dígitos para el mes y cuatro dígitos para el año (DD/MM/AAAA), usando ceros a la izquierda cuando el día o el mes sea menor a 10.
4. THE Sistema SHALL mostrar las horas en formato de 24 horas con dos dígitos para hora y dos dígitos para minutos (HH:MM), usando ceros a la izquierda.
5. THE Sistema SHALL usar la zona horaria America/Bogotá (UTC-5) sin ajuste por horario de verano en toda visualización y cálculo de fechas.
6. THE Sistema SHALL mostrar los valores numéricos con punto como separador de miles y coma como separador decimal, y los valores monetarios en pesos colombianos (COP) con dos dígitos decimales.
7. THE Sistema SHALL mantener la Localizacion_CO como configuración fija sin ofrecer opciones de configuración de idioma, formato de fecha, zona horaria o país al usuario.

### Requerimiento 15: Extensibilidad del modelo de datos para Fase 2

**Historia de usuario:** Como responsable del producto, quiero que el modelo de datos admita despachos y roles más adelante, para evolucionar a Fase 2 sin migrar todo el esquema.

#### Criterios de aceptación

1. THE Sistema SHALL diseñar el modelo de datos de forma que la entidad Despacho pueda incorporarse como tenant únicamente agregando nuevas entidades y relaciones, sin eliminar ni renombrar las entidades núcleo existentes de Fase 1 (Usuario, Proceso, Actuacion, Plazo, ConfiguracionUsuario).
2. THE Sistema SHALL diseñar el modelo de datos de forma que la entidad Rol pueda incorporarse únicamente agregando nuevas entidades y relaciones, sin eliminar ni renombrar las entidades núcleo existentes de Fase 1.
3. WHILE el producto está en Fase 1, THE Sistema SHALL operar con un único tenant equivalente a un abogado independiente, sin aplicar lógica de multi-tenant ni de roles ni permisos.
4. IF durante Fase 1 se solicita una operación que dependa de funcionalidad de multi-tenant, roles o permisos, THEN THE Sistema SHALL rechazar la operación, conservar el estado de los datos sin cambios y presentar un mensaje indicando que la funcionalidad no está disponible en Fase 1.

### Requerimiento 16: Sistema de diseño y estilo visual

**Historia de usuario:** Como abogado independiente, quiero una interfaz elegante y consistente, para percibir el producto como una herramienta profesional y confiable.

#### Criterios de aceptación

1. THE Sistema_Diseno SHALL construirse como librería de componentes reutilizables (botón, input, tarjeta, badge de estado) y tokens de diseño desde el inicio del proyecto, antes de construir las pantallas que los consumen.
2. THE Sistema_Diseno SHALL aplicar un estilo neumórfico (soft UI) en el que cada componente elevado presente dos sombras simultáneas (una clara y una oscura), un radio de esquina uniforme de al menos 16 píxeles para todos los componentes del mismo tipo, un espaciado basado en una escala de múltiplos de una unidad base de 8 píxeles, e iconografía de estilo de línea (outline) con grosor de trazo uniforme.
3. THE Sistema_Diseno SHALL aplicar transiciones suaves con una duración entre 200 y 300 milisegundos.
4. THE Sistema_Diseno SHALL usar una paleta monocromática en escala de grises y aplicar el único color de acento exclusivamente a los estados funcionales críticos (vencimientos, botón primario y estado Vencido), sin usar dicho color de acento en ningún otro elemento de la interfaz.
5. THE Sistema_Diseno SHALL definir los colores mediante tokens con nombres semánticos referenciados por los componentes, de modo que la incorporación posterior de modo oscuro se realice cambiando únicamente los valores de los tokens sin modificar los componentes.
6. WHEN el sistema operativo del usuario indica la preferencia `prefers-reduced-motion`, THE Sistema SHALL desactivar las transiciones y animaciones.
7. THE Sistema_Diseno SHALL definir una jerarquía tipográfica de al menos tres niveles diferenciados con tamaños de fuente distintos entre sí para título, subtítulo y cuerpo de texto.
8. THE Sistema_Diseno SHALL mantener una relación de contraste mínima de 4.5:1 entre el texto y su fondo en todos los componentes.

### Requerimiento 17: Logo de marca LexAI

**Historia de usuario:** Como responsable del producto, quiero un logo elegante y coherente, para transmitir una identidad premium y legal.

#### Criterios de aceptación

1. THE Sistema SHALL incluir un logo de la marca LexAI en formato SVG vectorial escalable, monocromático (una sola tinta, sin degradados), disponible antes de su aplicación en cualquier vista de la interfaz general.
2. THE logo SHALL renderizarse de forma legible, sin pérdida de trazos ni superposición de elementos, en tamaños de favicon de 16x16, 32x32 y 48x48 píxeles y en ícono de aplicación de hasta 512x512 píxeles.
3. THE Sistema SHALL proveer una versión de solo texto (wordmark) del logo para espacios con una altura de renderizado menor o igual a 24 píxeles.
4. THE Sistema SHALL proveer una versión del logo cuyo contraste con el fondo cumpla una relación de contraste mínima de 3:1, tanto sobre fondo claro como sobre fondo oscuro.
5. IF el archivo SVG del logo no puede cargarse, THEN THE Sistema SHALL mostrar la versión wordmark de texto como alternativa, conservando la identidad de la marca e indicando visualmente la presencia del logo.

### Requerimiento 18: Accesibilidad (WCAG 2.1 AA) no negociable

**Historia de usuario:** Como abogado con o sin discapacidad, quiero que todas las pantallas sean accesibles, para usar la herramienta con teclado, lector de pantalla o distintas capacidades visuales.

#### Criterios de aceptación

1. THE Sistema SHALL cumplir una relación de contraste mínima de 4.5:1 en el texto normal, y de 3:1 en texto grande (de al menos 18 puntos, o 14 puntos en negrita) y en componentes de interfaz, conforme a WCAG 2.1 nivel AA.
2. THE Sistema SHALL distinguir cada elemento interactivo mediante borde, cambio de color o ícono además del relieve neumórfico.
3. WHEN un usuario navega con teclado mediante Tab y Shift+Tab, THE Sistema SHALL mostrar en cada elemento interactivo un indicador de foco visible con una relación de contraste mínima de 3:1 respecto al fondo adyacente, seguir un orden de foco lógico y coherente con el orden visual, y permitir salir de todo componente sin quedar atrapado por teclado (WCAG 2.1.2).
4. THE Sistema SHALL usar HTML semántico, texto alternativo en imágenes e íconos con significado, y etiquetas asociadas a cada campo de entrada.
5. WHEN un usuario mueve una tarjeta del Tablero_Kanban mediante drag-and-drop, THE Sistema SHALL anunciar el cambio de estado resultante a los lectores de pantalla mediante regiones dinámicas ARIA (live regions).
6. THE Sistema SHALL distinguir los estados del Tablero_Kanban mediante texto e ícono además del color.
7. WHEN un usuario visualiza la interfaz en un ancho de ventana de 320 píxeles CSS, THE Sistema SHALL reflujar el contenido sin pérdida de contenido ni de funcionalidad y sin requerir desplazamiento horizontal (WCAG 1.4.10).
8. THE Sistema SHALL proveer objetivos táctiles de un tamaño mínimo de 44 por 44 píxeles en los elementos interactivos.
9. THE Sistema SHALL aplicar los criterios de accesibilidad definidos en los criterios 1 al 8 a todas las pantallas, incluyendo inicio de sesión, registro, formularios de configuración y el modal de registro de proceso.
