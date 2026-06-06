# Tile Puzzle

A browser-based tile-removal puzzle where shipped levels are validated as solvable.

## Local Development

```sh
npm install
npm run dev
```

The dev server binds to `0.0.0.0` and prints a Tailscale URL when this machine has a Tailscale IPv4 address. Open that `http://100.x.y.z:5173/` URL from another device in the same tailnet.

## Validation

```sh
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```
