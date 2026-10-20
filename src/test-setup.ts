import '@testing-library/jest-dom/vitest';

// Polyfill DOMMatrix for PDF.js in jsdom environment
if (typeof globalThis.DOMMatrix === 'undefined') {
  class MockDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = init[0];
        this.b = init[1];
        this.c = init[2];
        this.d = init[3];
        this.e = init[4];
        this.f = init[5];
      }
    }
    multiply() {
      return new MockDOMMatrix();
    }
    inverse() {
      return new MockDOMMatrix();
    }
    translate() {
      return new MockDOMMatrix();
    }
    scale() {
      return new MockDOMMatrix();
    }
  }
  // @ts-expect-error polyfill for jsdom
  globalThis.DOMMatrix = MockDOMMatrix;
}
