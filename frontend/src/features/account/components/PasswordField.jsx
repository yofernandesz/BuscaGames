import { useState } from 'react';
import { passwordRequirements } from '../../../../../shared/accountPolicy.mjs';

export default function PasswordField({ label, visibilityLabel = label.toLowerCase(), id, ...props }) {
  const [visible, setVisible] = useState(false);
  return <>
    <label htmlFor={id}>{label}</label>
    <div className="auth-password">
      <input {...props} id={id} type={visible ? 'text' : 'password'} required />
      <button type="button" className="auth-show" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${visibilityLabel}`}
        aria-pressed={visible} onClick={() => setVisible(!visible)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  </>;
}

export function PasswordRequirements({ id, password, identity }) {
  return <ul id={id} className="auth-requirements" aria-label="Critérios da senha">
    {passwordRequirements(password, identity).map((rule) => {
      const canCheck = identity || rule.id !== 'personal';
      const met = Boolean(canCheck && password && rule.met);
      return <li key={rule.id} data-met={met}>
        <span aria-hidden="true">{met ? '✓' : '○'}</span>
        {canCheck && <span className="sr-only">{met ? 'Atendido: ' : 'Pendente: '}</span>}
        {rule.label}
      </li>;
    })}
  </ul>;
}
