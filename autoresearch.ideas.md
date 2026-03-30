# Autoresearch Ideas: Directory Suggestions

## Remaining ideas (very niche / diminishing returns)
- **Bazel/Buck targets**: Parse BUILD files for local dep references — very niche ecosystem
- **Import graph analysis**: Parse actual import statements — complex, slow, fragile
- **Elixir mix.exs path deps**: Parse `{:dep, path: "..."}` — niche, umbrella already covered by sibling heuristic

## Exhaustively completed ✅
All major ecosystems are covered (15 languages/tools). See autoresearch.md and git log for full details.
53 unit tests, 33 benchmark scenarios, F1=1.0.

## Not worth pursuing
- .env references, recently opened in editor, parallel heuristic scanning
