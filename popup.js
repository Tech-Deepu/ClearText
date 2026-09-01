// ===================== CONFIG =====================
// The API key is no longer hardcoded here. Each user enters their own
// free Groq API key in the extension's Options page, and it's read from
// chrome.storage.local at call time. This keeps no secret embedded in
// the shipped extension code.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";

function getApiKey() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        console.warn("chrome.storage.local is unavailable — is the extension freshly reloaded from chrome://extensions?");
        resolve("");
        return;
      }
      chrome.storage.local.get(["groqApiKey"], (data) => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError);
          resolve("");
          return;
        }
        resolve((data && data.groqApiKey) || "");
      });
    } catch (e) {
      console.warn("getApiKey failed:", e);
      resolve("");
    }
  });
}

function promptForApiKey(statusEl) {
  if (statusEl) {
    statusEl.innerHTML = '⚠️ No API key set. <a href="#" id="openOptionsLink">Add your free Groq key here</a>.';
    const link = document.getElementById("openOptionsLink");
    if (link) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
  }
}

// ===================== SHARED STATE =====================
let currentSimplifiedText = "";   // translate tab result (for TTS/copy)
let pageResultText = "";          // page mode result (for TTS/copy)
let pageRawText = "";             // extracted raw page text
let isSpeaking = false;
let isPageSpeaking = false;

let quizData = null;              // {questions:[...]}
let quizIndex = 0;
let quizScore = 0;

// ===================== HELPERS =====================
function getLang() {
  return document.getElementById("languageSelect").value;
}

function langCode(lang) {
  const map = {
    English: "en-US",
    Hindi: "hi-IN",
    Tamil: "ta-IN",
    Telugu: "te-IN",
    Kannada: "kn-IN",
    Malayalam: "ml-IN",
    Bengali: "bn-IN",
    Marathi: "mr-IN",
    Gujarati: "gu-IN",
    Punjabi: "pa-IN",
    Urdu: "ur-PK",
    Spanish: "es-ES",
    French: "fr-FR",
    German: "de-DE",
    Italian: "it-IT",
    Portuguese: "pt-PT",
    Chinese: "zh-CN",
    Japanese: "ja-JP",
    Korean: "ko-KR",
    Arabic: "ar-SA",
    Russian: "ru-RU"
  };
  return map[lang] || "en-US";
}

async function callGroq(systemPrompt, userPrompt) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  const data = await response.json();
  if (data.choices && data.choices[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  throw new Error(data.error ? data.error.message : "Unknown API error");
}

function stripFormatting(text) {
  return text.replace(/[*_#`~]/g, "").trim();
}

// Renders text into a container as word-spans so TTS can highlight as it speaks
function renderSpokenText(container, text) {
  container.innerHTML = "";
  const words = text.split(/(\s+)/);
  let charCount = 0;
  words.forEach((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    if (word.trim().length > 0) span.id = `${container.id}-word-${charCount}`;
    container.appendChild(span);
    charCount += word.length;
  });
}

function speak(text, lang, btnEl, containerEl, speakingFlagSetter) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.lang = langCode(lang);

  utterance.onboundary = (event) => {
    if (event.name === "word") {
      containerEl.querySelectorAll(".highlight-word").forEach(el => el.classList.remove("highlight-word"));
      const span = document.getElementById(`${containerEl.id}-word-${event.charIndex}`);
      if (span) {
        span.classList.add("highlight-word");
        span.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  };
  const reset = () => {
    speakingFlagSetter(false);
    btnEl.textContent = "🔊 Read Aloud";
    containerEl.querySelectorAll(".highlight-word").forEach(el => el.classList.remove("highlight-word"));
  };
  utterance.onend = reset;
  utterance.onerror = reset;

  window.speechSynthesis.speak(utterance);
}

async function getSelectedTextFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  });
  return result;
}

async function getFullPageTextFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerText
  });
  return result;
}

