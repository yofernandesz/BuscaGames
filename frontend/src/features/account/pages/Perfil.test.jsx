vi.mock("../../../lib/communityApi", () => ({ communityApi: vi.fn(async () => ({ user: null, comments: [], own: null, nextCursor: null })) }));
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { communityApi } from "../../../lib/communityApi";
import App from "../../../app/App";

beforeEach(() => { communityApi.mockReset(); communityApi.mockResolvedValue({ user: null, comments: [], own: null, nextCursor: null }); localStorage.clear(); vi.stubGlobal("scrollTo", vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

function openProfile() { return render(<MemoryRouter initialEntries={["/perfil"]}><App /></MemoryRouter>); }
function statistic(label) { return screen.getByText(label, { selector: "dt" }).parentElement.querySelector("dd"); }

it('altera o nickname, preserva o texto em conflito e mostra o próximo prazo', async () => {
  const user = { id: 7, name: 'Ana', email: 'ana@example.com' };
  communityApi.mockImplementation(async (path, options) => {
    if (path === '/api/auth/me') return { user };
    if (path === '/api/auth/nickname') {
      if (options.body.name === 'Ocupado') throw Object.assign(new Error('Este nickname já está em uso. Escolha outro.'), { status: 409 });
      return { user: { ...user, name: options.body.name, nicknameAvailableAt: Date.now() + 30 * 86400000 } };
    }
    return { profile: { ...user, followerCount: 0, followingCount: 0, receivedLikeCount: 0 } };
  });
  openProfile();
  const input = await screen.findByRole('textbox', { name: 'Nickname' });
  fireEvent.change(input, { target: { value: 'Ocupado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nickname' }));
  expect(await screen.findByText('Este nickname já está em uso. Escolha outro.')).toBeInTheDocument();
  expect(input).toHaveValue('Ocupado');
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Nova Ana' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nickname' }));
  expect(await screen.findByText('Nickname atualizado.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nova Ana' })).toBeInTheDocument();
  expect(screen.getByText(/Próxima troca a partir de/)).toBeInTheDocument();
});

it("abre a prévia sem inventar uma sessão e oferece navegação e revisão de cookies", async () => {
  openProfile();
  expect(screen.getByRole("heading", { level: 1, name: "Perfil" })).toHaveFocus();
  expect(document.title).toBe("Perfil — BuscaGames");
  expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("aria-current", "page");
  expect(await screen.findByText("Sem sessão iniciada")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Informações da conta" })).toBeInTheDocument();
  expect(statistic("Jogos na biblioteca")).toHaveTextContent("0");
  expect(statistic("Sua nota média")).toHaveTextContent("—");
  expect(screen.getByText("Todo jogador tem um primeiro favorito.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Abrir minha biblioteca/ })).toHaveAttribute("href", "/biblioteca");
  fireEvent.click(await screen.findByRole("button", { name: "Recusar opcionais" }));
  fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Preferências de cookies" }));
  expect(screen.getByRole("region", { name: "Cookies e sua privacidade" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Privacidade e seus dados" }));
  expect(screen.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeInTheDocument();
});

it("conta jogos únicos e calcula a média apenas das notas positivas persistidas", async () => {
  localStorage.setItem("buscagames:favorites", JSON.stringify(["igdb-1", "igdb-2", "igdb-2"]));
  localStorage.setItem("buscagames:ratings", JSON.stringify({ "igdb-1": 5, "igdb-3": 2, "igdb-4": 0 }));
  openProfile();
  await screen.findByText("Sem sessão iniciada");
  expect(statistic("Jogos na biblioteca")).toHaveTextContent("3");
  expect(statistic("Favoritos")).toHaveTextContent("2");
  expect(statistic("Jogos avaliados")).toHaveTextContent("2");
  expect(statistic("Sua nota média")).toHaveTextContent("3,5");
  expect(screen.getByRole("link", { name: /Ver favoritos/ })).toHaveAttribute("href", "/biblioteca?filtro=favoritos");
  expect(screen.getByRole("link", { name: /Ver avaliações/ })).toHaveAttribute("href", "/biblioteca?filtro=avaliados");
  expect(screen.getByText("Sempre cabe mais um favorito.")).toBeInTheDocument();
});

it("exibe a foto recebida no login diretamente no cartão de jogador", async () => {
  const avatarUrl = "https://lh3.googleusercontent.com/foto";
  communityApi.mockResolvedValueOnce({ user: { id: 1, name: "Ana", googleLinked: true, avatarUrl } });
  openProfile();
  const playerCard = (await screen.findByRole("heading", { name: "Ana" })).closest("section");
  expect(playerCard.querySelector(".profile-avatar img")).toHaveAttribute("src", avatarUrl);
  expect(screen.queryByRole("button", { name: /sincronizar/i })).toBeNull();
});

it("reúne os dados privados e direciona cada contador social para a lista correta", async () => {
  const user = { id: 42, name: 'Lia', email: 'lia@example.com', favorites: [], ratings: {}, commentCount: 3, customPhoto: true, reviewed: true, googleLinked: true };
  communityApi.mockImplementation(async path => path === '/api/auth/me' ? { user } : { profile: { ...user, followerCount: 18, followingCount: 7, receivedLikeCount: 24 } });
  openProfile();
  expect(await screen.findByRole('link', { name: 'Seguidores: 18. Ver seguidores' })).toHaveAttribute('href', '/perfil/42?aba=followers');
  expect(screen.getByRole('link', { name: 'Seguindo: 7. Ver seguindo' })).toHaveAttribute('href', '/perfil/42?aba=following');
  expect(screen.getByRole('link', { name: 'Curtidas recebidas: 24. Ver curtidas recebidas' })).toHaveAttribute('href', '/perfil/42?aba=likes');
  expect(screen.getByText('lia@example.com')).toBeInTheDocument();
  expect(screen.getByText('Personalizada')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Ver comentários publicados/ })).toHaveAttribute('href', '/perfil/42?aba=comments');
  expect(screen.getByRole('link', { name: /Ver jogos por nota/ })).toHaveAttribute('href', '/biblioteca?filtro=avaliados&ordem=nota');
});

it("não inventa contadores em falha e recupera as conexões sem perder a conta", async () => {
  let failed = true;
  communityApi.mockImplementation(async path => {
    if (path === '/api/auth/me') return { user: { id: 42, name: 'Lia', email: 'lia@example.com' } };
    if (failed) throw new Error('Não foi possível consultar conexões.');
    return { profile: { id: 42, followerCount: 0, followingCount: 0, receivedLikeCount: 0 } };
  });
  openProfile();
  await screen.findByText('Não foi possível consultar conexões.');
  expect(screen.queryByRole('navigation', { name: 'Conexões do perfil' })).not.toBeInTheDocument();
  expect(screen.getByText('lia@example.com')).toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('link', { name: 'Seguidores: 0. Ver seguidores' })).toBeInTheDocument();
});
