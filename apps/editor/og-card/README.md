# OG share card

`public/og-image.png` (2400×1260, 2x for a 1200×630 card) is generated from
`og-template.html`.

The template embeds two OFL-licensed fonts as base64 (placeholders
`__BRICOLAGE__` / `__GEISTMONO__`): [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque)
Bold and [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) Regular.

To regenerate:

```bash
# 1. Substitute base64-encoded TTFs into the template
base64 -i BricolageGrotesque-Bold.ttf > bricolage.b64
base64 -i GeistMono-Regular.ttf > geistmono.b64
python3 -c "
t = open('og-template.html').read()
t = t.replace('__BRICOLAGE__', open('bricolage.b64').read().strip())
t = t.replace('__GEISTMONO__', open('geistmono.b64').read().strip())
open('og.html', 'w').write(t)
"

# 2. Render at 2x with headless Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --user-data-dir=/tmp/og-chrome \
  --window-size=1200,630 --force-device-scale-factor=2 \
  --virtual-time-budget=3000 \
  --screenshot=../public/og-image.png "file://$PWD/og.html"
```
