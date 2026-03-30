# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (very niche / diminishing returns)
- **Bazel/Buck targets**: Parse BUILD files for local dep references — very niche ecosystem
- **Import graph analysis**: Parse actual import statements — complex, slow, fragile

## Exhaustively completed ✅
All major ecosystems covered (16 languages/tools): JS/TS/npm/pnpm/yarn, Rust, Go,
Python/uv, Ruby, Elixir, Java/Gradle/Maven, C#/.NET, PHP, C/C++, Swift, Dart/Flutter,
Docker. Smart sibling filtering, ancestor exclusion, depth limits, git root caching,
symlink resolution, nested workspace handling, special char support.
55 unit tests, 35 benchmark scenarios, F1=1.0 since run #2.

## Not worth pursuing
- .env references, recently opened in editor, parallel heuristic scanning
