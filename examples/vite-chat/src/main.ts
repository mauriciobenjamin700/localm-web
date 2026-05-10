import { Chat, type Chat as ChatType } from "localm-web";

const modelSelect = document.getElementById("model-select") as HTMLSelectElement;
const loadBtn = document.getElementById("load-btn") as HTMLButtonElement;
const promptInput = document.getElementById("prompt") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const abortBtn = document.getElementById("abort-btn") as HTMLButtonElement;
const output = document.getElementById("output") as HTMLPreElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const progressEl = document.getElementById("load-progress") as HTMLProgressElement;

let chat: ChatType | null = null;
let abortController: AbortController | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

loadBtn.addEventListener("click", async (): Promise<void> => {
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  setStatus("loading…");
  output.textContent = "";
  try {
    chat = await Chat.create(modelSelect.value, {
      onProgress: (p): void => {
        progressEl.value = p.progress;
        setStatus(p.text || `loading ${(p.progress * 100).toFixed(0)}%`);
      },
    });
    progressEl.value = 1;
    setStatus(`ready · ${chat.preset.family} ${chat.preset.parameters}`);
    promptInput.disabled = false;
    sendBtn.disabled = false;
    promptInput.focus();
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`);
    loadBtn.disabled = false;
    modelSelect.disabled = false;
  }
});

sendBtn.addEventListener("click", async (): Promise<void> => {
  if (!chat) return;
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  promptInput.value = "";
  sendBtn.disabled = true;
  abortBtn.disabled = false;
  output.textContent += `\n\n> ${prompt}\n\n`;
  abortController = new AbortController();
  try {
    for await (const token of chat.stream(prompt, { signal: abortController.signal })) {
      if (token.text) {
        output.textContent += token.text;
        output.scrollTop = output.scrollHeight;
      }
    }
    setStatus("done");
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`);
  } finally {
    sendBtn.disabled = false;
    abortBtn.disabled = true;
    abortController = null;
    promptInput.focus();
  }
});

abortBtn.addEventListener("click", (): void => {
  abortController?.abort();
  setStatus("aborting…");
});

promptInput.addEventListener("keydown", (e): void => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});
