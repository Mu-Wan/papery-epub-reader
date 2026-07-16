import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICON_PATH = ROOT / "src-tauri" / "icons" / "icon.ico"
PNG_PATH = ROOT / "src-tauri" / "icons" / "256x256.png"
PREVIEW_PATH = ROOT / "output" / "icon-preview-v2.png"
SIZES = [32, 16, 20, 24, 30, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256]
PREVIEW_SIZES = [16, 20, 24, 30, 32, 36, 48, 64, 96, 256]
FONT_PATH = r"C:\Windows\Fonts\segoeui.ttf"


def point(size: int, x: float, y: float) -> tuple[int, int]:
    return round(size * x), round(size * y)


def render_icon(size: int) -> Image.Image:
    # 每个目标尺寸单独绘制，确保小图层不由大图缩放得到。
    scale = 4
    canvas = size * scale
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    inset = max(scale, round(canvas * 0.045))
    radius = round(canvas * 0.22)
    draw.rounded_rectangle(
        (inset, inset, canvas - inset - 1, canvas - inset - 1),
        radius=radius,
        fill="#315c4c",
    )
    left = [point(canvas, 0.23, 0.28), point(canvas, 0.48, 0.34), point(canvas, 0.48, 0.76), point(canvas, 0.23, 0.68)]
    right = [point(canvas, 0.77, 0.28), point(canvas, 0.52, 0.34), point(canvas, 0.52, 0.76), point(canvas, 0.77, 0.68)]
    draw.polygon(left, fill="#fffdf7")
    draw.polygon(right, fill="#fffdf7")
    line_width = max(scale, round(canvas * 0.035))
    draw.line((canvas // 2, round(canvas * 0.34), canvas // 2, round(canvas * 0.76)), fill="#315c4c", width=line_width)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def png_bytes(image: Image.Image) -> bytes:
    stream = io.BytesIO()
    image.save(stream, format="PNG", optimize=True)
    return stream.getvalue()


def save_ico(frames: dict[int, Image.Image]) -> None:
    # 手工写入 PNG 图层以保留独立像素，并将 Tauri 推荐的 32px 放在首层。
    payloads = [png_bytes(frames[size]) for size in SIZES]
    header_size = 6 + 16 * len(SIZES)
    offset = header_size
    entries = []
    for size, payload in zip(SIZES, payloads):
        dimension = 0 if size == 256 else size
        entries.append(struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(payload), offset))
        offset += len(payload)
    ICON_PATH.parent.mkdir(parents=True, exist_ok=True)
    ICON_PATH.write_bytes(struct.pack("<HHH", 0, 1, len(SIZES)) + b"".join(entries) + b"".join(payloads))


def save_preview(frames: dict[int, Image.Image]) -> None:
    # 最近邻放大小图，便于直接检查真实像素和视觉重心。
    cell = 136
    preview = Image.new("RGB", (cell * 5, cell * 2), "#e9e9e6")
    draw = ImageDraw.Draw(preview)
    font = ImageFont.truetype(FONT_PATH, 16)
    for index, size in enumerate(PREVIEW_SIZES):
        x = index % 5 * cell
        y = index // 5 * cell
        enlarged = frames[size].resize((96, 96), Image.Resampling.NEAREST)
        preview.paste(enlarged, (x + 20, y + 8), enlarged)
        draw.text((x + 68, y + 113), f"{size}px", anchor="ma", font=font, fill="#333333")
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    preview.save(PREVIEW_PATH)


def main() -> None:
    frames = {size: render_icon(size) for size in SIZES}
    save_ico(frames)
    frames[256].save(PNG_PATH)
    save_preview(frames)


if __name__ == "__main__":
    main()
