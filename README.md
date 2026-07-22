# deep-search-core

Shared deep research orchestration, search providers, and page extraction.

This package merges the previous `research-orchestrator` and `@deep-search/search-extract` packages into one core package with subpath exports:

```ts
import { createGuardedStream } from "deep-search-core/research-orchestrator";
import { createSearchExtractEngine } from "deep-search-core/search-extract";
```

## License

[MIT](./LICENSE) © 2026 Florian Herrengt