function extractJson(raw) {
  let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

// ===================== ENLARGE / EXPAND TOGGLES =====================
function wireExpandButton(btnId, boxId) {
  const btn = document.getElementById(btnId);
  const box = document.getElementById(boxId);
  btn.addEventListener("click", () => {
    const nowExpanded = box.classList.toggle("expanded");
    document.body.classList.toggle("expanded-view", nowExpanded);
    btn.textContent = nowExpanded ? "⤡ Collapse" : "⤢ Enlarge";
  });
}
wireExpandButton("expandBtn", "resultBox");
wireExpandButton("pageExpandBtn", "pageResultBox");

function fireConfetti() {
  const emojis = ["🎉", "✨", "🕸️", "⭐", "🎊"];
  const container = document.getElementById("quizResult");
  if (!container) return;
  for (let i = 0; i < 14; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.textContent = emojis[i % emojis.length];
    piece.style.left = Math.random() * 100 + "%";
    piece.style.animationDelay = (Math.random() * 0.3) + "s";
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 1500);
  }
}

// ===================== SETTINGS =====================
document.getElementById("settingsBtn").addEventListener("click", () => {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  } catch (e) {
    console.warn("Could not open options page:", e);
  }
});

// On load, nudge the user to set up their key if none is stored yet.
(async () => {
  try {
    const key = await getApiKey();
    if (!key) {
      promptForApiKey(document.getElementById("status"));
    }
  } catch (e) {
    console.warn("Startup key check failed:", e);
  }
})();

// ===================== TAB SWITCHING =====================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    window.speechSynthesis.cancel();
    isSpeaking = false;
    isPageSpeaking = false;
  });
});

// ===================== TRANSLATE / MEANING TAB =====================
document.getElementById("simplifyBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");
  const resultBox = document.getElementById("resultBox");
  const btn = document.getElementById("simplifyBtn");
  const actionButtons = document.getElementById("actionButtons");
  const targetLanguage = getLang();

  resultBox.style.display = "none";
  resultBox.classList.remove("animate-fade", "expanded");
  document.getElementById("resultToolbar").style.display = "none";
  document.getElementById("expandBtn").textContent = "⤢ Enlarge";
  document.body.classList.remove("expanded-view");
  actionButtons.style.display = "none";
  window.speechSynthesis.cancel();
  isSpeaking = false;
  document.getElementById("ttsBtn").textContent = "🔊 Read Aloud";

  btn.innerHTML = '<span class="loader"></span> Working...';
  btn.disabled = true;
  statusEl.textContent = "";

  try {
    const selectedText = await getSelectedTextFromPage();
    if (!selectedText || !selectedText.trim()) {
      statusEl.textContent = "⚠️ Highlight some text on the page first!";
      return;
    }

    const trimmed = selectedText.trim();
    const isSingleWord = !/\s/.test(trimmed) && trimmed.length <= 40;
    const isLargeSelection = trimmed.length > 160;

    let systemPrompt, userPrompt;

    if (isSingleWord) {
      // Single word: give meaning + 2 synonyms + 2 antonyms
      systemPrompt = "You are ClearText, a vocabulary tool. Detect the input word's language, then respond ONLY in the requested target language, using EXACTLY this plain-text layout (no markdown, no extra commentary, no restating the word):\nMeaning: <one short, clear meaning or translation>\nSynonyms: <synonym 1>, <synonym 2>\nAntonyms: <antonym 1>, <antonym 2>\nIf genuine antonyms do not exist for this word, write \"Antonyms: none commonly used\" instead.";
      userPrompt = `Word: "${trimmed}"\nTarget language: ${targetLanguage}`;
    } else {
      systemPrompt = "You are ClearText, a precise translation and definition tool. Automatically detect the source language of the text, and provide a short, crisp meaning or translation in the requested target language. Avoid long paragraphs, keep it direct and concise.";
      userPrompt = `Please ${isLargeSelection ? "summarize and explain" : "translate/define"} this text in ${targetLanguage}:\n\n"${trimmed}"`;
    }

    const result = stripFormatting(await callGroq(systemPrompt, userPrompt));
    currentSimplifiedText = result;
    renderSpokenText(resultBox, result);
    resultBox.style.display = "block";
    resultBox.classList.add("animate-fade");
    document.getElementById("resultToolbar").style.display = "flex";
    actionButtons.style.display = "flex";
  } catch (err) {
    console.error(err);
    if (err.message === "NO_API_KEY") {
      promptForApiKey(statusEl);
    } else {
      statusEl.textContent = "Error: " + err.message;
    }
  } finally {
    btn.innerHTML = '<span>✦</span> Get Meaning / Translate';
    btn.disabled = false;
  }
});

