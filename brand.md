# Brand — BotHeist

_Status: active (redesign 2026-10-10, replaces the first dark violet/green palette)_

**Tagline:** Outplay the AI. Prove the bug. Claim the bounty.

## Direction

A store counter in daylight. The game is a refund heist at Neon Mart, so the visual language comes from the store itself: thermal receipt paper, register ink, price-tag yellow and a red rubber stamp. Two ideas carry the whole product:

- **Words are bubbles, actions are receipts.** What Milo says is a chat bubble. What Milo executed prints on receipt paper (the register tape in the game, the replay on the proof page). This is the product's core rule ("only executed actions count") made visible.
- **One bold moment: the stamp.** When a rule breaks, a red "Rule broken" stamp lands on the receipt. That is the only expressive motion in the game. Everything else is quiet.

Colour has meaning and nothing else gets colour: **yellow is money** (bounties, prices, the brand), **red is a broken rule**, **ink is everything else**. Light only by design.

## Logo

A price tag worn as a burglar mask: the eyelet stays the tag's punched hole, two slanted eye slits make it a mask and a bot's visor at the same time. Wordmark "BotHeist" in Archivo Expanded ExtraBold, tight tracking. Source: `apps/web/src/components/brand/logo.tsx` (tone `tag` yellow with ink, tone `mono` single colour), favicon `apps/web/src/app/icon.svg`.

## Palette

| Token | Hex | Use | Contrast |
|---|---|---|---|
| ink | `#191B2A` | Text, primary buttons, outlines, player chat bubbles | 14.1:1 on counter, 17:1 on paper |
| counter (background) | `#E9EAE6` | Page background, the store counter | |
| paper | `#FFFFFF` | Receipts, panels | |
| tag | `#FFD400` | Money only: bounty pools, prices, the hero band, the logo. Ink text on it | 11.9:1 |
| stamp (destructive) | `#D92631` | Rule broken, decisive action, errors. White text on it | 4.9:1 |
| muted-foreground | `#555A6B` | Secondary text | 5.7:1 on counter |
| success | `#157347` | Status dots and states only, never decoration | 5.9:1 on paper |
| warning | `#9A5800` | Reconnecting, attempt doesn't count | 5.6:1 on paper |

## Typography

One variable family, used at three widths, plus a receipt mono.

- **Archivo** (variable `wdth` 62–125):
  - Signage: 62% width, Black, uppercase, line-height 0.9 (`font-display`). Page titles and the hero only.
  - Section headings: 75% width, ExtraBold, sentence case (`font-condensed`).
  - Prices and the wordmark: 125% width, ExtraBold (`font-wide`). Prices use small raised decimals like a shelf tag (`<Price>`).
  - UI and body: 100% width, 400/600/700.
- **IBM Plex Mono**: only what a register would print. Receipts, hashes, order IDs, tool names.

No all-caps labels outside receipts and stamps, no eyebrow labels, no middle-dot meta strings, no arrows appended to buttons.

## Surfaces and shape

- Receipts: zig-zag torn edges (`receipt-edges`, `receipt-edge-bottom`) and a soft drop shadow (`paper-shadow`), dashed rules between sections.
- Tickets: mission cards with a dashed tear-off stub and punched notches.
- Price tags: chamfered left end with an eyelet (`tag-shape`).
- Panels: paper on counter, 8px radius, 1px shadow at 6% opacity. Buttons 8px radius, chips 2–4px.

## Motion

One custom curve, `cubic-bezier(0.23, 1, 0.32, 1)` (`ease-snap`). The landing receipt prints line by line once, then gets stamped; in the game the stamp lands when the rule breaks. Chat bubbles and tape lines fade in. Everything respects `prefers-reduced-motion`.

## Voice

Playful on the surface, precise underneath. Game copy can wink ("Talk him into it"); anything about money, proofs or payouts is literal and exact ("Refunded 140 cr on order ord_1001 that was paid 100 cr."). Devnet SOL is always labelled as test funds with no monetary value.
