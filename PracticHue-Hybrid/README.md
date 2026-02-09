\
# PracticHue (Hybrid Web Extension)

A MV3 Chrome Extension (React) + local Python backend (FastAPI) that lets artists:
- Capture the current browser tab as a "reference"
- Upload / drag-drop a reference image (accessibility + flexibility)
- Extract a dominant palette using K-Means clustering
- Generate color-theory harmonies (triadic, analogous, complementary, etc.)
- View results as **side-scrollable palette cards** (tap swatches to copy HEX)

> Privacy: references stay on the user's machine (localhost loopback).

---

## 1) Run the Python backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Test:
- http://127.0.0.1:8000/health -> {"ok": true}

---

## 2) Build the extension (React + Vite)

```bash
cd frontend
npm install
npm run build
```

This outputs:
- `frontend/dist/`

---

## 3) Load into Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select: `frontend/dist`

Pin the extension, then click it:
- 📸 Capture Tab (browser screenshot)
- 📂 Upload Reference (local file picker)
- Or drag & drop an image into the drop zone

---

## Notes

- The backend has a deterministic "AI Insight" generator (no external API calls).
  Swap `basic_artistic_insight()` for a real LLM later if you want.
- You can change extraction count (k=4..12) and the "style mode" (Studio/Cinematic/Impressionist).

---
