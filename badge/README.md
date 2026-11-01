# Badge

A React login page using Supabase Auth and Google OAuth.

## Run locally

1. Install Node.js 22.12 or newer.
2. Open a terminal in the `badge/` folder (`cd badge` from the repository root).
3. Install dependencies with `npm install`.
4. Copy `.env.example` to `.env` if you need to recreate the local environment file. Set:
   - `VITE_SUPABASE_URL` to your Supabase project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` to your Supabase publishable key.
5. Start the page with `npm run dev`, then open the local URL Vite prints (usually `http://localhost:5173`).

The local `.env` file is git-ignored. Vite variables prefixed with `VITE_` are included in browser code, so only use public/publishable values there. Never put a Supabase secret/service-role key or a Google OAuth client secret in this app or any `VITE_` variable.

## Enable Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/), choose or create a project and configure the OAuth consent screen.
2. Create an OAuth client ID with application type **Web application**.
3. In Supabase, open **Authentication → Providers → Google**, enable the provider, and enter the Google client ID and client secret there.
4. Copy the Supabase callback URL shown in the Google provider settings. Add that exact URL to **Authorized redirect URIs** for the Google OAuth client. It will look like `https://<project-ref>.supabase.co/auth/v1/callback`.
5. In Supabase, open **Authentication → URL Configuration**. Set the Site URL to `http://localhost:5173` for local work and add `http://localhost:5173` under Redirect URLs. Add your production site URL before deploying.
6. Run the app and click **Continue with Google**. After Google authentication, Supabase redirects to the app and the signed-in email is shown.

Google sign-in can use a Gmail account, but it is Google OAuth rather than a Gmail password login. The Google OAuth client secret is entered only in the Supabase dashboard; it is not needed in React.
