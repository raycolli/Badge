# Badge

A wearable conference badge that remembers who you meet and what you talked about.

Tap record after a conversation. Badge transcribes it, creates a contact, writes a summary, and lists your next steps (email, call, meeting) so you can follow up.

## Features

- **Badge:** your profile with name and photo.
- **Record:** up to five minutes of audio, with a live transcript when the browser supports it.
- **Insights:** contacts on the left; on the right, an editable contact, AI summary, and key highlights.
- **Outreach:** next steps from your notes, such as drafting an email, calling a saved number, or preparing a calendar invite. Nothing sends without your review.

## Hardware

Raspberry Pi 5, 3.5 in Screen, USB Microphone, Case, Lanyard (knitted to desired length)

## Tech stack

React and Vite, a Node.js server, Supabase (Google sign-in, Postgres, Storage), and deployed on Vercel.

AI models:

- Meta Muse Spark for summaries, key highlights, contact extraction, and next steps
- Meta Muse Voice Transcribe for speech-to-text

## Privacy

Audio is deleted after transcription. Each user can only access their own data. API keys stay on the server. There is no face recognition, and only conversations recorded with permission should be saved.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `MODEL_API_KEY`.
3. In Supabase, run `supabase/schema.sql` in the SQL Editor.
4. Enable Google in Supabase under Authentication, Providers, and add `http://localhost:5173` as a redirect URL.
5. `npm run dev`, then open the exact URL Vite prints.

To deploy, push to Vercel and add the same environment variables in the project settings.

## On the Raspberry Pi

The app is hosted on Vercel, so the Pi only needs a browser. Allow microphone access.

## Troubleshooting

- **Port 5173 in use:** stop the old session (`pkill -f vite`, `pkill -f "node server.js"`).
- **Empty 404 when recording:** open the exact URL `npm run dev` prints.