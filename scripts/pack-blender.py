"""Pack Blender PNG frames into six animation rows, four frames per row."""
from pathlib import Path
from PIL import Image
from PIL.ImageChops import lighter

root = Path(__file__).resolve().parents[1]
source = root / ".hivemind" / "blender-frames"
output = root / "public" / "art" / "animated"
output.mkdir(parents=True, exist_ok=True)
for name in ("vesper", "rook", "drone", "brute", "shooter", "spore", "hound", "elite", "queen"):
    frames = [Image.open(source / f"{name}-{frame:02}.png").convert("RGBA") for frame in range(1, 25)]
    union = Image.new("L", frames[0].size)
    for frame in frames:
        alpha = frame.getchannel("A")
        if alpha.getextrema() != (0, 255):
            raise ValueError(f"invalid alpha for {name}")
        union = lighter(union, alpha)
    left, top, right, bottom = union.getbbox()
    side = max(right - left, bottom - top) + 6
    cx = (left + right) // 2
    cy = (top + bottom) // 2
    x = cx - side // 2
    y = cy - side // 2
    atlas = Image.new("RGBA", (384, 576))
    for index, frame in enumerate(frames):
        tile = frame.crop((x, y, x + side, y + side)).resize((96, 96), Image.Resampling.LANCZOS)
        atlas.paste(tile, (index % 4 * 96, index // 4 * 96))
    atlas.save(output / (name + ".webp"), "WEBP", quality=88, method=6)
