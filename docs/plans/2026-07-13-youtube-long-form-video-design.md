# PreviewShip YouTube Long-Form Video Design

## Objective

Render the two existing English long-form publishing packages as complete, upload-ready MP4 videos while preserving their editorial, non-advertising tone.

## Approved Direction

Use a technical editorial-documentary format rather than a product demo or a kinetic-typography slideshow.

- 1920×1080, 30 fps, H.264 video with AAC stereo audio.
- Approximately 6–7 minutes per video, sized to the final narration rather than padded to a fixed runtime.
- English macOS `Samantha` narration for consistency with the existing Shorts.
- Sentence-level English captions stored as Remotion `Caption` JSON and burned into the video.
- A meaningful visual change every 6–12 seconds.
- Actual PreviewShip pages appear only when the narration refers to PreviewShip or its concrete workflow.
- Neutral diagrams, browser mockups, code/diff views, checklists, and existing editorial illustrations carry the conceptual sections.
- No pricing, urgency, conversion CTA, unverified performance claims, or background music with licensing risk.

## Visual System

The videos translate the current live-site language into a long-form editorial system:

- warm off-white and near-black surfaces;
- restrained blue, violet, green, amber, and pink glows;
- terminal and browser-inspired focal cards;
- a subtle technical grid;
- large, short headlines rather than dense dashboard layouts;
- chapter labels, a slim progress line, and a small `WORKFLOW NOTES` series marker.

Important text stays at least 100 px from the top and bottom and 120 px from the sides. Captions occupy a reserved lower-third slot and never compete with chapter labels or focal visuals.

## Video 01 Structure

`Why Screenshots Are a Bad Review Format for Interactive HTML`

1. Cold open: generated dashboard and the mismatch between an interactive artifact and a static review medium.
2. What screenshots remove: time, input, environment, responsive states, focus, and browser errors.
3. Handoff problem: screenshots, code blocks, file attachments, and oversized deployment pipelines.
4. Infrastructure fit: production responsibilities versus static review objects.
5. Five-step loop: build, inspect, remove sensitive data, publish, and ask behavior-oriented questions.
6. Valid screenshot use cases: thumbnails, annotations, comparisons, and state evidence.
7. Close: use a browser URL when behavior matters, followed by an editorial question.

PreviewShip footage is limited to the infrastructure-fit and workflow sections.

## Video 02 Structure

`AI Coding Context Is Becoming a Work Artifact`

1. Cold open: the final diff versus the path that produced it.
2. What a diff leaves out: constraints, failed attempts, commands, diagnosis, and deliberate non-changes.
3. Artifact boundary: useful visible context versus hidden context, raw output, attachments, and secrets.
4. Tool differences: a visible Codex conversation and a filtered Claude Code JSONL workflow.
5. Five-step safety check: need, scope, filter, render, and review.
6. Appropriate use: debugging notes, PR context, implementation records, and async handoffs.
7. Close: preserve context only when it earns durable project status.

Any session data shown in the video is fictional or taken from purpose-built editorial assets. No real credentials, customer data, private paths, or raw personal transcripts appear.

## Audio and Caption Pipeline

1. Extract narration from the approved Markdown scripts.
2. Split it into sentence-level clips while preserving chapter membership.
3. Generate each clip with macOS `say` using the English `Samantha` voice.
4. Normalize clips, add small deterministic pauses, and concatenate them into one MP3 per video.
5. Record exact clip start and end times as JSON captions and chapter metadata.
6. Size the Remotion composition from the generated timing manifest.

This pipeline avoids estimated caption timing and keeps the video, narration, chapter boundaries, and burned-in text synchronized.

## Remotion Architecture

- Add two 16:9 compositions to the existing independent Remotion project.
- Use one reusable `LongFormVideo` component driven by separate content/timing manifests.
- Use a small set of reusable visual primitives: title card, browser comparison, animated state list, handoff flow, responsibility split, checklist, transcript/diff comparison, privacy filter, rendered-page frame, and closing question.
- Use `Series`/`Sequence` with premounting for deterministic chapter and shot scheduling.
- Animate only through frame-based `interpolate()` calls; no CSS transitions or CSS animations.
- Keep live-site screenshots and generated assets inside `public/long-form-assets` and load them with `staticFile()` and `<Img>`.

## Failure Handling

- The voiceover generator fails with a clear message if `say`, FFmpeg, a script section, or an output duration is missing.
- The renderer uses only local assets after preparation; a network outage cannot break final rendering.
- Captions are generated from the same sentence list as narration, preventing missing-text drift.
- If a live-page screenshot cannot be refreshed, the last verified local capture remains available and is labeled by its capture date in production notes.

## Verification

- ESLint and TypeScript checks.
- Representative frame renders from every chapter at full 1920×1080 resolution.
- Contact sheets for rapid visual review of both complete timelines.
- FFprobe verification of codec, resolution, frame rate, audio stream, and duration.
- Full FFmpeg decode of both MP4 files.
- Silence/loudness checks for narration.
- Manual checks that captions remain inside the safe area and that PreviewShip claims match `SITE-REFERENCE.md`.

## Deliverables

- `operation/0706/youtube/long-form/renders/01-why-screenshots-are-a-bad-review-format.mp4`
- `operation/0706/youtube/long-form/renders/02-ai-coding-context-is-a-work-artifact.mp4`
- narration MP3 files, Caption JSON, timing manifests, chapter contact sheets, source code, and updated publishing documentation.
