import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import FeaturedGame from "./FeaturedGame";

vi.mock("../hooks/useCatalog", () => ({ useCatalog: () => ({ data: null }) }));
afterEach(() => vi.useRealTimers());

it("mantém GTA VI em destaque sem API e reduz a contagem na virada do dia em São Paulo", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T02:59:30Z"));
  render(<MemoryRouter><FeaturedGame /></MemoryRouter>);
  expect(screen.getByRole("region", { name: "Destaque da vez: Grand Theft Auto VI" })).toBeInTheDocument();
  const values = () => [...screen.getByRole("timer").querySelectorAll("strong")].map((node) => node.textContent);
  expect(values()).toEqual(["01", "00", "00", "30"]);
  act(() => vi.advanceTimersByTime(1000));
  expect(values()).toEqual(["01", "00", "00", "29"]);
  act(() => vi.advanceTimersByTime(30000));
  expect(values()).toEqual(["00", "23", "59", "59"]);
  expect(within(screen.getByRole("timer")).getByText("segundos")).toBeInTheDocument();
  act(() => { vi.setSystemTime(new Date("2026-11-19T03:00:00Z")); vi.advanceTimersByTime(1000); });
  expect(screen.getByText("A data prevista chegou!")).toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});

it("carrega a música apenas ao abrir o player e permite encerrá-la", () => {
  render(<MemoryRouter><FeaturedGame cookiesAccepted /></MemoryRouter>);
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.getByTitle("Flower In A Hurricane — YouTube")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/5dPwBWvmcbQ?autoplay=1&playsinline=1");
  fireEvent.click(screen.getByRole("button", { name: "Fechar player" }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
});
