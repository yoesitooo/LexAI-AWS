/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
import { ToastProvider } from '@/components';

// Mock next-auth/react
const mockSignIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

// Import after mocks
import LoginPage from './page';

// LoginPage usa useToast(), que requiere estar dentro de <ToastProvider>.
function renderConProvider(): RenderResult {
  return render(
    <ToastProvider>
      <LoginPage />
    </ToastProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('muestra mensaje genérico y limpia la URL si Auth.js redirige con ?error=', async () => {
    mockSearchParams = new URLSearchParams('error=Configuration');

    renderConProvider();

    await waitFor(() => {
      const alerta = screen.getByRole('alert');
      expect(alerta.textContent).toContain('Credenciales inválidas');
    });

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('renderiza el formulario de login con campos de email y contraseña', () => {
    renderConProvider();
    expect(screen.getByLabelText(/correo electrónico/i)).toBeDefined();
    expect(screen.getByLabelText(/contraseña/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeDefined();
  });

  it('botón está deshabilitado cuando los campos están vacíos', () => {
    renderConProvider();
    const btn = screen.getByRole('button', { name: /ingresar/i });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('redirige al Kanban tras login exitoso', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null, ok: true });

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'abogado@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/tablero');
    });

    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'abogado@test.com',
      password: 'password123',
      redirect: false,
    });
  });

  it('muestra mensaje genérico ante credenciales inválidas sin revelar el campo', async () => {
    mockSignIn.mockResolvedValueOnce({ error: 'CredentialsSignin', ok: false });

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'usuario@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      const alerta = screen.getByRole('alert');
      expect(alerta.textContent).toContain('Credenciales inválidas');
    });

    // The message must NOT reveal whether it was the email or password
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).not.toContain('correo');
    expect(alerta.textContent).not.toContain('contraseña');
    expect(alerta.textContent).not.toContain('email');
    expect(alerta.textContent).not.toContain('password');
  });

  it('muestra mensaje de bloqueo cuando la cuenta está bloqueada', async () => {
    mockSignIn.mockResolvedValueOnce({ error: 'ACCOUNT_LOCKED', ok: false });

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'bloqueado@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'cualquierpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      const alerta = screen.getByRole('alert');
      expect(alerta.textContent).toContain('bloqueada temporalmente');
    });
  });

  it('normaliza el email a minúsculas y sin espacios antes de enviar', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null, ok: true });

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: '  Abogado@Test.COM  ' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'pass1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'abogado@test.com',
        password: 'pass1234',
        redirect: false,
      });
    });
  });

  it('muestra error de conexión si signIn lanza una excepción inesperada', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('network down'));

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'usuario@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      const alertas = screen.getAllByRole('alert');
      expect(alertas.some((a) => a.textContent?.includes('No se pudo conectar'))).toBe(true);
    });
  });

  it('muestra estado de carga durante la autenticación', async () => {
    // Make signIn hang indefinitely until we resolve it
    let resolveSignIn: (value: unknown) => void;
    mockSignIn.mockImplementation(
      () => new Promise((resolve) => { resolveSignIn = resolve; })
    );

    renderConProvider();

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'test@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    // Button should be disabled and show aria-busy during loading
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /ingresar/i });
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(btn).toHaveProperty('disabled', true);
    });

    // Resolve the pending signIn
    resolveSignIn!({ error: null, ok: true });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });
});
