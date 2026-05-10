# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project uses `vMajor.Minor.Patch` versioning.

## [Unreleased]

### Added
- Capacitor Android wrapper scaffolding for Android APK support
- PWA manifest, icons, and service worker registration
- `public/index.html` placeholder used by Capacitor Android
- `capacitor.config.ts` with remote `server.url` for hosted web app loading
- `package.json` scripts: `cap:copy`, `cap:sync`, `cap:open`
- `VERSION` file to track current release version

### Fixed
- Android Gradle Kotlin dependency conflict by forcing Kotlin stdlib versions to `1.8.22` in `android/build.gradle`

### Changed
- Android wrapper now loads a local shell page and displays a friendly offline message instead of a generic "Webpage not available" error.

## [0.1.0] - 2026-05-10

### Added
- Initial MLBB Forge web app with sandbox build editor, authentication, sharing, and community features
- Local development instructions and scraper command docs
- Android APK wrapper support via Capacitor
- Basic PWA support for installable web app behavior
