export class AtlassianHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly detail: string,
    public readonly url: string,
  ) {
    super(`Atlassian API ${status} ${statusText} — ${detail} [${url}]`);
    this.name = 'AtlassianHttpError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
