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

  // --- Landing (página pública de bienvenida) ---
  "landing.titular": "Trazabilidad procesal inteligente para abogados en Colombia",
  "landing.descripcion":
    "Registre sus procesos por radicado y mantenga el control de actuaciones y plazos en un solo tablero. LexAI revisa sus procesos automáticamente y le avisa antes de cada vencimiento.",
  "landing.cta_login": "Iniciar sesión",
  "landing.beneficio_1": "Seguimiento automático de actuaciones",
  "landing.beneficio_2": "Alertas de plazos antes del vencimiento",
  "landing.beneficio_3": "Tablero visual de todos sus procesos",

  // --- Navegación (sidebar) ---
  "nav.mis_procesos": "Mis procesos",
  "nav.notificaciones": "Notificaciones",
  "nav.configuracion": "Configuración",

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
  "kanban.nuevo_proceso": "Nuevo proceso",
  "kanban.ver_proceso": "Ver proceso",
  "kanban.eliminar_proceso": "Eliminar proceso",
  "eliminar.titulo": "Eliminar proceso",
  "eliminar.confirmacion":
    "¿Seguro que desea eliminar este proceso? Se borrará de su tablero junto con su historial de actuaciones y plazos. Esta acción no se puede deshacer.",
  "eliminar.confirmar": "Eliminar",
  "eliminar.cancelar": "Cancelar",
  "eliminar.error": "No se pudo eliminar el proceso. Intente de nuevo.",
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
  "detalle.info_general": "Información del proceso",
  "detalle.radicado": "Radicado",
  "detalle.despacho": "Juzgado / Despacho",
  "detalle.ubicacion": "Ubicación",
  "detalle.tipo_proceso": "Tipo de proceso",
  "detalle.demandante": "Demandante",
  "detalle.demandado": "Demandado",
  "detalle.sujetos": "Sujetos procesales",
  "detalle.privado_etiqueta": "Proceso privado",
  "detalle.privado_aviso":
    "Este proceso es privado. La fuente pública (Rama Judicial) no expone las partes ni el historial de actuaciones.",
  "detalle.sin_actuaciones_privado":
    "Proceso privado: la fuente no expone el historial de actuaciones.",
  "detalle.estado_cpnu": "Última actuación (fuente)",
  "detalle.llave": "Llave del proceso",
  "detalle.seguimiento": "Seguimiento",
  "detalle.seguimiento_activo": "Activo",
  "detalle.seguimiento_inactivo": "Inactivo",
  "detalle.registrado": "Registrado en LexAI",
  "detalle.no_disponible": "No disponible",
  "detalle.actuaciones": "Historial de actuaciones",
  "detalle.actuacion_consecutivo": "Consecutivo {n}",
  "detalle.actuacion_registrada": "Registrada: {fecha}",
  "detalle.actuacion_termino": "Término: {inicio} a {fin}",
  "detalle.actuacion_documentos": "Con documentos",
  "detalle.actuacion_nueva": "Nueva",
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
  "notificacion.subtitulo": "Alertas de sus procesos y plazos.",
  "notificacion.vacia": "No tiene notificaciones pendientes.",
  "notificacion.nueva": "Nueva",
  "notificacion.error_carga": "No se pudieron cargar las notificaciones. Intente de nuevo.",
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
