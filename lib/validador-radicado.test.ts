import { describe, it, expect } from "vitest";
import { validarRadicado } from "./validador-radicado";

describe("validarRadicado", () => {
  // Año actual en Colombia para construir radicados válidos
  const anioActual = new Date().toLocaleString("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
  });
  const anioStr = anioActual.padStart(4, "0");

  // Helper: construir un radicado válido con año dado
  function construirRadicado(anio: number): string {
    // 5 DANE + 2 entidad + 2 especialidad + 3 despacho + 4 año + 7 consecutivo = 23
    return `11001` + `02` + `03` + `001` + anio.toString().padStart(4, "0") + `0000001`;
  }

  describe("R3.1 y R3.2: Acepta solo 23 dígitos numéricos", () => {
    it("acepta un radicado válido de 23 dígitos", () => {
      const radicado = construirRadicado(2020);
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(true);
    });

    it("rechaza cadena vacía", () => {
      const result = validarRadicado("");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("longitud_invalida");
      }
    });

    it("rechaza cadena de solo espacios", () => {
      const result = validarRadicado("                       "); // 23 espacios
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("formato_invalido");
      }
    });

    it("rechaza radicado con menos de 23 caracteres", () => {
      const result = validarRadicado("1234567890123456789012"); // 22 dígitos
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("longitud_invalida");
      }
    });

    it("rechaza radicado con más de 23 caracteres", () => {
      const result = validarRadicado("123456789012345678901234"); // 24 dígitos
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("longitud_invalida");
      }
    });

    it("rechaza radicado con letras", () => {
      const result = validarRadicado("1100102030012020000000a");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("formato_invalido");
      }
    });

    it("rechaza radicado con guiones", () => {
      const result = validarRadicado("11001-02-03-001-2020-00"); // 23 chars con guiones
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Puede fallar por longitud o formato dependiendo de si guiones cambian la longitud
        expect(["formato_invalido", "longitud_invalida"]).toContain(result.error.codigo);
      }
    });

    it("rechaza radicado con puntos", () => {
      const result = validarRadicado("11001.0203.001.2020.000"); // 23 chars con puntos
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("formato_invalido");
      }
    });

    it("rechaza radicado con espacios internos", () => {
      const result = validarRadicado("11001 0203 001 2020 000"); // 23 chars con espacios
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("formato_invalido");
      }
    });
  });

  describe("R3.3: Descomposición estructural 5+2+2+3+4+7", () => {
    it("descompone correctamente los segmentos del radicado", () => {
      //           DANE  ENT ESP DESP AÑO  CONSEC
      const radicado = "11001" + "02" + "03" + "001" + "2023" + "0000001";
      const result = validarRadicado(radicado);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dane).toBe("11001");
        expect(result.value.entidad).toBe("02");
        expect(result.value.especialidad).toBe("03");
        expect(result.value.despacho).toBe("001");
        expect(result.value.anio).toBe(2023);
        expect(result.value.consecutivo).toBe("0000001");
        expect(result.value.raw).toBe(radicado);
      }
    });

    it("la concatenación de segmentos reproduce el original", () => {
      const radicado = "68001233300020200012300";
      const result = validarRadicado(radicado);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const reconstruido =
          result.value.dane +
          result.value.entidad +
          result.value.especialidad +
          result.value.despacho +
          result.value.anio.toString().padStart(4, "0") +
          result.value.consecutivo;
        expect(reconstruido).toBe(radicado);
      }
    });

    it("la suma de longitudes de segmentos es 23", () => {
      const radicado = construirRadicado(2022);
      const result = validarRadicado(radicado);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const totalLen =
          result.value.dane.length +
          result.value.entidad.length +
          result.value.especialidad.length +
          result.value.despacho.length +
          result.value.anio.toString().padStart(4, "0").length +
          result.value.consecutivo.length;
        expect(totalLen).toBe(23);
      }
    });
  });

  describe("R3.4: Año en rango [1900, año actual CO]", () => {
    it("acepta año 1900 (límite inferior)", () => {
      const radicado = construirRadicado(1900);
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(true);
    });

    it("acepta año actual", () => {
      const radicado = construirRadicado(parseInt(anioStr, 10));
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(true);
    });

    it("rechaza año 1899 (debajo del mínimo)", () => {
      const radicado = construirRadicado(1899);
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("anio_fuera_de_rango");
      }
    });

    it("rechaza año futuro (año actual + 1)", () => {
      const radicado = construirRadicado(parseInt(anioStr, 10) + 1);
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("anio_fuera_de_rango");
      }
    });

    it("rechaza año 0000", () => {
      // DANE(5) + entidad(2) + esp(2) + desp(3) + año(0000) + cons(7)
      const radicado = "11001020300100000000001";
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("anio_fuera_de_rango");
      }
    });

    it("rechaza año 9999", () => {
      const radicado = construirRadicado(9999);
      const result = validarRadicado(radicado);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.codigo).toBe("anio_fuera_de_rango");
      }
    });
  });

  describe("R3.5: Rendimiento", () => {
    it("la validación es rápida (función pura sin I/O)", () => {
      const radicado = construirRadicado(2023);
      const inicio = performance.now();
      for (let i = 0; i < 10_000; i++) {
        validarRadicado(radicado);
      }
      const duracion = performance.now() - inicio;
      // 10000 validaciones deben completarse en menos de 2 segundos
      expect(duracion).toBeLessThan(2000);
    });
  });
});
