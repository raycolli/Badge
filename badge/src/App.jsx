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
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const recorder = useRef(null);
  const speechRecognition = useRef(null);
  const speechRestartTimer = useRef(null);
  const recordingActive = useRef(false);
  const liveRecognitionEnabled = useRef(false);
  const finalTranscript = useRef("");
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
      window.clearTimeout(speechRestartTimer.current);
      recordingActive.current = false;
      liveRecognitionEnabled.current = false;
      speechRecognition.current?.abort();
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
      if (!Array.isArray(result.contacts)) {
        throw new Error(
          "The transcription server is out of date. Stop and restart npm run dev, then try again.",
        );
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

      if (result.contacts.length) {
        const { error: contactsError } = await supabase
          .from("recording_contacts")
          .insert(
            result.contacts.map((contact) => ({
              recording_id: savedRecording.id,
              user_id: session.user.id,
              ...contact,
            })),
          );
        if (contactsError) {
          throw new Error(
            `Recording saved, but its contacts could not be saved: ${contactsError.message}`,
          );
        }
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
    setSpeechStatus("");
    setLiveTranscript("");
    setInterimTranscript("");
    finalTranscript.current = "";

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
        recordingActive.current = false;
        liveRecognitionEnabled.current = false;
        stream.getTracks().forEach((track) => track.stop());
        speechRecognition.current?.stop();
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
        recordingActive.current = false;
        liveRecognitionEnabled.current = false;
        window.clearTimeout(speechRestartTimer.current);
        speechRecognition.current?.stop();
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
      recordingActive.current = true;
      setRecording(true);
      startLiveTranscription();
      autoStopTimer.current = window.setTimeout(() => {
        if (recorder.current?.state === "recording") {
          recordingActive.current = false;
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

  function startLiveTranscription() {
    if (!recordingActive.current) return;
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechStatus(
        "Live transcription isn't supported in this browser. A transcript will be created after you stop recording.",
      );
      return;
    }

    liveRecognitionEnabled.current = true;
    try {
      const recognition = new Recognition();
      recognition.lang = navigator.language || "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const phrase = event.results[index][0].transcript.trim();
          if (event.results[index].isFinal) {
            finalTranscript.current = [
              finalTranscript.current,
              phrase,
            ]
              .filter(Boolean)
              .join(" ");
          } else {
            interim = [interim, phrase].filter(Boolean).join(" ");
          }
        }
        if (mounted.current) {
          setLiveTranscript(finalTranscript.current);
          setInterimTranscript(interim);
        }
      };
      recognition.onerror = (event) => {
        if (!mounted.current || !recordingActive.current) return;
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed" ||
          event.error === "network"
        ) {
          liveRecognitionEnabled.current = false;
          setSpeechStatus(
            "Live transcription is unavailable. Recording continues; a transcript will be created when you stop.",
          );
        } else if (event.error !== "no-speech" && event.error !== "aborted") {
          liveRecognitionEnabled.current = false;
          setSpeechStatus(
            "Live transcription paused. Recording continues; a transcript will be created when you stop.",
          );
        }
      };
      recognition.onend = () => {
        if (
          !mounted.current ||
          !recordingActive.current ||
          !liveRecognitionEnabled.current
        ) {
          return;
        }
        speechRestartTimer.current = window.setTimeout(() => {
          if (recordingActive.current && liveRecognitionEnabled.current) {
            startLiveTranscription();
          }
        }, 300);
      };
      speechRecognition.current = recognition;
      recognition.start();
    } catch {
      liveRecognitionEnabled.current = false;
      setSpeechStatus(
        "Live transcription couldn't start. Recording continues; a transcript will be created when you stop.",
      );
    }
  }

  function stopRecording() {
    if (!recorder.current || recorder.current.state === "inactive") return;
    window.clearTimeout(autoStopTimer.current);
    window.clearTimeout(speechRestartTimer.current);
    recordingActive.current = false;
    liveRecognitionEnabled.current = false;
    speechRecognition.current?.stop();
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
      <section
        className="live-transcript"
        aria-labelledby="live-transcript-heading"
        aria-live="polite"
      >
        <h2 id="live-transcript-heading">Live transcript</h2>
        {speechStatus ? (
          <p className="live-transcript-placeholder">{speechStatus}</p>
        ) : liveTranscript || interimTranscript ? (
          <p className="live-transcript-text">
            {liveTranscript}
            {liveTranscript && interimTranscript ? " " : ""}
            <span className="interim-transcript">{interimTranscript}</span>
          </p>
        ) : (
          <p className="live-transcript-placeholder">
            
          </p>
        )}
      </section>
    </section>
  );
}

function formatRecordingDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function contactLabel(contact) {
  return contact.name || "Unknown person";
}

