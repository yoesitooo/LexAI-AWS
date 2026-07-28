# Referencia de módulos — LexAI

Documentación archivo por archivo de la capa de dominio (`lib/`), el proceso worker (`worker/`), el modelo de datos (`prisma/schema.prisma`), la presentación (`app/`) y el sistema de diseño (`components/`). Los archivos `*.test.ts(x)` no se documentan aquí (existe un test por cada módulo de dominio y de worker; ver el propio directorio).

Para el panorama general (procesos, capas, flujo de datos, despliegue) ver [arquitectura.md](./arquitectura.md).

> Nota terminológica: la mayor parte del dominio está escrita en estilo funcional (`Result<T,E>`, funciones puras + factories), no en clases. Las únicas clases reales del proyecto son `RateLimiter` (interna de `lib/cpnu-client.ts`), `CanalInApp` y `CanalEmail` (`lib/notificaciones/`). El resto de "unidades" documentadas abajo son módulos/factories que cumplen el mismo rol de encapsulamiento.

---

## `lib/` — capa de dominio

### `lib/repository.ts`
Base transversal usada por casi todo el dominio. Define `Result<T, E>` (unión discriminada `{ok:true, value} | {ok:false, error}`) y los constructores `ok()`/`err()`, la interfaz `RepositoryError`, el helper `withRepository()` (envuelve una operación async capturando excepciones como `Result`) y `nowUtc()`.

### `lib/formato.ts`
Utilidades transversales de formato `es-CO` y zona horaria `America/Bogotá` (UTC-5 fijo, sin horario de verano). Define el tipo `FechaCO` que envuelve un `Date` con sus componentes ya resueltos en hora colombiana (`anio`, `mes`, `dia`, `hora`, `minuto`, `segundo`, `diaSemana`). Expone `crearFechaCO`, `fechaCODesdeComponentes`, `hoyCO`, `formatoFecha`/`formatoFechaDate` (`DD/MM/AAAA`), `formatoHora`/`formatoHoraDate` (`HH:MM`), `formatoNumero`, `formatoMoneda` (COP), `parsearFechaCO`, `fechaCOaISO`, `compararFechasCO`. No tiene dependencias internas; es la base de `festivos.ts`, `calculadora-plazos.ts`, `planificador-notificaciones.ts`, `transicion-vencido.ts` y `worker/*`.

### `lib/festivos.ts`
Calcula los 18 festivos nacionales de Colombia por año (Ley 51 de 1983 / Ley Emiliani): festivos fijos, trasladados al lunes siguiente, y dependientes de la Pascua (algoritmo Computus). Expone `festivosDelAnio(anio)` (cacheado en memoria) y `esFestivo(fecha)`. Es la base de todo cálculo de "día hábil" del sistema.

### `lib/validador-radicado.ts`
Función pura sin I/O que valida y descompone el número de radicado judicial colombiano (23 dígitos: 5 DANE + 2 entidad + 2 especialidad + 3 despacho + 4 año + 7 consecutivo). `validarRadicado(input)` devuelve `Result<RadicadoValido, ErrorRadicado>` con códigos `formato_invalido | longitud_invalida | anio_fuera_de_rango`. Es la primera línea de defensa antes de golpear la CPNU: la usan `lib/cpnu-client.ts` (`consultarPorRadicado`) y `POST /api/procesos`.

### `lib/cpnu-client.ts`
Única capa de acceso HTTP a la API pública de la Rama Judicial (CPNU). Centraliza rate limiting (≥500ms entre peticiones vía la clase interna `RateLimiter`), timeout de 30s y hasta 3 reintentos, y normaliza los nombres de campo que difieren entre la API real y los mocks. `crearClienteCPNU()` construye un objeto `ClienteCPNU` con:
- `consultarPorRadicado(radicado, opciones?)` — valida el radicado, pagina hasta 100 páginas.
- `obtenerActuaciones(idProceso)` — histórico de actuaciones.
- `obtenerDocumentosActuacion(idRegActuacion)` — documentos adjuntos de una actuación.
- `descargarDocumento(idRegDocumento)` — descarga binaria (Content-Type/Content-Disposition).

