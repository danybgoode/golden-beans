# Contributing

This repository is a **read-only mirror** of `skills/` in
[`danybgoode/golden-beans`](https://github.com/danybgoode/golden-beans). Every merge there that touches `skills/` is
pushed here as a fast-forward (`git subtree split --prefix=skills`), and a version bump then releases here as before
(see [RELEASING.md](RELEASING.md)).

- **Issues and pull requests:** open them in `danybgoode/golden-beans`.
- **Don't commit here directly.** Only the mirror's deploy key can push to `main`, and a direct commit would make the
  next mirror push non-fast-forward.
