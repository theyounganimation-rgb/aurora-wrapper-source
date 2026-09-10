# Aurora Wrapper and Auri — Source Snapshot

Source snapshot exported September 10, 2026.

This repository shares implementation code, dependency manifests, schemas, and retained third-party license notices. It is a source review snapshot, not a turnkey distribution or a statement that the full system is currently running.

Personal memory, conversation logs, runtime state, health records, credentials, screen recordings, model binaries, backups, and original Git history are excluded. Machine-specific configuration and private identity/context files must be supplied separately to run applicable integrations. References to those local resources may remain in the implementation.

The source was selected from the project tree; setup and runtime behavior have not been validated on a clean machine. No new license grant is added by this publication.

Publication preparation replaces hardcoded personal Telegram identifiers with `0000000000`. Any such values are inactive placeholders requiring local configuration. Named relationship examples in the legacy Aurora wrapper were anonymized. These publication copies do not modify the original systems.

Known source issue: the inherited root package.json identifies a Codex Electron package, while package-lock.json identifies aurora-wrapper. This mismatch existed in the source repository. The snapshot preserves it; resolve the dependency manifest before attempting installation. Large avatar/model assets and runtime captures are not included.
