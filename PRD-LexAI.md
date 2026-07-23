# PRD — LexAI
## Plataforma SaaS de trazabilidad procesal para abogados independientes

> Este documento es el contexto completo del proyecto para ser usado por Kiro (IDE con Spec-Driven Development). Contiene el problema, alcance, modelo de datos, arquitectura técnica sugerida y plan de ejecución para un hackatón de 5 días con equipo de 3 personas. Kiro debe usar este documento para generar los specs (requirements → design → tasks) y ejecutar la implementación completa.

---

## 0. Alcance geográfico — SOLO COLOMBIA

**Este producto es exclusivamente para el sistema judicial de Colombia.** No es un producto multi-país ni debe diseñarse pensando en portabilidad a otras jurisdicciones. Esto no es un detalle menor: afecta decisiones de diseño concretas que Kiro debe respetar y NO generalizar:

- La única fuente de datos es la **Rama Judicial de Colombia** (CPNU). No hay abstracción de "múltiples fuentes por país".
- El identificador de proceso es el **radicado colombiano de 23 dígitos** con su estructura específica (municipio DANE, entidad, especialidad, despacho) — no es un ID genérico.
- El cálculo de plazos usa **días hábiles y festivos oficiales de Colombia** (Ley 51 de 1983 y normas relacionadas). No usar librerías genéricas de "business days" sin festivos colombianos cargados — deben ser los festivos reales de Colombia para el año en curso y siguientes.
- El marco de referencia procesal (traslados, términos, ejecutorias, etc.) es el del **derecho procesal colombiano**. El prompt que se le dé al LLM para clasificar actuaciones debe estar redactado asumiendo terminología jurídica colombiana, no genérica.
- Moneda, idioma (español de Colombia), formato de fecha (día/mes/año) y zona horaria (**America/Bogotá, UTC-5, sin horario de verano**) deben ser fijos, no configurables por país.
- El público objetivo (abogados independientes) es el mercado colombiano — no diseñar onboarding, copy ni pricing pensando en otros mercados.

Si en algún punto Kiro sugiere "hacerlo configurable por país" o abstraer la fuente de datos para soportar otras jurisdicciones, esa sugerencia debe rechazarse: **fuera de alcance total**, no es parte de la visión del producto ni siquiera a futuro dentro de este documento.

---

## 1. Resumen ejecutivo

**Problema:** Los abogados independientes en Colombia deben revisar manualmente, proceso por proceso, el portal de Consulta de Procesos Nacional Unificada (CPNU) de la Rama Judicial para enterarse de nuevas actuaciones judiciales. Esto es lento, propenso a error humano, y hace fácil perder plazos procesales críticos (términos de días hábiles para responder, apelar, subsanar, etc.).

**Solución:** Una plataforma SaaS donde el abogado registra el número de radicado (23 dígitos) de sus procesos una sola vez. El sistema consulta automáticamente el estado de cada proceso todos los días hábiles, detecta cualquier actuación nueva, usa IA para leer el texto de la actuación y decidir si genera un plazo/alerta, y presenta todo en un tablero Kanban. El abogado recibe notificaciones (in-app, email, WhatsApp) antes de que se venzan los términos.

**Modelo de negocio:** SaaS por suscripción, dirigido inicialmente a abogados independientes, con posibilidad de evolucionar a despachos (multi-usuario, roles) en fases posteriores.

**Contexto de entrega:** Hackatón de 5 días, equipo de 3 personas, MVP funcional end-to-end del Módulo 1, desplegado en AWS. Los últimos 2 días del sprint están reservados exclusivamente para despliegue, por lo que el desarrollo funcional real es de 3 días.

---

## 2. Alcance del MVP (lo que Kiro debe construir ahora)

### ✅ En alcance (Fase 1 — este hackatón)
- **Módulo de Trazabilidad de Procesos** (núcleo del producto, ver sección 4)
- **Autenticación real** de usuarios (registro/login)
- **Módulo de configuración** básico, parametrizable: canal(es) de alerta por usuario
- **Vista Kanban** como pantalla principal

### 🟡 Dejar la arquitectura preparada, pero NO construir ahora
- Roles y permisos multi-usuario (fase 2)
- Multi-tenant real por despacho (fase 2) — para el MVP, un tenant = un abogado independiente, pero el modelo de datos debe poder extenderse a "despacho" sin refactor mayor
- Frecuencia de revisión configurable por patrón de juzgado (fase 2) — MVP usa revisión diaria fija para todos los procesos

