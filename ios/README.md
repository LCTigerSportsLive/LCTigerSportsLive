# Tiger Sports Live for iPhone and iPad

This is a **native SwiftUI iOS starter app** in the existing Tiger Sports Live repository. It is not an App Store release yet.

## What works

- Native orange-and-black Home, Game Day, Scores, Teams and More tabs.
- Live video discovery from the same `/api/live` endpoint as the website, with an embedded YouTube player when a broadcast is verified live and a YouTube fallback link.
- Native Press Row football scoreboard using `/api/v1/pressrow/gridiron`, with 20-second foreground polling and automatic hiding when `activeGame` is false. The existing provider's game-state heuristic still applies.
- Native team directory from `/api/v1/teams`, with links to the current roster pages.
- News & Events, Trivia, Athletics Calendar and Members pages in a secure in-app web view.
- Share sheet, pull-to-refresh and external YouTube links.

The app makes HTTPS requests to the existing Railway deployment; no Press Row credentials or YouTube API keys are stored on the device. The website remains the source of truth for schedules, rosters and stories.

## Build on a Mac

1. Install **Xcode 16 or newer** and XcodeGen (`brew install xcodegen`).
2. From the repository root run `bash ios/scripts/bootstrap.sh`. This generates the temporary branded icon and the Xcode project.
3. Open `ios/TigerSportsLive.xcodeproj` in Xcode.
4. Choose an iPhone simulator and press Run.
5. For a real iPhone, select the TigerSportsLive target → Signing & Capabilities, choose your Apple Developer Team, and use a bundle identifier assigned to your team.

You can also use the GitHub Actions **iOS Simulator Build** workflow to compile the app without Apple signing credentials.

## Before TestFlight / App Store

- Enroll in the Apple Developer Program, configure a unique bundle ID and signing team, and archive the app in Xcode.
- Replace the generated **temporary TSL icon** with your approved Tiger Sports Live artwork. Add screenshots, app description, support URL and a published privacy policy in App Store Connect.
- Test YouTube playback, game detection, live scores, all linked pages, offline/error behavior, and navigation on a physical iPhone.
- Check Apple's minimum-functionality / web-content guidelines: the app includes native navigation, scorecards and live state, but approval is determined by App Review.
- Push notifications and Live Activities are **not included** in this initial version. They require additional server infrastructure, Apple capabilities, device registration and permission handling.

## Architecture

- `TigerSportsLiveApp.swift`: SwiftUI tabs and foreground polling.
- `SportsStore.swift`: async HTTPS API client.
- `Models.swift`: typed feed, team and live-video data.
- `Views.swift`: native screens and scoreboard.
- `WebViews.swift`: web content and YouTube playback.
- `AppConfig.swift`: backend and channel URLs.
- `project.yml`: XcodeGen project spec.
- `scripts/bootstrap.sh`: generates project and temporary icon.

The production backend is set in `AppConfig.baseURL`. When you switch domains, update that URL and rebuild the iOS app.
