#!/usr/bin/env node
// Preview smoke notes for Nikola — Ask Hanna on the same Today case.
//
// This file is the signed-in check, not a live login. Run it after the
// Preview deploy of this branch. Triangle sends nothing in any of these
// steps. Do not use Scout's research credentials.
//
//   1. Open Today. Find a follow-up / Needs-you case (Oliver Hall · PLC
//      commissioning · Germany, or any overdue email follow-up).
//   2. Confirm Ask Bob and Ask Hanna both sit on the card. If Bob already
//      has it, Ask Hanna still sits under With Bob — it must not vanish.
//   3. Press Ask Hanna. Leave the radio on "Bio — initials only" (or type
//      "Matej as M.P., not a full named CV"). Press Hand to Hanna.
//   4. Stay on Today. The same card should show "Hanna is preparing the bio"
//      and, if the words named somebody on the books, the anonymised pack
//      (initials, Triangle reference filename). Open thread stays on the case.
//   5. Open Bob's thread on the same card. The composer button says
//      "Message Bob", not Send. Typing "ask Hanna for a bio" shows the hint
//      and Ask Hanna still sits at the foot of the drawer.
//   6. Do not press Send from Triangle unless you mean to email a recruiter.
//      Attaching the profile is a later human press.
//
// Offline proof of the wording and the handoff (no env, no database):

import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["scripts/check-ask-hanna.mjs"], {
  stdio: "inherit",
});
process.exit(result.status === 0 ? 0 : result.status ?? 1);