document.getElementById("ttsBtn").addEventListener("click", () => {
  const ttsBtn = document.getElementById("ttsBtn");
  const resultBox = document.getElementById("resultBox");
  if (!currentSimplifiedText) return;

  if (isSpeaking) {
    window.speechSynthesis.cancel();
    ttsBtn.textContent = "🔊 Read Aloud";
    isSpeaking = false;
    resultBox.querySelectorAll(".highlight-word").forEach(el => el.classList.remove("highlight-word"));
  } else {
    ttsBtn.textContent = "⏹️ Stop Speaking";
    isSpeaking = true;
    speak(currentSimplifiedText, getLang(), ttsBtn, resultBox, (v) => { isSpeaking = v; });
  }
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  if (!currentSimplifiedText) return;
  try {
    await navigator.clipboard.writeText(currentSimplifiedText);
    const copyBtn = document.getElementById("copyBtn");
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy Text"; }, 2000);
  } catch (err) {
    console.error("Copy failed:", err);
  }
});

// ===================== PAGE MODE TAB =====================
document.getElementById("readPageBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("pageStatus");
  const btn = document.getElementById("readPageBtn");
  const styleBtns = ["storyBtn", "summaryBtn", "notesBtn"].map(id => document.getElementById(id));

  btn.innerHTML = '<span class="loader"></span> Reading page...';
  btn.disabled = true;
  statusEl.textContent = "";
  document.getElementById("pageResultBox").style.display = "none";
  document.getElementById("pageResultBox").classList.remove("expanded");
  document.getElementById("pageResultToolbar").style.display = "none";
  document.getElementById("pageExpandBtn").textContent = "⤢ Enlarge";
  document.body.classList.remove("expanded-view");
  document.getElementById("pageActionButtons").style.display = "none";
  styleBtns.forEach(b => b.disabled = true);

  try {
    const text = await getFullPageTextFromPage();
    if (!text || !text.trim()) {
      statusEl.textContent = "⚠️ Couldn't find readable text on this page.";
      return;
    }
    pageRawText = text.trim().slice(0, 8000); // keep payload sane
    statusEl.textContent = `✅ Loaded ${pageRawText.length} characters. Pick a format below.`;
    styleBtns.forEach(b => b.disabled = false);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error reading page: " + err.message;
  } finally {
    btn.innerHTML = '<span>↳</span> Load This Page\'s Text';
    btn.disabled = false;
  }
});

async function runPageStyle(styleName, systemPrompt, userInstruction, clickedBtn) {
  const statusEl = document.getElementById("pageStatus");
  const resultBox = document.getElementById("pageResultBox");
  const actionButtons = document.getElementById("pageActionButtons");

  if (!pageRawText) {
    statusEl.textContent = "⚠️ Load the page text first!";
    return;
  }

  const originalLabel = clickedBtn.innerHTML;
  clickedBtn.innerHTML = '<span class="loader"></span> ' + styleName + "...";
  clickedBtn.disabled = true;
  window.speechSynthesis.cancel();
  isPageSpeaking = false;
  document.getElementById("pageTtsBtn").textContent = "🔊 Read Aloud";

  try {
    const userPrompt = `${userInstruction} Respond in ${getLang()}.\n\nTEXT:\n${pageRawText}`;
    const result = stripFormatting(await callGroq(systemPrompt, userPrompt));
    pageResultText = result;
    renderSpokenText(resultBox, result);
    resultBox.style.display = "block";
    resultBox.classList.add("animate-fade");
    document.getElementById("pageResultToolbar").style.display = "flex";
    actionButtons.style.display = "flex";
    statusEl.textContent = "";
  } catch (err) {
    console.error(err);
    if (err.message === "NO_API_KEY") {
      promptForApiKey(statusEl);
    } else {
      statusEl.textContent = "Error: " + err.message;
    }
  } finally {
    clickedBtn.innerHTML = originalLabel;
    clickedBtn.disabled = false;
  }
}