### ⛔ Fuera de alcance total (solo dejar mención/placeholder en UI)
- **Kanban de tutelas** — dejar solo un módulo/tab visible con mensaje "Próximamente" o similar en el modal
- **Redacción asistida de demandas/tutelas con IA** (generación con IA sobre base de datos propia de demandas/tutelas anonimizadas) — mismo tratamiento, placeholder para fase 2

No construir lógica real de estos dos módulos. Solo reservar el espacio en la navegación/UI y dejar el modelo de datos abierto a que se puedan añadir después sin romper lo demás.

---

## 3. Usuarios objetivo

- **Usuario primario (MVP):** Abogado independiente en Colombia que litiga procesos judiciales y necesita monitorear vencimientos de términos.
- **Usuario futuro (fase 2+):** Despachos de abogados (múltiples usuarios, roles, permisos, gestión de equipo).

---

## 4. Módulo 1 — Trazabilidad de Procesos Judiciales (núcleo del MVP)

### 4.1 Fuente de datos

Fuente oficial: **Consulta de Procesos Nacional Unificada (CPNU)** de la Rama Judicial de Colombia.
- URL de consulta por radicado: `https://consultaprocesos.ramajudicial.gov.co/Procesos/NumeroRadicacion`
- Es una SPA (Angular), no un formulario server-side clásico → probablemente tiene una API REST propia detrás que el frontend consume.
- **Ya existen productos comerciales en el mercado (JustiBot, CoreSoft, NeoJurídico) que hacen exactamente esto**: consultar por radicado y comparar con la consulta anterior para detectar actuaciones nuevas. Esto confirma que el enfoque es viable técnicamente.

**✅ Investigación técnica ya realizada — endpoint confirmado (no hace falta spike de exploración, solo validación).**

Se hizo intercepción de tráfico de red sobre el portal real y se confirmó que expone una API REST directa, sin necesidad de navegador headless:

- **Endpoint:** `GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion`
  (nota el puerto no convencional **448**, no 443)
- **Query params:** `numero` (radicado de 23 dígitos), `SoloActivos` (boolean), `pagina` (integer, desde 1)
- **Headers recomendados** (no obligatorios pero recomendados para tráfico "orgánico"): `Accept: application/json, text/plain, */*`, `Referer: https://consultaprocesos.ramajudicial.gov.co/`, `User-Agent` de navegador estándar.
- **Sin CAPTCHA, sin tokens CSRF, sin sesión previa requerida** — es *stateless*, se puede consumir backend-to-backend sin simular navegador.
- **Respuesta:** JSON con `procesos[]` (cada uno con `idProceso`, `llaveProceso` = radicado, `despacho`, `departamento`, `sujetosProcesales` con demandante/demandado separados por `|`, `fechaUltimaActuacion`), más objeto `paginacion`.
- `idProceso` es el ID interno — probablemente necesario para consultar el detalle de actuaciones de ese proceso específico en otro endpoint relacionado (pendiente de confirmar cuál, ver tarea abajo).

**Tareas restantes para el día 1 (mucho más cortas que un spike desde cero):**
1. Reproducir esta petición contra 2-3 radicados reales para confirmar que sigue funcionando igual (las APIs no documentadas pueden cambiar sin aviso).
2. **Encontrar el endpoint del detalle de actuaciones** de un proceso (este reporte solo cubrió la consulta general por radicado; falta el listado completo de actuaciones históricas que es lo que se compara día a día). Repetir el mismo ejercicio de intercepción de red pero entrando al detalle de un proceso específico dentro del portal.
3. Implementar el cliente HTTP en una capa aislada (ej. `lib/cpnu-client.ts`) para poder ajustarlo rápido si el endpoint cambia.
4. Implementar rate limiting propio (1-2 peticiones/segundo, sin ráfagas) como buena práctica hacia un servicio público, aunque no se haya detectado throttling agresivo — evita riesgo de bloqueo de IP en producción.

Con esto, el riesgo mayor del proyecto (¿hay API o no?) queda resuelto — el riesgo restante es menor: confirmar el endpoint de actuaciones y que el hallazgo siga vigente al momento de construir.

### 4.2 Identificador de proceso

- **Número de radicado: 23 dígitos**, estructura:
  - 5 dígitos: código DANE del municipio
  - 2 dígitos: código de entidad/jurisdicción
  - 2 dígitos: código de especialidad (civil, laboral, penal, etc.)
  - 3 dígitos: código de despacho
  - resto: año y consecutivo
