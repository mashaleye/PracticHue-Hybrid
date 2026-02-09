import io
import math
import colorsys
from typing import List, Dict, Any, Tuple

import numpy as np
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from sklearn.cluster import MiniBatchKMeans

app = FastAPI(title="PracticHue Backend", version="0.1.0")

# Allow local extension to call localhost backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Utilities ----------------
def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))

def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    r, g, b = rgb
    return "#{:02x}{:02x}{:02x}".format(int(r), int(g), int(b))

def hex_to_rgb01(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return r, g, b

def perceptual_sort(hex_colors: List[str]) -> List[str]:
    # Sort roughly by hue then brightness for nicer swatch ordering
    def key(c: str):
        r, g, b = hex_to_rgb01(c)
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        return (h, v, s)
    return sorted(hex_colors, key=key)

def image_to_pixels(image_bytes: bytes, max_side: int = 512) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img.thumbnail((max_side, max_side))
    arr = np.asarray(img, dtype=np.uint8)
    pixels = arr.reshape(-1, 3)
    return pixels

def extract_palette_kmeans(pixels: np.ndarray, k: int = 6, sample: int = 60000) -> List[str]:
    if pixels.shape[0] > sample:
        idx = np.random.choice(pixels.shape[0], size=sample, replace=False)
        pixels = pixels[idx]

    # MiniBatchKMeans is faster and good enough for palette extraction
    km = MiniBatchKMeans(n_clusters=k, n_init="auto", random_state=42, batch_size=2048)
    km.fit(pixels)

    centers = km.cluster_centers_.astype(int)
    # Order centers by cluster frequency
    labels = km.labels_
    counts = np.bincount(labels, minlength=k)
    order = np.argsort(-counts)
    ordered = centers[order]
    hexes = [rgb_to_hex(tuple(c)) for c in ordered]
    return perceptual_sort(hexes)

def hsv_shift(hex_color: str, deg: float, s_mul: float = 1.0, v_mul: float = 1.0) -> str:
    r, g, b = hex_to_rgb01(hex_color)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h_deg = (h * 360.0 + deg) % 360.0
    s2 = clamp01(s * s_mul)
    v2 = clamp01(v * v_mul)
    r2, g2, b2 = colorsys.hsv_to_rgb(h_deg / 360.0, s2, v2)
    return rgb_to_hex((round(r2 * 255), round(g2 * 255), round(b2 * 255)))

def palette_harmonies(base_hex: str) -> Dict[str, List[str]]:
    # Produce "ideal" harmony partners based on hue wheel math
    # Keep saturation/value close to base to stay in same vibe
    return {
        "Complementary": [base_hex, hsv_shift(base_hex, 180)],
        "Analogous": [hsv_shift(base_hex, -30), base_hex, hsv_shift(base_hex, 30)],
        "Triadic": [base_hex, hsv_shift(base_hex, 120), hsv_shift(base_hex, 240)],
        "Split-Complementary": [base_hex, hsv_shift(base_hex, 150), hsv_shift(base_hex, 210)],
        "Tetradic": [base_hex, hsv_shift(base_hex, 90), hsv_shift(base_hex, 180), hsv_shift(base_hex, 270)],
        "Monochrome": [hsv_shift(base_hex, 0, v_mul=0.65), base_hex, hsv_shift(base_hex, 0, v_mul=1.15)],
    }

def basic_artistic_insight(palette: List[str], mode: str = "Studio") -> Dict[str, str]:
    """
    No external LLM call. This produces a decent, deterministic "artist-style" insight.
    You can swap this function later for an actual LLM call.
    """
    # Analyze palette rough stats
    hsvs = []
    for c in palette:
        r, g, b = hex_to_rgb01(c)
        hsvs.append(colorsys.rgb_to_hsv(r, g, b))
    avg_s = float(np.mean([s for (_, s, _) in hsvs]))
    avg_v = float(np.mean([v for (_, _, v) in hsvs]))
    s_txt = "high-saturation" if avg_s > 0.6 else "muted" if avg_s < 0.35 else "balanced"
    v_txt = "bright" if avg_v > 0.7 else "moody" if avg_v < 0.45 else "medium-value"

    # Pick a "dominant" (first) and "accent" (most saturated)
    dom = palette[0] if palette else "#000000"
    accent = max(palette, key=lambda c: colorsys.rgb_to_hsv(*hex_to_rgb01(c))[1]) if palette else dom

    # Mode tweaks
    if mode.lower() == "cinematic":
        mood = f"{v_txt} and dramatic"
        usage = f"Use {dom} as your scene base and reserve {accent} for small story beats (titles, highlights, focal points)."
        note = "Keep accents sparse to preserve tension and readability."
    elif mode.lower() == "impressionist":
        mood = f"{s_txt}, painterly"
        usage = f"Let {dom} establish atmosphere; scatter {accent} in broken strokes to suggest light rather than outline it."
        note = "Consider softer edges and value grouping to keep the piece cohesive."
    else:  # Studio
        mood = f"{s_txt} with a {v_txt} value range"
        usage = f"Anchor your composition with {dom}. Use {accent} as an accent for calls-to-action, highlights, or focal elements."
        note = "If this is for UI, maintain contrast between text and backgrounds for accessibility."

    return {
        "mode": mode,
        "mood": mood,
        "dominant": dom,
        "accent": accent,
        "insight": f"This palette feels {mood}. {usage} {note}"
    }

class AnalyzeResponse(BaseModel):
    palette: List[str]
    harmony_cards: List[Dict[str, Any]]
    insight: Dict[str, str]

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_image(
    file: UploadFile = File(...),
    k: int = Query(default=6, ge=3, le=12),
    mode: str = Query(default="Studio"),
):
    contents = await file.read()

    pixels = image_to_pixels(contents, max_side=512)
    palette = extract_palette_kmeans(pixels, k=k)

    # Build side-scroll cards:
    #  - Extracted Palette card
    #  - Harmony cards based on first (dominant) color
    base = palette[0] if palette else "#000000"
    harmonies = palette_harmonies(base)

    harmony_cards = [{"title": "Extracted Palette", "type": "extracted", "colors": palette}]
    for title, colors in harmonies.items():
        harmony_cards.append({"title": title, "type": "harmony", "colors": colors})

    insight = basic_artistic_insight(palette, mode=mode)

    return AnalyzeResponse(palette=palette, harmony_cards=harmony_cards, insight=insight)

# Run:
#   pip install -r requirements.txt
#   uvicorn app:app --reload --host 127.0.0.1 --port 8000
