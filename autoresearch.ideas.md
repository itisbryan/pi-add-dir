# Autoresearch Ideas: Directory Suggestions

## Deferred optimizations
- **Lerna/Nx support**: Parse `lerna.json` or `nx.json` for workspace config (currently relies on package.json workspaces which Lerna/Nx often use too)
- **Docker compose references**: Parse `docker-compose.yml` for `build.context` paths pointing to sibling services
- **Bazel/Buck targets**: Parse BUILD files for local dependency references
- **.env references**: Scan `.env` files for paths to config/secret directories
- **Recently opened in editor**: Read VS Code/Cursor recent workspaces for cross-project suggestions
- **Import graph analysis**: Parse actual import statements to find referenced paths (complex, slow)
- **Caching git root lookups**: `findGitRoot` walks up for every sibling — cache result per parent dir
- **Parallel sibling scanning**: Use `Promise.all` for multiple independent heuristic collectors (currently serial, but each is <1ms)