- Este es el único identificador necesario para registrar un proceso en el MVP (no se requiere gestión de clientes en esta fase).

### 4.3 Flujo de registro de un proceso

1. Usuario autenticado ingresa el número de radicado (23 dígitos) en un formulario.
2. Sistema valida formato (23 dígitos numéricos).
3. Sistema hace la primera consulta contra la fuente y trae: partes procesales, juzgado, departamento/ciudad, tipo de proceso, listado completo de actuaciones históricas.
4. Se crea el registro del proceso en la BD con su historial inicial de actuaciones.
5. El proceso queda en seguimiento activo (revisión diaria automática desde ese momento).

### 4.4 Job de revisión diaria

- **Frecuencia:** diaria, de lunes a viernes, excluyendo festivos colombianos (usar librería/tabla de festivos de Colombia — importante para el cálculo de términos, ver 4.5).
- Para cada proceso activo: hacer la consulta, comparar el listado de actuaciones traído contra el histórico guardado en BD.
- **Criterio de "cambio relevante": cualquier actuación nueva cuenta**, sin filtrar por palabras clave. (No solo términos/plazos — se debe reflejar todo movimiento del proceso).
- Cada actuación nueva detectada se guarda en el histórico y dispara el flujo de análisis con IA (4.5).
- Implementar como job/cron (no depender de invocación manual). Para el MVP en AWS: puede ser un cron simple corriendo en el mismo servidor (ver arquitectura, sección 6), no es necesario Lambda/EventBridge para esta entrega.

### 4.5 Análisis con IA y cálculo de plazos

- Cuando se detecta una actuación nueva, se envía el texto de la actuación a un modelo de lenguaje (LLM).
- El LLM debe:
  1. Determinar si la actuación implica un plazo/término a cargo del abogado (ej. "traslado por 3 días", "se corre traslado", "término de ejecutoria", etc.)
  2. Si aplica, extraer la duración del plazo en días.
  3. Clasificar si el plazo es en **días hábiles** (por defecto en derecho procesal colombiano, salvo que el texto indique lo contrario).
- **Cálculo de fecha límite:** días hábiles en Colombia (excluir sábados, domingos y festivos nacionales).
- **Regla de notificación (importante, tal como la definió el usuario):**
  - Se notifica **el día calendario anterior** a cada día hábil que reste del plazo — es decir, si el plazo vence el lunes, se notifica el domingo (aunque no sea hábil), y también se notifica en cada uno de los días hábiles previos al vencimiento según corresponda.
  - En otras palabras: las notificaciones se calculan sobre el calendario real (para no perder el aviso por estar en fin de semana), pero el cómputo del plazo en sí (cuándo vence) se hace en días hábiles.
- Debe quedar parametrizado como configuración (no hardcodeado) para poder ajustar la regla de notificación después.

### 4.6 Canales de notificación

- In-app, Email, WhatsApp.
- Deben ser **configurables por usuario** (activar/desactivar cada canal) desde el módulo de configuración.
- Para WhatsApp en el MVP: usar un proveedor con API simple (ej. Twilio WhatsApp API o similar) — Kiro debe evaluar cuál tiene mejor tier gratuito/sandbox para pruebas rápidas en 5 días.

### 4.7 Vista Kanban

- Pantalla principal de la aplicación tras login.
- Columnas sugeridas (ajustar si al revisar la fuente aparecen estados propios del sistema judicial que tenga más sentido reflejar): Nuevo / En seguimiento / Requiere acción / Vencido / Archivado.
- **Información mínima visible en cada tarjeta:**
  - Número de radicado
  - Partes procesales (demandante/demandado)
  - Último estado/actuación
  - Juzgado
  - Departamento/ciudad (ubicación)
- Al abrir una tarjeta: ver histórico completo de actuaciones y plazos calculados/activos para ese proceso.

### 4.8 Módulo de configuración (MVP)

- Parametrizable: canales de notificación activos por usuario.
- Frecuencia de revisión: fija (diaria, días hábiles) en esta fase — no editable por el usuario todavía, pero el campo debe existir en el modelo de datos para habilitarlo en fase 2.
- Roles/permisos: no se implementan en esta fase.

---

## 5. Módulos en standby (solo placeholder en UI)

