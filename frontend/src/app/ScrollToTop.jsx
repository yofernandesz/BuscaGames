import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.addEventListener("pageshow", scrollToTop);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener("pageshow", scrollToTop);
    };
  }, []);

  // Filtros e âncoras na mesma tela preservam sua navegação própria.
  useLayoutEffect(scrollToTop, [pathname]);
  return null;
}