`clienteCPNU` es la instancia singleton exportada y usada en toda la app. También exporta `extensionATipoMime()` y los tipos `ProcesoCPNU`, `ActuacionCPNU`, `DocumentoActuacionCPNU`, `DocumentoDescargadoCPNU`, `FalloCPNU`, `PaginacionCPNU`, `RespuestaConsultaCPNU`.

### `lib/diffing-actuaciones.ts`
Compara actuaciones frescas de la CPNU contra el histórico almacenado de un proceso, por identidad `id_actuacion_cpnu` (sin filtrar por palabras clave: todo lo no registrado es "nuevo"). `diffActuaciones(procesoId, frescas, almacenadas)` es pura y testeable; `almacenarActuacionesNuevas(procesoId, nuevas)` persiste con `createMany({skipDuplicates: true})`, marcando `es_nueva=true` y `analisis_completado=false`.

### `lib/analizador-ia.ts`
Puente entre el texto de una actuación y el LLM configurado. Contiene el prompt de sistema (`PROMPT_SISTEMA_ANALISIS`) en terminología procesal colombiana y las reglas para decidir si una actuación genera un plazo, en cuántos días, y si son hábiles o calendario.
- `analizarActuacion(texto, adaptador?)` — invoca el LLM y normaliza la respuesta.
- `parsearRespuestaLLM(respuesta)` — parseo tolerante a markdown code-fences.
- `normalizarRespuesta(respuesta)` — reglas de negocio (`sin_plazo` / `plazo` / `indeterminado`; días fuera de 1–365 → indeterminado).
- `analizarActuacionConReintentos(texto, adaptador?, opciones?)` — hasta 3 reintentos configurables; nunca lanza, siempre devuelve un resultado (éxito o `analisis_pendiente`).

Invocado desde `worker/revision-diaria.ts`.

### `lib/calculadora-plazos.ts`
Núcleo aritmético de "cuándo vence un plazo": calcula la fecha límite en días hábiles o calendario respetando festivos y zona horaria de Colombia. `calcularFechaLimite(fechaInicio, dias, esHabil)` valida `dias ∈ [1,365]` y devuelve `Result<FechaCO, ErrorCalculo>` (`dias_invalidos | festivos_no_disponibles`).

### `lib/planificador-notificaciones.ts`
Determina y persiste cuándo notificar sobre un plazo: notifica el día calendario inmediatamente anterior a cada día hábil restante, a una hora configurable (`HORA_ENVIO_DEFAULT = "07:00"`). Si no queda ningún día hábil (vence hoy o ya venció), genera una `AlertaInmediata` en vez de notificaciones futuras. `calcularNotificaciones(plazo, regla, hoy)` es pura; `planificarNotificaciones(plazo, regla?, hoy, prismaClient)` persiste dentro de una transacción atómica (si falla, marca `error_programacion=true` en vez de dejar notificaciones parciales). También expone `obtenerDiasHabilesRestantes(hoy, fechaLimite)`.

### `lib/transicion-vencido.ts`
`marcarPlazosVencidos(usuarioId?)` — busca plazos `pendiente` con `fecha_limite` pasada (no indeterminados) y los transiciona a `vencido` en una transacción, moviendo también el `Proceso` asociado a la columna Kanban `vencido`. Se invoca "al leer" (en `GET /api/procesos` y `GET /api/procesos/:id`) para que el tablero refleje vencimientos incluso si el worker aún no corrió ese día.

