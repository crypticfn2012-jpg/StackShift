# Stack Shift

Stack Shift is a browser puzzle game by PixelForge Studios. Fit every parcel into the van, follow each order's special rule, and build a clean-delivery streak.

Play: https://crypticfn2012-jpg.github.io/StackShift/

## Controls

- Drag parcels into the van.
- Tap or click a parcel to select it. Rotation is only available while dragging: press **R**, or use Rotate with a second finger on touch devices.
- Use **Hint** once per order to reveal one parcel's correct placement. It costs 35 points and the assisted delivery does not count as perfect.
- Press **Space** or **Enter** to deliver once every parcel is placed.
- Press **P** or use the on-screen pause button to pause or resume. **Escape is reserved for browser/platform fullscreen controls.**

The game includes Timed Puzzle, Endless, a 100-level Career Campaign, a daily route with streak rewards, special cargo rules, a once-per-order parcel hint with a score penalty, contracts, unlockable cosmetics, achievements, and optional CrazyGames rewarded-ad lives where supported.

## CrazyGames account saves and leaderboards

- On CrazyGames, the CrazyGames SDK Data Module is the source of truth for the full save. Outside CrazyGames, the game uses browser storage.
- The Settings panel includes CrazyGames account sign-in when the platform exposes it. Guest Data Module progress is designed to sync to the account after sign-in.
- The client submits a player's weekly personal-best **Timed Puzzle** score to the CrazyGames leaderboard SDK when the player is signed in and the platform has enabled leaderboards for Stack Shift. Daily, Endless, and Campaign runs are excluded to keep the competition fair.
- **Developer Portal setup:** enable **Progress Save / Data Module** in the submission settings. CrazyGames leaderboards are only available to invited games, so leaderboard submissions will not appear globally until CrazyGames enables this feature for Stack Shift.
- Configure the single leaderboard as metric **POINTS**, sorting **DESC**, incremental scoring **false**, minimum **0**, maximum **500000**, cooldown **10 seconds**, and guide text `Timed Shift Score — earn the highest delivery score`.
- Set the leaderboard Encryption Key to this exact 32-byte Base64 key (it must match the client code):

  `KoiAqdxJreewq67vmVKaQKd/xCPdvrSGz0K8dnC4NzM=`

The client-side SDK submission is appropriate for this static browser game, but client scores are not tamper-proof; CrazyGames notes that server-side validation is stronger. Do not treat the encryption key as a server secret.

## Y8 SDK, Score leaderboard, and rewarded lives

- Stack Shift loads the official Y8 SDK 2.0 from `https://cdn.y8.com/minimal-sdk/2-0/y8.min.js` and initializes it with App ID `6ad27ea36da5b1f7cbf0c634`, Game ID `288001`, and automatic login.
- The Y8 leaderboard table name must be exactly `Score`. The menu's **Leaderboard** button opens the all-time table; if the player is not authenticated, the game starts Y8 sign-in first.
- Only regular **Timed Puzzle** runs submit a score to Y8. Daily Route, Endless, and Campaign runs are excluded. Y8 keeps each player's best score in the table.
- The Campaign extra-life reward uses Y8's rewarded-ad API when running on Y8. The existing CrazyGames leaderboard, cloud-save and rewarded-ad paths are kept separate and unchanged.
- Y8 features are enabled on Y8 domains. For local development, append `?platform=y8` to opt in; the adapter stays off inside another active platform SDK, including CrazyGames.

## Quality checks

Pushes to `main` run JavaScript syntax checks, seeded puzzle-generation and placement tests, SDK/control/legal-link checks, and target-iframe sizing smoke tests before deploying GitHub Pages. Automated tests do not replace manual checks in CrazyGames Preview at the required iframe sizes and on a physical touch device.
