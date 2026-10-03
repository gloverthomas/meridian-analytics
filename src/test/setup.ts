import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL only auto-cleans when Vitest globals are enabled; we keep globals off.
afterEach(() => cleanup());
