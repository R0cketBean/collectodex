// Vitest setup: pulls in jest-dom's custom matchers (toBeInTheDocument,
// toHaveTextContent, etc.) so component-level tests can use them. The
// jsdom environment is configured in vite.config.ts.
import '@testing-library/jest-dom/vitest';
