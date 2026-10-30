import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Si la app intenta usar la red en modo mock, la prueba debe fallar: eso demuestra que funciona SIN backend.
vi.stubGlobal('fetch', () => { throw new Error('fetch no debe usarse en modo mock'); });

window.HTMLElement.prototype.scrollIntoView = () => undefined;

// jsdom no implementa URL.createObjectURL (lo usan la descarga y la vista previa)
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
