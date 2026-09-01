const input = document.getElementById("apiKey");
const status = document.getElementById("status");

function storageAvailable() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

if (storageAvailable()) {
  chrome.storage.local.get(["groqApiKey"], (data) => {
    if (data && data.groqApiKey) input.value = data.groqApiKey;
  });
} else {
  status.textContent = "⚠️ Extension storage isn't available. Try reloading the extension from chrome://extensions.";
  status.style.color = "#dc2626";
}

document.getElementById("saveBtn").addEventListener("click", () => {
  const key = input.value.trim();
  if (!key) {
    status.textContent = "Please enter a key.";
    status.style.color = "#dc2626";
    return;
  }
  if (!storageAvailable()) {
    status.textContent = "⚠️ Extension storage isn't available. Try reloading the extension from chrome://extensions.";
    status.style.color = "#dc2626";
    return;
  }
  chrome.storage.local.set({ groqApiKey: key }, () => {
    status.textContent = "✅ Saved!";
    status.style.color = "#10b981";
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
});
