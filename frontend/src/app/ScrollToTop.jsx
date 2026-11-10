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

  useLayoutEffect(() => {
    if (import.meta.env.VITE_GITHUB_PAGES !== 'true') return;
    function scrollToSection(event) {
      const href = event.target.closest?.('a')?.getAttribute('href');
      if (!href?.startsWith('#') || href.startsWith('#/') || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const section = document.getElementById(href.slice(1))
        || (href === '#shelf-all' ? document.getElementById('catalogo') : null);
      section?.scrollIntoView({ behavior: 'smooth' });
    }
    document.addEventListener('click', scrollToSection);
    return () => document.removeEventListener('click', scrollToSection);
  }, []);
  return null;
}