document.getElementById("storyBtn").addEventListener("click", (e) => {
  runPageStyle(
    "Story Mode",
    "You are ClearText, a friendly storyteller who turns any content into a short, simple, engaging story using easy words a child could follow. Keep it under 180 words.",
    "Turn this page's content into a short, simple story that explains what it's about.",
    e.currentTarget
  );
});
document.getElementById("summaryBtn").addEventListener("click", (e) => {
  runPageStyle(
    "Summary",
    "You are ClearText, a concise summarizer. Produce a short, clear summary in plain, simple language, no more than 6 sentences.",
    "Summarize this page's content clearly and briefly.",
    e.currentTarget
  );
});
document.getElementById("notesBtn").addEventListener("click", (e) => {
  runPageStyle(
    "Notes",
    "You are ClearText, a note-taking assistant. Convert content into short, clear bullet points (use a leading dash for each point) covering only the key ideas, in simple language.",
    "Convert this page's content into concise bullet-point notes.",
    e.currentTarget
  );
});

document.getElementById("pageTtsBtn").addEventListener("click", () => {
  const ttsBtn = document.getElementById("pageTtsBtn");
  const resultBox = document.getElementById("pageResultBox");
  if (!pageResultText) return;

  if (isPageSpeaking) {
    window.speechSynthesis.cancel();
    ttsBtn.textContent = "🔊 Read Aloud";
    isPageSpeaking = false;
    resultBox.querySelectorAll(".highlight-word").forEach(el => el.classList.remove("highlight-word"));
  } else {
    ttsBtn.textContent = "⏹️ Stop Speaking";
    isPageSpeaking = true;
    speak(pageResultText, getLang(), ttsBtn, resultBox, (v) => { isPageSpeaking = v; });
  }
});

document.getElementById("pageCopyBtn").addEventListener("click", async () => {
  if (!pageResultText) return;
  try {
    await navigator.clipboard.writeText(pageResultText);
    const copyBtn = document.getElementById("pageCopyBtn");
    copyBtn.textContent = "✅ Copied!";
    setTimeout(() => { copyBtn.textContent = "📋 Copy Text"; }, 2000);
  } catch (err) {
    console.error("Copy failed:", err);
  }
});

// ===================== QUIZ TAB =====================
document.getElementById("quizSelectedBtn").addEventListener("click", () => startQuiz("selected"));
document.getElementById("quizPageBtn").addEventListener("click", () => startQuiz("page"));

async function startQuiz(source) {
  const statusEl = document.getElementById("quizStatus");
  const quizArea = document.getElementById("quizArea");
  const quizResult = document.getElementById("quizResult");
  const btn = document.getElementById(source === "selected" ? "quizSelectedBtn" : "quizPageBtn");

  quizArea.innerHTML = "";
  quizResult.innerHTML = "";
  statusEl.textContent = "";
  const originalLabel = btn.innerHTML;
  btn.innerHTML = '<span class="loader"></span> Building quiz...';
  btn.disabled = true;

  try {
    let sourceText;
    if (source === "selected") {
      sourceText = await getSelectedTextFromPage();
      if (!sourceText || !sourceText.trim()) {
        statusEl.textContent = "⚠️ Highlight some text on the page first!";
        return;
      }
    } else {
      sourceText = await getFullPageTextFromPage();
      if (!sourceText || !sourceText.trim()) {
        statusEl.textContent = "⚠️ Couldn't find readable text on this page.";
        return;
      }
    }
    sourceText = sourceText.trim().slice(0, 6000);

    const systemPrompt = "You are a quiz generator. Output ONLY valid minified JSON and nothing else — no markdown, no code fences, no commentary. Schema: {\"questions\":[{\"question\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"answerIndex\":0,\"explanation\":\"string\"}]}. Generate exactly 5 multiple-choice questions with 4 options each, testing understanding of the given text.";
    const userPrompt = `Write the quiz questions, options, and explanations in ${getLang()}. Base the quiz strictly on this text:\n\n${sourceText}`;

    const raw = await callGroq(systemPrompt, userPrompt);
    quizData = extractJson(raw);
    if (!quizData.questions || !quizData.questions.length) throw new Error("No questions generated");

    quizIndex = 0;
    quizScore = 0;
    renderQuizQuestion();
  } catch (err) {
    console.error(err);
    if (err.message === "NO_API_KEY") {
      promptForApiKey(statusEl);
    } else {
      statusEl.textContent = "Error building quiz: " + err.message;
    }
  } finally {
    btn.innerHTML = originalLabel;
    btn.disabled = false;
  }
}

