# Accessibility & Human-Centric Design Rules (MANDATORY)

0. **STRICT VERSION NUMBER COMMIT CONVENTION (ABSOLUTE MANDATORY)**:
   - EVERY single git commit message and upload MUST explicitly start with the version number (e.g. `v0.6.25: <Summary>`).
   - NEVER for any reason upload or commit anything starting with generic `feat:`, `fix:`, or any other prefix without the explicit version number at the very start!
   - Keep `package.json` version aligned and incremented.

1. **Zero Descriptors, Subtitles, or Instructional Paragraphs**:
   - NEVER render helper sentences explaining how to use the UI (e.g., *"Click any book to open..."*, *"Each scene covers a specific time window..."*, *"No transcript yet, click Transcribe above..."*).
   - Explanations belong strictly in hover `title="..."` tooltips.

2. **Non-Grandiose Wording (Plain 1-Word Labels or Pure Symbols)**:
   - NEVER use verbose or pompous headings (*"Audiobook Library & Bedside Table"*, *"Chapter Speech-to-Text Transcript"*, *"Chapter Scenes Breakdown"*).
   - Use plain, single-word labels (`Books`, `Chapters`, `Scenes`, `Text`, `Art`, `Voice`, `Generate`, `Settings`, `Info`) or pure symbols.

3. **Big Symbols + Visual Custom UIs**:
   - Prefer **large, high-contrast icons** (`20px–28px`) paired with at most **1 word** and a `title="..."` tooltip.
   - Replace text-heavy status blocks with visual cards, progress rings/bars, and direct icon buttons inside the element being controlled.

4. **Vision & Readability (125%+ Scale)**:
   - ALWAYS use **LARGER IMAGES, LARGER FONTS, LARGER TITLES, AND LARGER BUTTONS** across all views, cards, modals, and navigation.
   - Never use microscopic text (`text-[9px]`, `text-[10px]`) or truncate book titles into unreadable fragments.

5. **Never Ask Users to Type Automated Data**:
   - Live karaoke transcripts require exact audio timestamps from Speech-to-Text. Never offer manual transcript typing/pasting UIs — only show the synced lines or a single `Transcribe` / `Redo` button.

6. **Consistent Clean Book Names, Filters & Sorting Everywhere**:
   - Always strip raw file prefixes (`01 - `, `2012 - `, `[Book 1]`) and canonicalize authors identically across Theater and Media.
   - Always provide **Author**, **Genre**, **Sort**, and **Search** filters on book grids.

7. **Authentic Visuals Only**:
   - Never generate or substitute fake SVG placeholders or Wikipedia summaries when real raster artwork or real Speech-to-Text is expected.

# Live Server & Log Testing Locations (Saved for Future Testing)
- **Direct Local/Tailscale App URL (No Cloudflare Auth Barrier)**: `http://100.74.103.79:3010`
  - Tasks UI: `http://100.74.103.79:3010/tasks`
  - Tasks & Studio Telemetry API: `http://100.74.103.79:3010/api/tasks`
  - Audiobook Studio API: `http://100.74.103.79:3010/api/theater/audiobooks/studio`
- **Public Tasks URL**: `https://schedulearr.flashnas.vip/tasks`
- **Unraid Container Log Terminal**: `http://100.74.103.79/logterminal/Schedulearr.log/`

