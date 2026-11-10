import { Link } from 'react-router-dom';
import './profile-social.css';

const metrics = [
  { key: 'followerCount', label: 'Seguidores', tab: 'followers', hint: 'Quem acompanha você', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87', circle: true },
  { key: 'followingCount', label: 'Seguindo', tab: 'following', hint: 'Suas conexões no jogo', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 10l2 2 4-4', circle: true },
  { key: 'receivedLikeCount', label: 'Curtidas recebidas', tab: 'likes', hint: 'Nos seus comentários', icon: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z' },
];

export default function ProfileSocialStats({ profile, personal = false }) {
  return <nav className="profile-social-stats" aria-label="Conexões do perfil">
    {metrics.map(({ key, label, tab, hint, icon, circle }) => <Link className={`profile-social-link profile-social-link--${tab}`} key={key}
      to={`/perfil/${profile.id}?aba=${tab}`} aria-label={`${label}: ${profile[key]?.toLocaleString('pt-BR') ?? '—'}. Ver ${label.toLocaleLowerCase('pt-BR')}`}>
      <svg className="profile-social-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon} />{circle && <circle cx="9" cy="7" r="4" />}</svg>
      <span className="profile-social-number">{profile[key]?.toLocaleString('pt-BR') ?? '—'}</span>
      <span className="profile-social-label">{label}</span>
      <span className="profile-social-hint">{personal ? hint : `Ver ${label.toLocaleLowerCase('pt-BR')}`}</span>
      <span className="profile-social-arrow" aria-hidden="true">↗</span>
    </Link>)}
  </nav>;
}
