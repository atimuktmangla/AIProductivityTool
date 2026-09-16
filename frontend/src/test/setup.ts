// jest-dom v6 ships Vitest-compatible matcher types via this entrypoint.
// Importing the bare package pulls in a `/// <reference types="jest" />`
// that requires @types/jest; the /vitest entrypoint registers the matchers
// against Vitest's expect instead.
import '@testing-library/jest-dom/vitest';
