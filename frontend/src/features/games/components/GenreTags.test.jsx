import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import GenreTags from "./GenreTags";

it("preserva categorias completas, elimina duplicatas e aceita registros antigos", () => {
  const longGenre = "4X (explorar, expandir, explorar recursos e exterminar)";
  const { rerender } = render(<GenreTags game={{ genres: ["Terror", " Suspense ", "Terror", longGenre] }} />);
  expect(within(screen.getByRole("list", { name: "Gêneros e temas" })).getAllByRole("listitem")
    .map((item) => item.textContent)).toEqual(["Terror", "Suspense", longGenre]);
  rerender(<GenreTags game={{ genre: "Aventura, Terror, Suspense" }} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  rerender(<GenreTags game={{ genres: [], genre: "Gênero não informado" }} />);
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.getByText("Gênero não informado")).toBeInTheDocument();
});
