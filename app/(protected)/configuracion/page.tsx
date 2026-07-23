"use client";

/**
 * Pantalla de configuración de canales de notificación
 *
 * Muestra el estado de in-app/email/WhatsApp y permite activarlos/desactivarlos.
 * - WhatsApp requiere número internacional válido (8–15 dígitos con prefijo)
 * - `frecuencia_revision` se muestra pero NO es editable en Fase 1
 * - Ante fallo de persistencia: conserva estado previo y muestra error
 * - Ante éxito: muestra confirmación visible
 *
 * Requisitos: R11.1, R11.2, R11.3, R11.4, R11.5, R11.6, R11.7
 */

import { useEffect, useState, useCallback } from "react";
import { Boton, Input, Tarjeta } from "@/components";
import styles from "./configuracion.module.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ConfiguracionCanales {
  canal_inapp: boolean;
  canal_email: boolean;
  canal_whatsapp: boolean;
  numero_whatsapp: string | null;
  frecuencia_revision: string;
  frecuencia_editable: boolean;
}

type EstadoMensaje = {
  tipo: "exito" | "error";
  texto: string;
} | null;

// ─── Componente de Toggle accesible ──────────────────────────────────────────

interface ToggleCanalProps {
  etiqueta: string;
  descripcion: string;
  activo: boolean;
  deshabilitado?: boolean;
  onChange: (valor: boolean) => void;
  id: string;
}

function ToggleCanal({
  etiqueta,
  descripcion,
  activo,
  deshabilitado = false,
  onChange,
  id,
}: ToggleCanalProps) {
  return (
    <div className={styles.canalFila}>
      <div className={styles.canalInfo}>
        <label htmlFor={id} className={styles.canalEtiqueta}>
          {etiqueta}
        </label>
        <p className={styles.canalDescripcion}>{descripcion}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={`${etiqueta}: ${activo ? "activo" : "inactivo"}`}
        className={`${styles.toggle} ${activo ? styles.toggleActivo : ""}`}
        disabled={deshabilitado}
        onClick={() => onChange(!activo)}
      >
        <span className={styles.toggleCirculo} aria-hidden="true" />
      </button>
    </div>
  );
}

// ─── Página de configuración ─────────────────────────────────────────────────

