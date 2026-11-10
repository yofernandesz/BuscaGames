import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Price from "./Price";

it("exibe oferta em reais, desconto, loja e data; diferencia gratuito de promoção a zero", () => {
  const game = { price: 59.97, priceInitial: 199.9, priceCurrency: "BRL", priceStatus: "ready",
    priceSource: "https://store.steampowered.com/app/1091500/?cc=br&l=brazilian", priceCheckedAt: "2026-10-26T01:00:00Z" };
  const view = render(<Price game={game} />);
  expect(screen.getByText(/59,97/)).toBeInTheDocument();
  expect(screen.getByLabelText("Desconto de 70%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Conferir na Steam/ })).toHaveAttribute("href", game.priceSource);
  expect(screen.getByText("Steam Brasil · PC")).toBeInTheDocument();
  expect(screen.getByText(/Consultado em/)).toBeInTheDocument();
  view.rerender(<Price game={{ ...game, price: 0, priceInitial: 0, priceIsFree: true }} />);
  expect(screen.getByText("Grátis")).toBeInTheDocument();
  view.rerender(<Price game={{ ...game, price: 0, priceIsFree: false }} />);
  expect(screen.queryByText("Grátis")).not.toBeInTheDocument();
  expect(screen.getByText(/0,00/)).toBeInTheDocument();
  view.rerender(<Price game={{ ...game, priceStatus: "stale" }} />);
  expect(screen.getByText(/Último preço/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Desconto de 70%")).not.toBeInTheDocument();
});

it("explica ausência de oferta, falta de vínculo e falha temporária com recuperação", () => {
  const game = { price: null, priceSource: "https://store.steampowered.com/app/1/", priceStatus: "unavailable" };
  const view = render(<Price game={game} />);
  expect(screen.getByText("Sem oferta em reais")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Conferir na Steam/ })).toHaveAttribute("target", "_blank");
  view.rerender(<Price game={{ ...game, priceStatus: "error", priceRetryAt: "2099-01-01T00:00:00Z" }} />);
  expect(screen.getByText("Consulta temporariamente indisponível")).toBeInTheDocument();
  expect(screen.getByText(/Nova tentativa a partir de/)).toBeInTheDocument();
  view.rerender(<Price game={{ priceStatus: "no_source", price: null }} />);
  expect(screen.getByText("Preço não monitorado")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  view.rerender(<Price game={{ ...game, priceSource: "https://evil.test/app/1/" }} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("não inventa preços nem apresenta dados inválidos ou de outra moeda como grátis", () => {
  const view = render(<Price game={{ price: null, priceStatus: "pending" }} />);
  expect(screen.getByText("Consultando preço...")).toBeInTheDocument();
  for (const game of [{ price: null }, { price: NaN }, { price: -1 }, { price: 10, priceCurrency: "USD" }, { price: "0" }]) {
    view.rerender(<Price game={game} />);
    expect(screen.getByText("Preço indisponível")).toBeInTheDocument();
    expect(screen.queryByText("Grátis")).not.toBeInTheDocument();
  }
});
