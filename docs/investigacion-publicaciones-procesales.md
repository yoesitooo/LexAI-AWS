# Investigación — Portal de Publicaciones Procesales (Rama Judicial)

**Fecha de la investigación:** 2026-07-26
**Fuente investigada:** `https://publicacionesprocesales.ramajudicial.gov.co/`
**Estado:** Investigación completa. **No implementado.** Documento de referencia para una decisión futura.

---

## 1. Por qué se investigó

LexAI ya descarga documentos desde la **CPNU** (`consultaprocesos.ramajudicial.gov.co:448`,
ver [`lib/cpnu-client.ts`](../lib/cpnu-client.ts) y [`lib/descarga-documentos.ts`](../lib/descarga-documentos.ts)),
usando el endpoint `GET /Proceso/DocumentosActuacion/{idRegActuacion}`.

El problema observado en producción: **la CPNU casi nunca trae documentos adjuntos**.
La mayoría de actuaciones vienen con `conDocumentos: false`, así que el historial de actuaciones
queda con el texto de la actuación pero sin ningún archivo descargable.

Ejemplo real verificado en la base de datos local (2026-07-26):

| Proceso | Actuaciones | Con `existe_docs = true` | Documentos descargados |
|---|---|---|---|
| `15001311000320230035500` | 24 | **0** | 0 |

La hipótesis a evaluar era: *¿el portal de Publicaciones Procesales sí tiene los documentos
de forma consistente, y se pueden traer automáticamente?*

---

## 2. Naturaleza del portal

No es una API. Es un **portal Liferay 7.1.3 CE** que renderiza HTML.

```
Liferay-Portal: Liferay Community Edition Portal 7.1.3 CE GA4 (Judson / Build 7102 / May 14, 2019)
```

El portlet que contiene la funcionalidad es:

```
co_com_avanti_efectosProcesales_PublicacionesEfectosProcesalesPortletV2_INSTANCE_BIyXQFHVaYaq
```

Ese `INSTANCE_BIyXQFHVaYaq` es el **ID de instancia del portlet** y aparece como prefijo
(*namespace*) en todos los parámetros. **Es un valor que el portal puede cambiar** si
reconfiguran la página — habría que extraerlo dinámicamente del HTML en vez de hardcodearlo.

La API REST nativa de Liferay (`/o/api/doc`) responde **403**, así que no es una vía alterna.

---

## 3. Endpoints descubiertos (todos confirmados en vivo)

### 3.1 Filtros en cascada — devuelve JSON limpio ✅

Único endpoint que responde JSON en vez de HTML. Sirve para obtener municipios y despachos
de un departamento.

```
GET https://publicacionesprocesales.ramajudicial.gov.co/web/publicaciones-procesales/inicio
  ?p_p_id=co_com_avanti_efectosProcesales_PublicacionesEfectosProcesalesPortletV2_INSTANCE_BIyXQFHVaYaq
  &p_p_lifecycle=2
  &p_p_state=normal
  &p_p_mode=view
  &p_p_cacheability=cacheLevelPage
  &{NS}tipoFiltro=departamento
  &{NS}idFiltro={codigoDepto}       # ej. "15" (Boyacá)
  &{NS}id={idCategoriaDepto}        # ej. "178849595" — ver tabla en §7
```

Respuesta:

```json
{
  "filtros":   [{ "id": "15001", "nombre": "TUNJA" }, ...],
  "despachos": [{ "id": "150013110003", "nombre": "150013110003 - JUZGADO 003 DE FAMILIA DE TUNJA" }, ...]
}
```

### 3.2 Búsqueda de publicaciones — devuelve HTML ⚠️