export default function PaginaConfiguracion() {
  const [config, setConfig] = useState<ConfiguracionCanales | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<EstadoMensaje>(null);
  const [numeroWhatsapp, setNumeroWhatsapp] = useState("");
  const [errorNumero, setErrorNumero] = useState<string | undefined>(undefined);

  // ─── Cargar configuración actual ────────────────────────────────────────────

  const cargarConfiguracion = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/configuracion");

      if (!res.ok) {
        throw new Error("No se pudo cargar la configuración.");
      }

      const datos: ConfiguracionCanales = await res.json();
      setConfig(datos);
      setNumeroWhatsapp(datos.numero_whatsapp ?? "");
    } catch {
      setMensaje({ tipo: "error", texto: "Error al cargar la configuración." });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarConfiguracion();
  }, [cargarConfiguracion]);

  // ─── Guardar cambio de canal ────────────────────────────────────────────────

  const guardarCambio = async (datos: Record<string, unknown>) => {
    if (!config) return;

    const estadoPrevio = { ...config };
    setGuardando(true);
    setMensaje(null);
    setErrorNumero(undefined);

    // Actualizar UI optimistamente
    setConfig((prev) => (prev ? { ...prev, ...datos } : prev));

    try {
      const res = await fetch("/api/configuracion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });

      const respuesta = await res.json();

      if (!res.ok) {
        // Revertir al estado previo ante fallo (R11.3)
        setConfig(estadoPrevio);

        if (respuesta.campo === "numero_whatsapp") {
          setErrorNumero(respuesta.error);
        } else {
          setMensaje({ tipo: "error", texto: respuesta.error || "No se pudo guardar el cambio." });
        }
        return;
      }

      // Éxito: actualizar con datos del servidor y mostrar confirmación (R11.2)
      setConfig({
        canal_inapp: respuesta.canal_inapp,
        canal_email: respuesta.canal_email,
        canal_whatsapp: respuesta.canal_whatsapp,
        numero_whatsapp: respuesta.numero_whatsapp,
        frecuencia_revision: respuesta.frecuencia_revision,
        frecuencia_editable: config.frecuencia_editable,
      });
      setNumeroWhatsapp(respuesta.numero_whatsapp ?? "");
      setMensaje({ tipo: "exito", texto: "Configuración guardada correctamente." });
    } catch {
      // Revertir al estado previo (R11.3)
      setConfig(estadoPrevio);
      setMensaje({ tipo: "error", texto: "Error de conexión. Intente nuevamente." });
    } finally {
      setGuardando(false);
    }
  };

  // ─── Handlers de canales ────────────────────────────────────────────────────

  const toggleInApp = (valor: boolean) => {
    guardarCambio({ canal_inapp: valor });
  };

  const toggleEmail = (valor: boolean) => {
    guardarCambio({ canal_email: valor });
  };

  const toggleWhatsApp = (valor: boolean) => {
    if (valor) {
      // Activar: requiere número válido
      guardarCambio({ canal_whatsapp: true, numero_whatsapp: numeroWhatsapp });
    } else {
      guardarCambio({ canal_whatsapp: false });
    }
  };

  const guardarNumeroWhatsapp = () => {
    setErrorNumero(undefined);
    guardarCambio({ numero_whatsapp: numeroWhatsapp });
  };

  // ─── Limpar mensaje después de un tiempo ────────────────────────────────────

  useEffect(() => {
    if (mensaje) {
      const timer = setTimeout(() => setMensaje(null), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mensaje]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <main className={styles.pagina}>
        <div className={styles.contenedor}>
          <p className={styles.cargando} role="status" aria-live="polite">
            Cargando configuración...
          </p>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className={styles.pagina}>
        <div className={styles.contenedor}>
          <p className={styles.errorCarga} role="alert">
            No se pudo cargar la configuración. Intente recargar la página.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.pagina}>
      <div className={styles.contenedor}>
        <h1 className={styles.titulo}>Configuración de notificaciones</h1>
        <p className={styles.subtitulo}>
          Gestione los canales por los que desea recibir notificaciones de sus plazos procesales.
        </p>

        {/* Mensaje de estado */}
        {mensaje && (
          <div
            className={`${styles.mensaje} ${
              mensaje.tipo === "exito" ? styles.mensajeExito : styles.mensajeError
            }`}
            role="alert"
            aria-live="assertive"
          >
            <span aria-hidden="true">{mensaje.tipo === "exito" ? "✓" : "✗"}</span>
            {mensaje.texto}
          </div>
        )}

        {/* Canales de notificación */}
        <Tarjeta className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>Canales de notificación</h2>

          <ToggleCanal
            id="toggle-inapp"
            etiqueta="Notificaciones in-app"
            descripcion="Reciba alertas dentro de la aplicación."
            activo={config.canal_inapp}
            deshabilitado={guardando}
            onChange={toggleInApp}
          />

          <ToggleCanal
            id="toggle-email"
            etiqueta="Notificaciones por email"
            descripcion="Reciba alertas en su correo electrónico registrado."
            activo={config.canal_email}
            deshabilitado={guardando}
            onChange={toggleEmail}
          />

          <div className={styles.canalWhatsapp}>
            <ToggleCanal
              id="toggle-whatsapp"
              etiqueta="Notificaciones por WhatsApp"
              descripcion="Reciba alertas por mensaje de WhatsApp."
              activo={config.canal_whatsapp}
              deshabilitado={guardando}
              onChange={toggleWhatsApp}
            />

            {/* Campo de número WhatsApp */}
            <div className={styles.campoWhatsapp}>
              <Input
                etiqueta="Número de WhatsApp"
                type="tel"
                placeholder="+573001234567"
                value={numeroWhatsapp}
                onChange={(e) => {
                  setNumeroWhatsapp(e.target.value);
                  setErrorNumero(undefined);
                }}
                error={errorNumero}
                ayuda="Formato internacional: + seguido de 8 a 15 dígitos (ej: +573001234567)"
                disabled={guardando}
              />
              <Boton
                variante="secundario"
                onClick={guardarNumeroWhatsapp}
                cargando={guardando}
                disabled={guardando || !numeroWhatsapp}
              >
                Guardar número
              </Boton>
            </div>
          </div>
        </Tarjeta>

        {/* Frecuencia de revisión (solo lectura) */}
        <Tarjeta className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>Frecuencia de revisión</h2>
          <div className={styles.frecuencia}>
            <p className={styles.frecuenciaValor}>
              Diaria en días hábiles
            </p>
            <p className={styles.frecuenciaInfo}>
              La revisión automática de sus procesos se ejecuta cada día hábil a las 06:00 (hora Colombia).
              Esta configuración no es editable en la fase actual.
            </p>
          </div>
        </Tarjeta>
      </div>
    </main>
  );
}