- **Kanban de tutelas:** un ítem de navegación visible con estado "Próximamente" / modal informativo. Sin lógica funcional.
- **Redacción de demandas/tutelas asistida por IA:** mismo tratamiento. En el futuro funcionará generando borradores con IA a partir de una base de datos propia de demandas/tutelas (con datos censurados/anonimizados) más los datos del caso concreto. No implementar en este MVP, solo dejar la mención.
- El modelo de datos general debe quedar diseñado de forma que estos módulos se puedan añadir después sin requerir rediseño de las tablas núcleo (procesos, actuaciones, usuarios).

---

## 6. Arquitectura técnica recomendada

Contexto: equipo de 3 personas, 5 días totales, **2 últimos días exclusivos para despliegue en AWS**, sin experiencia previa en AWS. Prioridad: simplicidad y velocidad de entrega sobre "arquitectura ideal".

### Stack recomendado

| Capa | Recomendación | Por qué |
|---|---|---|
| Frontend | **Next.js (App Router)** | Ya lo tenían en mente, permite SSR y buen DX |
| Backend | **Next.js API Routes / Route Handlers** (todo en el mismo proyecto, monolito) | Con 3 personas y 3 días de desarrollo real, mantener un solo repo/lenguaje (TypeScript) reduce fricción de integración drásticamente frente a separar en Python/Java. Ver excepción abajo. |
| Job de scraping/consulta diaria | **Node.js script con `node-cron`** (o proceso separado si el spike de la sección 4.1 determina que se necesita Playwright) | Si el endpoint de la Rama Judicial resulta ser una API JSON limpia, un fetch HTTP simple desde Node basta. Si se necesita Playwright, correrlo como un worker aparte dentro del mismo servidor. |
| Base de datos | **PostgreSQL** (relacional, como pediste) | Encaja natural con relaciones proceso→actuaciones→plazos→usuario |
| IA para lectura de actuaciones | Modelo con **tier gratuito**: evaluar Google Gemini (tier gratuito generoso) o Anthropic Claude (créditos limitados) — Kiro debe dejar esto como variable de entorno intercambiable, no hardcodear un proveedor | Clasificación de texto jurídico corto, no requiere modelo enorme |
| Notificaciones email | Resend o AWS SES (tier gratuito) | Simple de integrar con Next.js |
| Notificaciones WhatsApp | Twilio WhatsApp Sandbox (gratis para pruebas) | Rápido de activar sin aprobación de Meta Business |
| Autenticación | NextAuth.js / Auth.js con credenciales o email+password | Autenticación real como pediste, sin fricción de configurar OAuth externo bajo presión de tiempo |
| Despliegue AWS | **Un solo EC2 (t3.small) corriendo todo con Docker Compose** (Next.js + Postgres + cron worker en contenedores) | Dado que el equipo no conoce AWS y solo tiene 2 días para desplegar: evitar ECS/Fargate/RDS/Amplify multi-servicio. Un solo servidor con `docker compose up` es el camino más corto a "funcionando en producción" sin curva de aprendizaje de AWS. |

**Nota sobre backend Python/Java:** dijiste que no sabían cuál elegir. Mi recomendación firme para este contexto (poco tiempo, equipo pequeño) es **no dividir en dos lenguajes**. Next.js full-stack (frontend + API routes) es suficiente para este alcance y elimina una capa entera de complejidad de integración y despliegue. Si el spike de la sección 4.1 determina que Playwright es indispensable, se puede correr como un script Node aparte (mismo lenguaje, mismo repo) — no hace falta Python solo para eso.

### Notas de despliegue AWS (para los últimos 2 días)
- Provisionar un solo EC2 t3.small con Ubuntu, Docker y Docker Compose.
- Un `docker-compose.yml` con 3 servicios: `web` (Next.js), `db` (Postgres con volumen persistente), `worker` (cron del job diario).
- Variables de entorno vía archivo `.env` (no versionado) para: DB connection string, API key del LLM, credenciales de Twilio/Resend, `NEXTAUTH_SECRET`.
- Dominio: si no hay tiempo para Route53 + certificado, usar el DNS público del EC2 o un subdominio gratuito (ej. nip.io) + Caddy para HTTPS automático (más simple que configurar Nginx + Certbot manualmente).
- Dejar un script `deploy.sh` simple (git pull + docker compose up -d --build) para poder iterar rápido durante la demo.

---

## 7. Modelo de datos (alto nivel, para que Kiro lo detalle)

