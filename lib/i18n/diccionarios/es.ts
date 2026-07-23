/**
 * Diccionario genérico en español — fallback cuando es-CO no tiene la clave.
 *
 * Convención: claves en snake_case agrupadas por prefijo de dominio.
 * Interpolación: usar `{nombreVariable}` dentro de las cadenas.
 */
export const es = {
  // --- General ---
  "app.nombre": "LexAI",
  "app.subtitulo": "Trazabilidad procesal inteligente",

  // --- Autenticación ---
  "auth.login.titulo": "Iniciar sesión",
  "auth.login.correo": "Correo electrónico",
  "auth.login.contrasena": "Contraseña",
  "auth.login.boton": "Ingresar",
  "auth.login.error_generico": "Credenciales inválidas. Verifique sus datos e intente de nuevo.",
  "auth.login.bloqueo": "Cuenta bloqueada temporalmente. Intente de nuevo en 15 minutos.",
  "auth.registro.titulo": "Crear cuenta",
  "auth.registro.nombre": "Nombre completo",
  "auth.registro.boton": "Registrarse",
  "auth.registro.exito": "Cuenta creada exitosamente.",
  "auth.registro.error_email_duplicado": "Este correo ya está registrado.",
  "auth.registro.error_nombre_longitud": "El nombre debe tener entre 1 y 100 caracteres.",
  "auth.registro.error_contrasena_longitud": "La contraseña debe tener entre 8 y 128 caracteres.",
  "auth.registro.error_email_formato": "El formato del correo electrónico no es válido.",
  "auth.logout.boton": "Cerrar sesión",
  "auth.sesion.expirada": "Su sesión ha expirado. Por favor inicie sesión nuevamente.",

  // --- Procesos ---
  "proceso.registrar.titulo": "Registrar proceso",
  "proceso.registrar.radicado_placeholder": "Número de radicado (23 dígitos)",
  "proceso.registrar.boton": "Registrar",
  "proceso.registrar.exito": "Proceso registrado exitosamente.",
  "proceso.registrar.error_formato": "El radicado debe contener exactamente 23 dígitos numéricos.",
  "proceso.registrar.error_anio": "El año del radicado está fuera del rango permitido.",
  "proceso.registrar.error_duplicado": "Este proceso ya se encuentra en seguimiento.",
  "proceso.registrar.error_no_encontrado": "No se encontró un proceso con ese radicado.",
  "proceso.registrar.error_fuente": "No fue posible consultar la fuente. Intente más tarde.",

  // --- Kanban ---
  "kanban.titulo": "Mis procesos",
  "kanban.columna.nuevo": "Nuevo",
  "kanban.columna.en_seguimiento": "En seguimiento",
  "kanban.columna.requiere_accion": "Requiere acción",
  "kanban.columna.vencido": "Vencido",
  "kanban.columna.archivado": "Archivado",
  "kanban.vacio": "No tiene procesos registrados. Registre uno para comenzar.",
  "kanban.tarjeta.radicado": "Radicado",
  "kanban.tarjeta.demandante": "Demandante",
  "kanban.tarjeta.demandado": "Demandado",
  "kanban.tarjeta.juzgado": "Juzgado",
  "kanban.tarjeta.departamento": "Departamento",
  "kanban.tarjeta.ultima_actuacion": "Última actuación",

  // --- Detalle ---
  "detalle.titulo": "Detalle del proceso",
  "detalle.actuaciones": "Historial de actuaciones",
  "detalle.plazos_activos": "Plazos activos",
  "detalle.sin_actuaciones": "No se encontraron actuaciones.",
  "detalle.sin_plazos": "No hay plazos activos.",

  // --- Plazos ---
  "plazo.estado.pendiente": "Pendiente",
  "plazo.estado.cumplido": "Cumplido",
  "plazo.estado.vencido": "Vencido",
  "plazo.dias_habiles": "{dias} días hábiles",
  "plazo.dias_calendario": "{dias} días calendario",
  "plazo.fecha_limite": "Fecha límite: {fecha}",
  "plazo.indeterminado": "Plazo indeterminado — requiere revisión manual",

  // --- Notificaciones ---
  "notificacion.titulo": "Notificaciones",
  "notificacion.vacia": "No tiene notificaciones pendientes.",
  "notificacion.plazo_proximo": "El plazo del proceso {radicado} vence el {fecha}.",
  "notificacion.plazo_vencido": "El plazo del proceso {radicado} ha vencido.",

  // --- Configuración ---
  "config.titulo": "Configuración de notificaciones",
  "config.canal.inapp": "Notificaciones en la aplicación",
  "config.canal.email": "Correo electrónico",
  "config.canal.whatsapp": "WhatsApp",
  "config.canal.activo": "Activo",
  "config.canal.inactivo": "Inactivo",
  "config.guardar.exito": "Configuración guardada.",
  "config.guardar.error": "No fue posible guardar la configuración. Intente de nuevo.",
  "config.whatsapp.numero_placeholder": "Número con prefijo de país (ej: +57...)",
  "config.whatsapp.error_formato": "Ingrese un número válido entre 8 y 15 dígitos con prefijo de país.",
  "config.frecuencia": "Frecuencia de revisión: diaria en días hábiles",

  // --- Módulos en standby ---
  "standby.tutelas": "Kanban de tutelas",
  "standby.redaccion_ia": "Redacción de demandas/tutelas con IA",
  "standby.proximamente": "Próximamente",

  // --- Kanban Drag & Drop ---
  "kanban.dnd.recogido": "Proceso {radicado} recogido de {origen}.",
  "kanban.dnd.movido": "Proceso {radicado} movido de {origen} a {destino}.",
  "kanban.dnd.cancelado": "Movimiento cancelado. Proceso {radicado} devuelto a {origen}.",
  "kanban.dnd.error": "No se pudo mover el proceso. Intente de nuevo.",
  "kanban.dnd.instrucciones": "Presione Espacio o Enter para recoger. Use flechas izquierda/derecha para mover entre columnas. Presione Espacio o Enter para soltar. Escape para cancelar.",

  // --- Errores generales ---
  "error.generico": "Ocurrió un error inesperado. Intente de nuevo.",
  "error.no_disponible": "Esta funcionalidad no está disponible en esta versión.",
  "error.cargando": "Cargando...",

  // --- Saludo ejemplo (para documentación/test) ---
  "saludo": "Hola, {nombre}",
} as const;

export type DiccionarioES = typeof es;
export type ClaveI18n = keyof DiccionarioES;
