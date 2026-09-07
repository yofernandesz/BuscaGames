import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";

import App from "./App";

describe("BuscaGames", () => {
  it("deve renderizar a aplicação", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByText("© BuscaGames — Todos os direitos reservados.")
    ).toBeInTheDocument();
  });

  it("deve mostrar o desenvolvedor", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByText("Developed by Arthur Fernandes")
    ).toBeInTheDocument();
  });
});