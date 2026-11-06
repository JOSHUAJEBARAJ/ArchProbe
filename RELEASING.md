# Publish the first local preview

Release target: **v0.1.0 — Local preview**, published as a GitHub pre-release with source archives. This is not a public web deployment or a package-registry release.

The README, release notes, and frontend/backend version metadata are prepared. Further evaluation, recovery acceptance, and latency measurements are deferred by Joshua. They must not be presented as completed in the release description.

## Commit and tag

From the repository root, review `git status --short` and then run:

```bash
git add -A
git commit -m "Prepare v0.1.0 local preview release"
git tag -a v0.1.0 -m "ArchProbe v0.1.0 - local preview"
git push origin main v0.1.0
```

No co-author trailer is included. Do not overwrite an existing tag; these commands are for the first publication of `v0.1.0`.

## Publish on GitHub

1. Open [New release](https://github.com/JOSHUAJEBARAJ/ArchProbe/releases/new?tag=v0.1.0).
2. Select the pushed `v0.1.0` tag.
3. Use the title **ArchProbe v0.1.0 — Local preview**.
4. Copy the contents of `RELEASE_NOTES.md` into the description. For the GitHub release description, change its relative README link to `https://github.com/JOSHUAJEBARAJ/ArchProbe/blob/v0.1.0/README.md`.
5. Mark **Set as a pre-release** and publish.

GitHub generates source ZIP and tar archives for the tag. No model binaries, recordings, databases, credentials, or local build folders should be attached. Users download the Whisper model separately using the README.

After publication, the release should appear at https://github.com/JOSHUAJEBARAJ/ArchProbe/releases/tag/v0.1.0. A local commit or tag alone does not mean the GitHub release is published.
