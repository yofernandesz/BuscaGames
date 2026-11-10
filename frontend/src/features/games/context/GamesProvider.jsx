import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeRating, withDetails } from "../model/gameModel";

import { GamesContext } from "./GamesContext";
import { communityApi } from "../../../lib/communityApi";
import LoginDialog from '../../account/components/LoginDialog';
const EMPTY_RATINGS = {};
const EMPTY_FAVORITES = [];

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function GamesProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loginRequest, setLoginRequest] = useState(null);
  const requestLogin = useCallback((reason = 'account', message = '') => setLoginRequest({ reason, message }), []);
  const closeLogin = useCallback(() => setLoginRequest(null), []);
  const [revision, setRevision] = useState(0);
  const accountGeneration = useRef(0);
  const sessionUserId = useRef(null);
  const personalQueue = useRef(Promise.resolve());
  const refreshAccount = useCallback(() => {
    const generation = accountGeneration.current;
    return communityApi('/api/auth/me').then((data) => {
      if (generation === accountGeneration.current) { sessionUserId.current = data.user?.id || null; setUser(data.user || null); setGoogleEnabled(Boolean(data.googleEnabled)); setAccountError(''); }
    }).catch(() => { if (generation === accountGeneration.current) setAccountError('Não foi possível consultar sua conta. Tente novamente.'); })
      .finally(() => { if (generation === accountGeneration.current) setAccountLoading(false); });
  }, []);
  useEffect(() => { refreshAccount(); }, [refreshAccount]);
  const updateUser = useCallback((next, expectedId, ratingsOnly = false) => {
    accountGeneration.current++;
    if (!expectedId) sessionUserId.current = next?.id || null;
    setUser((current) => expectedId && current?.id !== expectedId ? current : ratingsOnly ? { ...current, ratings: next.ratings, favorites: next.favorites } : next);
    setAccountLoading(false);
    setRevision((value) => value + 1);
  }, []);
  const [remote, setRemote] = useState({});
  const [localRatings] = useState(() => {
    const stored = readStored("buscagames:ratings", null);
    const legacy = readStored("buscagames:patches", {});
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored :
      Object.fromEntries(Object.entries(legacy || {}).filter(([id, patch]) => /^igdb-\d+$/.test(id) && patch && typeof patch === "object" && "rating" in patch).map(([id, patch]) => [id, patch.rating]));
    return Object.fromEntries(Object.entries(source).map(([id, rating]) => [id, normalizeRating(rating)]));
  });
  const ratings = user ? user.ratings || EMPTY_RATINGS : localRatings;
  const games = useMemo(() => Object.values(remote).map((game) =>
    withDetails({ ...game, rating: ratings[game.id] ?? 0 })), [remote, ratings]);

  const rememberGames = useCallback((items) => {
    setRemote((current) => {
      const next = { ...current };
      for (const game of items) next[game.id] = { ...next[game.id], ...game };
      return next;
    });
  }, []);

  const [localFavorites] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("buscagames:favorites") || "[]");
      return Array.isArray(stored) ? stored.filter((id) => typeof id === "number" || typeof id === "string") : [];
    } catch {
      return [];
    }
  });

  const favorites = user ? user.favorites || EMPTY_FAVORITES : localFavorites;
  const savePersonal = useCallback(async (id, kind, body) => {
    if (accountLoading) return;
    if (!user) { requestLogin(kind); return; }
    personalQueue.current = personalQueue.current.then(async () => {
      if (sessionUserId.current !== user.id) return;
      try {
        const data = await communityApi(`/api/games/${id}/${kind}`, { method: 'PUT', body });
        updateUser(data.user, user.id, true); setAccountError('');
      } catch (error) {
        if (sessionUserId.current !== user.id) return;
        if (error.status === 401) { updateUser(null); requestLogin(kind, 'Sua sessão expirou. Entre novamente para continuar.'); }
        else setAccountError(error.message);
      }
    });
    return personalQueue.current;
  }, [user, updateUser, requestLogin, accountLoading]);
  const rateGame = useCallback((id, rating) => savePersonal(id, 'rating', { rating: normalizeRating(rating) }), [savePersonal]);
  const toggleFavorite = useCallback((id) => savePersonal(id, 'favorite', { favorite: !favorites.includes(id) }), [favorites, savePersonal]);

  const value = useMemo(
    () => ({ games, rememberGames, ratings, rateGame, favorites, toggleFavorite, user, updateUser, accountLoading, accountError, refreshAccount, revision, googleEnabled, loginRequest, requestLogin, closeLogin }),
    [games, rememberGames, ratings, rateGame, favorites, toggleFavorite, user, updateUser, accountLoading, accountError, refreshAccount, revision, googleEnabled, loginRequest, requestLogin, closeLogin]
  );

  return <GamesContext.Provider value={value}>{accountError && <div className="catalog-note" role="alert">{accountError} <button className="btn-ghost" onClick={refreshAccount}>Consultar conta novamente</button></div>}{children}<LoginDialog /></GamesContext.Provider>;
}
