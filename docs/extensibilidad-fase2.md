# Extensibilidad aditiva a Fase 2 — LexAI

## Principio rector

El modelo de datos de Fase 1 se diseñó para que Fase 2 se incorpore **solo agregando entidades, columnas nullable y relaciones**. Nunca se eliminan ni renombran tablas ni columnas núcleo existentes.

---

## 1. Despacho (multi-tenant)

### Estado actual (Fase 1)

- No existe la tabla `despacho`.
- `usuario` no tiene columna `despacho_id`.
- El sistema opera con un tenant implícito: cada abogado es su propio contexto.
- **Ninguna consulta de Fase 1 filtra por `despacho` ni `despacho_id`.**

### Migración sugerida para Fase 2

```sql
-- 1. Crear la tabla de despacho
CREATE TABLE despacho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(200) NOT NULL,
  nit VARCHAR(20),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Agregar FK nullable a usuario (no rompe registros existentes)
ALTER TABLE usuario
  ADD COLUMN despacho_id UUID NULL REFERENCES despacho(id);

-- 3. Índice para consultas multi-tenant
CREATE INDEX ix_usuario_despacho ON usuario(despacho_id);
```

### Cambios de código requeridos

- Actualizar el modelo Prisma con la relación `Usuario.despacho`.
- Agregar middleware/interceptor que inyecte `WHERE despacho_id = ?` en consultas de datos compartidos.
- Habilitar la guarda `DESPACHO` en `lib/guardas-fase1.ts` (cambiar a lógica real).
- Crear UI de gestión de despacho.

---

## 2. Roles y permisos

### Estado actual (Fase 1)

- No existen tablas `rol` ni `usuario_rol`.
- No hay lógica de autorización por rol — todo usuario autenticado tiene acceso completo a sus datos.
- Las guardas de Fase 1 rechazan cualquier operación que dependa de roles.

### Migración sugerida para Fase 2

```sql
-- 1. Tabla de roles
CREATE TABLE rol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabla puente usuario-rol (muchos a muchos)
CREATE TABLE usuario_rol (
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  rol_id UUID NOT NULL REFERENCES rol(id) ON DELETE CASCADE,
  asignado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rol_id)
);

-- 3. Roles iniciales
INSERT INTO rol (nombre, descripcion) VALUES
  ('abogado', 'Abogado titular — acceso completo a sus procesos'),
  ('asistente', 'Asistente — acceso de lectura con restricciones'),
  ('admin_despacho', 'Administrador del despacho — gestión de usuarios y roles');
```

### Cambios de código requeridos

- Actualizar modelos Prisma con `Rol` y `UsuarioRol`.
- Crear middleware de autorización que verifique permisos por rol antes de cada operación.
- Habilitar la guarda `ROL` en `lib/guardas-fase1.ts`.
- Crear UI de asignación de roles (admin de despacho).

---

## 3. Módulo de tutelas (standby)

### Estado actual (Fase 1)

- Solo existe un placeholder en la navegación ("Kanban de tutelas — Próximamente").
- No hay tablas, lógica ni endpoints asociados.

### Migración sugerida para Fase 2

```sql
CREATE TABLE tutela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proceso_id UUID NULL REFERENCES proceso(id) ON DELETE SET NULL,
  tipo VARCHAR(100) NOT NULL, -- 'tutela_salud', 'tutela_educacion', etc.
  estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
  contenido JSONB NOT NULL DEFAULT '{}',
  fecha_presentacion DATE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_tutela_usuario ON tutela(usuario_id);
```

### Cambios de código requeridos

- Agregar modelo Prisma `Tutela`.
- Crear rutas API `POST/GET/PATCH /api/tutelas`.
- Crear vista Kanban de tutelas reutilizando los componentes del sistema de diseño.
- Habilitar la guarda `TUTELA` en `lib/guardas-fase1.ts`.

---

## 4. Módulo de redacción IA (standby)

### Estado actual (Fase 1)

- Solo existe un placeholder en la navegación ("Redacción de demandas/tutelas con IA — Próximamente").
- No hay tablas, lógica ni endpoints asociados.

### Migración sugerida para Fase 2

```sql
CREATE TABLE borrador_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proceso_id UUID NULL REFERENCES proceso(id) ON DELETE SET NULL,
  tipo_documento VARCHAR(100) NOT NULL, -- 'demanda', 'tutela', 'recurso', etc.
  prompt_utilizado TEXT,
  contenido_generado TEXT,
  estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
  version INT NOT NULL DEFAULT 1,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_borrador_ia_usuario ON borrador_ia(usuario_id);
```

### Cambios de código requeridos

- Agregar modelo Prisma `BorradorIA`.
- Crear rutas API `POST/GET/PATCH /api/borradores`.
- Crear UI de editor de borradores con integración LLM.
- Habilitar la guarda `BORRADOR_IA` en `lib/guardas-fase1.ts`.

---

## 5. Frecuencia de revisión configurable

### Estado actual (Fase 1)

- El campo `configuracion_usuario.frecuencia_revision` ya existe con valor fijo `'diaria_habiles'`.
- No es editable por el usuario en Fase 1.

### Cambios para Fase 2

- Permitir valores: `'diaria_habiles'`, `'dos_veces_dia'`, `'semanal'`, `'personalizada'`.
- Actualizar el Worker_Revision para respetar la frecuencia del usuario.
- Agregar UI para editar la frecuencia en el módulo de configuración.

---

## Notas de implementación

### Guardas de Fase 1

El archivo `lib/guardas-fase1.ts` contiene funciones de guarda que rechazan operaciones dependientes de funcionalidad de Fase 2. Al implementar cada módulo en Fase 2, se reemplaza la guarda correspondiente con la lógica real.

### Consultas de Fase 1

Se ha verificado que **ninguna consulta de Fase 1** filtra por:
- `despacho_id` (no existe en el esquema actual)
- `rol` / `usuario_rol` (no existen en el esquema actual)

Todo el aislamiento de datos se logra exclusivamente por `usuario_id` en la sesión autenticada.

### Convención de nombres

- Tablas nuevas se agregan en `prisma/schema.prisma` con el prefijo de módulo cuando aplica.
- Las migraciones se nombran descriptivamente: `add_despacho_table`, `add_roles_tables`, etc.
- Los modelos Prisma usan PascalCase y mapean a snake_case con `@@map()`.
