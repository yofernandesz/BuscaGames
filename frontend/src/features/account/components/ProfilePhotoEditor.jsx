import { useEffect, useRef, useState } from "react";
import { communityApi } from "../../../lib/communityApi";
import { useGames } from "../../games/hooks/useGames";

import PhotoCropDialog from "./PhotoCropDialog";

export default function ProfilePhotoEditor({ background = false }) {
  const { user, updateUser, requestLogin } = useGames();
  const picker = useRef(null);
  const disclosure = useRef(null);
  const pending = useRef(null);
  const [cropTrigger, setCropTrigger] = useState(null);
  const [draft, setDraft] = useState(null);
  const source = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const kind = background ? 'background' : 'photo';
  const title = background ? 'plano de fundo' : 'foto de perfil';
  const hasImage = background ? user.backgroundUrl : user.avatarUrl;
  const removable = background ? user.backgroundUrl : user.customPhoto;
  useEffect(() => () => { pending.current?.abort(); if (source.current) URL.revokeObjectURL(source.current); }, []);

  function clearDraft() {
    if (source.current) URL.revokeObjectURL(source.current);
    source.current = null;
    setDraft(null);
  }

  async function select(file) {
    if (pending.current) return;
    setCropTrigger(document.activeElement === document.body
      ? picker.current.parentElement.querySelector('button') : document.activeElement);
    setFailed(false);
    setMessage("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024) {
      setFailed(true);
      setMessage("Escolha uma imagem JPG, PNG ou WebP de até 8 MB.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("Preparando imagem…");
    const url = URL.createObjectURL(file);
    source.current = url;
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      controller.signal.throwIfAborted();
      setDraft(image);
      setMessage("");
    } catch {
      URL.revokeObjectURL(url);
      source.current = null;
      if (!controller.signal.aborted) {
        setFailed(true);
        setMessage("Não foi possível ler essa imagem. Escolha outra foto.");
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function save(prepare) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFailed(false);
    setMessage(background ? "Salvando plano de fundo…" : "Salvando foto…");
    try {
      const photo = prepare ? prepare() : null;
      controller.signal.throwIfAborted();
      const data = await communityApi(background ? "/api/auth/background" : "/api/auth/avatar", { method: "PUT", body: { photo }, signal: controller.signal });
      updateUser(data.user, user.id);
      clearDraft();
      setMessage(background ? (prepare ? "Plano de fundo atualizado." : "Plano de fundo removido.") : (prepare ? "Foto atualizada." : "Foto personalizada removida."));
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailed(true);
        setMessage(error.message);
        if (error.status === 401) { updateUser(null); requestLogin('account', 'Sua sessão expirou. Entre novamente para continuar.'); }
      }
    } finally {
      pending.current = null;
      setBusy(false);
    }
  }

  const controls = <div className={`profile-photo-editor${background ? ' profile-background-editor' : ''}`} aria-busy={busy}>
    <input id={`profile-${kind}-file`} type="file" disabled={busy} hidden ref={picker} accept="image/jpeg,image/png,image/webp" aria-label={`Selecionar ${title}`}
      onChange={(event) => { const file = event.target.files[0]; event.target.value = ""; if (file) select(file); }} />
    <div className="comment-actions">
      <button type="button" className="btn-ghost" disabled={busy} aria-describedby={`${kind}-help`} onClick={() => picker.current.click()}>{hasImage ? `Alterar ${title}` : `Adicionar ${title}`}</button>
      {Boolean(removable) && <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(null)}>{background ? 'Remover fundo' : 'Remover foto'}</button>}
    </div>
    <p id={`${kind}-help`}>{background ? 'Visível para todos no seu perfil. Ajuste o recorte antes de salvar. ' : 'Sua foto aparece nos comentários. '}JPG, PNG ou WebP de até 8 MB.</p>
    <p className="profile-image-status" role={failed ? 'alert' : 'status'}>{message}</p>
  </div>;

  const editor = background ? <details className="profile-background-tools" ref={disclosure} onKeyDown={event => {
    if (event.key === 'Escape') { disclosure.current.open = false; disclosure.current.querySelector('summary').focus(); }
  }}>
    <summary><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg>Plano de fundo</summary>
    {controls}
  </details> : controls;
  return <>{editor}{draft && <PhotoCropDialog image={draft} trigger={cropTrigger} background={background} busy={busy} error={failed ? message : ''} onSave={save} onCancel={() => { clearDraft(); setMessage(''); setFailed(false); }} />}</>;
}
