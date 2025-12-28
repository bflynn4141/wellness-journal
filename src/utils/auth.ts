/**
 * OAuth authentication utilities
 *
 * Handles the OAuth flow for Whoop and Google APIs,
 * including token refresh and local server for callbacks.
 *
 * Flow with GitHub Pages relay:
 * 1. Browser opens to OAuth provider with redirect_uri = GitHub Pages URL
 * 2. User authorizes
 * 3. Provider redirects to GitHub Pages callback.html?code=XXX
 * 4. callback.html JavaScript redirects to localhost:8585/callback?code=XXX
 * 5. Local server receives code and exchanges for tokens
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { URL } from 'url';
import { randomBytes } from 'crypto';
import open from 'open';
import type { OAuthTokens } from '../types.js';

const REDIRECT_PORT = 8585;
const LOCAL_CALLBACK_URI = `http://localhost:${REDIRECT_PORT}/callback`;

/**
 * Get the OAuth redirect URI from environment or default
 * For Whoop/Google registration, use the GitHub Pages URL
 * The callback page will relay to localhost
 */
export function getRedirectUri(): string {
  return process.env.OAUTH_REDIRECT_URL || LOCAL_CALLBACK_URI;
}

export { LOCAL_CALLBACK_URI as REDIRECT_URI };

interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

/**
 * Start the OAuth flow and get tokens
 * Opens browser for user authorization and waits for callback
 */
export async function performOAuthFlow(config: OAuthConfig): Promise<OAuthTokens> {
  // Generate a random state for CSRF protection
  const state = randomBytes(32).toString('hex');

  return new Promise((resolve, reject) => {
    // Create temporary local server to receive OAuth callback
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const returnedState = url.searchParams.get('state');

        // Verify state parameter to prevent CSRF attacks
        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>❌ Authorization Failed</h1>
                <p>Invalid state parameter. This may be a security issue.</p>
                <p>Please try again.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('OAuth state mismatch - possible CSRF attack'));
          return;
        }

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>❌ Authorization Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          try {
            const tokens = await exchangeCodeForTokens(config, code);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>✅ Authorization Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
              </html>
            `);

            server.close();
            resolve(tokens);
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>❌ Token Exchange Failed</h1>
                  <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                </body>
              </html>
            `);
            server.close();
            reject(err);
          }
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      // Build authorization URL
      // Use the configured redirect URI (GitHub Pages) for the OAuth provider
      const redirectUri = getRedirectUri();
      const authUrl = new URL(config.authorizationUrl);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('state', state); // CSRF protection
      authUrl.searchParams.set('access_type', 'offline'); // For refresh token
      authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

      // Open browser
      open(authUrl.toString());
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth flow timed out'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string
): Promise<OAuthTokens> {
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: getRedirectUri(), // Must match the redirect_uri used in authorization
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  // Debug: Log the raw response to understand what OAuth provider returns
  console.log('[OAuth Debug] Token response keys:', Object.keys(data));
  if (!data.refresh_token) {
    console.log('[OAuth Debug] Warning: No refresh_token in response');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<OAuthTokens> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if not returned
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };
}
