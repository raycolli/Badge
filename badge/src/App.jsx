import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";

const TABS = ["Profile", "Record", "Insights"];

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        transform="translate(0 4)"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.01 46.98 31.9 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

function ProfilePage({ user, onError }) {
  const [name, setName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [editing, setEditing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPath, setPhotoPath] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    let active = true;
    const metadata = user.user_metadata ?? {};
    const defaultName =
      metadata.full_name || metadata.name || user.email?.split("@")[0] || "";
    setName(defaultName);
    setDraftName(defaultName);
    setEditing(false);
    setPhotoUrl("");
    setPhotoPath(null);
    onError("");

    async function loadProfile() {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_path")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        onError(`Could not load your profile: ${error.message}`);
        return;
      }

      if (!profile) {
        const { error: insertError } = await supabase.from("profiles").insert({
          user_id: user.id,
          display_name: defaultName,
        });
        if (!active) return;
        if (insertError) {
          onError(`Could not create your profile: ${insertError.message}`);
          return;
        }
      } else {
        setName(profile.display_name);
        setDraftName(profile.display_name);
        setPhotoPath(profile.avatar_path);
      }

      const savedPhotoPath = profile?.avatar_path;
      if (savedPhotoPath) {
        const { data, error: photoError } = await supabase.storage
          .from("profile-photos")
          .createSignedUrl(savedPhotoPath, 60 * 60);
        if (!active) return;
        if (photoError) {
          onError(`Could not load your profile photo: ${photoError.message}`);
          return;
        }
        setPhotoUrl(data.signedUrl);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [user.id, user.user_metadata, user.email, onError]);

  async function saveName(event) {
    event.preventDefault();
    const cleanName = draftName.trim();
    if (!cleanName) {
      onError("Enter your name before saving.");
      return;
    }

    setSaving(true);
    onError("");
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        display_name: cleanName,
        avatar_path: photoPath,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }

    setName(cleanName);
    setEditing(false);
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Choose an image smaller than 5 MB.");
      return;
    }

    setSaving(true);
    onError("");
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${user.id}/profile.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setSaving(false);
      onError(uploadError.message);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        display_name: name,
        avatar_path: path,
      },
      { onConflict: "user_id" },
    );
    const { data, error: urlError } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(path, 60 * 60);
    setSaving(false);

    if (profileError || urlError) {
      onError(
        `Photo uploaded, but profile update failed: ${
          profileError?.message || urlError.message
        }`,
      );
      return;
    }
    setPhotoPath(path);
    setPhotoUrl(data.signedUrl);
  }

  return (
    <section className="profile-page" aria-label="Profile">
      <article className="badge-card">
        <button
          className="badge-photo"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={saving}
          aria-label={photoUrl ? "Change profile photo" : "Add profile photo"}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="Your profile" />
          ) : (
            <span className="photo-placeholder">
              <span className="photo-plus" aria-hidden="true">+</span>
              Add photo
            </span>
          )}
          {photoUrl && <span className="photo-action">Change photo</span>}
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={uploadPhoto}
          aria-label="Choose profile photo"
        />
        <div className="badge-name">
          {name || "Your name"}
        </div>
      </article>

      {editing ? (
        <form className="profile-edit" onSubmit={saveName}>
          <label htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            autoComplete="name"
            maxLength={80}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <div className="form-actions">
            <button
              className="plain-button"
              type="button"
              onClick={() => {
                setDraftName(name);
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button className="plain-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <button
          className="plain-button edit-profile-button"
          type="button"
          onClick={() => setEditing(true)}
        >
          Edit name
        </button>
      )}
    </section>
  );
}

const MAX_RECORDING_MS = 5 * 60 * 1000;

