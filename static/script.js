// Local development: run the Flask backend at http://127.0.0.1:5000.
// When the backend is deployed, replace API_BASE with its HTTPS address.
const API_BASE = "http://127.0.0.1:5000";
const $ = (id) => document.getElementById(id);

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

const state = {
  user: null,
  authMode: "signup",
  page: "dashboard",
  activities: [],
  typingTests: [],
  mood: "",
  recorder: null,
  chunks: [],
  recordingUrl: null,
  recordingTimer: null,
  typingInterval: null,
  typingStarted: false,
  typingFinished: false,
  typingStartTime: 0,
  typingEndTime: 0,
  lastWpm: 0
};

const pageInfo = {
  dashboard: ["Your little corner of calm 🌷", "Understand your habits, one day at a time."],
  activity: ["Your daily activity 🌿", "Small observations can help you understand your routines."],
  typing: ["The Typing Lab ⌨️", "Explore your typing speed and accuracy."],
  speech: ["The Speech Lab 🎙️", "An optional space to record and listen to your voice."],
  insights: ["Your gentle insights ✨", "Examples today, data-driven observations later."],
  progress: ["Your progress garden 🌻", "Every entry is a small step."]
};

function todayString() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function showPage(name) {
  if (!pageInfo[name]) return;

  state.page = name;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  const target = $(name + "Page");
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === name);
  });

  $("pageTitle").textContent = pageInfo[name][0];
  $("pageSubtitle").textContent = pageInfo[name][1];

  if (name === "progress") renderProgress();
  if (name === "activity") renderActivities();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAuth() {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  $("authPage").classList.remove("hidden");
  $("pageTitle").textContent = "A fresh little start 🌸";
  $("pageSubtitle").textContent = "Welcome to your personal well-being space.";
  $("profileName").textContent = "Your space";

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.remove("active");
  });
}

function updateAuthForm() {
  const signup = state.authMode === "signup";

  $("authTitle").textContent = signup
    ? "Welcome to Bloomwell"
    : "Welcome back 🌷";

  $("authSubmit").textContent = signup
    ? "Create my demo space ✨"
    : "Enter my space ✨";

  $("authSwitchText").textContent = signup
    ? "Already visited?"
    : "New around here?";

  $("authSwitch").textContent = signup
    ? "Switch to login"
    : "Switch to sign-up";

  $("authName").required = signup;
  $("authName").classList.toggle("hidden", !signup);
  document.querySelector('label[for="authName"]').classList.toggle("hidden", !signup);
}

$("authSwitch").addEventListener("click", () => {
  state.authMode = state.authMode === "signup" ? "login" : "signup";
  updateAuthForm();
});

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const name = $("authName").value.trim();

  try {
    if (state.authMode === "signup") {
      await apiRequest("/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });

      alert("Account created! Please log in with your email and password.");
      state.authMode = "login";
      $("authPassword").value = "";
      updateAuthForm();
      return;
    }

    const result = await apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    state.user = result.user;
    $("profileName").textContent = state.user.name;
    $("authPassword").value = "";
    await loadUserData();
    showPage("dashboard");
  } catch (error) {
    alert(error.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await apiRequest("/logout", { method: "POST" });
  } catch (error) {
    alert("Could not log out from the server: " + error.message);
    return;
  }

  state.user = null;
  state.activities = [];
  state.typingTests = [];
  state.mood = "";
  state.lastWpm = 0;
  showAuth();
});

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();

    const page = button.dataset.page;

    if (page === "dashboard" && button.classList.contains("brand")) {
      showPage("dashboard");
    } else {
      showPage(page);
    }
  });
});

// Mood check-in
document.querySelectorAll(".mood-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    state.mood = button.dataset.mood;

    document.querySelectorAll(".mood-btn").forEach((item) => {
      item.classList.toggle("selected", item === button);
    });

    $("dashMood").textContent = state.mood;
    $("moodMessage").textContent =
      "Mood recorded for this visit: " + state.mood + ". Be kind to yourself. ♡";

    try {
      await apiRequest("/api/mood", {
        method: "POST",
        body: JSON.stringify({ mood: state.mood, notes: "" })
      });
    } catch (error) {
      $("moodMessage").textContent =
        "Mood shown for this visit, but could not be saved: " + error.message;
    }
  });
});

// Daily activity tracker
$("activityDate").value = todayString();