Entidades núcleo:
- **Usuario** (id, nombre, email, password_hash, canales_notificacion_activos, creado_en)
- **Proceso** (id, usuario_id, numero_radicado, juzgado, departamento, ciudad, tipo_proceso, partes_procesales [json], estado_actual, columna_kanban, creado_en, ultima_revision_en)
- **Actuacion** (id, proceso_id, fecha_actuacion, texto, detectada_en, es_nueva)
- **Plazo** (id, actuacion_id, dias_plazo, es_habil, fecha_limite_calculada, notificaciones_generadas [json], estado [pendiente/cumplido/vencido])
- **ConfiguracionUsuario** (usuario_id, canal_inapp_activo, canal_email_activo, canal_whatsapp_activo, telefono_whatsapp)

Diseñar con espacio para extender a `Despacho` (tenant) y `Rol` en fase 2 sin migrar todo el esquema.

---

## 8. Riesgos principales

1. **Riesgo bajo (ya mitigado):** se confirmó que existe un endpoint REST directo sin CAPTCHA ni sesión (ver sección 4.1). Riesgo residual: que el endpoint cambie por ser no documentado, o que falte confirmar el endpoint específico de actuaciones — validar ambos el día 1 antes de construir sobre ellos.
2. **Riesgo medio:** cálculo de días hábiles/festivos colombianos mal hecho → usar una fuente confiable de festivos (ej. librería de festivos CO o tabla estática de festivos 2026).
3. **Riesgo medio:** WhatsApp API real requiere aprobación de Meta que puede tardar → usar modo sandbox de Twilio para la demo, dejar claro que en producción real se necesita aprobación.
4. **Riesgo bajo:** despliegue AWS con equipo sin experiencia → mitigado por elegir la opción más simple posible (un solo EC2 + Docker Compose) en vez de arquitectura distribuida.

---

## 9. Datos de prueba

- Se debe conseguir 2-3 números de radicado reales (23 dígitos) de procesos públicos para usar durante el desarrollo y la demo. Esto debe hacerse el día 1, en paralelo al spike técnico.

---

## 10. Diseño UI/UX — Neumorfismo accesible, estilo iOS, paleta blanco y negro

Esta sección es **obligatoria y transversal**: aplica a todos los módulos y pantallas del MVP (login, Kanban, configuración, y también a los placeholders de los módulos en standby). Ningún requerimiento de esta sección se negocia por velocidad de desarrollo — si hay que elegir entre "más rápido" y "cumple esto", Kiro debe preguntar antes de sacrificar diseño o accesibilidad.

### 12.1 Referencia visual
Se adjunta una imagen de referencia (mockup) como **guía de estilo únicamente** — paleta, tono general, tipografía, sensación de "suite profesional". **No se debe copiar el layout, la nomenclatura de módulos ni el contenido literal de esa imagen** (los nombres de sección, textos de ejemplo, disposición exacta de 3 columnas, etc. son solo ilustrativos). Kiro debe diseñar la disposición real en función de lo que el MVP necesita mostrar según las secciones 4 y 5 de este documento (Kanban como vista principal, no un editor de documentos partido en 3 columnas).

### 12.2 Estilo visual: Neumorfismo elegante, inspirado en iOS

- **Neumorfismo (soft UI):** superficies que parecen "talladas" o "extruidas" del mismo fondo, usando sombras duales sutiles (una clara y una oscura) en vez de bordes duros o sombras planas tipo Material Design.
- **Inspiración iOS:** esquinas muy redondeadas (border-radius generoso y consistente), espaciado generoso (mucho "aire" entre elementos), tipografía clara con jerarquía marcada, transiciones suaves (ease-in-out, ~200-300ms), iconografía delgada (line icons, no filled), sin ruido visual innecesario.
- **Elegancia:** nada de gradientes llamativos, sin colores saturados, jerarquía por tamaño/peso tipográfico y espaciado — no por color.
- Los componentes deben sentirse "premium" y serios, acorde a un producto usado por abogados (evitar cualquier elemento que se sienta "gamificado" o infantil).

### 12.3 Paleta: blanco y negro (monocromática)

- Base: escala de grises — blanco/gris muy claro para fondos, gris medio para superficies neumórficas, negro/gris oscuro para texto y elementos de alto énfasis.
- **Un único color de acento permitido**, usado con moderación y solo para estados funcionales críticos (ej. alertas de vencimiento, botón primario, estado "Vencido" en el Kanban) — no para decoración. Kiro puede proponer un acento sobrio (ej. un rojo apagado para vencimientos, o simplemente variaciones de negro/gris) y justificarlo, ya que un producto 100% monocromático puede dificultar distinguir estados críticos (ver 12.5).
- Modo oscuro: no es requisito para el MVP, pero el sistema de diseño (tokens de color) debe dejarse preparado para no requerir un rediseño si se agrega después.