```
GET https://publicacionesprocesales.ramajudicial.gov.co/web/publicaciones-procesales/inicio
  ?p_p_id=...INSTANCE_BIyXQFHVaYaq
  &p_p_lifecycle=0
  &p_p_state=normal
  &p_p_mode=view
  &{NS}action=busqueda
  &{NS}fechaInicio=2026-07-20        # YYYY-MM-DD
  &{NS}fechaFin=2026-07-26
  &{NS}idDepto=11
  &{NS}idDeptoIdCategory=178847780   # requerido junto con idDepto
  &{NS}idMuni=11001                  # opcional
  &{NS}idEntidad=31                  # opcional
  &{NS}idEspecialidad=10             # opcional
  &{NS}idDespacho=110013110040       # opcional — el filtro clave
  &{NS}verTotales=true               # opcional
```

Devuelve una página HTML de **200–320 KB**. Los resultados están en filas de tabla;
cada una trae un botón "Ver detalle" y, en un bloque `resumen-publicacion`, el enlace al PDF.

> **Nota:** en la respuesta cruda ese bloque viene **dentro de un comentario HTML**
> (`<!-- <div class="resumen-publicacion"> ... -->`), pero el enlace al PDF está ahí y es
> parseable sin ejecutar JavaScript. La UI real lo muestra vía JS.

### 3.3 Descarga del PDF — pública, sin autenticación ✅

```
GET https://publicacionesprocesales.ramajudicial.gov.co/documents/{groupId}/{folderId}/{nombre}.pdf/{uuid}?t={timestamp}
```

Verificado:

```
STATUS:200  TYPE:application/pdf  SIZE:21024
test.pdf: PDF document, version 1.2, 2 page(s)
```

**No requiere cookies ni sesión.** El `groupId` observado para publicaciones fue `6098902`.

### 3.4 Página de detalle — no aporta ❌

`{NS}jspPage=/META-INF/resources/detail.jsp` + `{NS}articleId={id}`.
Se probó: **no contiene el enlace al PDF de la publicación**, solo PDFs institucionales
estáticos (instructivos, infografías). No vale la pena usarla.

---

## 4. Hallazgo clave: el despacho se deriva del radicado ✅

El portal filtra por un **código de despacho de 12 dígitos** que se arma exactamente con los
primeros 12 dígitos del radicado, que [`lib/validador-radicado.ts`](../lib/validador-radicado.ts)
**ya descompone**:

```
codDespacho = dane(5) + entidad(2) + especialidad(2) + despacho(3)
```

Verificado contra el proceso real del usuario:

```
Radicado: 15001311000320230035500
          15001 31 10 003 2023 0035500
          └─────────────┘
          codDespacho = 150013110003
```

Y ese código existe tal cual en la lista del portal:

```
150013110003 - JUZGADO 003 DE FAMILIA DE TUNJA
```

**Implicación:** no habría que pedirle ningún dato nuevo al usuario ni mantener un
mapeo manual de juzgados. La derivación es directa desde lo que ya tenemos.

---

## 5. Problemas encontrados (los que hacen dudar de la viabilidad)

### 5.1 🔴 No se puede buscar por radicado

El objeto de datos que el portal serializa en el HTML **tiene** un campo `radicado`:

```
radicado\x3dnull,  fechaRadicado\x3d2026-07-26, entry\x3dnull, articleId\x3d245029476,
codDepto\x3d11, codMuni\x3d11001, codEntidad\x3d41, codEspecialidad\x3d89,
codDespacho\x3d110014189008, nomDepto\x3dBOGOTÁ...
```

Pero vino **`radicado=null` en el 100% de los resultados muestreados**, en todas las búsquedas
(Bogotá jul-2026, Boyacá ago-2024, despacho específico). No hay forma de preguntar
"dame los documentos del radicado X".

El flujo obligado sería: buscar por despacho+fecha → descargar cada PDF → extraer su texto →
buscar el radicado adentro.

### 5.2 🔴 Los documentos son boletines compartidos, no documentos del caso

Un PDF de tipo "ESTADO" lista **muchos radicados de muchos procesos distintos**.
Texto real extraído de uno:

