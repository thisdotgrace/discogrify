const clientId = "ce22a7cd731344169391140153df03dd"; // Replace with your client id

// Default redirect URI - make sure this EXACT value is registered in your
// Spotify app (including protocol, host, port and path).
// Use the 127.0.0.1:8000 callback for local dev by default
const DEFAULT_REDIRECT = 'http://127.0.0.1:8000/callback';

// Start PKCE auth flow (redirect user to Spotify).
export async function startAuth(redirectUri = DEFAULT_REDIRECT) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", redirectUri);
    params.append("scope", "user-read-private user-read-email");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    // exact redirect URI matters for Spotify validation
    document.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// After redirect back to our app, call this to exchange code for token and fetch profile.
// Returns { accessToken, profile } or null when no code present.
export async function handleAuthCallback(redirectUri = DEFAULT_REDIRECT) {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return null;

    // Prevent double-processing in React StrictMode (dev) by using an
    // in-memory flag. sessionStorage persisted across reloads and caused
    // the flow to stop working on subsequent loads.
    if ((globalThis as any).__spotify_pkce_handling) return null;
    (globalThis as any).__spotify_pkce_handling = true;

    // Remove the code from the URL immediately so concurrent handlers don't see it.
    try {
        const u = new URL(window.location.href);
        u.searchParams.delete('code');
        window.history.replaceState({}, document.title, u.pathname + u.search);
    } catch (e) {
        // ignore
    }

    try {
        const accessToken = await getAccessToken(clientId, code, redirectUri);
        if (!accessToken) throw new Error('No access token returned from token endpoint');
        const profile = await fetchProfile(accessToken);
        return { accessToken, profile };
    } catch (err) {
        console.error('handleAuthCallback error', err);
        return { error: err instanceof Error ? err.message : String(err) };
    } finally {
        // clear the in-memory handling flag so future flows can run
        (globalThis as any).__spotify_pkce_handling = false;
    }
}

// Generate a code verifier
function generateCodeVerifier(length: number) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Generate a code challenge from a code verifier
async function generateCodeChallenge(codeVerifier: string) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


// Exchange the authorization code for an access token
export async function getAccessToken(clientId: string, code: string, redirectUri = DEFAULT_REDIRECT): Promise<string> {
    const verifier = localStorage.getItem('verifier') ?? '';

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('code_verifier', verifier);

    const result = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const json = await result.json().catch(() => ({}));
    if (!result.ok) {
        // Spotify returns JSON with error and error_description fields
        const message = json?.error_description ?? json?.error ?? `Token endpoint returned ${result.status}`;
        console.error('getAccessToken error', json);
        throw new Error(message);
    }

    return json.access_token;
}

// Fetch the user's profile information
export async function fetchProfile(token: string): Promise<any> {
    const result = await fetch('https://api.spotify.com/v1/me', {
        method: 'GET', headers: { Authorization: `Bearer ${token}` },
    });

    if (!result.ok) {
        const errJson = await result.json().catch(() => null);
        const message = errJson?.error?.message ?? `Profile endpoint returned ${result.status}`;
        console.error('fetchProfile error', errJson);
        throw new Error(message);
    }

    return await result.json();
}
