# App Store Connect assets — Skyrim journal

The umbrella app ("JAW Digital Companion Journals") has one shared App Store listing
covering all 7 games — see `APP-STORE-READINESS.md` at the repo root for that whole
checklist. This file is just the Skyrim-specific pieces of it: screenshots and listing
copy you can drop straight into App Store Connect once the app record exists.

## Screenshots in this folder

- `iphone-6.7in-01-overview.jpg` (1290×2796) — the journal's Overview dashboard,
  showing the full 12-section breadth (Quests, Achievements, Shouts & Masks, Treasure,
  Crafting, Bestiary, Locations, Lore & Shrines, etc.) and live completion tracking.
- `iphone-6.7in-02-treasure.jpg` (1290×2796) — the Treasure & Collectibles tab open on
  its sub-tab row (Stones of Barenziah, Dragon Claws, Guild Trophies, Rare Curios,
  World Oddities...), a good "there's a lot in here" shot.

Both are sized exactly for the **iPhone 6.7" display class** (required by App Store
Connect). Still needed before submission: the 6.5" class (1242×2688) and, if the app
supports iPad, the 12.9" class (2048×2732) — same capture method (Chrome DevTools
`emulate` + `resize_page` + `take_screenshot` against the live journal URL, mobile nav
kicks in automatically under 780px), just at those pixel sizes. Repeat for the other 6
games too if/when this same pass gets done for them.

## Suggested description copy (Skyrim-specific paragraph)

> **Dragonborn's Field Journal** — the deepest Skyrim companion in the bundle. Every
> quest and questline (Main Quest through all 4 DLC-era Creation Club additions),
> all 100 achievements, all 27 shouts and 13 Dragon Priest masks (including the
> Solstheim four and Konahrik), Daedric artifacts, Stones of Barenziah, Dragon
> Claws, Thieves Guild trophies, followers & marriage, a full crafting reference,
> the bestiary, every hold's dungeons and points of interest, and a curated shelf
> of the game's key lore books — all searchable, favoritable, and trackable with
> your progress saved locally (and synced if you're signed in).

## Suggested keywords (Skyrim-relevant slice of the app's keyword field)

skyrim companion, skyrim guide, skyrim checklist, dragon priest masks, skyrim quests,
elder scrolls, dragonborn, skyrim achievements, skyrim collectibles, thieves guild

## Age rating questionnaire notes

The app itself contains no violence, gambling, or user-generated content — it's
reference text and checkboxes about a game rated Teen (ESRB) / 18 (PEGI, for
fantasy violence and blood). Apple's own questionnaire asks about content *in the
app*, not the source game, so this should land at **4+** same as the rest of the
bundle — but flag "Infrequent/Mild Fantasy Violence" if asked whether the app
references violent game content, to stay honest about what it describes.