$("activityForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const date = $("activityDate").value;
  const screen = Number($("screenHours").value);
  const sleep = Number($("sleepHours").value);
  const social = Number($("socialHours").value);
  const notes = $("activityNotes").value.trim();

  if (!date || [screen, sleep, social].some((value) => !Number.isFinite(value) || value < 0 || value > 24)) {
    alert("Please enter valid hours between 0 and 24.");
    return;
  }

  if (social > screen) {
    alert("Social media time should not exceed total screen time.");
    return;
  }

  try {
    await apiRequest("/api/activity", {
      method: "POST",
      body: JSON.stringify({ date, screen, sleep, social, notes })
    });

    state.activities.unshift({ date, screen, sleep, social, notes });
    $("dashScreen").textContent = formatHours(screen);
    $("dashSleep").textContent = formatHours(sleep);

    $("activityForm").reset();
    $("activityDate").value = todayString();

    renderActivities();
    renderProgress();
    alert("Your activity entry has been saved! 🌱");
  } catch (error) {
    alert("Activity could not be saved. Please make sure you're logged in and the Flask backend is running. " + error.message);
  }
});

function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (h === 0) return m + "m";
  if (m === 0) return h + "h";
  return h + "h " + m + "m";
}

function renderActivities() {
  const container = $("activityHistory");

  if (!state.activities.length) {
    container.innerHTML =
      '<p class="muted">Your saved entries will appear here.</p>';
    return;
  }

  container.replaceChildren();

  state.activities.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const heading = document.createElement("h3");
    heading.textContent = "🌿 " + item.date;

    const details = document.createElement("p");
    details.textContent =
      "Screen: " + formatHours(item.screen) +
      " · Sleep: " + formatHours(item.sleep) +
      " · Social media: " + formatHours(item.social);

    card.append(heading, details);

    if (item.notes) {
      const notes = document.createElement("p");
      notes.textContent = item.notes;
      card.append(notes);
    }

    container.append(card);
  });
}

// Typing test
const typingPassage =
  "Small steps can make a meaningful difference. Take a moment to pause, notice your habits, and choose one gentle change that supports your day.";

let typingFinishedText = "";

function resetTypingTest() {
  clearInterval(state.typingInterval);
  state.typingInterval = null;
  state.typingStarted = false;
  state.typingFinished = false;
  state.typingStartTime = 0;
  state.typingEndTime = 0;
  typingFinishedText = "";

  $("typingInput").value = "";
  $("typingInput").disabled = true;
  $("typingTimer").textContent = "60s";
  $("typingWpm").textContent = "0";
  $("typingAccuracy").textContent = "100%";
  $("typingFeedback").textContent =
    "Press start, then type the passage above.";
  $("startTyping").disabled = false;
}

function startTypingTest() {
  resetTypingTest();

  state.typingStarted = true;
  state.typingStartTime = Date.now();

  $("typingInput").disabled = false;
  $("typingInput").focus();
  $("startTyping").disabled = true;
  $("typingFeedback").textContent = "Go! Type naturally. ⌨️";

  state.typingInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.typingStartTime) / 1000);
    const remaining = Math.max(0, 60 - elapsed);

    $("typingTimer").textContent = remaining + "s";
    updateTypingStats();

    if (remaining <= 0) finishTypingTest();
  }, 200);
}

function updateTypingStats() {
  const text = $("typingInput").value;
  const elapsedMinutes = Math.max(
    (Date.now() - state.typingStartTime) / 60000,
    1 / 600
  );

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const wpm = Math.round(words / elapsedMinutes);

  let correct = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === typingPassage[i]) correct++;
  }

  const accuracy = text.length
    ? Math.round((correct / text.length) * 100)
    : 100;

  $("typingWpm").textContent = wpm;
  $("typingAccuracy").textContent = accuracy + "%";
}

$("typingInput").addEventListener("input", () => {
  if (!state.typingStarted || state.typingFinished) return;

  updateTypingStats();

  if ($("typingInput").value.length >= typingPassage.length) {
    finishTypingTest();
  }
});

function finishTypingTest() {
  if (!state.typingStarted || state.typingFinished) return;

  state.typingFinished = true;
  state.typingStarted = false;
  state.typingEndTime = Date.now();

  clearInterval(state.typingInterval);
  state.typingInterval = null;

  $("typingInput").disabled = true;
  $("startTyping").disabled = false;

  updateTypingStats();

  state.lastWpm = Number($("typingWpm").textContent) || 0;
  typingFinishedText = $("typingInput").value;

  const accuracyValue = Number(
    $("typingAccuracy").textContent.replace("%", "")
  );

  const testRecord = {
    wpm: state.lastWpm,
    accuracy: accuracyValue + "%",
    characters: typingFinishedText.length,
    date: todayString()
  };
  state.typingTests.unshift(testRecord);

  $("dashWpm").textContent = state.lastWpm + " WPM";
  $("typingFeedback").textContent =
    "Test completed! " + typingFinishedText.length +
    " characters typed. Keep practising at your own pace. 🌷";

  renderProgress();

  apiRequest("/api/typing", {
    method: "POST",
    body: JSON.stringify({
      wpm: state.lastWpm,
      accuracy: accuracyValue,
      characters: typingFinishedText.length,
      date: todayString()
    })
  }).catch((error) => {
    $("typingFeedback").textContent +=
      " (This result could not be saved: " + error.message + ")";
  });
}