### 12.4 Logo

- Se requiere un **logo elegante y coherente con el estilo definido** (monocromático, minimalista, con sensación premium/legal — no un ícono genérico de "balanza de la justicia" gastado por sobreuso).
- Debe funcionar bien en tamaños pequeños (favicon, ícono de app) y en versión solo-texto (wordmark) para casos donde no hay espacio para el isotipo.
- Debe verse coherente tanto sobre fondo claro como oscuro (versión en negativo).
- El nombre de marca definitivo es **LexAI**. Kiro debe generar el logo (SVG) acorde a este nombre como parte de las tareas de diseño, no como ocurrencia tardía — debe quedar listo antes de aplicarse a la UI general.

### 12.5 Accesibilidad — requisito NO negociable, incluso sobre el estilo visual

**Principio rector: la estética neumórfica se aplica a elementos decorativos y contenedores; los elementos funcionales/interactivos SIEMPRE priorizan la accesibilidad sobre el efecto visual.** Esto es necesario porque el neumorfismo "clásico" (contraste muy bajo entre elemento y fondo) es incompatible por diseño con WCAG — así que se define aquí la versión que sí es compatible:

- **Contraste:** todo texto y todo componente interactivo (botones, inputs, íconos clickeables, bordes de tarjetas del Kanban) debe cumplir **WCAG 2.1 nivel AA** como mínimo (4.5:1 texto normal, 3:1 texto grande y componentes UI). Las sombras neumórficas no cuentan como el único indicador de que algo es interactivo — todo elemento clickeable debe tener también un borde, cambio de color o ícono que lo distinga, no solo relieve.
- **Estados de foco visibles:** navegación completa por teclado (Tab/Shift+Tab) con un indicador de foco claramente visible en cada elemento interactivo — no eliminar el outline de foco por estética, rediseñarlo para que encaje con el estilo pero siga siendo visible.
- **Lectores de pantalla:** HTML semántico, roles ARIA correctos en el Kanban (que no sea solo `div`s con drag-and-drop visual sin anunciar cambios de estado a un lector de pantalla), `alt` en toda imagen/ícono con significado, labels asociados a cada input.
- **No depender solo del color:** los estados del Kanban (Nuevo/En seguimiento/Requiere acción/Vencido/Archivado) deben distinguirse también por texto/ícono, no solo por el color de acento — pensando en usuarios con daltonismo.
- **Texto redimensionable:** el layout no debe romperse si el usuario aumenta el zoom del navegador o el tamaño de fuente del sistema hasta 200%.
- **Movimiento reducido:** respetar la preferencia del sistema operativo `prefers-reduced-motion` — las transiciones/animaciones suaves del estilo iOS deben poder desactivarse.
- **Tamaño de objetivo táctil:** áreas clickeables de mínimo 44x44px (estándar de accesibilidad móvil de Apple), relevante también para pantalla táctil/tablet.
- Estos requisitos aplican a **todas** las pantallas del MVP, no solo a las "principales" — incluyendo login, formularios de configuración y el modal de registro de proceso.

### 12.6 Qué NO sacrificar por velocidad de desarrollo
Dado que el proyecto tiene solo 3 días reales de desarrollo, existe la tentación de dejar el diseño "para después" o usar componentes por defecto sin pulir. Esto no aplica aquí: el sistema de diseño (tokens de color, tipografía, componentes base neumórficos accesibles, y el logo) debe construirse **desde el día 1 como parte del setup del proyecto** (junto con la infraestructura técnica de la sección 6), no como una capa de estilos aplicada al final. Kiro debe crear un pequeño design system / librería de componentes reutilizables (botón, input, tarjeta, badge de estado) que ya cumplan lo anterior, para que el resto del desarrollo solo los consuma.

---

## 11. Qué NO construir en este MVP (recordatorio explícito para Kiro)

- No gestión de clientes.
- No multi-tenant real ni roles/permisos.
- No frecuencia de revisión configurable por juzgado/patrón.
- No lógica funcional de Kanban de tutelas ni de redacción de demandas — solo placeholders de navegación.
