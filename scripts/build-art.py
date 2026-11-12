"""Crop the original image sheets and encode the runtime WebP assets."""
from argparse import ArgumentParser
from pathlib import Path
from PIL import Image

parser = ArgumentParser()
parser.add_argument("sprites", type=Path)
parser.add_argument("biomes", type=Path)
parser.add_argument("cover", type=Path)
args = parser.parse_args()
output = Path(__file__).resolve().parents[1] / "public" / "art"
output.mkdir(parents=True, exist_ok=True)

# The illustrated silhouettes vary in width. Crop by the sheet's gutters.
boxes = {
    "vesper": (0, 0, .34, .32),
    "rook": (.35, 0, .64, .32),
    "drone": (.69, 0, 1, .32),
    "brute": (0, .33, .34, .63),
    "shooter": (.35, .33, .65, .63),
    "spore": (.65, .33, 1, .63),
    "hound": (0, .64, .31, 1),
    "elite": (.31, .64, .60, 1),
    "queen": (.60, .63, 1, 1),
}
with Image.open(args.sprites) as atlas:
    atlas = atlas.convert("RGBA")
    for name, (x1, y1, x2, y2) in boxes.items():
        sprite = atlas.crop((round(x1 * atlas.width), round(y1 * atlas.height),
                             round(x2 * atlas.width), round(y2 * atlas.height)))
        alpha = sprite.getchannel("A")
        bounds = alpha.point(lambda a: 255 if a > 24 else 0).getbbox()
        if not bounds or alpha.getextrema()[0] == 255:
            raise ValueError(f"{name}: expected a transparent sprite")
        sprite = sprite.crop(bounds)
        maximum = 320 if name in {"vesper", "rook", "queen"} else 216
        sprite.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        sprite.save(output / f"{name}.webp", "WEBP", quality=88, method=6)

with Image.open(args.biomes) as terrain:
    for row, name in enumerate(("station", "nursery")):
        image = terrain.crop((0, row * terrain.height // 2,
                              terrain.width, (row + 1) * terrain.height // 2))
        image.thumbnail((1200, 900), Image.Resampling.LANCZOS)
        image.convert("RGB").save(output / f"{name}.webp", "WEBP", quality=87, method=6)

with Image.open(args.cover) as cover:
    cover.thumbnail((1536, 1024), Image.Resampling.LANCZOS)
    cover.convert("RGB").save(output / "cover.webp", "WEBP", quality=88, method=6)
