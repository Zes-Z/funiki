#!/usr/bin/env python3
"""
funiki · asset forge
====================
Downloads every photographic asset from the Unsplash CDN, applies one shared
"warm analog" grade, crops to the exact geometry each Astro component expects,
and derives the short H.264 loops (project hovers + live photos), the avatar,
the one-page CV and the Open Graph card.

Only writes into public/ and src/content/ (plus scripts/asset-credits.md).

    python3 scripts/generate-assets.py            # build everything
    python3 scripts/generate-assets.py --only avatar
    python3 scripts/generate-assets.py --force    # re-download sources

Requires: Pillow, numpy, PyMuPDF (fitz), ffmpeg (imageio_ffmpeg binary).
The HTTP proxy is used because the Unsplash CDN is only reachable through the
local Clash listener in this environment.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("FUNIKI_ASSET_CACHE", "/tmp/funiki-asset-cache"))
PROXY = os.environ.get("FUNIKI_PROXY", "http://127.0.0.1:7897")
FFMPEG = os.environ.get(
    "FUNIKI_FFMPEG", "/tmp/pylibs/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v9.0"
)
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

os.environ.setdefault("HTTPS_PROXY", PROXY)
os.environ.setdefault("HTTP_PROXY", PROXY)

# ---------------------------------------------------------------------------
# 1. sources — every unsplash photo id used on the site
# ---------------------------------------------------------------------------
SOURCES = {
    # life / nature
    "deer": "1472396961693-142e6e269027",
    "mountain_clouds": "1506905925346-21bda4d32df4",
    "canopy": "1513836279014-a89f7a76ae86",
    "ferns": "1497250681960-ef046c08a56e",
    "beach": "1507525428034-b723cf961d3e",
    "boardwalk": "1447752875215-b2761acb3c5d",
    "mountain_lake": "1464822759023-fed622ff2c3b",
    "dusk_gradient": "1500534314209-a25ddb2bd429",
    "tree_burst": "1518495973542-4542c06a5843",
    "night_street": "1519501025264-65ba15a82390",
    "cherry": "1522383225653-ed111181a951",
    "rain_window": "1428592953211-077101b2021b",
    # interior / objects / analog
    "coffee_cups": "1495474472287-4d71bcdd2085",
    "coffee_plant": "1509042239860-f550ce710b93",
    "cafe_neon": "1501339847302-ac426a4a7cbb",
    "sofa": "1502672260266-1c1ef2d93688",
    "vintage_cam": "1510127034890-ba27508e9f1c",
    "cam_dark": "1520390138845-fd2d229dd553",
    "tea": "1564890369478-c89ca6d9cde9",
    "desk_warm": "1497032628192-86f99bcd76bc",
    "sticky_note": "1512314889357-e157c22f938d",
    "paper_sculpt": "1509266272358-7701da638078",
    "books_stack": "1543002588-bfa74002ed7e",
    "book_leaf": "1490633874781-1c63cc424610",
    "notebook": "1455390582262-044cdead277a",
    "window_light": "1494438639946-1ebd1d20bf85",
    "library_curved": "1481627834876-b7833e8f5570",
    "dog_beach": "1530281700549-e82e7bf110d6",
    # architecture / city
    "museum": "1487958449943-2429e8be8625",
    "white_arch": "1496307653780-42ee777d4833",
    "flatiron": "1514924013411-cbf25faa35bb",
    "city_canyon": "1449824913935-59a10b8d2000",
    "tokyo_neon": "1517154421773-0529f29ea451",
    # brand / nature
    "fog_pines": "1476362555312-ab9e108a0b7e",
    "lake_cabin": "1470770841072-f978cf4d019e",
    # product / plants
    "plant_hand": "1520412099551-62b6bafeb5bb",
    "plant_leaf": "1416879595882-3373a0480b5b",
    "plant_white": "1485955900006-10f4d324d411",
    # portrait
    "portrait_sea": "1438761681033-6461ffad8d80",
}


def fetch(slot, width=2200, force=False):
    """Download (and cache) one source photo, always validating the response."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (slot + ".jpg")
    if force or not path.exists() or path.stat().st_size < 30000:
        pid = SOURCES[slot]
        url = (
            "https://images.unsplash.com/photo-" + pid
            + "?w=" + str(width) + "&q=88&fm=jpg&fit=max"
        )
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            ctype = resp.headers.get("content-type", "")
            status = resp.status
        if status != 200 or "image" not in ctype or len(data) < 30000:
            raise RuntimeError("bad download for %s: %s %s %sB" % (slot, status, ctype, len(data)))
        path.write_bytes(data)
    im = Image.open(path)
    im.load()
    return im.convert("RGB")