$("startTyping").addEventListener("click", startTypingTest);
$("resetTyping").addEventListener("click", resetTypingTest);

// Optional speech recording
$("startRecording").addEventListener("click", async () => {
  if (!$("speechConsent").checked) {
    $("speechStatus").textContent =
      "Please give consent before starting a recording.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined") {
    $("speechStatus").textContent =
      "Recording is not supported here. Try a supported browser over HTTPS.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    state.chunks = [];
    state.recorder = new MediaRecorder(stream);

    state.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    };

    state.recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());

      if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);

      const blob = new Blob(state.chunks, {
        type: state.recorder.mimeType || "audio/webm"
      });

      state.recordingUrl = URL.createObjectURL(blob);
      $("speechPlayback").src = state.recordingUrl;
      $("speechPlayback").classList.remove("hidden");
      $("speechStatus").textContent =
        "Recording ready. You can listen to it below.";
    };

    state.recorder.start();
    state.recordingTimer = Date.now();

    $("startRecording").disabled = true;
    $("stopRecording").disabled = false;
    $("speechStatus").textContent =
      "Recording in progress. Tap stop when you're done.";

    $("speechDuration").textContent = "Recording...";
  } catch (error) {
    $("speechStatus").textContent =
      "Microphone permission was not granted or recording could not start.";
  }
});

$("stopRecording").addEventListener("click", () => {
  if (!state.recorder || state.recorder.state === "inactive") return;

  const seconds = Math.max(
    1,
    Math.round((Date.now() - state.recordingTimer) / 1000)
  );

  $("speechDuration").textContent = "Duration: " + seconds + " seconds";

  state.recorder.stop();

  $("startRecording").disabled = false;
  $("stopRecording").disabled = true;
});

$("speechConsent").addEventListener("change", () => {
  if (!$("speechConsent").checked &&
      state.recorder &&
      state.recorder.state !== "inactive") {
    state.recorder.stop();
    $("startRecording").disabled = false;
    $("stopRecording").disabled = true;
    $("speechStatus").textContent =
      "Recording stopped because consent was withdrawn.";
  }
});

// Progress page
function renderProgress() {
  $("progressEntries").textContent = state.activities.length;
  $("progressTests").textContent = state.typingTests.length;
  $("progressWpm").textContent = state.lastWpm;

  const container = $("progressHistory");
  container.replaceChildren();

  const records = [
    ...state.activities.map((item) => ({
      title: "🌿 Daily activity · " + item.date,
      detail: "Screen " + formatHours(item.screen) +
        " · Sleep " + formatHours(item.sleep)
    })),
    ...state.typingTests.map((item) => ({
      title: "⌨️ Typing test · " + item.date,
      detail: item.wpm + " WPM · " + item.accuracy +
        " accuracy · " + item.characters + " characters"
    }))
  ];

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent =
      "Your activity will appear here as you use the prototype.";
    container.append(empty);
    return;
  }

  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const title = document.createElement("h3");
    title.textContent = record.title;

    const detail = document.createElement("p");
    detail.textContent = record.detail;

    card.append(title, detail);
    container.append(card);
  });
}

async function loadUserData() {
  const [activityData, typingData, moodData] = await Promise.all([
    apiRequest("/api/activity"),
    apiRequest("/api/typing"),
    apiRequest("/api/mood")
  ]);

  state.activities = activityData.activities || [];
  state.typingTests = (typingData.tests || []).map((item) => ({
    ...item,
    accuracy: Number(item.accuracy) + "%",
    characters: item.characters || 0
  }));

  if (moodData.mood) {
    state.mood = moodData.mood;
    $("dashMood").textContent = state.mood;
    document.querySelectorAll(".mood-btn").forEach((button) => {
      button.classList.toggle("selected", button.dataset.mood === state.mood);
    });
  }

  if (state.activities.length) {
    $("dashScreen").textContent = formatHours(state.activities[0].screen);
    $("dashSleep").textContent = formatHours(state.activities[0].sleep);
  }

  if (state.typingTests.length) {
    state.lastWpm = Number(state.typingTests[0].wpm) || 0;
    $("dashWpm").textContent = state.lastWpm + " WPM";
  }

  renderActivities();
  renderProgress();
}

async function restoreLogin() {
  try {
    const result = await apiRequest("/api/me");
    state.user = result.user;
    $("profileName").textContent = state.user.name;
    await loadUserData();
    showPage("dashboard");
  } catch (_error) {
    state.user = null;
    showAuth();
  }
}

// Initial setup
$("todayDate").textContent = new Date().toLocaleDateString("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

updateAuthForm();
resetTypingTest();
renderActivities();
renderProgress();
restoreLogin();