### `lib/descarga-documentos.ts`
Sincroniza documentos adjuntos de actuaciones desde la CPNU hacia el expediente digital (`DocumentoProceso`, `origen="cpnu"`). Idempotente (deduplica por `id_documento_cpnu`) y tolerante a fallos por documento individual. `AlmacenamientoDocumentos` es una interfaz de almacenamiento (contrato `guardar()`) con implementación por defecto en disco (`almacenamientoDisco`), pensada para poder migrar a S3 sin tocar la lógica de negocio. `sincronizarDocumentosProceso(procesoId, opciones?)` recorre actuaciones con `existe_docs=true` y descarga lo faltante (límite 50MB/archivo). Invocado best-effort desde `worker/revision-diaria.ts` y desde `POST /api/procesos`.

### `lib/parse-sujetos.ts`
Parsea el campo `sujetos_procesales` (texto `"DEMANDANTE: X | DEMANDADO: Y"` o JSON) para extraer las partes procesales de forma robusta. `esProcesoPrivado(raw)` detecta el marcador de la CPNU para procesos privados. Usado por `ModalDetalle` y `app/(protected)/tablero/page.tsx`.

### `lib/formato-archivo.ts`
`formatoTamano(bytes)` — tamaños de archivo legibles (B/KB/MB) para la UI del expediente digital.

### `lib/config.ts`
Punto único de validación/tipado de variables de entorno; en producción valida al importarse que existan las requeridas. Expone `type LLMProvider` (`gemini | openai | claude | anthropic`), `interface EnvConfig` y la instancia validada `env`. Es la pieza que permite intercambiar proveedor de IA por variable de entorno sin tocar código.

### `lib/db.ts`
Singleton de `PrismaClient` (adapter `@prisma/adapter-pg`, requerido en Prisma 7) compartido por `web` y `worker`, reutilizado vía `globalThis` fuera de producción para no agotar conexiones en hot-reload. Es importado por prácticamente todo módulo que toca la base de datos.

### `lib/db-health.ts`
`checkDbHealth(timeoutMs=5000)` — `SELECT 1` con carrera contra timeout, para healthchecks/diagnóstico de arranque. `disconnectDb()` — shutdown graceful (`prisma.$disconnect()`).

### `lib/auth.config.ts`
Configuración de NextAuth **Edge-safe** (sin Prisma), usada por `middleware.ts`. Define sesión JWT con expiración por inactividad de 30 minutos, páginas de login/error y el callback `authorized` (redirige a `/login?callbackUrl=...` si no hay sesión en ruta no pública, usando `isPublicPath` de `lib/middleware-utils.ts`).

### `lib/auth.ts`
Configuración completa de NextAuth v5 con proveedor `Credentials` (email + password). El `authorize()` normaliza el email, cuenta intentos fallidos en los últimos 15 minutos (bloqueo tras 5), verifica contraseña con `bcrypt.compare`, y registra cada intento (éxito o fallo) en `IntentoLogin`. Reexporta `handlers`, `signIn`, `signOut`, `auth`, consumidos por `app/api/auth/[...nextauth]/route.ts` y las rutas API.

### `lib/middleware-utils.ts`
Lógica pura de decisión de rutas públicas, extraída para testear sin depender de Next.js/NextAuth en runtime. `PUBLIC_PATHS = ["/", "/login", "/api/auth"]`, `isPublicPath(pathname)`, `buildLoginRedirectUrl(origin, callbackPath)`.

### `lib/guardas-fase1.ts`
Rechaza explícitamente operaciones que dependen de funcionalidad planificada para Fase 2 (multi-tenant/despacho, roles, tutelas, redacción con IA, frecuencia de revisión configurable). `verificarFase1(operacion)` siempre devuelve `err(ErrorFase1)`; existen wrappers específicos (`verificarSinDespacho`, `verificarSinRol`, `verificarModuloTutela`, `verificarModuloBorradorIA`, `verificarFrecuenciaEditable`) y el type guard `esErrorFase1`. Usado por `GET/PATCH /api/configuracion`. Ver el plan de extensión en [extensibilidad-fase2.md](./extensibilidad-fase2.md).

