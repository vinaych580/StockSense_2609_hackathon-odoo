import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Testing Library only cleans up on its own when Vitest globals are enabled; they aren't here.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom lacks a few APIs that Radix menus call.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
