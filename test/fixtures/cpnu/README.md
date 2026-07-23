# Fixtures CPNU — Consulta de Procesos Nacional Unificada

## Origen

Estos fixtures representan la estructura real de las respuestas de la API de la Rama Judicial de Colombia:
- **Base URL**: `https://consultaprocesos.ramajudicial.gov.co:448/api/v2`
- **Portal público**: `https://consultaprocesos.ramajudicial.gov.co/`

## Endpoints documentados

### 1. Consulta por radicado (CONFIRMADO)

```
GET /api/v2/Procesos/Consulta/NumeroRadicacion
  ?numero={23_digitos}
  &SoloActivos={true|false}
  &pagina={int}
```

**Headers requeridos:**
- `Accept: application/json, text/plain, */*`
- `Referer: https://consultaprocesos.ramajudicial.gov.co/`
- `User-Agent: {navegador estándar}`

**Respuesta:** `{ procesos: ProcesoCPNU[] }`

### 2. Detalle de actuaciones (PENDIENTE CONFIRMACIÓN LIVE)

```
GET /api/v2/Proceso/Actuaciones/{idProceso}
  ?pagina={int}
```

**Headers:** mismos que consulta por radicado.

**Respuesta esperada:** `{ actuaciones: ActuacionCPNU[] }` o directamente `ActuacionCPNU[]`

**Estado:** Endpoint inferido del análisis del frontend Angular del portal. La URL sigue el patrón RESTful de la API v2. Pendiente de confirmación con una llamada live cuando el entorno lo permita.

## Archivos de fixture

| Archivo | Descripción |
|---------|-------------|
| `consulta-radicado-exitosa.json` | Un proceso encontrado para un radicado de Bogotá |
| `consulta-radicado-multiples.json` | Dos procesos para un radicado de Medellín |
| `consulta-radicado-sin-resultados.json` | Sin procesos (radicado inexistente) |
| `actuaciones-proceso.json` | 6 actuaciones típicas de un proceso civil colombiano |
| `actuaciones-proceso-vacio.json` | Sin actuaciones (proceso sin historial) |

## Estructura de `ProcesoCPNU`

```typescript
{
  idProceso: number;          // ID interno CPNU
  llaveProceso: string;       // Radicado/llave del proceso
  fechaProceso: string|null;  // ISO date
  fechaUltimaActuacion: string|null;
  despacho: string;           // Nombre del juzgado
  departamento: string;       // Departamento colombiano
  sujetosProcesales: string;  // "DEMANDANTE: ... | DEMANDADO: ..."
  esPrivado: boolean;
  cantFilas: number;          // Total registros (para paginación)
}
```

## Estructura de `ActuacionCPNU`

```typescript
{
  idRegActuacion: number;     // ID único actuación
  llaveProceso: string;
  consActuacion: number;      // Consecutivo
  fechaActuacion: string;     // Fecha de la actuación
  actuacion: string;          // Tipo (Auto, Sentencia, etc.)
  anotacion: string;          // Detalle/texto de la actuación
  fechaInicia: string|null;   // Inicio de término
  fechaFinaliza: string|null; // Fin de término
  fechaRegistro: string;      // Registro en sistema
  existeDocs: boolean;        // Documentos adjuntos
}
```

## Paginación

La API no retorna un objeto de paginación explícito en la respuesta. La paginación se infiere de:
- `cantFilas` en cada elemento de `procesos[]` indica el total de registros
- Se divide por la cantidad de registros por página (típicamente 10-20)
- Se incrementa `pagina` secuencialmente desde 1

## Notas de implementación

- Los datos en los fixtures son ficticios pero con estructura realista
- Los radicados siguen el formato real: 5+2+2+3+4+7 = 23 dígitos
- Los textos de actuaciones usan terminología procesal colombiana real
- Las fechas están en formato ISO para facilitar el parsing
- El campo `sujetosProcesales` viene como string con separador `|`