### `lib/llm/` — adaptador LLM intercambiable
- **`types.ts`** — interfaz `AdaptadorLLM` (`{proveedor, completar(prompt, opciones?)}`), `OpcionesLLM`, `TipoErrorLLM` (`timeout | auth | rate_limit | servidor | red | respuesta_invalida | proveedor_no_soportado | configuracion`), constantes `TIMEOUT_LLM_MS=30000`, `TEMPERATURA_DEFAULT=0.2`, `MAX_TOKENS_DEFAULT=1024`.
- **`index.ts`** — factory/selector según `LLM_PROVIDER`/`LLM_API_KEY` (`lib/config.ts`). `crearAdaptadorLLM(proveedor, apiKey)` (inyectable, usado en tests) y `obtenerAdaptadorLLM()` (singleton según entorno; sin `LLM_API_KEY` devuelve un adaptador que siempre falla con `configuracion`). Único punto de entrada que debe usar `lib/analizador-ia.ts`.
- **`providers/anthropic.ts`** — `crearProveedorAnthropic(apiKey)`, REST directo a `api.anthropic.com/v1/messages`, modelo `claude-sonnet-4-20250514`.
- **`providers/gemini.ts`** — `crearProveedorGemini(apiKey)`, REST directo a `generativelanguage.googleapis.com`, modelo `gemini-2.0-flash` (proveedor por defecto).
- **`providers/openai.ts`** — `crearProveedorOpenAI(apiKey)`, REST directo a `api.openai.com/v1/chat/completions`, modelo `gpt-4o-mini`.
- **`providers/mock.ts`** — `crearProveedorMock(config?)` para tests unitarios/PBT: respuesta fija, error simulado, latencia simulada o generador custom; registra historial de llamadas.

### `lib/notificaciones/` — servicio de notificaciones multicanal
- **`tipos.ts`** — interfaz `CanalNotificacion` (`{nombre, disponiblePara(config), enviar(destinatario, contenido)}`) y tipos compartidos (`ConfiguracionUsuario`, `DatosDestinatario`, `ContenidoNotificacion`, `ErrorCanal`).
- **`canal-inapp.ts`** — clase `CanalInApp implements CanalNotificacion` (`nombre="inapp"`): crea un registro en `notificacion_inapp`. Instancia singleton `canalInApp`.
- **`canal-email.ts`** — `esEmailValido(email)` + clase `CanalEmail implements CanalNotificacion` (`nombre="email"`, constructor inyectable): envía vía Resend (`resend.emails.send`). Instancia singleton `canalEmail`.
- **`index.ts`** — barrel de reexportación.

> El canal WhatsApp (Twilio) está reservado en el esquema de datos (`canal_whatsapp`, `numero_whatsapp`, variables `TWILIO_*`) y en la UI de configuración, pero **no tiene una implementación de `CanalNotificacion` en este repo todavía** — `obtenerCanales()` en `worker/despacho-notificaciones.ts` solo registra `canalInApp` y `canalEmail`.

### `lib/i18n/` — internacionalización
- **`index.ts`** — motor de resolución de claves con locale fijo `es-CO` y fallback a `es` genérico; nunca expone el identificador técnico de la clave al usuario, registra claves faltantes para awareness del desarrollador. `t(key, params?)` soporta interpolación `{variable}`.
- **`diccionarios/es.ts`** — diccionario genérico (~110 claves) que cubre landing, auth, Kanban, detalle de proceso, plazos, notificaciones, configuración, módulos en standby y errores.
- **`diccionarios/es-CO.ts`** — diccionario de variante colombiana; solo diferencias respecto al genérico (actualmente vacío, mecanismo listo para futuras diferencias dialectales).

### `lib/generated/`
Cliente de Prisma **autogenerado** por `prisma generate` (`output = "../lib/generated/prisma"` en `schema.prisma`). No se edita manualmente; la fuente de verdad es `prisma/schema.prisma`.

