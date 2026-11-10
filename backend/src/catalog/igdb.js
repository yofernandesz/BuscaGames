import { setTimeout as sleep } from 'node:timers/promises';

export const GAME_FIELDS = `name,slug,summary,storyline,updated_at,first_release_date,
  cover.image_id,screenshots.image_id,genres.name,themes.name,platforms.name,platforms.generation,
  game_modes.name,total_rating,total_rating_count,game_type.type,parent_game,dlcs,expansions,
  standalone_expansions,involved_companies.company.name,release_dates.*,websites.*`;

export class IgdbClient {
  constructor({ clientId, clientSecret, fetcher = fetch, wait = sleep }) {
    this.clientId = clientId; this.clientSecret = clientSecret; this.fetcher = fetcher; this.wait = wait;
    this.token = null; this.expires = 0;
  }

  async request(url, options) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try { response = await this.fetcher(url, { ...options, signal: AbortSignal.timeout(20000) }); }
      catch {
        if (attempt === 3) throw new Error('IGDB: falha de rede ou timeout');
        await this.wait(1000 * 2 ** attempt); continue;
      }
      if (response.ok) return response.json();
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers.get('retry-after');
        const milliseconds = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        await response.body?.cancel();
        // Long provider cooldowns defer the job rather than retrying before Retry-After.
        if (milliseconds > 60000 || attempt === 3) {
          const error = new Error(`IGDB: HTTP ${response.status}; nova tentativa após cooldown`);
          error.retryAt = Date.now() + Math.max(3600000, milliseconds || 0);
          throw error;
        }
        await this.wait(Math.max(1000 * 2 ** attempt, milliseconds || 0)); continue;
      }
      await response.body?.cancel();
      const error = new Error(`IGDB: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
  }

  async authenticate() {
    if (this.token && Date.now() < this.expires) return;
    let result;
    try {
      result = await this.request('https://id.twitch.tv/oauth2/token', {
        method: 'POST', body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'client_credentials' }),
      });
    } catch (error) {
      error.message = error.message.replace(/^IGDB:/, 'Twitch OAuth:');
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        error.message += '. Confira o Client ID e o Client Secret da mesma aplicação Twitch no arquivo .env';
      }
      throw error;
    }
    if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Error('Twitch: resposta de autenticação inválida');
    this.token = result.access_token; this.expires = Date.now() + (result.expires_in - 60) * 1000;
  }

  async query(endpoint, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.authenticate();
      await this.wait(300); // Sequential requests stay below IGDB's 4 requests/second.
      try {
        const result = await this.request(`https://api.igdb.com/v4/${endpoint}`, {
          method: 'POST', headers: { 'Client-ID': this.clientId, Authorization: `Bearer ${this.token}`, 'Content-Type': 'text/plain' }, body,
        });
        if (!Array.isArray(result)) throw new Error('IGDB: resposta inválida');
        return result;
      } catch (error) {
        if (error.status !== 401 || attempt) throw error;
        this.token = null;
      }
    }
  }
}
