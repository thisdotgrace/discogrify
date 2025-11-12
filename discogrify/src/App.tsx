import { useEffect, useState } from 'react'
import './App.css'
import { startAuth, handleAuthCallback } from './script'

// Use 127.0.0.1:8000 for local dev as requested
const REDIRECT = 'http://127.0.0.1:8000/callback'

function App() {
  const [profile, setProfile] = useState<any | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // Restore from sessionStorage if available (keeps user signed in on reload)
      const storedToken = sessionStorage.getItem('spotify_access_token')
      const storedProfile = sessionStorage.getItem('spotify_profile')
      if (storedToken && storedProfile) {
        try {
          setAccessToken(storedToken)
          setProfile(JSON.parse(storedProfile))
          return
        } catch (e) {
          // fall through to normal flow
        }
      }

      const result: any = await handleAuthCallback(REDIRECT)
      if (!result) return
      if (result.error) {
        setError(result.error)
        console.error('Auth error:', result.error)
        return
      }
      if (result?.profile) {
        setProfile(result.profile)
        setAccessToken(result.accessToken)
        // persist briefly for reloads (session storage)
        try {
          sessionStorage.setItem('spotify_access_token', result.accessToken)
          sessionStorage.setItem('spotify_profile', JSON.stringify(result.profile))
        } catch (e) {
          // ignore storage errors
        }
        // remove code param from url
        const u = new URL(window.location.href)
        u.searchParams.delete('code')
        window.history.replaceState({}, document.title, u.pathname + u.search)
      }
    })()
  }, [])

  return (
    <>
      <h2>Hello Discogrify!</h2>
      <section id="profile">
        {error ? (
          <div style={{ color: 'red' }}>Error: {error}</div>
        ) : profile ? (
          <>
            <h2>Logged in as <span id="displayName">{profile.display_name}</span></h2>
            {profile.images?.[0]?.url && <img src={profile.images[0].url} alt="avatar" width={80} />}
            <ul>
              <li>User ID: <span id="id">{profile.id}</span></li>
              <li>Email: <span id="email">{profile.email}</span></li>
              <li>Spotify URI: <a id="uri" href={profile.external_urls?.spotify}>{profile.uri}</a></li>
              <li>Link: <a id="url" href={profile.href}>{profile.href}</a></li>
              <li>Profile Image: <span id="imgUrl">{profile.images?.[0]?.url ?? '(no profile image)'}</span></li>
            </ul>
            <p><small>Access token length: {accessToken ? accessToken.length : 0}</small></p>
          </>
        ) : (
          <>
            <p>Not signed in</p>
            <button onClick={() => startAuth(REDIRECT)}>Login with Spotify</button>
          </>
        )}
        {profile && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => {
              // logout: clear session storage and react state
              sessionStorage.removeItem('spotify_access_token')
              sessionStorage.removeItem('spotify_profile')
              setProfile(null)
              setAccessToken(null)
            }}>Logout</button>
          </div>
        )}
      </section>
    </>
  )
}

export default App
