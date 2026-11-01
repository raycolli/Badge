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
    if (!/^audio\/(webm|mp4|mpeg|wav|ogg|x-wav|aac)(;.*)?$/.test(file.mimetype)) {
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
          type: request.file.mimetype,
        }),
        model: "gpt-4o-mini-transcribe",
      });
      response.json({ text: transcript.text });
    } catch (error) {
      console.error("Audio transcription failed:", error.message);
      next(
        Object.assign(new Error("Audio transcription failed. Check the server configuration and try again."), {
          status: 502,
        }),
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