function renderQuizQuestion() {
  const quizArea = document.getElementById("quizArea");
  const quizResult = document.getElementById("quizResult");
  quizResult.innerHTML = "";
  const q = quizData.questions[quizIndex];

  quizArea.innerHTML = "";

  const progress = document.createElement("div");
  progress.className = "quiz-progress";
  progress.textContent = `Question ${quizIndex + 1} of ${quizData.questions.length} · Score: ${quizScore}`;
  quizArea.appendChild(progress);

  const questionEl = document.createElement("div");
  questionEl.className = "quiz-question";
  questionEl.textContent = q.question;
  quizArea.appendChild(questionEl);

  const optionsWrap = document.createElement("div");
  q.options.forEach((opt, idx) => {
    const optBtn = document.createElement("button");
    optBtn.className = "quiz-option";
    optBtn.textContent = opt;
    optBtn.addEventListener("click", () => handleQuizAnswer(idx, optionsWrap, q));
    optionsWrap.appendChild(optBtn);
  });
  quizArea.appendChild(optionsWrap);
}

function handleQuizAnswer(selectedIdx, optionsWrap, q) {
  const buttons = optionsWrap.querySelectorAll(".quiz-option");
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === q.answerIndex) b.classList.add("correct");
    else if (idx === selectedIdx) b.classList.add("incorrect");
  });

  if (selectedIdx === q.answerIndex) quizScore++;

  if (q.explanation) {
    const exp = document.createElement("div");
    exp.className = "quiz-explanation";
    exp.textContent = q.explanation;
    optionsWrap.after(exp);
  }

  const nextBtn = document.createElement("button");
  nextBtn.textContent = quizIndex < quizData.questions.length - 1 ? "Next Question →" : "See Results 🏆";
  nextBtn.style.marginTop = "6px";
  nextBtn.addEventListener("click", () => {
    quizIndex++;
    if (quizIndex < quizData.questions.length) {
      renderQuizQuestion();
    } else {
      renderQuizResult();
    }
  });
  document.getElementById("quizArea").appendChild(nextBtn);
}

function renderQuizResult() {
  const quizArea = document.getElementById("quizArea");
  const quizResult = document.getElementById("quizResult");
  quizArea.innerHTML = "";

  const total = quizData.questions.length;
  const pct = Math.round((quizScore / total) * 100);
  let verdict = "Nice try! 💪";
  if (pct === 100) verdict = "Perfect score, web-slinger! 🌟";
  else if (pct >= 70) verdict = "Great job! 🎉";
  else if (pct >= 40) verdict = "Good effort! 👍";

  quizResult.innerHTML = `
    <div class="quiz-score">${quizScore} / ${total}</div>
    <div class="quiz-score-label">${verdict}</div>
  `;

  if (pct >= 70) fireConfetti();

  const retryBtn = document.createElement("button");
  retryBtn.textContent = "🔄 New Quiz";
  retryBtn.addEventListener("click", () => {
    quizResult.innerHTML = "";
    document.getElementById("quizStatus").textContent = "";
    quizData = null;
  });
  quizResult.appendChild(retryBtn);
}
