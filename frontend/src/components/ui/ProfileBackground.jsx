import Avatar from './Avatar';
import './profile-background.css';

export default function ProfileBackground({ src }) {
  return src ? <div className="profile-background" aria-hidden="true"><Avatar src={src} /></div> : null;
}