# ---------------------------------------------------------------------------
# 2. the shared grade — warm, slightly faded, quietly filmic
# ---------------------------------------------------------------------------
def _lut(warm):
    """Tone curve: lift the blacks a touch, roll the highlights, warm balance."""
    x = np.linspace(0, 255, 256)
    y = 6 + (x / 255) ** 1.02 * 246
    y = np.clip(y, 0, 255)
    lut = np.repeat(y[:, None], 3, axis=1)
    lut[:, 0] *= 1.0 + 0.028 * warm   # red
    lut[:, 1] *= 1.0 + 0.004 * warm   # green
    lut[:, 2] *= 1.0 - 0.030 * warm   # blue
    # Pillow wants one 256-entry ramp PER BAND (R0..R255, G0..G255, B0..B255)
    return np.clip(lut, 0, 255).astype(np.uint8).flatten(order="F")


_GRADE_LUT = _lut(1.0)


def grade(im, warm=1.0, grain=2.2):
    """One grade for the whole site so the photos read as one person's roll."""
    im = im.convert("RGB")
    im = ImageEnhance.Color(im).enhance(0.93)
    im = ImageEnhance.Contrast(im).enhance(1.035)
    im = im.point(_GRADE_LUT)
    if grain:
        arr = np.asarray(im, dtype=np.int16)
        rng = np.random.default_rng(7)
        noise = rng.normal(0, grain, arr.shape[:2]).astype(np.int16)
        arr = np.clip(arr + noise[..., None], 0, 255).astype(np.uint8)
        im = Image.fromarray(arr, "RGB")
    return im


def crop_to(im, w, h, fx=0.5, fy=0.5):
    """Cover-crop to w:h, keeping the crop centre at (fx, fy) of the source."""
    sw, sh = im.size
    target = w / h
    src = sw / sh
    if src > target:
        cw, ch = int(round(sh * target)), sh
    else:
        cw, ch = sw, int(round(sw / target))
    x0 = int(round((sw - cw) * fx))
    y0 = int(round((sh - ch) * fy))
    x0 = max(0, min(sw - cw, x0))
    y0 = max(0, min(sh - ch, y0))
    im = im.crop((x0, y0, x0 + cw, y0 + ch))
    return im.resize((w, h), Image.LANCZOS)


