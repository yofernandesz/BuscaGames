vi.mock("../lib/communityApi", () => ({ communityApi: vi.fn() }));
import { communityApi } from "../lib/communityApi";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import App from "./App";

const emptyPage = { games: [], total: 0, page: 1, limit: 12, hasMore: false };
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.clear();
  vi.mocked(communityApi).mockReset().mockResolvedValue({ user: null, comments: [], own: null, nextCursor: null });
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => url === "/api/home"
    ? { sections: [], catalog: emptyPage, status: { configured: false } } : emptyPage })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("abre a política pelo rodapé e permite revisar cookies", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Recusar opcionais" }));
  fireEvent.click(within(screen.getByRole("contentinfo")).getByRole("link", { name: "Política de Privacidade" }));
  expect(screen.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toHaveFocus();
  expect(document.title).toBe("Política de Privacidade — BuscaGames");
  expect(screen.getByRole("navigation", { name: "Nesta política" }).querySelectorAll("a")).toHaveLength(11);
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "thur2402@outlook.com" })[0]).toHaveAttribute("href", "mailto:thur2402@outlook.com");
  fireEvent.click(screen.getByRole("button", { name: "Revisar preferências de cookies" }));
  expect(screen.getByRole("region", { name: "Cookies e sua privacidade" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Catálogo" }));
  expect(screen.queryByRole("heading", { level: 1, name: "Política de Privacidade" })).not.toBeInTheDocument();
});

it("permite acesso direto à política e oferece seu link no aviso", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  render(<MemoryRouter initialEntries={["/privacidade"]}><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeInTheDocument();
  expect(await screen.findByText("Leia a Política de Privacidade completa.")).toHaveAttribute("href", "/privacidade");
  expect(fetch).not.toHaveBeenCalled();
});

it("permite navegar e dispensar o aviso sem autorizar cookies opcionais", async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  const notice = await screen.findByRole("region", { name: "Cookies e sua privacidade" });
  expect(notice.querySelector("details")).not.toHaveAttribute("open");
  expect(notice).not.toHaveAttribute("aria-modal");
  expect(notice).not.toHaveFocus();
  fireEvent.click(screen.getByRole("link", { name: "Minha biblioteca" }));
  expect(screen.getByRole("heading", { name: "Minha biblioteca" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fechar aviso e continuar sem cookies opcionais" }));
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Catálogo" }));
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
  fireEvent.keyDown(screen.getByRole("region", { name: "Cookies e sua privacidade" }), { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
});

it("preserva a aceitação ao reabrir, respeita recusa e permite revisar a escolha", async () => {
  const { unmount } = render(<MemoryRouter><App /></MemoryRouter>);
  expect(await screen.findByRole("region", { name: "Cookies e sua privacidade" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Recusar opcionais" }));
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
  fireEvent.click(screen.getByRole("button", { name: "Aceitar cookies" }));
  expect(screen.getByTitle("Flower In A Hurricane — YouTube")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aceitar cookies" }));
  unmount();
  render(<MemoryRouter initialEntries={["/biblioteca"]}><App /></MemoryRouter>);
  await waitFor(() => expect(communityApi).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Catálogo" }));
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.getByTitle("Flower In A Hurricane — YouTube")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
  fireEvent.click(screen.getByRole("button", { name: "Recusar opcionais" }));
  expect(localStorage.getItem("buscagames:cookie-choice")).toBe("rejected");
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
});

it("aguarda a sessão e não exibe aviso automático nem autoriza opcionais para usuário conectado", async () => {
  let resolveSession;
  vi.mocked(communityApi).mockImplementationOnce(() => new Promise(resolve => { resolveSession = resolve; }));
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  await act(async () => resolveSession({ user: { id: 1, name: "Jogador", favorites: [], ratings: {} } }));
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
  expect(localStorage.getItem("buscagames:cookie-choice")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preferências de cookies" }));
  expect(screen.getByRole("region", { name: "Cookies e sua privacidade" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aceitar cookies" }));
  expect(screen.getByTitle("Flower In A Hurricane — YouTube")).toBeInTheDocument();
});

it("preserva a recusa após reabrir sem carregar o player", async () => {
  const { unmount } = render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Recusar opcionais" }));
  unmount();
  await act(async () => { render(<MemoryRouter><App /></MemoryRouter>); });
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Ouvir a música/ }));
  expect(screen.queryByTitle("Flower In A Hurricane — YouTube")).not.toBeInTheDocument();
});

it("permite escolher com armazenamento bloqueado e falha ao consultar a sessão", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Bloqueado"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Bloqueado"); });
  vi.mocked(communityApi).mockRejectedValue(new Error("Offline"));
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Aceitar cookies" }));
  expect(screen.queryByRole("region", { name: "Cookies e sua privacidade" })).not.toBeInTheDocument();
});

describe("Catálogo sincronizado", () => {
  const remoteGame = {
    id: "igdb-42", title: "Jogo real da API", source: "IGDB", sourceUrl: "https://www.igdb.com/games/test",
    genre: "Ação", modes: [], platforms: ["PC"], price: null, rating: 0,
    sourceRating: 87.4, sourceRatingCount: 120, type: "Main Game", summary: "Resumo da fonte",
    description: "Descrição completa da fonte", relatedIds: ["igdb-43"],
  };
  const titles = ["Interesse da semana", "Em alta", "Retrô", "Clássicos", "Lançamentos", "Próximos lançamentos"];
  const sectionIds = ["weekly", "trending", "retro", "classics", "new", "upcoming"];

  it("mostra as seis seções, pagina os resultados e mantém notas pessoais separadas da fonte", async () => {
    localStorage.clear();
    vi.mocked(fetch).mockImplementation(async (url) => ({ ok: true, json: async () => {
      if (url.includes("page=2")) return { ...emptyPage, page: 2, games: [{ ...remoteGame, id: "igdb-44", title: "Segundo jogo" }] };
      return {
        status: { configured: true, importComplete: true, lastSuccess: "2026-10-23T06:00:00Z" }, catalog: emptyPage,
        sections: titles.map((title, index) => ({ ...emptyPage, id: sectionIds[index], title,
          games: index ? [] : [remoteGame], hasMore: index === 0 })),
      };
    } }));
    render(<MemoryRouter><App /></MemoryRouter>);
    for (const title of titles) expect(await screen.findByRole("region", { name: title })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Explorar categorias" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(6);
    titles.forEach((title, index) => {
      expect(within(navigation).getByRole("link", { name: `Explorar ${title}` })).toHaveAttribute("href", `#shelf-${sectionIds[index]}`);
    });
    expect(screen.getByRole("link", { name: /Todos os jogos/ })).toHaveAttribute("href", "#shelf-all");
    const weekly = screen.getByRole("region", { name: titles[0] });
    expect(within(weekly).getByText("Preço indisponível")).toBeInTheDocument();
    expect(within(weekly).getByText(/87.4\/100/)).toBeInTheDocument();
    fireEvent.click(within(weekly).getByRole("radio", { name: "5 estrelas" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar login e continuar explorando' }));
    expect(within(weekly).getByText(/87.4\/100/)).toBeInTheDocument();
    fireEvent.click(within(weekly).getByRole("button", { name: "Adicionar Jogo real da API aos favoritos" }));
    expect(localStorage.getItem("buscagames:favorites")).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar login e continuar explorando' }));
    fireEvent.click(within(weekly).getByRole("button", { name: /Ver mais/ }));
    expect(await screen.findByRole("heading", { name: "Segundo jogo" })).toBeInTheDocument();
    await waitFor(() => expect(within(weekly).queryByRole("button", { name: /Ver mais/ })).not.toBeInTheDocument());
  });

  it.each(["saved", "catalog"])("identifica a seleção alternativa semanal: %s", async (selection) => {
    const notice = selection === "saved" ? "Atualização pendente: exibindo a última seleção de interesse disponível." : "Enquanto o interesse da semana é atualizado, explore os jogos com mais avaliações no catálogo.";
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({
      status: { configured: true }, catalog: emptyPage,
      sections: [{ ...emptyPage, id: "weekly", title: titles[0], total: 1, selection, notice,
        games: [{ ...remoteGame, metric: selection === "saved" ? { kind: "weekly", samples: 1, measuredAt: "2026-10-25T12:00:00Z", stale: true } : null }] }],
    }) });
    render(<MemoryRouter><App /></MemoryRouter>);
    const weekly = await screen.findByRole("region", { name: titles[0] });
    expect(within(weekly).getByText(notice)).toBeInTheDocument();
    expect(within(weekly).getByRole("heading", { name: remoteGame.title })).toBeInTheDocument();
    if (selection === "saved") expect(within(weekly).getByText(/Coleta:/)).toHaveTextContent("Atualização pendente");
    else expect(within(weekly).queryByText(/amostra/)).not.toBeInTheDocument();
  });

  it("carrega detalhes por URL direta e permite abrir o DLC", async () => {
    localStorage.clear();
    vi.mocked(fetch).mockImplementation(async (url) => ({ ok: true, json: async () =>
      url.endsWith("igdb-43") ? { ...remoteGame, id: "igdb-43", title: "Expansão", relatedIds: [], parentId: "igdb-42" } : remoteGame }));
    render(<MemoryRouter initialEntries={["/jogo/igdb-42"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: remoteGame.title })).toBeInTheDocument();
    expect(screen.getByText(remoteGame.summary)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Requisitos mínimos (PC)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plataformas que rodam o jogo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Conteúdo 1" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Expansão" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver jogo base" })).toHaveAttribute("href", "/jogo/igdb-42");
  });

  it("combina categoria e busca, mantém o filtro na paginação e permite removê-lo", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => ({ ok: true, json: async () => {
      if (url === "/api/home") return {
        status: { configured: true }, catalog: emptyPage,
        sections: [{ ...emptyPage, id: "retro", title: "Retrô" }],
      };
      const params = new URLSearchParams(url.split("?")[1]);
      return { ...emptyPage, total: 2, hasMore: params.get("page") !== "2",
        page: Number(params.get("page") || 1), games: [{ ...remoteGame,
          id: `igdb-${params.get("page") === "2" ? "43" : "42"}`,
          title: params.get("page") === "2" ? "Outro jogo retrô" : remoteGame.title }],
      };
    } }));
    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByRole("region", { name: "Retrô" });
    fireEvent.click(screen.getByText("Filtros"));
    fireEvent.change(screen.getByLabelText("Explorar por categoria"), { target: { value: "retro" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=&section=retro", expect.anything()));
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar jogos" }), { target: { value: "Mario" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=Mario&section=retro", expect.anything()));
    fireEvent.click(await screen.findByRole("button", { name: "Ver mais — Retrô" }));
    expect(await screen.findByRole("heading", { name: "Outro jogo retrô" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/games?section=retro&q=Mario&page=2&limit=12", { signal: undefined });
    fireEvent.keyDown(screen.getByLabelText("Explorar por categoria"), { key: "Escape" });
    expect(screen.getByText("Filtros").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Remover filtro Retrô" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=Mario&section=", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByRole("searchbox", { name: "Buscar jogos" })).toHaveValue("");
    expect(screen.getByRole("navigation", { name: "Explorar categorias" })).toBeInTheDocument();
  });

  it("informa indisponibilidade sem apresentar jogos de exemplo como dados reais", async () => {
    localStorage.clear();
    vi.mocked(fetch).mockRejectedValue(new Error("Catálogo temporariamente indisponível."));
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Catálogo temporariamente indisponível");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar jogo" })).not.toBeInTheDocument();
  });

  it("restaura busca pela URL e limpa o texto sem remover a categoria", async () => {
    render(<MemoryRouter initialEntries={["/?q=Mario&section=retro"]}><App /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "Buscar jogos" });
    expect(input).toHaveValue("Mario");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=Mario&section=retro", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "Limpar texto da busca" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=&section=retro", expect.anything()));
    expect(screen.queryByRole("region", { name: /Destaque da vez/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByRole("region", { name: /Destaque da vez/ })).toBeInTheDocument();
  });

  it("aguarda concluir a composição de texto antes de consultar a busca", async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "Buscar jogos" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ação" } });
    expect(screen.queryByText(/Buscando por/)).not.toBeInTheDocument();
    fireEvent.compositionEnd(input, { data: "ação" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/games?q=a%C3%A7%C3%A3o&section=", expect.anything()));
  });

  it("distingue cota de tradução e mantém requisitos disponíveis", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({
      ...remoteGame, summary: "", summaryPending: true, summaryStatus: "quota",
      pcRequirements: "Memória: 8 GB", requirementsStatus: "ready",
    }) });
    render(<MemoryRouter initialEntries={["/jogo/igdb-42"]}><App /></MemoryRouter>);
    expect(await screen.findByText(/aguarda a renovação da cota diária/)).toBeInTheDocument();
    expect(screen.getByText("Memória: 8 GB")).toBeInTheDocument();
    expect(screen.queryByText(/Volte em instantes/)).not.toBeInTheDocument();
  });

  it("ignora cadastros e edições antigos, preservando notas e favoritos após reabrir", async () => {
    localStorage.setItem("buscagames:local-games", JSON.stringify([{ id: 1, title: "Cadastro antigo", modes: [] }]));
    localStorage.setItem("buscagames:patches", JSON.stringify({ "igdb-42": { title: "Título alterado", rating: 4, cover: "imagem-pessoal" } }));
    localStorage.setItem("buscagames:favorites", JSON.stringify(["igdb-42"]));
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => remoteGame });
    const view = render(<MemoryRouter initialEntries={["/jogo/igdb-42"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: remoteGame.title })).toBeInTheDocument();
    expect(screen.queryByText("Título alterado")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4 estrelas" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Remover Jogo real da API dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("radio", { name: "5 estrelas" }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    view.unmount();
    render(<MemoryRouter initialEntries={["/jogo/igdb-42"]}><App /></MemoryRouter>);
    await screen.findByRole("heading", { name: remoteGame.title });
    expect(screen.getByRole("radio", { name: "4 estrelas" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });
});
