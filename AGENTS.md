## Code style

Write code a new teammate can read without explanation.

- Names explain the code. Use full words: `remainingDebt`, not `rd` or `tmp`. Functions are verbs (`calculateStockCost`), booleans read as questions (`isClosed`, `hasDebt`).
- Small functions with one job each. If a function needs a comment to explain its steps, split it into well-named functions instead.
- Return early instead of nesting `if`s. Avoid nested ternaries.
- Keep logic flat and obvious. Don't build clever one-liners, abstractions "for later", or helpers that are only used once.
- Follow the patterns already in the codebase (folder layout, naming, error handling). Look at a neighbouring module before writing a new one.

## Comments

- Almost no comments. Good names should make the code explain itself.
- Never write comments that repeat the code (`// get user`, `// loop over items`).
- Only comment the *why* when it isn't obvious: a business rule, a workaround, a surprising edge case. One short line.
- No JSDoc on obvious methods, no section banners, no commented-out code.
- Don't leave notes about what you changed ("// updated to fix X"). That belongs in the commit message.