---

## `worker/` — proceso en background (node-cron)

### `worker/index.ts`
Punto de entrada del proceso worker. `debeEjecutar(fecha)` valida día hábil (lunes-viernes, no festivo). `iniciarWorker()` programa `cron.schedule("0 6 * * *", ..., {timezone: "America/Bogota"})` para la revisión diaria y llama a `iniciarCronDespacho()` para el despacho de notificaciones. Se autoejecuta solo si es el módulo principal (`require.main === module`), para poder importarse en tests sin efectos secundarios.

### `worker/revision-diaria.ts`
Orquestador central del pipeline de dominio (ver diagrama de secuencia en [arquitectura.md](./arquitectura.md)). `ejecutarRevisionDiaria(opciones?)` obtiene procesos con `seguimiento_activo=true` e itera secuencialmente: por cada uno, consulta la CPNU, hace diffing, procesa cada actuación nueva (analizador IA → calculadora de plazos → planificador de notificaciones), sincroniza documentos (best-effort) y actualiza `ultima_revision_en`. Todas las dependencias (`logger`, `prismaClient`, `cpnuClient`, `analizarFn`, `calcularFechaLimiteFn`, `planificarFn`, `sincronizarDocumentosFn`, `ahora`) son inyectables para testing. Diseñado para que el fallo de un proceso individual, de la CPNU o del análisis IA nunca detenga la revisión de los demás.

### `worker/despacho-notificaciones.ts`
Cron de las 07:00 CO que envía las notificaciones ya programadas. `ejecutarDespacho(ahora?, canalesFn?, esperarFn?)` busca `Notificacion` en estado `programada` con `fecha_programada` vencida, y por cada una despacha a través de todos los canales activos del usuario (`Promise.allSettled`, aislamiento total entre canales) con `enviarConReintentos` (hasta `MAX_INTENTOS=3`, espera ≥60s entre intentos, timeout de 5 min por intento). Marca la notificación `enviada` si al menos un canal tuvo éxito, o `fallida` si todos fallaron, registrando `intentos` y `error_detalle`. `iniciarCronDespacho()` programa `cron.schedule("0 7 * * *", ...)`.

---

## `prisma/schema.prisma` — modelo de datos

Generador `prisma-client` (salida a `lib/generated/prisma`), datasource PostgreSQL. Diseñado para que Fase 2 se incorpore **solo agregando** entidades/columnas nullable (ver [extensibilidad-fase2.md](./extensibilidad-fase2.md)).

**Enums:** `ColumnaKanban` (`nuevo | en_seguimiento | requiere_accion | vencido | archivado`), `EstadoPlazo` (`pendiente | cumplido | vencido`), `EstadoNotificacion` (`programada | enviada | fallida`).

| Modelo | Rol |
|---|---|
| `Usuario` | Abogado independiente (1 por cuenta en Fase 1). Relaciona con `ConfiguracionUsuario`, `Proceso[]`, `Notificacion[]`, `NotificacionInapp[]`, `ComentarioProceso[]`, `DocumentoProceso[]`. |
| `ConfiguracionUsuario` | 1:1 con `Usuario`: canales activos (`canal_inapp`, `canal_email`, `canal_whatsapp` + `numero_whatsapp`), `frecuencia_revision` (fija en Fase 1). |
| `Proceso` | Proceso judicial en seguimiento: `radicado` (23 dígitos), `id_proceso_cpnu`, ubicación/despacho, `sujetos_procesales`, `columna_kanban`, `seguimiento_activo`. Único por `(usuario_id, radicado)`. |
| `Actuacion` | Actuación procesal de la CPNU asociada a un `Proceso`: fechas, `es_nueva`, `analisis_completado`. Único por `(proceso_id, id_actuacion_cpnu)`. |
| `Plazo` | Plazo derivado del análisis IA de una `Actuacion`: `dias` (nullable si indeterminado), `es_habil`, `fecha_limite`, `estado`, `indeterminado`, `error_programacion`. |
| `Notificacion` | Notificación programada para un `Plazo`: `fecha_programada`, `estado`, `intentos`, `canal`, `error_detalle`. |
| `NotificacionInapp` | Notificación mostrada en la bandeja in-app (`leida`), opcionalmente ligada a una `Notificacion`. |
| `IntentoLogin` | Registro de intentos de login (`email`, `exitoso`, `ip`) para el bloqueo temporal de `lib/auth.ts`. |
| `ComentarioProceso` | Notas personales del usuario sobre un `Proceso`. |
| `DocumentoProceso` | Documento del expediente digital, `origen` `manual` o `cpnu` (deduplicado por `id_documento_cpnu` cuando aplica). |

