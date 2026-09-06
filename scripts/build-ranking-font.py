"""Build the bundled pixel-serif ranking face from the licensed DejaVu outlines."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
source = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
font = ImageFont.truetype(source, 24)
chars = list(range(32, 256)) + [0x20ac, 0x2019, 0x2013, 0x2014]
order = ['.notdef'] + ['uni%04X' % c for c in chars]
glyphs = {}; metrics = {}
for code, name in [(None, '.notdef')] + list(zip(chars, order[1:])):
    char = '?' if code is None else chr(code)
    mask = Image.new('L', (48, 40)); ImageDraw.Draw(mask).text((2, 28), char, font=font, fill=255, anchor='ls')
    pen = TTGlyphPen(None)
    for y in range(40):
        x = 0
        while x < 48:
            if mask.getpixel((x,y)) < 110: x += 1; continue
            start = x
            while x < 48 and mask.getpixel((x,y)) >= 110: x += 1
            left, right, top, bottom = (start-2)*28, (x-2)*28, (28-y)*40, (27-y)*40
            pen.moveTo((left,bottom));pen.lineTo((left,top));pen.lineTo((right,top));pen.lineTo((right,bottom));pen.closePath()
    glyphs[name] = pen.glyph(); metrics[name] = (round(font.getlength(char))*28+28, 0)
fb=FontBuilder(1024,isTTF=True);fb.setupGlyphOrder(order);fb.setupCharacterMap(dict(zip(chars,order[1:])));fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=1000,descent=-240)
fb.setupNameTable({'familyName':'KP Arcade Score','styleName':'Regular','uniqueFontIdentifier':'KP Arcade Score 1.0','fullName':'KP Arcade Score','psName':'KPArcadeScore','version':'Version 1.0','copyright':'Based on DejaVu fonts. Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved. DejaVu changes are in public domain.'})
fb.setupOS2(sTypoAscender=1000,sTypoDescender=-240,usWinAscent=1100,usWinDescent=280);fb.setupPost();fb.setupMaxp()
fb.font.flavor='woff';fb.save(Path(__file__).resolve().parents[1]/'assets/fonts/kp-arcade-score.woff')
