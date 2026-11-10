import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ScrollToTop from "./ScrollToTop";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('no Pages rola para a seção sem substituir o hash usado pela rota', () => {
  vi.stubEnv('VITE_GITHUB_PAGES', 'true');
  vi.stubGlobal('scrollTo', vi.fn());
  render(<MemoryRouter><ScrollToTop /><a href="#dados">Dados</a><section id="dados">Seção</section></MemoryRouter>);
  const section = document.getElementById('dados');
  section.scrollIntoView = vi.fn();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByText('Dados').dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
});

function Navigation() {
  const navigate = useNavigate();
  return <>
    <ScrollToTop />
    <button onClick={() => navigate("/jogo/2")}>Outro jogo</button>
    <button onClick={() => navigate(-1)}>Voltar</button>
    <button onClick={() => navigate("?q=Mario")}>Filtrar</button>
    <button onClick={() => navigate("#comentarios")}>Comentários</button>
  </>;
}

it("abre no topo, reinicia ao trocar de rota e voltar, mas preserva filtros e âncoras", () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const previous = window.history.scrollRestoration;
  const view = render(<MemoryRouter initialEntries={["/jogo/1"]}><Navigation /></MemoryRouter>);
  expect(window.history.scrollRestoration).toBe("manual");
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "instant" });
  window.scrollTo.mockClear();
  fireEvent.click(screen.getByText("Outro jogo"));
  expect(window.scrollTo).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Voltar"));
  expect(window.scrollTo).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText("Filtrar"));
  fireEvent.click(screen.getByText("Comentários"));
  expect(window.scrollTo).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("pageshow"));
  expect(window.scrollTo).toHaveBeenCalledTimes(3);
  view.unmount();
  expect(window.history.scrollRestoration).toBe(previous);
  window.dispatchEvent(new Event("pageshow"));
  expect(window.scrollTo).toHaveBeenCalledTimes(3);
});