---

## `app/` — presentación y API (Next.js App Router)

### Raíz
- **`middleware.ts`** — protege todas las rutas salvo `/login` y `/api/auth/*`, usando la config Edge-safe de `lib/auth.config.ts`; redirige a `/login?callbackUrl=...` si no hay sesión válida.
- **`app/layout.tsx`** — layout raíz: metadata global, `<html lang="es-CO">`, envuelve la app en `ToastProvider`.
- **`app/page.tsx`** — landing pública (`/`); si hay sesión redirige a `/tablero`, si no muestra propuesta de valor + CTA de login.
- **`app/error.tsx`** — error boundary de la app (toast + reintentar/volver al tablero).
- **`app/global-error.tsx`** — error boundary de última instancia (si falla el layout raíz); sin dependencias de providers/CSS modules/i18n, para poder renderizar incluso si esos módulos fallan.

### `app/login/`
- **`page.tsx`** — formulario de login (`'use client'`), usa `signIn('credentials', {redirect:false})` de `next-auth/react`; distingue `ACCOUNT_LOCKED` de otros errores (nunca revela qué campo falló); en éxito navega a `/tablero`.

### `app/(protected)/` (rutas autenticadas)
- **`layout.tsx`** — compone `Sidebar` + `<main>`; la verificación de sesión la hace el middleware, no este layout.
- **`tablero/page.tsx`** — el Kanban principal (`'use client'`, el archivo cliente más grande de `app/`): carga `GET /api/procesos`, agrupa en 5 columnas fijas, implementa drag-and-drop HTML5 **y** una alternativa accesible por teclado completa (levantar/mover/soltar/cancelar con anuncios `aria-live`), mover proceso vía `PATCH /api/procesos/:id` con actualización optimista y rollback, eliminar vía `DELETE` con modal de confirmación, e integra `ModalRegistro` y `ModalDetalle`.
- **`notificaciones/page.tsx`** — bandeja in-app (`GET /api/notificaciones`), redirige a `/login` en 401.
- **`configuracion/page.tsx`** — activación de canales in-app/email/WhatsApp (`GET`/`PATCH /api/configuracion`) con actualización optimista y rollback; frecuencia de revisión de solo lectura en Fase 1.

### `app/api/auth/`
- **`register/route.ts`** — `POST` público: valida nombre/email/password, verifica unicidad, hashea con bcrypt (12 rounds), crea `Usuario` + `ConfiguracionUsuario` por defecto en una transacción.
- **`[...nextauth]/route.ts`** — expone `GET`/`POST` reexportando `handlers` de `lib/auth.ts` (login, logout, sesión, CSRF); sin lógica propia.

### `app/api/configuracion/route.ts`
`GET`/`PATCH`, requiere sesión. `GET` incluye `frecuencia_editable` (siempre `false` en Fase 1, vía `lib/guardas-fase1`). `PATCH` rechaza cambios a `frecuencia_revision` (`403`), valida el número de WhatsApp con regex antes de permitir activar ese canal (`400` si inválido).

