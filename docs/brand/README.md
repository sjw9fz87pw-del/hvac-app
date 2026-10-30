# Axios Equipment Care: the logo

The logo is "Option 4" from the owner's design sheet: a blue-to-green ring
around **AXIOS** and **EQUIPMENT CARE**, with the line
*People. Equipment. A stronger tomorrow.*

It is redrawn as vector art so it stays sharp at any size. The lettering is
Montserrat (SIL Open Font License), converted to outlines, so no font is
loaded at runtime.

| File | Where it's used |
|---|---|
| `public/brand/logo-full.svg` | Sign-in and invitation pages (with the tagline) |
| `public/brand/logo.svg` | The logo without the tagline |
| `public/brand/logo-horizontal.svg` | The top bar on each main tab: the ring around AXIOS, the name across |
| `public/brand/logo-mark.svg` | The ring and "A" on their own |
| `src/app/icon.svg`, `src/app/apple-icon.png` | Browser tab and home-screen icon |

Colours: navy `#0b1f3f` (text), blue `#1667a0` (actions), green `#6fae47`,
gray `#5b6470`; the ring runs `#0b4f86` → `#1667a0` → `#2f8f95` → `#8cc043`.
The app's colour tokens live at the top of `src/app/globals.css`.

To rebuild the SVGs, install `fonttools` and `brotli`, put the
`@fontsource/montserrat` files beside the script, and run
`python3 build_logo.py <output-folder>`.
