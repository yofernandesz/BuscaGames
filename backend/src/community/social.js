export function initializeSocial(db) {
  db.function('player_search', { deterministic: true }, value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  db.exec(`CREATE TABLE IF NOT EXISTS user_follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(follower_id, followed_id), CHECK(follower_id <> followed_id)
  );
  CREATE INDEX IF NOT EXISTS follows_target ON user_follows(followed_id, follower_id);
  CREATE TABLE IF NOT EXISTS comment_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, comment_id)
  );
  CREATE INDEX IF NOT EXISTS likes_comment ON comment_likes(comment_id);`);
}

// An explicit public projection: never reuse the account/session response here.
const publicSelect = `SELECT u.id, u.name, COALESCE(p.custom_url, p.google_url) AS avatarUrl,
  (SELECT url FROM profile_backgrounds WHERE user_id=u.id) AS backgroundUrl,
  EXISTS(SELECT 1 FROM admin_reviews WHERE user_id=u.id) AS reviewed,
  (SELECT COUNT(*) FROM user_favorites WHERE user_id=u.id) AS favoriteCount,
  (SELECT COUNT(*) FROM user_ratings WHERE user_id=u.id) AS ratingCount,
  (SELECT AVG(rating) FROM user_ratings WHERE user_id=u.id) AS averageRating,
  (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=u.id) AS followerCount,
  (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id=u.id) AS followingCount,
  (SELECT COUNT(*) FROM comments c WHERE c.user_id=u.id) AS commentCount,
  (SELECT COUNT(*) FROM comment_likes l JOIN comments c ON c.id=l.comment_id WHERE c.user_id=u.id) AS receivedLikeCount,
  EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=u.id) AS isFollowing
  FROM users u LEFT JOIN profile_photos p ON p.user_id=u.id`;

export async function handleSocial(db, req, url, { userId, readBody, requireActive, fail, send }) {
  const route = /^\/api\/users\/(\d+)(?:\/(follow|followers|following|library|comments|likes))?$/.exec(url.pathname);
  const like = /^\/api\/comments\/(\d+)\/like$/.exec(url.pathname);
  if (url.pathname !== '/api/users' && !route && !like) fail(404, 'Jogador não encontrado.');
  const target = route ? Number(route[1]) : null;
  if (route && (!Number.isSafeInteger(target) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(target))) fail(404, 'Jogador não encontrado.');
  if (req.method === 'GET' && !like && route?.[2] !== 'follow') {
    if (route && !route[2]) {
      send(200, { profile: db.prepare(`${publicSelect} WHERE u.id=?`).get(userId || 0, target) });
      return true;
    }
    const page = Number(url.searchParams.get('page') || 1);
    const query = (url.searchParams.get('q') || '').trim();
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 120) fail(400, 'Busca ou página inválida.');
    const limit = 12;
    if (['comments', 'likes'].includes(route?.[2])) {
      const from = `FROM comments c JOIN games g ON g.id=c.game_id WHERE c.user_id=?
        ${route[2] === 'likes' ? 'AND EXISTS(SELECT 1 FROM comment_likes l WHERE l.comment_id=c.id)' : ''}`;
      const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(target).n;
      const current = Math.min(page, Math.max(1, Math.ceil(total / limit)));
      const comments = db.prepare(`SELECT c.id, c.body, c.created_at AS createdAt, g.data,
        (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id) AS likeCount
        ${from} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(target, limit, (current - 1) * limit)
        .map(({ data, ...comment }) => {
          const game = JSON.parse(data);
          return { ...comment, game: { id: game.id, title: game.title, cover: game.cover } };
        });
      send(200, { comments, total, page: current, pages: Math.ceil(total / limit) });
    } else if (route?.[2] === 'library') {
      const filter = url.searchParams.get('filter') || 'all';
      if (!['all', 'favorites', 'rated'].includes(filter)) fail(400, 'Filtro inválido.');
      const from = `FROM games g LEFT JOIN user_favorites f ON f.game_id=g.id AND f.user_id=?
        LEFT JOIN user_ratings r ON r.game_id=g.id AND r.user_id=?
        WHERE ${filter === 'favorites' ? 'f.game_id IS NOT NULL' : filter === 'rated' ? 'r.game_id IS NOT NULL' : '(f.game_id IS NOT NULL OR r.game_id IS NOT NULL)'}`;
      const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(target, target).n;
      const current = Math.min(page, Math.max(1, Math.ceil(total / limit)));
      const games = db.prepare(`SELECT g.data, r.rating, f.game_id IS NOT NULL AS favorite ${from} ORDER BY g.title COLLATE NOCASE, g.id LIMIT ? OFFSET ?`)
        .all(target, target, limit, (current - 1) * limit).map(({ data, rating, favorite }) => {
          const game = JSON.parse(data);
          return { id: game.id, title: game.title, cover: game.cover, platforms: game.platforms, rating: rating || 0, favorite: Boolean(favorite) };
        });
      send(200, { games, total, page: current, pages: Math.ceil(total / limit) });
    } else {
      const args = [];
      let where = 'WHERE 1=1';
      if (route) {
        where += route[2] === 'followers'
          ? ' AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=u.id AND f.followed_id=?)'
          : ' AND EXISTS(SELECT 1 FROM user_follows f WHERE f.followed_id=u.id AND f.follower_id=?)';
        args.push(target);
      }
      if (query) { where += ' AND instr(player_search(u.name), player_search(?)) > 0'; args.push(query); }
      const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(...args).n;
      const current = Math.min(page, Math.max(1, Math.ceil(total / limit)));
      const users = db.prepare(`${publicSelect} ${where} ORDER BY u.name COLLATE NOCASE, u.id LIMIT ? OFFSET ?`).all(userId || 0, ...args, limit, (current - 1) * limit);
      send(200, { users, total, page: current, pages: Math.ceil(total / limit) });
    }
    return true;
  }
  if (req.method !== 'PUT' || (!like && route?.[2] !== 'follow')) fail(405, 'Método não permitido.');
  if (!userId) fail(401, 'Entre na sua conta para continuar.');
  const body = await readBody(req);
  requireActive(userId);
  if (like) {
    const commentId = Number(like[1]);
    if (!Number.isSafeInteger(commentId) || !db.prepare('SELECT 1 FROM comments WHERE id=?').get(commentId)) fail(404, 'Comentário não encontrado.');
    if (typeof body.liked !== 'boolean') fail(400, 'Curtida inválida.');
    if (body.liked) db.prepare('INSERT OR IGNORE INTO comment_likes VALUES (?,?)').run(userId, commentId);
    else db.prepare('DELETE FROM comment_likes WHERE user_id=? AND comment_id=?').run(userId, commentId);
    send(200, { liked: body.liked, likeCount: db.prepare('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id=?').get(commentId).n });
  } else {
    if (target === userId) fail(400, 'Você não pode seguir a própria conta.');
    if (typeof body.following !== 'boolean') fail(400, 'Escolha inválida.');
    if (body.following) db.prepare('INSERT OR IGNORE INTO user_follows VALUES (?,?)').run(userId, target);
    else db.prepare('DELETE FROM user_follows WHERE follower_id=? AND followed_id=?').run(userId, target);
    send(200, { profile: db.prepare(`${publicSelect} WHERE u.id=?`).get(userId, target) });
  }
  return true;
}