### `app/api/notificaciones/route.ts`
`GET`, requiere sesión: notificaciones in-app del usuario, no leídas primero.

### `app/api/procesos/`
- **`route.ts`** — `GET` (llama `marcarPlazosVencidos` antes de listar; agrupa por columna Kanban) / `POST` (valida radicado, evita duplicados `409`, consulta la CPNU real, crea `Proceso`+`Actuacion[]` en transacción, sincroniza documentos best-effort). `runtime="nodejs"`, `maxDuration=300`.
- **`[id]/route.ts`** — `GET` (detalle completo, marca vencidos primero) / `PATCH` (mover de columna, valida contra la lista de columnas válidas) / `DELETE` (cascada a actuaciones/plazos). Nunca devuelve `403` por no-pertenencia, siempre `404`, para no revelar existencia de recursos ajenos.
- **`[id]/comentarios/route.ts`** — `GET`/`POST` notas del proceso (máx. 5000 caracteres).
- **`[id]/documentos/route.ts`** — `GET` lista expediente digital / `POST` sube archivo (`multipart/form-data`, whitelist de MIME, máx. 10MB, nombre único en disco). `maxDuration=60`.
- **`[id]/documentos/[docId]/route.ts`** — `GET` descarga binaria (streaming con headers `Content-Disposition`) / `DELETE` borra archivo físico + registro.

---

## `components/` — sistema de diseño

- **`index.ts`** — barrel de reexportación de todo el sistema de diseño.
- **`Boton.tsx`** — botón base (`variante: primario|secundario|acento`, `cargando`, `icono`), objetivo táctil ≥44px, `aria-busy`.
- **`Input.tsx`** — input accesible: label obligatoria, `aria-invalid`/`aria-describedby`/`aria-required`, `id` autogenerado con `useId()` si no se provee.
- **`Tarjeta.tsx`** — contenedor "card" con neumorfismo; building block usado en casi toda la UI.
- **`BadgeEstado.tsx`** — badge de `EstadoProceso` (tipo también usado por `tablero/page.tsx`): etiqueta + ícono + `aria-label`, nunca solo color.
- **`BotonLogout.tsx`** — botón que llama `signOut({redirectTo:'/login'})`.
- **`Logo.tsx`** — logotipo textual "LexAI" sin imágenes (`variant: full|compact`).
- **`Modal.tsx`** — modal base accesible: `role="dialog"`+`aria-modal`, gestión y restitución de foco, focus trap manual, cierre con `Escape`/overlay, bloqueo de scroll. Base de `ModalRegistro` y `ModalDetalle`.
- **`ModalRegistro.tsx`** — alta de proceso: un campo `radicado` (23 dígitos), `POST /api/procesos`, mensajes distintos por código de estado (`409`/`404`/`503`).
- **`ModalDetalle.tsx`** — el componente más grande del sistema de diseño (~820 líneas): 5 tabs accesibles (General, Actuaciones, Plazos, Expediente digital, Comentarios) sobre `GET /api/procesos/:id`, con subida/descarga/borrado de documentos y CRUD de comentarios.
- **`NavPrincipal.tsx`** / **`NavStandby.tsx`** — componentes de navegación exportados en `index.ts`, cuya funcionalidad equivalente está reimplementada inline dentro de `Sidebar.tsx`; no se detectaron imports activos desde las páginas actuales (posible remanente de una iteración anterior del sidebar).
- **`Sidebar.tsx`** — navegación lateral responsiva (colapsable en escritorio con persistencia en `localStorage`, drawer con overlay en móvil): procesos, ítems "en standby" no funcionales (Kanban de tutelas, Redacción con IA — Fase 2), notificaciones, configuración, logout.
- **`Toast.tsx`** — `ToastProvider` + hook `useToast()`: notificaciones efímeras (`error|exito|info`), autodestrucción a los 6s, `role="alert"` para errores.