```
ESTADO No. 023
No Proceso                    Clase de Proceso        Demandante
11001 31 10 003  Alimentos  2026 00204                JEISON ANDRES RUIZ MORENO
11001 31 10 004  Verbal Mayor y Menor Cuantía 2026 00133  AARON DUBITZKY
11001 31 10 013  Verbal Sumario 2026 00163             CINDY PAOLA CALDERON GOMEZ
11001 31 10 040  Liquidacion Sucesoral 2026 00066      JAIRO ANDRES PEREZ WILCHEZ (QEPD)
...
REPUBLICA DE COLOMBIA / RAMA JUDICIAL
JUZGADO 040 FAMILIA DEL CIRCUITO — LISTADO DE ESTADO
Fecha: 27/07/2026
```

No existe "el documento de esta actuación". Existe *"el estado donde ese día apareció
listado tu caso junto con otros"*. Conceptualmente **es un feature distinto** al que se pidió.

### 5.3 🔴 La cobertura es parcial — y el despacho del usuario no publica

Búsqueda del despacho `150013110003` (el del proceso cargado hoy) en el rango
**completo 2023-01-01 → 2026-07-27**:

```
No se encontraron publicaciones procesales con los filtros seleccionados
```

Cero resultados. En cambio, Boyacá en general sí tiene publicaciones (10 solo en agosto 2024).
Es decir: **el despacho está registrado en el portal pero no publica ahí**. La adopción
varía juzgado por juzgado.

**Esto significa que integrar el portal no resolvería el proceso de prueba actual.**

### 5.4 🟡 Es scraping de HTML, no una API

- Respuestas de 200–320 KB por búsqueda.
- El parseo depende de markup (`resumen-publicacion`, `boton-detalle`) que puede cambiar sin aviso.
- El namespace del portlet (`INSTANCE_BIyXQFHVaYaq`) es configuración del portal, no un contrato.
- De 10 resultados en una búsqueda, **solo 6 traían enlace a PDF**.

### 5.5 🟡 El formato del radicado dentro de los PDFs varía

```
11001 31 10 003  ← despacho con 3 dígitos
11001 31 05 03   ← despacho con 2 dígitos (sin cero a la izquierda)
```

Además el consecutivo aparece con 5 dígitos (`00204`) cuando el radicado completo usa 7
(`0020400`). Requiere normalización: quitar espacios, rellenar con ceros, comparar solo dígitos.

### 5.6 🟡 Costo por proceso

Por cada proceso y rango de fechas: 1 búsqueda (~250 KB de HTML) + N descargas de PDF +
N extracciones de texto. Muy superior al costo actual contra la API de la CPNU.

---

## 6. Verificación de extracción de texto de los PDFs

Se descargaron 4 PDFs reales y se probó `pdftotext`. **Ninguno era escaneado** —
todos tienen texto extraíble:

| PDF | Caracteres extraídos | Radicado detectado |
|---|---|---|
| `126-003E.pdf` | 19 587 | ✅ `11001 40 03 059` |
| `Estado+122+27-07-2026+inadmite.pdf` | 7 540 | ✅ `11001 40 03 045` |
| `estado+22+CO.pdf` | 2 239 | ✅ `11001 31 10 003` |
| `87+siglo+xxi.pdf` | 1 616 | ⚠️ formato distinto (`11001 31 05 03`) |

**No haría falta OCR** en estos casos, pero la muestra es pequeña (4 documentos, todos de
Bogotá). Habría que validar con una muestra mayor antes de asumirlo.

---

## 7. Datos de referencia recolectados

### Tipos de publicación observados

En una sola búsqueda (Bogotá, julio 2026): `Estado` (45), `Traslado` (11), `Aviso` (4),
`Remate` (1), `Edicto` (1).

### IDs de categoría por departamento

Requeridos en el parámetro `idDeptoIdCategory`. **Son IDs internos de Liferay: pueden cambiar
si reorganizan el portal.** Extraídos del `<select id="departamento">` de la página principal:

