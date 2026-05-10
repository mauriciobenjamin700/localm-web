import {
  Chat,
  StructuredOutputError,
  type Chat as ChatType,
  type GenerationOptions,
} from "localm-web";

const modelSelect = document.getElementById("model-select") as HTMLSelectElement;
const loadBtn = document.getElementById("load-btn") as HTMLButtonElement;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const schemaEl = document.getElementById("schema") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const rawEl = document.getElementById("raw") as HTMLPreElement;
const parsedEl = document.getElementById("parsed") as HTMLPreElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const progressEl = document.getElementById("load-progress") as HTMLProgressElement;
const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');

let chat: ChatType | null = null;

function setStatus(text: string, isError: boolean = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("err", isError);
}

function getMode(): "json" | "schema" {
  const checked = Array.from(modeInputs).find((i) => i.checked);
  return (checked?.value as "json" | "schema") ?? "json";
}

function buildOptions(): GenerationOptions {
  const mode = getMode();
  if (mode === "schema") {
    let schema: object;
    try {
      const parsed: unknown = JSON.parse(schemaEl.value);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("schema must be a JSON object.");
      }
      schema = parsed;
    } catch (err) {
      throw new Error(`Invalid schema JSON: ${(err as Error).message}`);
    }
    return { jsonSchema: schema, maxTokens: 256 };
  }
  return { json: true, maxTokens: 256 };
}

loadBtn.addEventListener("click", async (): Promise<void> => {
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  setStatus("loading…");
  rawEl.textContent = "";
  parsedEl.textContent = "";
  try {
    chat = await Chat.create(modelSelect.value, {
      onProgress: (p): void => {
        progressEl.value = p.progress;
        setStatus(p.text || `loading ${(p.progress * 100).toFixed(0)}%`);
      },
    });
    progressEl.value = 1;
    setStatus(`ready · ${chat.preset.family} ${chat.preset.parameters}`);
    promptEl.disabled = false;
    sendBtn.disabled = false;
    promptEl.focus();
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`, true);
    loadBtn.disabled = false;
    modelSelect.disabled = false;
  }
});

sendBtn.addEventListener("click", async (): Promise<void> => {
  if (!chat) return;
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  sendBtn.disabled = true;
  rawEl.textContent = "";
  parsedEl.textContent = "";
  parsedEl.classList.remove("err");
  setStatus(`generating (${getMode()} mode)…`);
  try {
    const options = buildOptions();
    const reply = await chat.send(prompt, options);
    rawEl.textContent = reply.text;
    try {
      const data = reply.json();
      parsedEl.textContent = JSON.stringify(data, null, 2);
      setStatus(`done · ${reply.text.length} chars`);
    } catch (err) {
      parsedEl.classList.add("err");
      if (err instanceof StructuredOutputError) {
        parsedEl.textContent = `StructuredOutputError: ${err.message}\n\nUnderlying cause: ${String(err.cause)}`;
      } else {
        parsedEl.textContent = `Unexpected: ${(err as Error).message}`;
      }
      setStatus("output did not parse — see right pane", true);
    }
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`, true);
  } finally {
    sendBtn.disabled = false;
  }
});

promptEl.addEventListener("keydown", (e): void => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    sendBtn.click();
  }
});
