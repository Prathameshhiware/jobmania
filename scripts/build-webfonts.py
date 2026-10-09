# Builds the self-hosted webfonts from the variable originals.
#
# The site loaded fonts from fonts.googleapis.com, which costs a
# render-blocking stylesheet, then a second DNS lookup, TLS handshake and
# fetch to fonts.gstatic.com before a single glyph can be drawn. On a slow
# connection that is most of the time before first paint, and none of it buys
# anything: the files are static and we already ship a renderer that uses
# them.
#
# Self-hosted they come from the same origin as the page, over a connection
# the browser already has open.
#
# Only the weights the site actually uses — 500, 600, 700, 800 for the
# display face and 400, 500, 600, 700 for the body — instanced out of the
# variable fonts rather than guessed at. Latin only: the site is English, and
# the full character set is several times the size.
#
#   python scripts/build-webfonts.py
#
# Writes to public/fonts/. Run it again if the weights in the CSS change.

import io
import os
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'fonts')
SRC = 'https://raw.githubusercontent.com/google/fonts/main'

# Everything the site renders: Latin, the common punctuation, the rupee sign,
# the en and em dashes and the curly quotes the copy actually uses.
UNICODES = 'U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2026,U+20B9,U+2192,U+00B7'

FACES = [
    ('Sora', 'ofl/sora/Sora%5Bwght%5D.ttf', [500, 600, 700, 800]),
    ('SchibstedGrotesk', 'ofl/schibstedgrotesk/SchibstedGrotesk%5Bwght%5D.ttf', [400, 500, 600, 700]),
]


def fetch(path):
    req = urllib.request.Request(
        f'{SRC}/{path}',
        headers={'User-Agent': 'JoBmaniaBuild/0.1 (+https://jobmania.dpdns.org)'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0

    for name, remote, weights in FACES:
        raw = fetch(remote)
        print(f'{name}: downloaded {len(raw) // 1024}KB variable')

        for wght in weights:
            font = TTFont(io.BytesIO(raw))
            instantiateVariableFont(font, {'wght': wght}, inplace=True, updateFontNames=False)

            opts = Options()
            opts.layout_features = ['kern', 'liga', 'calt']
            opts.desubroutinize = True
            opts.notdef_outline = False
            sub = Subsetter(options=opts)
            sub.populate(unicodes=[
                c
                for part in UNICODES.split(',')
                for c in (
                    range(int(part.split('-')[0][2:], 16), int(part.split('-')[1], 16) + 1)
                    if '-' in part else [int(part[2:], 16)]
                )
            ])
            sub.subset(font)

            font.flavor = 'woff2'
            path = os.path.join(OUT, f'{name}-{wght}.woff2')
            font.save(path)
            size = os.path.getsize(path)
            total += size
            print(f'  {name}-{wght}.woff2  {size // 1024}KB')

    print(f'\n{total // 1024}KB total in public/fonts/')


if __name__ == '__main__':
    main()
