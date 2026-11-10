import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import GameImage from "./GameImage";

it("melhora URLs salvas, recupera falhas e reinicia ao trocar a imagem", () => {
  const src = "https://images.igdb.com/igdb/image/upload/t_cover_big/test.jpg";
  const view = render(<GameImage src={src} alt="Capa" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", src.replace("t_cover_big", "t_cover_big_2x"));
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("src", src);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAccessibleName("Capa — imagem indisponível");
  const next = src.replace("test.jpg", "next.jpg");
  view.rerender(<GameImage src={next} size="1080p" alt="Outra capa" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", next.replace("t_cover_big", "t_1080p"));
  view.rerender(<GameImage src="/capa-local.png" alt="Local" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "/capa-local.png");
});
