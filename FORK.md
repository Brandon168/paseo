# What this fork changes

`Brandon168/paseo` is a personal fork of [getpaseo/paseo](https://github.com/getpaseo/paseo), and `main` here is the branch I actually run in production. It is usually a little ahead of upstream with features I use, and a little behind with work that hasn't been merged or rebased in yet.

The commit log alone can't answer "what is mine, and what has upstream already taken?": it carries reverts, rebased duplicates and upstream merge commits, and upstream squash-merges pull requests so their commits never match mine. So this file is the record, kept by feature rather than by commit.

Two audiences: me at rebase time (what can be dropped), and anyone using the fork (what they get, and what upstream already covers).

## Status values

| Status      | Meaning                                                          | Kept in the fork?                                   |
| ----------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `fork-only` | Mine, not offered upstream, or upstream would not take it.       | Yes                                                 |
| `pr-open`   | A pull request is open on getpaseo/paseo.                        | Yes, until it lands and the fork is rebased past it |
| `upstream`  | Merged upstream. The fork commits are history, not a difference. | Prune the entry after the next rebase includes it   |
| `dropped`   | Tried and reverted, or superseded. Recorded so nobody redoes it. | No                                                  |

Not every entry needs a pull request. Upstream declines some work (Bun support, #7055) and some changes are only useful with the fork's own client build.

## Entry format

`scripts/fork-status.mjs` parses this file, so keep one field per line and the exact field names and status values above:

```md
### A short title

- **Status:** fork-only
- **Commits:** `abc123456`, `def789012`
- **PR:** #1234
- **Upstream:** merged 2026-11-11 (free text, required for `upstream`)
- **Why:** one sentence on the problem it solves
- **Notes:** optional caveats, client requirements, rollback
```

`Commits` lists the representative commits on `main`, not every duplicate from a rebase. `PR` is required for `pr-open` and `upstream` and optional otherwise.

Check the file with:

```sh
node scripts/fork-status.mjs
```

It compares each entry with the pull request's real state and flags drift: a PR that merged while the entry still says `pr-open`, a `fork-only` commit that upstream now contains, a commit that no longer exists. Exit code 1 means the file needs an edit; 2 means the check itself couldn't run (no `gh`, no network).

## Fork-only changes

### Hide models per provider

- **Status:** fork-only
- **Commits:** `e54de8dae`, `c9dc18fac`
- **Why:** Model discovery keeps every provider running, but the picker only needs the models I actually use, so models and whole providers can be hidden without turning discovery off.
- **Notes:** Choices are stored in the app's per-device settings store. The server still lists everything it discovers.

### Wider desktop model picker with optional grouping

- **Status:** fork-only
- **Commits:** `86400bbba`
- **Why:** The desktop composer picker truncated the route, which made same-name models from different providers indistinguishable.
- **Notes:** Settings → Chat → "Group models by route", off by default, per device. Client-side only: the App Store app and an older IPA are unaffected.

### The model that answered each turn

- **Status:** fork-only
- **Commits:** `7ebbd3e6f`, `a7190ece5`
- **Why:** With several providers and routes, a conversation needs to show which model produced each reply, not just which model is selected now.
- **Notes:** The daemon stamps every assistant message with provider, model id and thinking option; the footer shows picker name · route · thinking level. Settings → Chat → "Show model on each turn", on by default, per device. Older clients ignore the added fields.

### Cache hit rate, session tokens and plan usage in the context card

- **Status:** fork-only
- **Commits:** `c4816a66c`, `c8fb4506d`
- **Why:** The context window card showed what was in the window but not how often the prompt cache hit, how many tokens the session had used, or whether the session was covered by a subscription.
- **Notes:** Shows last-call and session cache hit rate (amber below 50%), session token total, and "Included in plan" for subscription sessions. OpenCode v2 sessions now report usage, so plan limits appear for them too. There is no plan source for Vercel AI Gateway, DeepSeek direct or NVIDIA keys.

### Plugin agent tools for OpenCode agents

- **Status:** fork-only
- **Commits:** `15bf5937f`
- **Why:** Agent tools that plugins return from `agent.open.before` (Ask's `ask_user`, genui's `render_ui`) reached Claude agents but never OpenCode agents. The OpenCode bridge manifest is built once at boot without a caller agent, so it held only the built-in Paseo tools.
- **Notes:** Upstream #9426 (in 0.17.0-beta.1) fixed this for the v2 bridge plugin, which now asks for its bound session's catalog; the fork keeps that path as upstream wrote it. What stays fork-only is the v1 bridge plugin: it reads the global manifest once per directory load, so the bridge adds the tools of every session catalog it sees to that manifest, announced before OpenCode loads the plugin. A session without the tool still gets "Paseo tool not found". A plugin tool that first appears after a directory is loaded needs an OpenCode server restart on v1 (a daemon restart does that).

### Inherit the OpenCode v2 default model

- **Status:** fork-only
- **Commits:** `9859a88fe`
- **Why:** The daemon used a hardcoded default instead of the default model in OpenCode's own config.

### Build only matching workspaces for a workspace list query

- **Status:** fork-only
- **Commits:** `44ccce04e`
- **Why:** Listing workspaces rebuilt every workspace's entry; only the matching ones are needed.

### Lazy loading for daemon startup and a lean service entry

- **Status:** fork-only
- **Commits:** `eb895aa1b`, `9eff292d1`, `9db6ca181`, `b615283b7`, `8e040362c`, `0fb97d2d1`, `1b74835b6`, `7872d0bf2`, `ff2e025b5`, `0bb1aa4ab`, `856de3e21`, `bc044c098`, `efb07f08a`, `c89655bdb`
- **Why:** Daemon and app startup loaded every protocol validator and plugin schema up front; they now load on demand, and `paseo-daemon` is a lean entry point for service units.
- **Notes:** The Bun-specific parts of this line of work were reverted later; see Dropped.

### Take a photo from the attachment menu

- **Status:** fork-only
- **Commits:** `26ed542c8`
- **Why:** Attaching a photo on iOS meant opening the picker; the camera should be one tap away.
- **Notes:** Native build only (sideloaded IPA or a local build), not the App Store app.

### Paste images into new and retained iOS composers

- **Status:** fork-only
- **Commits:** `06050098d`
- **Why:** Upstream pastes clipboard images on mobile (#2793), but the paste was lost when moving between a new chat and a retained composer on iOS.

### Unsigned IPA build for sideloading

- **Status:** fork-only
- **Commits:** `d73f08a5b`
- **Why:** Personal sideloaded iOS build, signed with a personal certificate rather than an App Store profile.
- **Notes:** `.github/workflows/ios-unsigned-personal.yml` in this fork.

### New Workspace from the app icon

- **Status:** fork-only
- **Commits:** `f6ccbeb8a`
- **Why:** Long-pressing the app icon should start a new workspace without opening the app first.
- **Notes:** iOS adds a static home screen quick action and a small local module (`packages/app/modules/paseo-quick-actions`) that keeps the chosen action through a cold start. Android adds a launcher shortcut that opens `paseo://new` (`packages/app/plugins/with-android-quick-actions.js`). Both need a native build: a JS-only update won't add the option. `expo-quick-actions` 6.0.2 was not used: it targets Expo SDK 54 and drops the action on a cold start in this app's scene-based iOS lifecycle.

### Voice mode entry points in empty chats

- **Status:** fork-only
- **Commits:** `0dba14e38`, `26c93cc54`
- **Why:** Voice mode could only be reached after a conversation started; it is now offered before the first message and on the New workspace screen.

### Name an agent from its first message or first spoken words

- **Status:** fork-only
- **Commits:** `8f4d12c65`, `02fa96de9`
- **Why:** A promptless first agent left its workspace unnamed, and an untitled agent stayed "Untitled" after a spoken first message.

### Send voice replies a sentence at a time, ahead of playback

- **Status:** fork-only
- **Commits:** `33b7281db`
- **Why:** Waiting for the whole reply before speaking added a long silence at the start of every spoken answer.

### Optional recording of the voice-mode microphone stream

- **Status:** fork-only
- **Commits:** `ac1649c39`
- **Why:** Diagnosing interrupt and echo problems needed the actual audio the detector saw. Off by default.

## Open upstream pull requests

### Voice: the transcript decides what interrupts a reply

- **Status:** pr-open
- **PR:** #9438
- **Commits:** `5b2d90b95`, `2515e4d96`, `42f3d4e8a`, `e55947d5c`, `c1c8b7dbc`, `f859d3fd2`, `1465a705e`
- **Why:** Sound detection alone interrupted on coughs, background noise and the reply's own echo. The transcript of the detected utterance now decides, with per-clip transcription, echo settling, and detector fixes for short words and sparse bursts.
- **Notes:** Large, opinionated change. The earlier pause-on-sound approach was reverted; see Dropped.

### Send phone photos as downscaled JPEG

- **Status:** pr-open
- **PR:** #9328
- **Commits:** `56c2757f2`
- **Why:** Full-size PNG photos from the phone were slow to upload and large on disk.

### Sample event-loop delay every 100 ms

- **Status:** pr-open
- **PR:** #9357
- **Commits:** `31da7f4f1`, `dac5dd54f`, `24f73b966`, `970d46bd0`
- **Why:** A 10 ms sampling interval idled the daemon's event loop for more time than the measurement was worth; coarse sampling while idle keeps the signal without the cost.

### Sleep until the next schedule is due

- **Status:** pr-open
- **PR:** #9254
- **Commits:** `1ec759a6c`, `d708fecba`, `dd7646cee`, `13cf2eeca`, `9d2072c43`
- **Why:** The scheduler polled every second; it now sleeps until the next due job and handles wake edge cases deterministically.

### No liveness pings for plugin sessions

- **Status:** pr-open
- **PR:** #9352
- **Commits:** `fb435d225`, `0c999137d`, `e7b31bb74`
- **Why:** Per-session liveness pings kept plugin processes busy for no benefit, and a plugin whose daemon channel closed kept running.

### Build with zod 4.6.7

- **Status:** pr-open
- **PR:** #9260
- **Commits:** `9d7a32402`, `19a78b38b`
- **Why:** The lockfile's third-party zod ranges resolved to a version the build didn't pin, so a fresh install could fail or drift.

### Plugin skill docs load on demand

- **Status:** pr-open
- **PR:** #9721
- **Commits:** none on `main` (branch `docs/plugin-skill-references`)
- **Why:** The plugin skill inlined every reference, which made it long to load for a small task.

## Landed upstream

These are already in getpaseo/paseo. They are listed so a rebase doesn't re-litigate them, and so a fork user knows which upstream version makes the fork unnecessary for that fix. Delete an entry once the next rebase includes it.

None at the moment.

## Reverted or dropped

### Bun runtime support

- **Status:** dropped
- **Commits:** `14a1843a6`, `a1b50717c`, `56fc545ab`, `e84543082`, `af313618a`, `03b1f6d7d`, `bc9aa92be`, `dad60867d`, `b56d8c754`
- **Why:** Upstream declined Bun support (#7055) and production runs the daemon on Node (with `MALLOC_ARENA_MAX=2`), so the Bun PTY, runtime selection, terminal-worker engine tracking and Bun-only plugin shutdown work were reverted in `b56d8c754`.
- **Notes:** The lazy loading and lean `paseo-daemon` entry from the same branch were kept.

### Pause a spoken reply on detected sound

- **Status:** dropped
- **Commits:** `003e60f0c`, `6bcfb9a24`, `d0b0bbfbd`, `6b773e52f`, `d037640ba`, `9666d9dfe`
- **Why:** Pausing on any detected sound fired on coughs and echo. Replaced by the transcript verdict in #9438, and the client pause path was removed (`2515e4d96`).

## Keeping this current

- Add an entry in the same change that adds a feature, or right after merging it.
- When a PR merges upstream, change its status to `upstream` and add the upstream note. Run `node scripts/fork-status.mjs` to find entries that are out of date.
- When a rebase brings in an upstream entry, delete that entry: it is no longer a difference.
- Keep machine-specific deploy paths and release bookkeeping out of this file; it is for other users of the fork too.