function contactRoleCompany(contact) {
  if (contact.role && contact.company) {
    return `${contact.role} @ ${contact.company}`;
  }
  return contact.role || contact.company || "";
}

function ContactCard({ contact, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: contact.name || "",
    role: contact.role || "",
    company: contact.company || "",
    email: contact.email || "",
    phone_number: contact.phone_number || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      name: contact.name || "",
      role: contact.role || "",
      company: contact.company || "",
      email: contact.email || "",
      phone_number: contact.phone_number || "",
    });
  }, [
    contact.name,
    contact.role,
    contact.company,
    contact.email,
    contact.phone_number,
  ]);

  async function saveContact(event) {
    event.preventDefault();
    setSaving(true);
    const saved = await onSave(contact.id, {
      name: draft.name.trim(),
      role: draft.role.trim(),
      company: draft.company.trim(),
      email: draft.email.trim(),
      phone_number: draft.phone_number.trim(),
    });
    setSaving(false);
    if (saved) setEditing(false);
  }

  return (
    <article className="contact-card">
      {editing ? (
        <form className="contact-form" onSubmit={saveContact}>
          <label>
            Name
            <input
              autoComplete="off"
              maxLength={120}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="Name"
            />
          </label>
          <label>
            Role
            <input
              autoComplete="off"
              maxLength={120}
              value={draft.role}
              onChange={(event) =>
                setDraft({ ...draft, role: event.target.value })
              }
              placeholder="Role"
            />
          </label>
          <label>
            Company
            <input
              autoComplete="organization"
              maxLength={120}
              value={draft.company}
              onChange={(event) =>
                setDraft({ ...draft, company: event.target.value })
              }
              placeholder="Company"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={draft.email}
              onChange={(event) =>
                setDraft({ ...draft, email: event.target.value })
              }
              placeholder="Email address"
            />
          </label>
          <label>
            Phone number
            <input
              type="text"
              autoComplete="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={32}
              value={draft.phone_number}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  phone_number: event.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="Phone number"
            />
          </label>
          <div className="contact-actions">
            <button
              className="plain-button"
              type="button"
              onClick={() => {
                setDraft({
                  name: contact.name || "",
                  role: contact.role || "",
                  company: contact.company || "",
                  email: contact.email || "",
                  phone_number: contact.phone_number || "",
                });
                setEditing(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button className="plain-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="contact-card-view">
          <div>
            <h3>{contactLabel(contact)}</h3>
            {contactRoleCompany(contact) && (
              <p>{contactRoleCompany(contact)}</p>
            )}
            {contact.email && <p>{contact.email}</p>}
            {contact.phone_number && <p>{contact.phone_number}</p>}
          </div>
          <button
            className="plain-button"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
      )}
    </article>
  );
}

function InsightsPage({ selectedId, onSelect, onError }) {
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(true);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState(undefined);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [editingHighlights, setEditingHighlights] = useState(false);
  const [highlightsDraft, setHighlightsDraft] = useState("");
  const [savingHighlights, setSavingHighlights] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingRecordings(true);

    async function loadRecordings() {
      const { data, error } = await supabase
        .from("recordings")
        .select(
          "id, created_at, duration_seconds, transcript, executive_summary, key_highlights, contacts:recording_contacts(id, name, role, company, email, phone_number)",
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

  const contacts = recordings.flatMap((recording) =>
    (recording.contacts || []).map((contact) => ({ contact, recording })),
  );
  const selectedContact =
    selectedContactId !== undefined
      ? contacts.find(({ contact }) => contact.id === selectedContactId) ?? null
      : contacts.find(({ recording }) => recording.id === selectedId) ??
        contacts[0] ??
        null;
  const selectedRecording =
    selectedContact?.recording ??
    recordings.find((recording) => recording.id === selectedId) ??
    recordings[0] ??
    null;
  const visibleContacts = contacts.filter(({ contact }) => {
    const query = contactSearch.trim().toLocaleLowerCase();
    return [
      contact.name,
      contact.role,
      contact.company,
      contact.email,
      contact.phone_number,
    ]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
  const recordingsWithoutContacts = recordings.filter(
    (recording) => !recording.contacts?.length,
  );

  useEffect(() => {
    setSummaryDraft(selectedRecording?.executive_summary || "");
    setEditingSummary(false);
    setHighlightsDraft((selectedRecording?.key_highlights || []).join("\n"));
    setEditingHighlights(false);
    setTranscriptDraft(selectedRecording?.transcript || "");
    setEditingTranscript(false);
  }, [
    selectedRecording?.id,
    selectedRecording?.executive_summary,
    selectedRecording?.key_highlights,
    selectedRecording?.transcript,
  ]);

  async function saveContactUpdates(contactId, updates) {
    if (!selectedContact) return false;
    const recordingId = selectedContact.recording.id;
    const { error } = await supabase
      .from("recording_contacts")
      .update(updates)
      .eq("id", contactId);
    if (error) {
      onError(`Could not update contact: ${error.message}`);
      return false;
    }

    setRecordings((current) =>
      current.map((recording) =>
        recording.id === recordingId
          ? {
              ...recording,
              contacts: recording.contacts.map((item) =>
                item.id === contactId ? { ...item, ...updates } : item,
              ),
            }
          : recording,
      ),
    );
    return true;
  }

  async function saveSummary(event) {
    event.preventDefault();
    if (!selectedRecording) return;

    setSavingSummary(true);
    const summary = summaryDraft.trim();
    const { error } = await supabase
      .from("recordings")
      .update({ executive_summary: summary })
      .eq("id", selectedRecording.id);
    setSavingSummary(false);
    if (error) {
      onError(`Could not update summary: ${error.message}`);
      return;
    }

    setRecordings((current) =>
      current.map((recording) =>
        recording.id === selectedRecording.id
          ? { ...recording, executive_summary: summary }
          : recording,
      ),
    );
    setEditingSummary(false);
  }

  async function saveRecordingChanges(updates) {
    if (!selectedRecording) return false;

    const { error } = await supabase
      .from("recordings")
      .update(updates)
      .eq("id", selectedRecording.id);
    if (error) {
      onError(`Could not update recording: ${error.message}`);
      return false;
    }

    setRecordings((current) =>
      current.map((recording) =>
        recording.id === selectedRecording.id
          ? { ...recording, ...updates }
          : recording,
      ),
    );
    return true;
  }

  async function saveHighlights(event) {
    event.preventDefault();
    setSavingHighlights(true);
    const highlights = highlightsDraft
      .split("\n")
      .map((highlight) => highlight.trim())
      .filter(Boolean);
    const saved = await saveRecordingChanges({ key_highlights: highlights });
    setSavingHighlights(false);
    if (saved) setEditingHighlights(false);
  }

  async function saveTranscript(event) {
    event.preventDefault();
    const transcript = transcriptDraft.trim();
    if (!transcript) {
      onError("Conversation history cannot be empty.");
      return;
    }

    setSavingTranscript(true);
    const saved = await saveRecordingChanges({ transcript });
    setSavingTranscript(false);
    if (saved) setEditingTranscript(false);
  }

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
        <aside className="recording-sidebar" aria-label="Contacts">
          <h2>Contacts</h2>
          <label className="contact-search">
            <span className="visually-hidden">Search contacts</span>
            <input
              type="search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Search contacts"
            />
          </label>
          {loadingRecordings ? (
            <p className="sidebar-message">Loading recordings…</p>
          ) : visibleContacts.length ||
            (!contactSearch.trim() && recordingsWithoutContacts.length) ? (
            <ul className="recording-list">
              {visibleContacts.map(({ contact, recording }) => (
                <li key={contact.id}>
                  <button
                    className={`recording-list-item${
                      selectedContact?.contact.id === contact.id ? " is-selected" : ""
                    }`}
                    type="button"
                    aria-current={
                      selectedContact?.contact.id === contact.id
                        ? "true"
                        : undefined
                    }
                    onClick={() => {
                      setSelectedContactId(contact.id);
                      onSelect(recording.id);
                    }}
                  >
                    <span className="recording-list-date">
                      {formatRecordingDate(recording.created_at)}
                    </span>
                    <span className="recording-list-summary">
                      {contactLabel(contact)}
                    </span>
                    {contactRoleCompany(contact) && (
                      <span className="recording-list-role">
                        {contactRoleCompany(contact)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {!contactSearch.trim() &&
                recordingsWithoutContacts.map((recording) => (
                  <li key={recording.id}>
                    <button
                      className={`recording-list-item${
                        !selectedContact && selectedRecording?.id === recording.id
                          ? " is-selected"
                          : ""
                      }`}
                      type="button"
                      aria-current={
                        !selectedContact && selectedRecording?.id === recording.id
                          ? "true"
                          : undefined
                      }
                      onClick={() => {
                        setSelectedContactId(null);
                        onSelect(recording.id);
                      }}
                    >
                      <span className="recording-list-date">
                        {formatRecordingDate(recording.created_at)}
                      </span>
                      <span className="recording-list-summary">
                        No people identified
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          ) : recordings.length ? (
            <p className="sidebar-message">No contacts match your search.</p>
          ) : (
            <p className="sidebar-message">Your recordings will appear here.</p>
          )}
        </aside>

        <article className="insight-detail">
          {selectedRecording ? (
            <>
              <div className="detail-meta">
                <span>{formatRecordingDate(selectedRecording.created_at)}</span>
              </div>
              <section className="insight-section people-section">
                <div className="section-heading-row">
                  <div>
                    <p className="section-eyebrow"></p>
                    <h2>Contact</h2>
                  </div>
                  <button
                    className="plain-button"
                    type="button"
                    onClick={async () => {
                      const { data, error } = await supabase
                        .from("recording_contacts")
                        .insert({
                          recording_id: selectedRecording.id,
                          name: "",
                          role: "",
                          company: "",
                          email: "",
                          phone_number: "",
                        })
                            .select("id, name, role, company, email, phone_number")
                        .single();
                      if (error) {
                        onError(`Could not add contact: ${error.message}`);
                        return;
                      }
                      setRecordings((current) =>
                        current.map((recording) =>
                          recording.id === selectedRecording.id
                            ? {
                                ...recording,
                                contacts: [...(recording.contacts || []), data],
                              }
                            : recording,
                        ),
                      );
                      setSelectedContactId(data.id);
                    }}
                  >
                    Add contact
                  </button>
                </div>
                {selectedContact ? (
                  <ContactCard
                    key={selectedContact.contact.id}
                    contact={selectedContact.contact}
                    onSave={saveContactUpdates}
                  />
                ) : (
                  <p className="no-contacts">
                    No contacts were identified. Add a contact from this conversation.
                  </p>
                )}
              </section>
              <section className="insight-section">
                <div className="section-heading-row">
                  <h2>Summary</h2>
                  {editingSummary ? (
                    <div className="contact-actions">
                      <button
                        className="plain-button"
                        type="button"
                        disabled={savingSummary}
                        onClick={() => {
                          setSummaryDraft(selectedRecording.executive_summary || "");
                          setEditingSummary(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="plain-button"
                        type="submit"
                        form="summary-form"
                        disabled={savingSummary}
                      >
                        {savingSummary ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="plain-button"
                      type="button"
                      onClick={() => setEditingSummary(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingSummary ? (
                  <form id="summary-form" onSubmit={saveSummary}>
                    <label className="visually-hidden" htmlFor="summary-editor">
                      Summary
                    </label>
                    <textarea
                      id="summary-editor"
                      className="summary-editor"
                      value={summaryDraft}
                      onChange={(event) => setSummaryDraft(event.target.value)}
                      rows={6}
                    />
                  </form>
                ) : (
                  <p className="executive-summary">
                    {selectedRecording.executive_summary}
                  </p>
                )}
              </section>
              <section className="insight-section">
                <div className="section-heading-row">
                  <h2>Key Highlights</h2>
                  {editingHighlights ? (
                    <div className="contact-actions">
                      <button
                        className="plain-button"
                        type="button"
                        disabled={savingHighlights}
                        onClick={() => {
                          setHighlightsDraft(
                            (selectedRecording.key_highlights || []).join("\n"),
                          );
                          setEditingHighlights(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="plain-button"
                        type="submit"
                        form="highlights-form"
                        disabled={savingHighlights}
                      >
                        {savingHighlights ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="plain-button"
                      type="button"
                      onClick={() => setEditingHighlights(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingHighlights ? (
                  <form id="highlights-form" onSubmit={saveHighlights}>
                    <label className="visually-hidden" htmlFor="highlights-editor">
                      Key Highlights, one per line
                    </label>
                    <textarea
                      id="highlights-editor"
                      className="recording-editor"
                      value={highlightsDraft}
                      onChange={(event) => setHighlightsDraft(event.target.value)}
                      placeholder="Enter one highlight per line"
                      rows={6}
                    />
                  </form>
                ) : selectedRecording.key_highlights?.length ? (
                  <ul className="highlight-list">
                    {selectedRecording.key_highlights.map((highlight, index) => (
                      <li key={`${index}-${highlight}`}>{highlight}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="executive-summary">No key highlights yet.</p>
                )}
              </section>
              <section className="insight-section conversation-section">
                <div className="section-heading-row">
                  <h2>Conversation History</h2>
                  {editingTranscript ? (
                    <div className="contact-actions">
                      <button
                        className="plain-button"
                        type="button"
                        disabled={savingTranscript}
                        onClick={() => {
                          setTranscriptDraft(selectedRecording.transcript || "");
                          setEditingTranscript(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="plain-button"
                        type="submit"
                        form="transcript-form"
                        disabled={savingTranscript}
                      >
                        {savingTranscript ? "Saving…" : "Save"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="plain-button"
                      type="button"
                      onClick={() => setEditingTranscript(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingTranscript ? (
                  <form id="transcript-form" onSubmit={saveTranscript}>
                    <label className="visually-hidden" htmlFor="transcript-editor">
                      Conversation History
                    </label>
                    <textarea
                      id="transcript-editor"
                      className="recording-editor"
                      value={transcriptDraft}
                      onChange={(event) => setTranscriptDraft(event.target.value)}
                      required
                      rows={14}
                    />
                  </form>
                ) : (
                  <p className="conversation-transcript">
                    {selectedRecording.transcript}
                  </p>
                )}
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
