# Bubblemap Bypass

A Solana program built with Anchor framework for bypassing bubblemap restrictions.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (1.75.0 or later)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.18.0 or later)
- [Anchor](https://www.anchor-lang.com/docs/installation) (v0.30.1 or later)
- [Node.js](https://nodejs.org/) (v16 or later)
- [Yarn](https://yarnpkg.com/) (optional, npm works too)

## Setup

1. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

2. Build the program:
   ```bash
   anchor build
   ```

3. Run tests:
   ```bash
   anchor test
   # or
   npm test
   ```

## Project Structure

```
.
├── Anchor.toml          # Anchor configuration
├── Cargo.toml           # Rust workspace configuration
├── programs/            # Solana programs
│   └── bubblemap-bypass/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs   # Main program logic
├── tests/               # Test files
│   └── bubblemap-bypass.ts
└── migrations/          # Deployment scripts
```

## Development

- Build: `anchor build`
- Test: `anchor test`
- Deploy: `anchor deploy`

## License

MIT

