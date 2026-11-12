import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { setSession } from "../lib/api";
import { resetDb, server } from "./server";

// O jsdom não implementa showModal/close do <dialog> (usado pelo Sheet).
// Este polyfill só liga e desliga o atributo "open" e dispara o evento "close".
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// Qualquer chamada sem handler é erro: o teste avisa se o app passar a chamar
// um endpoint novo que a API simulada não conhece.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => resetDb());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  setSession(null);
  localStorage.clear();
});
afterAll(() => server.close());
