/** Types shared between the API and the worker. */

/** Response body of `GET /health`. */
export interface HealthResponse {
  ok: boolean;
  db: boolean;
}

/** Claims carried by an API access token. */
export interface JwtPayload {
  sub: string;
}