function RecordPage({ onError, onSaved }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const mounted = useRef(false);
  const request = useRef(null);
  const autoStopTimer = useRef(null);
  const recordingStartedAt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(autoStopTimer.current);
      request.current?.abort();
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      recorder.current?.stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(blob, mimeType, durationSeconds) {
    if (!blob.size) {
      onError("No audio was captured. Try recording again.");
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setTranscribing(true);
    onError("");
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error("Sign in again to transcribe audio.");

      const mediaType = mimeType.split(";")[0].trim().toLowerCase();
      const extensions = {
        "audio/aac": "aac",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/webm": "webm",
        "audio/x-wav": "wav",
      };
      const extension = extensions[mediaType];
      if (!extension) {
        throw new Error(`This browser recorded an unsupported audio format: ${mediaType || "unknown"}.`);
      }
      const formData = new FormData();
      formData.append("audio", blob, `recording.${extension}`);
      formData.append("durationSeconds", String(durationSeconds));
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
        signal: controller.signal,
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        if (response.status === 404 && !responseText.trim()) {
          throw new Error(
            "This browser tab is connected to an app server without the transcription API. Open the exact Vite URL printed by npm run dev from the badge folder (currently http://localhost:5173).",
          );
        }
        throw new Error(
          responseText.trim()
            ? `The transcription server returned an invalid response (HTTP ${response.status}).`
            : `The transcription server returned an empty response (HTTP ${response.status}). Check the terminal running npm run dev.`,
        );
      }
      if (!response.ok) {
        throw new Error(result.error || "Transcription failed.");
      }
      if (!result.text?.trim()) {
        throw new Error("No speech was detected in that recording.");
      }

      const { data: savedRecording, error: saveError } = await supabase
        .from("recordings")
        .insert({
          user_id: session.user.id,
          duration_seconds: durationSeconds,
          transcript: result.text,
          executive_summary: result.executive_summary,
          key_highlights: result.key_highlights,
        })
        .select("id")
        .single();

      if (saveError) {
        throw new Error(`Transcript created, but could not save it: ${saveError.message}`);
      }
      if (mounted.current) onSaved(savedRecording.id);
    } catch (error) {
      if (mounted.current && error.name !== "AbortError") {
        onError(error.message || "Transcription failed.");
      }
    } finally {
      if (mounted.current) setTranscribing(false);
    }
  }

  async function startRecording() {
    onError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("Audio recording is not supported in this browser.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
      ];
      let activeRecorder;
      let requestedMimeType = "";
      for (const type of supportedTypes) {
        try {
          if (!MediaRecorder.isTypeSupported(type)) continue;
          activeRecorder = new MediaRecorder(stream, { mimeType: type });
          requestedMimeType = type;
          break;
        } catch {
          // A browser may report a format as supported but reject its exact codec string.
        }
      }
      if (!activeRecorder) activeRecorder = new MediaRecorder(stream);
      chunks.current = [];
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      activeRecorder.onerror = (event) => {
        window.clearTimeout(autoStopTimer.current);
        stream.getTracks().forEach((track) => track.stop());
        if (mounted.current) {
          setRecording(false);
          onError(
            event.error?.message ||
              "The browser could not record audio. Check microphone permissions and try again.",
          );
        }
      };
      activeRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        window.clearTimeout(autoStopTimer.current);
        if (!mounted.current) return;
        const recordedMimeType =
          activeRecorder.mimeType ||
          chunks.current.find((chunk) => chunk.type)?.type ||
          requestedMimeType ||
          (/\bSafari\//.test(navigator.userAgent) &&
          !/\bChrome\//.test(navigator.userAgent)
            ? "audio/mp4"
            : "audio/webm");
        if (!recordedMimeType) {
          onError("The browser did not provide a recording audio format.");
          return;
        }
        const durationSeconds = Math.max(
          1,
          Math.min(
            300,
            Math.ceil((Date.now() - recordingStartedAt.current) / 1000),
          ),
        );
        void transcribe(
          new Blob(chunks.current, {
            type: recordedMimeType,
          }),
          recordedMimeType,
          durationSeconds,
        );
      };
      recorder.current = activeRecorder;
      recordingStartedAt.current = Date.now();
      activeRecorder.start();
      setRecording(true);
      autoStopTimer.current = window.setTimeout(() => {
        if (recorder.current?.state === "recording") {
          recorder.current.stop();
          setRecording(false);
        }
      }, MAX_RECORDING_MS);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (mounted.current) {
        onError(error.message || "Could not access the microphone.");
      }
    }
  }

  function stopRecording() {
    if (!recorder.current || recorder.current.state === "inactive") return;
    window.clearTimeout(autoStopTimer.current);
    recorder.current.stop();
    setRecording(false);
  }

  return (
    <section className="record-page" aria-labelledby="record-heading">
      <h1 id="record-heading">Record Conversation</h1>
      <p className="record-description">
        Capture up to 5 minutes. Recording stops automatically at the limit.
      </p>
      <button
        className={`record-button${recording ? " is-recording" : ""}`}
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={transcribing}
      >
        <span className="record-dot" aria-hidden="true" />
        {recording
          ? "Stop recording"
          : transcribing
            ? "Transcribing…"
            : "Start Recording"}
      </button>
      {recording && (
        <p className="recording-status" role="status">
          Recording in progress
        </p>
      )}
      {transcribing && (
        <p className="recording-status" role="status">
          Creating transcript and insights…
        </p>
      )}
    </section>
  );
}

function formatRecordingDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRecordingDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function InsightsPage({ selectedId, onSelect, onError }) {
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRecordings() {
      const { data, error } = await supabase
        .from("recordings")
        .select(
          "id, created_at, duration_seconds, transcript, executive_summary, key_highlights",
        )
        .order("created_at", { ascending: false });

      if (!active) return;
      setLoadingRecordings(false);
      if (error) {
        onError(`Could not load recordings: ${error.message}`);
        return;
      }

      setRecordings(data);
      if (!selectedId && data.length) onSelect(data[0].id);
      if (selectedId && !data.some((recording) => recording.id === selectedId)) {
        onSelect(data[0]?.id ?? null);
      }
    }

    void loadRecordings();
    return () => {
      active = false;
    };
  }, [selectedId, onError, onSelect]);

  const selectedRecording =
    recordings.find((recording) => recording.id === selectedId) ??
    recordings[0] ??
    null;

  return (
    <section className="insights-page" aria-labelledby="insights-heading">
      <header className="insights-header">
        <div>
          <h1 id="insights-heading">Insights</h1>
        </div>
        <span className="recording-count">
          {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
        </span>
      </header>

      <div className="insights-layout">
        <aside className="recording-sidebar" aria-label="Recordings">
          <h2>Recordings</h2>
          {loadingRecordings ? (
            <p className="sidebar-message">Loading recordings…</p>
          ) : recordings.length ? (
            <ul className="recording-list">
              {recordings.map((recording) => (
                <li key={recording.id}>
                  <button
                    className={`recording-list-item${
                      selectedRecording?.id === recording.id ? " is-selected" : ""
                    }`}
                    type="button"
                    aria-current={
                      selectedRecording?.id === recording.id ? "true" : undefined
                    }
                    onClick={() => onSelect(recording.id)}
                  >
                    <span className="recording-list-date">
                      {formatRecordingDate(recording.created_at)}
                    </span>
                    <span className="recording-list-summary">
                      {recording.executive_summary}
                    </span>
                    <span className="recording-list-duration">
                      {formatRecordingDuration(recording.duration_seconds)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sidebar-message">Your recordings will appear here.</p>
          )}
        </aside>

        <article className="insight-detail">
          {selectedRecording ? (
            <>
              <div className="detail-meta">
                <span>{formatRecordingDate(selectedRecording.created_at)}</span>
                <span>
                  {formatRecordingDuration(selectedRecording.duration_seconds)}
                </span>
              </div>
              <section className="insight-section">
                <h2>Executive Summary</h2>
                <p className="executive-summary">
                  {selectedRecording.executive_summary}
                </p>
              </section>
              <section className="insight-section">
                <h2>Key Highlights</h2>
                <ul className="highlight-list">
                  {selectedRecording.key_highlights.map((highlight, index) => (
                    <li key={`${index}-${highlight}`}>{highlight}</li>
                  ))}
                </ul>
              </section>
              <section className="insight-section conversation-section">
                <h2>Conversation History</h2>
                <p className="conversation-transcript">
                  {selectedRecording.transcript}
                </p>
              </section>
            </>
          ) : (
            <div className="empty-insights">
              <h2>{loadingRecordings ? "Loading insights…" : "No recordings yet"}</h2>
              {!loadingRecordings && (
                <p>Record a conversation to see its summary and transcript here.</p>
              )}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Profile");
  const [error, setError] = useState("");
  const [selectedRecordingId, setSelectedRecordingId] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setTab("Profile");
      setError("");
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setLoading(false);
  }

  if (loading) return <main className="page-shell" aria-label="Loading" />;

  if (!session) {
    return (
      <main className="page-shell">
        <section className="login-card" aria-labelledby="page-title">
          <p className="welcome">Welcome</p>
          <h1 id="page-title">Sign in</h1>
          <button
            className="google-button"
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            <GoogleMark />
            <span>{loading ? "Connecting…" : "Continue with Google"}</span>
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell${tab === "Insights" ? " insights-open" : ""}`}>
      <header className="app-header">
        <button className="plain-button" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      {tab === "Profile" && (
        <ProfilePage user={session.user} onError={setError} />
      )}
      {tab === "Record" && (
        <RecordPage
          onError={setError}
          onSaved={(id) => {
            setSelectedRecordingId(id);
            setTab("Insights");
          }}
        />
      )}
      {tab === "Insights" && (
        <InsightsPage
          selectedId={selectedRecordingId}
          onSelect={setSelectedRecordingId}
          onError={setError}
        />
      )}

      {error && <p className="app-error" role="alert">{error}</p>}

      <nav className="bottom-nav" aria-label="Main navigation">
        {TABS.map((item) => (
          <button
            key={item}
            className={`nav-tab${tab === item ? " is-active" : ""}`}
            type="button"
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              setError("");
            }}
          >
            {item}
          </button>
        ))}
      </nav>
    </main>
  );
}

export default App;
