# Vishal Shanbhag — Portfolio

An interactive, 3D-skeuomorphic portfolio for a product designer. Plain HTML, CSS and JavaScript — no build step.

## Run it locally

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

## Files

| File | What it is |
| --- | --- |
| `index.html` | All the markup: hero desk, work folders, playground, about |
| `styles.css` | Styling, lighting/shadow system, leather folders, iPad mockup |
| `main.js` | Interactions: sticker dragging, pinned-note physics, vinyl + music, iPad library, sticker stack, scroll effects |
| `assets/` | Images and SVGs |

## Notes

- The vinyl's album art and 30-second preview are fetched live from Apple's public iTunes Search API; the iPad's other book covers come from Open Library. Both need an internet connection and fall back gracefully.
- Fonts load from Google Fonts. Bradley Hand (section titles) is an Apple system font and falls back to Gloria Hallelujah elsewhere.
- Social links and the Resume link in `index.html` are `#` placeholders — replace them with your real URLs.

## Deploy

Hosted with GitHub Pages straight from the `main` branch (root). Push to `main` and the site updates in about a minute.
