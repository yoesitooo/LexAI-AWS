# Resultados del Probe CPNU

## Fecha de ejecución
2026-07-22

## Estado: PENDIENTE VERIFICACIÓN LIVE

### Resultado
La API de la Rama Judicial de Colombia (`consultaprocesos.ramajudicial.gov.co:448`) no es accesible desde el entorno de desarrollo actual (timeout después de 30s). Esto es esperado ya que:
1. La API requiere conectividad directa desde Colombia o sin restricciones de red
2. El puerto 448 puede estar bloqueado por firewalls corporativos
3. El servidor puede tener geo-restricciones

### Endpoints validados (por análisis del portal público)

#### 1. Consulta por radicado — CONFIRMADO (por documentación y análisis)
```
GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Procesos/Consulta/NumeroRadicacion
  ?numero=11001310303220170012300
  &SoloActivos=false
  &pagina=1
```

**Fuente de confirmación:**
- PRD del proyecto (endpoint explícitamente documentado)
- Análisis del portal público consultaprocesos.ramajudicial.gov.co
- Headers confirmados por inspección del tráfico del portal Angular

#### 2. Detalle de actuaciones — PENDIENTE CONFIRMACIÓN LIVE
```
GET https://consultaprocesos.ramajudicial.gov.co:448/api/v2/Proceso/Actuaciones/{idProceso}
  ?pagina=1
```

**Fuente de inferencia:**
- Análisis del código Angular del frontend del portal
- Patrón RESTful consistente con el endpoint de procesos
- La app del portal realiza llamadas a este patrón cuando se abre el detalle

### Acciones pendientes para confirmación
1. Ejecutar `npx tsx scripts/probe-cpnu.ts` desde una red con acceso a la API (Colombia, sin restricciones de puerto 448)
2. Verificar la estructura exacta de la respuesta de procesos
3. Confirmar el endpoint de actuaciones y su formato de respuesta
4. Actualizar fixtures con datos reales si difieren de la estructura documentada

### Estructura del cliente
El cliente (`lib/cpnu-client.ts`) está preparado para ambos endpoints con:
- Rate limiting (máx 2 req/s, espaciado 500ms)
- Timeout de 30s
- Hasta 3 reintentos por petición
- Validación de radicado antes de consultar
- Contrato TypeScript completo y mockeable
