vi.mock("../../../lib/communityApi", () => ({ communityApi: vi.fn() }));
import { communityApi } from "../../../lib/communityApi";
let account;
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import App from "../../../app/App";

beforeEach(() => {
  localStorage.clear();
  account = null;
  communityApi.mockImplementation(async (path, options = {}) => {
    if (account === null) account = { id: 1, name: 'Ana', ratings: JSON.parse(localStorage.getItem('buscagames:ratings') || '{}'), favorites: JSON.parse(localStorage.getItem('buscagames:favorites') || '[]') };
    if (path.endsWith('/rating')) account = { ...account, ratings: { ...account.ratings, [path.split('/')[3]]: options.body.rating } };
    if (path.endsWith('/favorite')) account = { ...account, favorites: account.favorites.filter((id) => id !== path.split('/')[3]) };
    return { user: account, comments: [], own: null, nextCursor: null };
  });
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => ({
    id: url.split("/").at(-1), title: url.endsWith("42") ? "Aventura" : "Zelda", platforms: ["PC"], modes: [],
  }) })));
});
afterEach(() => vi.unstubAllGlobals());
const open = (path = "/biblioteca") => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

it("recupera todos os IDs salvos, filtra, ordena e mantém notas ao reabrir", async () => {
  localStorage.setItem("buscagames:favorites", JSON.stringify(["igdb-42"]));
  localStorage.setItem("buscagames:ratings", JSON.stringify({ "igdb-42": 2, "igdb-99": 5 }));
  const view = open();
  await screen.findByRole("heading", { name: "Zelda" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "nota" } });
  expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("Zelda");
  fireEvent.click(screen.getByRole("button", { name: "Favoritos 1" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  const star = screen.getByRole("radio", { name: "2 estrelas" });
  fireEvent.keyDown(star, { key: "ArrowRight" });
  expect(screen.getByRole("radio", { name: "3 estrelas" })).toHaveFocus();
  await waitFor(() => expect(screen.getByRole("radio", { name: "3 estrelas" })).toHaveAttribute("aria-checked", "true"));
  expect(account.ratings["igdb-42"]).toBe(3);
  fireEvent.change(screen.getByLabelText("Buscar na biblioteca"), { target: { value: "inexistente" } });
  expect(screen.getByText("Nenhum jogo nesta seleção.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar busca na biblioteca" }));
  expect(screen.getByLabelText("Buscar na biblioteca")).toHaveFocus();
  view.unmount();
  open("/biblioteca?filtro=favoritos");
  await screen.findByRole("heading", { name: "Aventura" });
  expect(screen.getByRole("radio", { name: "3 estrelas" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("button", { name: "Remover Aventura dos favoritos" }));
  await screen.findByText("Nenhum jogo nesta seleção.");
  fireEvent.click(screen.getByRole("button", { name: "Avaliados 2" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

it("preserva notas e favoritos em falha parcial e permite tentar novamente", async () => {
  localStorage.setItem("buscagames:favorites", JSON.stringify(["igdb-42", "igdb-99"]));
  localStorage.setItem("buscagames:ratings", JSON.stringify({ "igdb-99": 4 }));
  fetch.mockRejectedValueOnce(new Error("Sem conexão"));
  open();
  expect(screen.getByText("Carregando seus jogos…")).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("Seus favoritos e notas continuam salvos");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByRole("radio", { name: "4 estrelas", checked: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByRole("heading", { name: "Aventura" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("mostra convite ao catálogo sem solicitar dados quando a biblioteca está vazia", async () => {
  open();
  expect(await screen.findByText("Sua biblioteca começa com um jogo.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Encontrar meu próximo jogo" })).toHaveAttribute("href", "/");
  expect(fetch).not.toHaveBeenCalled();
});

it("combina gráficos e filtros, restaura a URL e recalcula as notas", async () => {
  const games = {
    "igdb-42": { id: "igdb-42", title: "Aventura", genres: ["RPG", "Ação", "RPG"], platforms: ["PC"], releaseDate: "2020-01-01" },
    "igdb-99": { id: "igdb-99", title: "Zelda", genres: ["Ação"], platforms: ["Switch"], releaseDate: "2023-01-01" },
    "igdb-77": { id: "igdb-77", title: "Sem nota", genres: ["RPG"], platforms: ["PC"], releaseDate: "2020-05-01" },
  };
  fetch.mockImplementation(async (url) => ({ ok: true, json: async () => games[url.split("/").at(-1)] }));
  localStorage.setItem("buscagames:favorites", JSON.stringify(["igdb-42", "igdb-77"]));
  localStorage.setItem("buscagames:ratings", JSON.stringify({ "igdb-42": 2, "igdb-99": 5 }));
  const view = open();
  await screen.findByRole("heading", { name: "Zelda" });
  const metric = (name) => screen.getByText(name).parentElement;
  expect(screen.queryByRole("heading", { name: "Seu perfil de jogos" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Minha nota")).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Visualizar estatísticas" }));
  expect(metric("Média das suas notas")).toHaveTextContent("3,5 / 5");
  expect(screen.getByRole("group", { name: "Gráfico de rosquinha: Suas notas" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Gráfico de pizza: Gêneros" })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "Formato de Gêneros" })).getByRole("button", { name: "Rosquinha" }));
  expect(screen.getByRole("group", { name: "Gráfico de rosquinha: Gêneros" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gêneros: RPG, 2 jogos" })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("button", { name: "Filtrar Gêneros: RPG: 2 jogos (50%)" }), { key: "Enter" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Ano de lançamento"), { target: { value: "2020" } });
  fireEvent.click(screen.getByRole("button", { name: "Ocultar estatísticas" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Visualizar estatísticas" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Visualizar estatísticas" }));
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Suas notas: 0, 1 jogo" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(metric("Média das suas notas")).toHaveTextContent("—");
  fireEvent.click(screen.getByRole("button", { name: "Suas notas: 0, 1 jogo" }));
  fireEvent.click(screen.getByRole("button", { name: "Favoritos avaliados 1" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(screen.getByRole("radio", { name: "4 estrelas" }));
  await waitFor(() => expect(metric("Média das suas notas")).toHaveTextContent("4 / 5"));
  fireEvent.change(screen.getByLabelText("Plataforma"), { target: { value: "Switch" } });
  expect(screen.getByText("Nenhum jogo nesta seleção.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar todos os filtros" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  view.unmount();
  open("/biblioteca?genero=A%C3%A7%C3%A3o&plataforma=Switch&ano=2023&nota=5&filtro=avaliados");
  await screen.findByRole("heading", { name: "Zelda" });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Visualizar estatísticas" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByLabelText("Minha nota")).toHaveValue("5");
});
