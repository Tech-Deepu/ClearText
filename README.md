# ⚡ ClearText

> **Understand. Learn. Remember.**  
ClearText is a lightweight Chrome Extension powered by Groq AI designed to instantly simplify complex text, generate multi-format page summaries, and create interactive active-recall quizzes directly in your browser.

---

## ✨ Features

* 🌐 **Instant Translation & Meanings:** Highlight any word or sentence to translate or explain it in 20+ languages.
* 📚 **Multi-Format Page Mode:** Load full page content and convert it into a **Story**, concise **Summary**, or bulleted **Notes**.
* 🧠 **Active Recall Quizzes:** Instantly generate a 5-question multiple-choice quiz from selected text or an entire article to test your understanding.
* 🔊 **Text-to-Speech (TTS):** Listen to simplified text and page summaries with real-time word-by-word highlighting.
* 🔒 **Privacy-First & Secure:** Uses your own free Groq API key stored locally in your browser (`chrome.storage.local`).

---

## 🛠️ Installation

1. **Clone or Download the Repository:**
   ```bash
   git clone [https://github.com/Tech-Deepu/ClearText.git](https://github.com/Tech-Deepu/ClearText.git)

 ## ⚙️ Configuration
Get a free API key from Groq Console.

Click the ClearText extension icon in your Chrome toolbar.

Click the ⚙️ Settings icon in the top-right corner of the popup.

Paste your Groq API key (gsk_...) and click Save.

##📂 Project Structure
ClearText/
├── icons/               # Extension icons (16px, 32px, 48px, 128px)
├── manifest.json        # Extension Manifest V3 configuration
├── options.html         # Settings UI for API key configuration
├── options.js           # Handles API key storage logic
├── popup.html           # Main extension interface layout
├── popup.css            # Extension styling & custom cursor theme
└── popup.js             # Core logic (Groq API, Speech Synthesis, Quizzes)

## 🚀 Tech Stack
Frontend: HTML5, CSS3, JavaScript (ES6+)

Extension Platform: Chrome Extension Manifest V3

AI Engine: Groq API (openai/gpt-oss-20b)

API Framework: Web Speech API (SpeechSynthesisUtterance)

## 📄 License
This project is open-source and available under the MIT License.