def save_jpeg(im, path, max_kb=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    q = 88
    while True:
        tmp = path.with_suffix(".tmp.jpg")
        im.save(tmp, "JPEG", quality=q, optimize=True, progressive=True)
        kb = tmp.stat().st_size / 1024
        if max_kb is None or kb <= max_kb or q <= 62:
            tmp.replace(path)
            return int(kb)
        q -= 4


def make_avatar(dest):
    """Warm-monochrome portrait, matching the treatment the design lead applied."""
    im = crop_to(fetch("portrait_sea"), 900, 1100, 0.62, 0.30)
    im = ImageEnhance.Color(im).enhance(0.0)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    lut = _lut(1.0)
    # sepia split-tone: warm highlights, cool-neutral shadows
    arr = np.asarray(im, dtype=np.float32)
    arr[..., 0] *= 1.035
    arr[..., 1] *= 1.005
    arr[..., 2] *= 0.955
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    return save_jpeg(im, dest, 240)


# image jobs: (slot, out, w, h, fx, fy, max_kb)
IMAGE_JOBS = [
    # note: public/avatar.jpg is graded by the design lead (warm monochrome) —
    # only regenerated with --only avatar, see make_avatar() below.

    # --- projects  cover 4:5 / gallery 14:9 / gallery 3:4 ---
    ("fog_pines", "src/content/project/shanwu/cover.jpg", 1200, 1500, 0.5, 0.45, 420),
    ("lake_cabin", "src/content/project/shanwu/gallery-01.jpg", 1400, 900, 0.5, 0.55, 420),
    ("tea", "src/content/project/shanwu/gallery-02.jpg", 900, 1200, 0.55, 0.5, 420),

    ("museum", "src/content/project/atelier-north/cover.jpg", 1200, 1500, 0.55, 0.55, 420),
    ("white_arch", "src/content/project/atelier-north/gallery-01.jpg", 1400, 900, 0.5, 0.35, 420),
    ("library_curved", "src/content/project/atelier-north/gallery-02.jpg", 900, 1200, 0.5, 0.5, 420),

    ("plant_hand", "src/content/project/hedgerow/cover.jpg", 1200, 1500, 0.5, 0.5, 420),
    ("plant_leaf", "src/content/project/hedgerow/gallery-01.jpg", 1400, 900, 0.5, 0.5, 420),
    ("plant_white", "src/content/project/hedgerow/gallery-02.jpg", 900, 1200, 0.5, 0.5, 420),

    ("desk_warm", "src/content/project/slow-tools/cover.jpg", 1200, 1500, 0.55, 0.5, 420),
    ("sticky_note", "src/content/project/slow-tools/gallery-01.jpg", 1400, 900, 0.5, 0.5, 420),
    ("paper_sculpt", "src/content/project/slow-tools/gallery-02.jpg", 900, 1200, 0.5, 0.5, 420),

    ("books_stack", "src/content/project/paper-plain/cover.jpg", 1200, 1500, 0.5, 0.5, 420),
    ("book_leaf", "src/content/project/paper-plain/gallery-01.jpg", 1400, 900, 0.5, 0.5, 420),
    ("notebook", "src/content/project/paper-plain/gallery-02.jpg", 900, 1200, 0.55, 0.5, 420),

    ("tokyo_neon", "src/content/project/city-walk/cover.jpg", 1200, 1500, 0.55, 0.5, 420),
    ("city_canyon", "src/content/project/city-walk/gallery-01.jpg", 1400, 900, 0.5, 0.5, 420),
    ("flatiron", "src/content/project/city-walk/gallery-02.jpg", 900, 1200, 0.5, 0.5, 420),

    # --- life photos, assorted aspect ratios (long edge 1200-1440) ---
    ("deer", "src/content/album/photos/life-01.jpg", 1350, 900, 0.55, 0.55, 360),
    ("mountain_clouds", "src/content/album/photos/life-02.jpg", 1280, 720, 0.5, 0.5, 320),
    ("canopy", "src/content/album/photos/life-03.jpg", 960, 1200, 0.5, 0.5, 420),
    ("ferns", "src/content/album/photos/life-04.jpg", 860, 1200, 0.5, 0.5, 420),
    ("coffee_cups", "src/content/album/photos/life-05.jpg", 1100, 1100, 0.5, 0.5, 380),
    ("coffee_plant", "src/content/album/photos/life-06.jpg", 1100, 1100, 0.5, 0.5, 380),
    ("cafe_neon", "src/content/album/photos/life-07.jpg", 960, 1200, 0.68, 0.42, 420),
    ("night_street", "src/content/album/photos/life-08.jpg", 800, 1200, 0.5, 0.5, 420),
    ("cherry", "src/content/album/photos/life-09.jpg", 1350, 900, 0.5, 0.45, 360),
    ("vintage_cam", "src/content/album/photos/life-10.jpg", 1350, 900, 0.55, 0.5, 360),
    ("sofa", "src/content/album/photos/life-11.jpg", 1350, 900, 0.5, 0.5, 360),
    ("rain_window", "src/content/album/photos/life-12.jpg", 800, 1200, 0.5, 0.5, 420),
    ("beach", "src/content/album/photos/life-13.jpg", 1280, 720, 0.5, 0.5, 320),
    ("dog_beach", "src/content/album/photos/life-14.jpg", 960, 1200, 0.5, 0.5, 420),

    # --- thought covers: each cropped to its frame's own aspect ratio ---
    # stamp 5:4 · polaroid 4:5 · film 3:2 · ticket 5:4 · tape 4:5 · mount 3:4
    ("dusk_gradient", "src/content/post/on-slowness/cover.jpg", 1250, 1000, 0.5, 0.5, 340),
    ("tree_burst", "src/content/post/tools-and-taste/cover.jpg", 1000, 1250, 0.5, 0.55, 340),
    ("cam_dark", "src/content/post/film-not-digital/cover.jpg", 1350, 900, 0.5, 0.5, 340),
    ("mountain_lake", "src/content/post/a-walk-in-rain/cover.jpg", 900, 1200, 0.45, 0.55, 340),
    ("window_light", "src/content/post/keep-a-notebook/cover.jpg", 1000, 1250, 0.72, 0.5, 340),
    ("boardwalk", "src/content/post/small-websites/cover.jpg", 1250, 1000, 0.5, 0.5, 340),
]

MOTION = {
    "in": "zoompan=z='1.0+0.11*on/149':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
    "out": "zoompan=z='1.11-0.11*on/149':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
    "drift": "zoompan=z='1.03+0.07*on/149':x='(iw-iw/zoom)*(0.42+0.16*on/149)':y='(ih-ih/zoom)*0.5'",
}

# video jobs: (source slot, out, w, h, seconds, motion, crf)
VIDEO_JOBS = [
    ("fog_pines", "public/project-shanwu.mp4", 720, 900, 5.0, "in", 27),
    ("desk_warm", "public/project-slow-tools.mp4", 720, 900, 5.0, "drift", 27),
    ("tokyo_neon", "public/project-city-walk.mp4", 720, 900, 5.0, "out", 27),
    ("cafe_neon", "src/content/album/videos/live-01.mp4", 768, 960, 5.0, "in", 26),
    ("rain_window", "src/content/album/videos/live-02.mp4", 640, 960, 5.0, "drift", 26),
    ("dog_beach", "src/content/album/videos/live-03.mp4", 768, 960, 5.0, "out", 26),
]


def make_video(slot, out, w, h, seconds, motion, crf, force=False):
    out.parent.mkdir(parents=True, exist_ok=True)
    src = CACHE / ("video-" + slot + ".jpg")
    if force or not src.exists():
        im = grade(fetch(slot))
        big = crop_to(im, w * 3, h * 3)          # oversample to kill zoompan jitter
        big.save(src, "JPEG", quality=92)
    frames = int(seconds * 30)
    vf = MOTION[motion] + ":d=" + str(frames) + ":s=" + str(w) + "x" + str(h) + ":fps=30,format=yuv420p"
    cmd = [
        FFMPEG, "-y", "-loop", "1", "-framerate", "30", "-i", str(src),
        "-vf", vf, "-t", str(seconds), "-c:v", "libx264",
        "-profile:v", "high", "-level", "4.0", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-color_range", "tv",
        "-preset", "medium", "-g", "60", "-movflags", "+faststart",
        "-an", str(out),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return int(out.stat().st_size / 1024)


# ---------------------------------------------------------------------------
# 3. one-page CV — vector PDF, Songti + Helvetica
# ---------------------------------------------------------------------------
SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"
HELV = "/System/Library/Fonts/Helvetica.ttc"


def make_resume(dest):
    import fitz  # PyMuPDF

    cream = (0.965, 0.957, 0.937)
    ink = (0.086, 0.086, 0.078)
    ink2 = (0.32, 0.31, 0.29)
    ink3 = (0.52, 0.50, 0.47)
    rule = (0.78, 0.76, 0.72)

    W, H = 595.0, 842.0
    doc = fitz.open()
    page = doc.new_page(width=W, height=H)
    page.draw_rect(fitz.Rect(0, 0, W, H), color=None, fill=cream)

    song = "song"
    helv = "helv"
    page.insert_font(fontname=song, fontfile=SONGTI)
    song_font = fitz.Font(fontfile=SONGTI)

    def txt(x, y, s, size=9, color=ink2, font=song):
        page.insert_text((x, y), s, fontsize=size, fontname=font, color=color)
        return song_font.text_length(s, size) if font == song else fitz.get_text_length(s, fontsize=size, fontname=font)

    def wrap(x, y, s, size, color, width, leading):
        cur = ""
        for ch in s:
            if song_font.text_length(cur + ch, size) > width:
                txt(x, y, cur, size, color)
                cur = ch
                y += leading
            else:
                cur += ch
        if cur:
            txt(x, y, cur, size, color)
        return y

    # --- masthead ---------------------------------------------------------
    txt(52, 66, "CURRICULUM VITAE / RESUME 2026", 7.2, ink3, helv)
    page.insert_text((52, 118), "Funiki", fontsize=54, fontname=helv, color=ink)
    page.insert_text((52, 156), "浮尼奇", fontsize=23, fontname=song, color=ink)
    txt(52, 186, "独立设计师 & 前端开发者  ·  杭州，中国", 12.5, ink2)
    txt(52, 206, "hello@funiki.design    ·    funiki.design    ·    github.com/funiki", 8.6, ink3, helv)
    page.draw_line(fitz.Point(52, 224), fitz.Point(543, 224), color=rule, width=0.8)
    txt(52, 248, "做品牌、做产品，也做自己觉得有趣的小东西。相信好的设计是克制的，好的代码也是。", 8.8, ink2)

    # --- two columns ------------------------------------------------------
    L, R = 52, 336
    CL = 252

    y = 290
    txt(L, y, "EXPERIENCE / 经历", 7.4, ink3, helv)
    page.draw_line(fitz.Point(L, y + 6), fitz.Point(L + CL, y + 6), color=rule, width=0.6)
    y += 28
    jobs = [
        ("2026 —", "慢工具 · 独立项目", "设计工程 / 前端", "一组浏览器里的微型工具，坚持零依赖、可离线、只做一件事。"),
        ("2025 —", "篱间 · 植物养护 App", "产品设计 / 视觉", "从命名到组件库，把「养一株植物」这件小事做轻。"),
        ("2025", "城市漫步 · 摄影计划", "摄影 / 编辑", "沿着老街走了一整个雨季，一本还没出版的小书。"),
        ("2024", "山坞 · 莫干山民宿", "品牌识别 / 空间导视", "为山里的院子重做一整套品牌语言，从标志到茶罐。"),
        ("2023", "北岸建筑事务所", "品牌 / 空间视觉", "把建筑事务所的理性气质，整理成一套可复用的版面。"),
        ("2022", "纸白 · 独立刊物", "编辑设计 / 印务", "一本关于纸与留白的年刊，从约稿到上机的全部流程。"),
    ]
    for when, what, role, line in jobs:
        txt(L, y, when, 7.0, ink3, helv)
        txt(L + 52, y, what, 10.2, ink)
        txt(L + 178, y, role, 6.6, ink3, song)
        y = wrap(L, y + 15, line, 8.0, ink2, CL - 6, 12) + 16
        page.draw_line(fitz.Point(L, y - 10), fitz.Point(L + CL, y - 10), color=rule, width=0.4)

    ry = 290
    txt(R, ry, "EDUCATION / 教育", 7.4, ink3, helv)
    page.draw_line(fitz.Point(R, ry + 6), fitz.Point(R + 207, ry + 6), color=rule, width=0.6)
    ry += 24
    txt(R, ry, "中国美术学院", 10.2, ink)
    txt(R, ry + 14, "视觉传达设计 · 学士", 8.0, ink2)
    txt(R, ry + 28, "2018 — 2022 · 杭州", 6.8, ink3, helv)
    ry += 54
    txt(R, ry, "EXCHANGE / 交换", 7.0, ink3, helv)
    page.draw_line(fitz.Point(R, ry + 6), fitz.Point(R + 207, ry + 6), color=rule, width=0.6)
    ry += 22
    txt(R, ry, "柏林白湖艺术学院", 9.8, ink)
    txt(R, ry + 14, "信息设计 · 一学期", 8.0, ink2)
    txt(R, ry + 28, "2021 秋 · Berlin", 6.8, ink3, helv)

    ry += 58
    txt(R, ry, "TOOLKIT / 技能", 7.0, ink3, helv)
    page.draw_line(fitz.Point(R, ry + 6), fitz.Point(R + 207, ry + 6), color=rule, width=0.6)
    ry += 22
    skills = [
        ("品牌与识别", "命名 · 标志 · 导视 · 手册"),
        ("版面与编辑", "网格 · 字体排印 · 印刷"),
        ("前端", "Astro · TypeScript · GSAP"),
        ("动态与影像", "分镜 · 剪辑 · 轻量动效"),
        ("摄影", "胶片 · 数码 · 暗房基础"),
    ]
    for head, detail in skills:
        txt(R, ry, head, 8.8, ink)
        txt(R, ry + 12, detail, 7.2, ink3)
        ry += 28

    # --- selected ---------------------------------------------------------
    y = 610
    txt(L, y, "SELECTED / 其他", 7.0, ink3, helv)
    page.draw_line(fitz.Point(L, y + 6), fitz.Point(543, y + 6), color=rule, width=0.6)
    notes = [
        ("2025", "《纸白 03》入选亚太设计年鉴"),
        ("2024", "山坞品牌获 Hiiibrand 包装类优异奖"),
        ("2023", "个人站点收录于 onepagelove"),
    ]
    yy = y + 22
    for when, what in notes:
        txt(L, yy, when, 7.0, ink3, helv)
        txt(L + 44, yy, what, 8.4, ink2)
        yy += 17

    yy += 18
    txt(L, yy, "CLIENTS / 合作", 7.0, ink3, helv)
    page.draw_line(fitz.Point(L, yy + 6), fitz.Point(543, yy + 6), color=rule, width=0.6)
    txt(L, yy + 26, "单向空间 · 天目里 · ABC Camping · 中国美术学院美术馆 · 山坞", 8.4, ink2)

    # --- closing note -----------------------------------------------------
    page.draw_line(fitz.Point(52, 742), fitz.Point(543, 742), color=rule, width=0.8)
    page.insert_text((52, 792), "慢一点，做久一点。", fontsize=19, fontname=song, color=ink)
    txt(543 - 96, 792, "工作笔记 · 2026", 7.0, ink3, song)

    # --- footer -----------------------------------------------------------
    page.draw_line(fitz.Point(52, 806), fitz.Point(543, 806), color=rule, width=0.6)
    txt(52, 822, "FUNIKI · 浮尼记    /    hello@funiki.design", 7.0, ink3, helv)
    txt(433, 822, "2026", 7.0, ink3, helv)

    doc.set_metadata({"title": "Funiki — 简历 2026", "author": "Funiki",
                      "subject": "独立设计师 & 前端开发者"})
    doc.subset_fonts()
    dest.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(dest), garbage=4, deflate=True)
    doc.close()
    return int(dest.stat().st_size / 1024)


# ---------------------------------------------------------------------------
# 4. open graph card
# ---------------------------------------------------------------------------
def make_og(dest):
    im = crop_to(grade(fetch("mountain_clouds")), 1200, 630)
    canvas = Image.new("RGB", (1200, 630), (246, 244, 239))
    canvas.paste(im, (0, 0))
    overlay = Image.new("RGBA", (1200, 630), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rectangle([0, 380, 1200, 630], fill=(246, 244, 239, 243))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(canvas)
    f_big = ImageFont.truetype(HELV, 64, index=0)
    f_small = ImageFont.truetype(SONGTI, 22, index=0)
    d.text((64, 416), "Funiki", font=f_big, fill=(22, 21, 20))
    d.text((66, 502), "浮尼记 · 独立设计师 & 前端开发者 · 杭州", font=f_small, fill=(78, 75, 70))
    d.line([(64, 560), (1136, 560)], fill=(200, 196, 188), width=1)
    d.text((64, 578), "BRAND / PRODUCT / WEB / MOTION / PHOTOGRAPHY", font=ImageFont.truetype(HELV, 12, index=0), fill=(120, 116, 110))
    return save_jpeg(canvas, dest, 380)


# ---------------------------------------------------------------------------
# 5. credits
# ---------------------------------------------------------------------------
def write_credits(used):
    lines = [
        "# 图片来源 / photo credits",
        "",
        "所有图片均来自 [Unsplash](https://unsplash.com)，按 Unsplash License 下载到本地，",
        "并做统一调色与裁切；站点运行时不再请求任何外部图片地址。",
        "",
        "| 用途 | 文件 | 原始地址 |",
        "| --- | --- | --- |",
    ]
    for role, path, slot in used:
        lines.append("| " + role + " | " + path + " | https://images.unsplash.com/photo-" + SOURCES[slot] + " |")
    lines += [
        "",
        "由 scripts/generate-assets.py 生成；更换图片时改脚本顶部的 SOURCES / IMAGE_JOBS 后重跑。",
        "",
    ]
    (ROOT / "scripts/asset-credits.md").write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="all")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = args.only
    total = 0
    used = []

    def want(kind):
        return only == "all" or only == kind

    if only == "avatar":
        size = make_avatar(ROOT / "public/avatar.jpg")
        total += size
        print("  img  %-72s 900x1100  %4d KB" % ("public/avatar.jpg", size))

    if want("projects") or want("life") or want("thoughts"):
        for slot, rel, w, h, fx, fy, kb in IMAGE_JOBS:
            if only != "all":
                if "internship" in rel and only != "projects":
                    continue
                if "album/photos" in rel and only != "life":
                    continue
                if "post/" in rel and only != "thoughts":
                    continue
                if rel.startswith("public/avatar") and only != "avatar":
                    continue
            im = grade(fetch(slot, force=args.force))
            out = crop_to(im, w, h, fx, fy)
            size = save_jpeg(out, ROOT / rel, kb)
            total += size
            role = ("项目封面" if rel.endswith("cover.jpg") and "internship" in rel
                    else "项目图" if "internship" in rel
                    else "生活照片" if "album/photos" in rel
                    else "随想封面" if "post/" in rel
                    else "头像")
            used.append((role, rel, slot))
            print("  img  %-72s %dx%d  %4d KB" % (rel, w, h, size))

    if want("media"):
        for slot, rel, w, h, secs, motion, crf in VIDEO_JOBS:
            size = make_video(slot, ROOT / rel, w, h, secs, motion, crf, force=args.force)
            total += size
            used.append(("视频预览" if rel.startswith("public/project-") else "实况照片", rel, slot))
            print("  vid  %-72s %dx%d  %4d KB" % (rel, w, h, size))

    if only == "credits":
        used.append(("头像", "public/avatar.jpg", "portrait_sea"))
        for slot, rel, w, h, fx, fy, kb in IMAGE_JOBS:
            role = ("项目封面" if rel.endswith("cover.jpg") and "internship" in rel
                    else "项目图" if "internship" in rel
                    else "生活照片" if "album/photos" in rel
                    else "随想封面" if "post/" in rel
                    else "头像")
            used.append((role, rel, slot))
        for slot, rel, w, h, secs, motion, crf in VIDEO_JOBS:
            used.append(("视频预览" if rel.startswith("public/media") else "实况照片", rel, slot))
        write_credits(used)
        print("  credits -> scripts/asset-credits.md (%d rows)" % len(used))
        return

    if want("resume"):
        kb = make_resume(ROOT / "public/kim cv.pdf")
        total += kb
        print("  pdf  %-72s        %4d KB" % ("public/kim cv.pdf", kb))

    if want("og"):
        kb = make_og(ROOT / "public/og.jpg")
        total += kb
        print("  img  %-72s 1200x630  %4d KB" % ("public/og.jpg", kb))

    write_credits(used)
    print("\n  total media: %.1f MB" % (total / 1024))


if __name__ == "__main__":
    main()