# Changelog

All notable changes to Homebridge CT200 Revived are documented here.

## [2.3.5] - 2026-08-02

### Added

- Added a controlled cache refresh for humidity, localization, away status, target temperatures, and zone modes.
- Added release notes and changelog documentation for npm and Homebridge users.

### Changed

- Serialized Bosch XMPP requests to avoid request spikes against the CT200/Bosch backend.
- HomeKit read handlers now return cached values instead of triggering immediate Bosch XMPP requests.

### Fixed

- Rebuilds the CT200 XMPP client when the stream becomes unhealthy after timeouts, destroyed streams, or connection resets.
- Reduces the chance of repeated `MAX_RETRIES_REACHED`, `REQUEST_TIMEOUT`, and `read ETIMEDOUT` errors causing stale Home app values.

## [2.3.0] - 2026-07-21

### Added

- Initial revived release with Node.js v20/v22/v24 and Homebridge 2 support.
- Migrated Bosch communication to `bosch-xmpp` 2.x on the modern `@xmpp/client` stack.
- Added retry-on-startup behavior so temporary Bosch availability issues do not crash the child bridge.
