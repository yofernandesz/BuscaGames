import { useEffect, useId, useRef, useState } from 'react';
import '../styles/photo-crop.css';

export default function PhotoCropDialog({ image, trigger, background, busy, error, onCancel, onSave }) {
  const dialog = useRef(null);
  const drag = useRef(null);
  const id = useId();
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const ratio = background ? 3 : 1;
  const width = Math.min(image.naturalWidth, image.naturalHeight * ratio) / zoom;
  const height = width / ratio;
  const remainingX = image.naturalWidth - width;
  const remainingY = image.naturalHeight - height;
  const x = remainingX * position.x / 100;
  const y = remainingY * position.y / 100;

  useEffect(() => {
    const element = dialog.current;
    const returnFocus = trigger || document.activeElement;
    const overflow = document.documentElement.style.overflow;
    element.showModal();
    element.querySelector('button').focus();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      element.close();
      document.documentElement.style.overflow = overflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [trigger]);

  function save() {
    onSave(() => {
      const canvas = document.createElement('canvas');
      canvas.width = background ? 900 : 128;
      canvas.height = background ? 300 : 128;
      canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  }

  return <dialog ref={dialog} className="photo-crop-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} onKeyDown={event => event.stopPropagation()}>
    <header className="photo-crop-header">
      <div><p className="profile-eyebrow">SEU PERFIL, SEU ENQUADRAMENTO</p><h2 id={`${id}-title`}>{background ? 'Ajustar plano de fundo' : 'Ajustar foto de perfil'}</h2></div>
      <button type="button" className="btn-ghost photo-crop-close" aria-label="Cancelar recorte" disabled={busy} onClick={onCancel}>×</button>
    </header>
    <div className="photo-crop-body">
      <p id={`${id}-help`}>Arraste a imagem para enquadrar ou use os ajustes abaixo.</p>
      <div className="photo-crop-stage">
        <div className={`photo-crop-frame${background ? ' photo-crop-wide' : ''}`} role="img" aria-label="Prévia do recorte" style={{ aspectRatio: ratio }}
          onPointerDown={event => {
            if (busy || !event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { clientX: event.clientX, clientY: event.clientY, ...position };
          }}
          onPointerMove={event => {
            if (!drag.current || busy) return;
            const scale = event.currentTarget.clientWidth / width;
            const clamp = value => Math.max(0, Math.min(100, value));
            setPosition({
              x: remainingX ? clamp(drag.current.x - (event.clientX - drag.current.clientX) / scale / remainingX * 100) : 50,
              y: remainingY ? clamp(drag.current.y - (event.clientY - drag.current.clientY) / scale / remainingY * 100) : 50,
            });
          }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          <img src={image.src} alt="" draggable="false" style={{ width: `${image.naturalWidth / width * 100}%`, height: `${image.naturalHeight / height * 100}%`, left: `${-x / width * 100}%`, top: `${-y / height * 100}%` }} />
          <span className="photo-crop-grid" aria-hidden="true" />
        </div>
        <span className="photo-crop-caption">{background ? 'Panorâmico · 3:1' : 'Foto de perfil · 1:1'}</span>
      </div>
      <fieldset disabled={busy} className="photo-crop-controls">
        <legend className="sr-only">Ajustes do recorte</legend>
        <label htmlFor={`${id}-zoom`}>Zoom <output>{Math.round(zoom * 100)}%</output></label>
        <input id={`${id}-zoom`} aria-label="Zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
        <div className="photo-crop-position">{[['x', 'Horizontal', remainingX], ['y', 'Vertical', remainingY]].map(([axis, label, remaining]) => <div key={axis}>
          <label htmlFor={`${id}-${axis}`}>{label}</label>
          <input id={`${id}-${axis}`} type="range" min="0" max="100" step="1" disabled={!remaining} value={position[axis]} onChange={event => setPosition({ ...position, [axis]: Number(event.target.value) })} />
        </div>)}</div>
        <button type="button" className="btn-ghost" onClick={() => { setZoom(1); setPosition({ x: 50, y: 50 }); }}>Redefinir enquadramento</button>
      </fieldset>
      <p className="photo-crop-status" role={error ? 'alert' : 'status'}>{error || (busy ? 'Salvando imagem…' : 'A imagem só será alterada ao salvar o recorte.')}</p>
    </div>
    <footer className="photo-crop-footer">
      <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button type="button" className="btn-details" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar recorte'}</button>
    </footer>
  </dialog>;
}
