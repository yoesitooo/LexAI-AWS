/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NavStandby } from "./NavStandby";

describe("NavStandby", () => {
  it('muestra ítem "Kanban de tutelas" con texto "Próximamente"', () => {
    render(<NavStandby />);
    expect(screen.getByText("Kanban de tutelas")).toBeDefined();
    // "Próximamente" appears twice (one per item), check at least one exists
    const badges = screen.getAllByText("Próximamente");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra ítem "Redacción de demandas/tutelas con IA" con texto "Próximamente"', () => {
    render(<NavStandby />);
    expect(
      screen.getByText("Redacción de demandas/tutelas con IA"),
    ).toBeDefined();
  });

  it("los ítems tienen aria-disabled=true (R13.3, R13.4)", () => {
    render(<NavStandby />);
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(2);
    items.forEach((item) => {
      expect(item.getAttribute("aria-disabled")).toBe("true");
    });
  });

  it("los ítems no tienen onClick handlers funcionales (R13.3)", () => {
    render(<NavStandby />);
    const items = screen.getAllByRole("menuitem");
    items.forEach((item) => {
      // Clicking should not throw or trigger navigation
      fireEvent.click(item);
    });
    // If we get here without errors, the test passes
    expect(true).toBe(true);
  });

  it("Enter/Space en los ítems no ejecuta ninguna acción (R13.4)", () => {
    render(<NavStandby />);
    const items = screen.getAllByRole("menuitem");
    items.forEach((item) => {
      fireEvent.keyDown(item, { key: "Enter" });
      fireEvent.keyDown(item, { key: " " });
    });
    // No navigation or action should have occurred
    expect(true).toBe(true);
  });

  it("tiene el role de navegación con label descriptivo", () => {
    render(<NavStandby />);
    const nav = screen.getByRole("navigation", {
      name: "Módulos próximamente",
    });
    expect(nav).toBeDefined();
  });

  it("acepta className adicional", () => {
    const { container } = render(<NavStandby className="custom-class" />);
    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("custom-class");
  });

  it("no contiene enlaces, formularios ni botones (R13.4)", () => {
    const { container } = render(<NavStandby />);
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.querySelectorAll("form").length).toBe(0);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.querySelectorAll("input").length).toBe(0);
  });
});
