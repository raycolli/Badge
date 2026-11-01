import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3001);
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const mediaType = file.mimetype.split(";")[0].trim().toLowerCase();
    if (!/^audio\/(webm|mp4|mpeg|wav|ogg|x-wav|aac)$/.test(mediaType)) {
      callback(
        Object.assign(new Error("Upload a supported audio recording."), {
          status: 400,
        }),
      );
      return;
    }
    callback(null, true);
  },
});

async function requireUser(request, response, next) {
  const authorization = request.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    response.status(401).json({ error: "Sign in to transcribe a recording." });
    return;
  }
  if (!supabase) {
    response.status(503).json({
      error: "Server Supabase configuration is missing.",
    });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    response.status(401).json({ error: "Your session expired. Sign in again." });
    return;
  }
  next();
}

app.post(
  "/api/transcribe",
  requireUser,
  upload.single("audio"),
  async (request, response, next) => {
    if (!request.file) {
      response.status(400).json({ error: "Choose an audio recording first." });
      return;
    }
    const durationSeconds = Number(request.body.durationSeconds);
    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 300
    ) {
      response.status(400).json({
        error: "Recording duration must be between 1 second and 5 minutes.",
      });
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      response.status(503).json({
        error: "Add OPENAI_API_KEY to badge/.env to enable transcription.",
      });
      return;
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const transcript = await openai.audio.transcriptions.create({
        file: new File([request.file.buffer], request.file.originalname, {
          type: request.file.mimetype.split(";")[0].trim().toLowerCase(),
        }),
        model: "gpt-4o-mini-transcribe",
      });
      if (!transcript.text.trim()) {
        response.status(422).json({ error: "No speech was detected." });
        return;
      }

      const analysis = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Analyze the conversation transcript. Return a JSON object with an executive_summary string and key_highlights array of 3 to 5 concise strings. Be factual, neutral, and concise. Do not invent details. If the conversation has no clear action items, summarize its main points instead.",
          },
          { role: "user", content: transcript.text },
        ],
      });
      const content = analysis.choices[0]?.message.content;
      if (!content) throw new Error("The AI returned an empty summary.");
      const insights = JSON.parse(content);
      if (
        typeof insights.executive_summary !== "string" ||
        !insights.executive_summary.trim() ||
        !Array.isArray(insights.key_highlights) ||
        insights.key_highlights.length < 3 ||
        insights.key_highlights.length > 5 ||
        !insights.key_highlights.every(
          (item) => typeof item === "string" && item.trim(),
        )
      ) {
        throw new Error("The AI returned an invalid summary.");
      }
      response.json({
        text: transcript.text,
        executive_summary: insights.executive_summary,
        key_highlights: insights.key_highlights.slice(0, 5),
      });
    } catch (error) {
      console.error("Audio transcription or insight generation failed:", {
        status: error.status,
        code: error.code,
      });
      const message =
        error.status === 401
          ? "OpenAI rejected the API key. Verify the server key and restart the app."
          : error.status === 429
            ? "OpenAI rate limit or usage limit reached. Check the project's billing and limits."
            : `OpenAI transcription or insight generation failed${
                error.status ? ` (HTTP ${error.status})` : ""
              }. Check the terminal running npm run dev for details.`;
      next(
        Object.assign(new Error(message), { status: 502 }),
      );
    }
  },
);

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: "Recordings must be 25 MB or smaller." });
    return;
  }
  const status = error.status || 500;
  if (status >= 500) console.error("API request failed:", error.message);
  response.status(status).json({ error: error.message || "Request failed." });
});

if (process.env.NODE_ENV === "production") {
  const distPath = fileURLToPath(new URL("./dist/", import.meta.url));
  app.use(express.static(distPath));
  app.get(/.*/, (_request, response) => {
    response.sendFile(fileURLToPath(new URL("./dist/index.html", import.meta.url)));
  });
}

app.listen(port, () => {
  console.log(`Badge API listening on http://localhost:${port}`);
});