| Cód. | Departamento | idCategory | | Cód. | Departamento | idCategory |
|---|---|---|---|---|---|---|
| 05 | ANTIOQUIA | 178845807 | | 68 | SANTANDER | 178855293 |
| 08 | ATLÁNTICO | 178847290 | | 70 | SUCRE | 178856154 |
| 11 | BOGOTÁ | 178847780 | | 73 | TOLIMA | 178856396 |
| 13 | BOLÍVAR | 178849104 | | 76 | VALLE DEL CAUCA | 178856860 |
| 15 | BOYACÁ | 178849595 | | 81 | ARAUCA | 178857843 |
| 17 | CALDAS | 178850384 | | 85 | CASANARE | 178857940 |
| 18 | CAQUETÁ | 178850746 | | 86 | PUTUMAYO | 178858103 |
| 19 | CAUCA | 178850921 | | 88 | SAN ANDRÉS | 178858244 |
| 20 | CESAR | 178851302 | | 91 | AMAZONAS | 178858280 |
| 23 | CÓRDOBA | 178851590 | | 94 | GUAINÍA | 178858310 |
| 25 | CUNDINAMARCA | 178851848 | | 95 | GUAVIARE | 178858326 |
| 27 | CHOCÓ | 178852660 | | 97 | VAUPÉS | 178858370 |
| 41 | HUILA | 178852856 | | 99 | VICHADA | 178858390 |
| 44 | LA GUAJIRA | 178853153 | | 47 | MAGDALENA | 178853311 |
| 50 | META | 178853632 | | 52 | NARIÑO | 178853974 |
| 54 | NORTE DE SANTANDER | 178854460 | | 63 | QUINDÍO | 178854894 |
| 66 | RISARALDA | 178855063 | | | | |

> El código de departamento (columna "Cód.") son los **2 primeros dígitos del DANE del radicado**,
> así que también sale gratis de la descomposición que ya hacemos.

---

## 8. Conclusión y recomendación

**Técnicamente viable, pero con valor incierto y costo alto.**

Lo que mata la propuesta en su forma original no es la dificultad técnica (que es manejable),
sino tres cosas de fondo:

1. **No entrega lo que se pidió.** Se buscaba "el documento de cada actuación"; el portal
   entrega boletines compartidos entre muchos procesos.
2. **No es confiable por proceso.** Depende de que el juzgado publique ahí, y muchos no lo hacen
   — incluido el del proceso de prueba actual, con cero publicaciones en más de 3 años.
3. **No hay búsqueda por radicado**, lo que obliga a descargar y leer PDFs a ciegas para
   averiguar si alguno menciona el caso.

### Si en el futuro se retoma

Plantearlo como un **feature distinto y explícito**: *"Estados y publicaciones donde apareció
tu proceso"*, separado del expediente digital y de los documentos de actuación. Y antes de
invertir en la implementación:

1. Construir un script aislado tipo `scripts/probe-publicaciones.ts` (siguiendo el patrón de
   [`scripts/probe-cpnu.ts`](../scripts/probe-cpnu.ts)) que, dado un lote de radicados reales,
   mida **la tasa real de aciertos**: cuántos procesos efectivamente encuentran publicaciones
   que los mencionen.
2. Decidir con ese número en la mano. Si la tasa es baja, no vale la pena el scraping.

### Riesgos a tener presentes si se implementa

- Es scraping de un portal público: el markup y los IDs internos de Liferay pueden cambiar sin aviso.
- Hay que respetar rate limiting (el `RateLimiter` de `cpnu-client.ts` ya sirve de modelo).
- Los PDFs contienen **datos personales de terceros** (nombres de demandantes de otros procesos),
  porque son boletines compartidos. Almacenarlos en el expediente de un usuario tiene
  implicaciones de privacidad que habría que revisar antes de persistirlos.
