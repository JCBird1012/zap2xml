# zap2xml

Automate TV guides to XMLTV format. Easy to use, up-to-date. See below for getting started.

> **A note on this fork:** This project traces back to the original zap2xml work by Jef LeCompte ([@jef](https://github.com/jef)), and this fork also builds on the many improvements Jesse Mann ([@jesmannstl](https://github.com/jesmannstl)) made in his version. I'm maintaining this fork for my own use and will do my best to keep it alive and honor the work that came before it. Thank you to Jef and Jesse for what they contributed.

A version of the original Perl implementation is preserved in the [historical-perl branch](https://github.com/JCBird1012/zap2xml/tree/historical-perl) if you're interested in that.

## Getting started

See the [Wiki](https://github.com/JCBird1012/zap2xml/wiki) for guides on [Installation in node.js](https://github.com/JCBird1012/zap2xml/wiki/Installation), [How to Run](https://github.com/JCBird1012/zap2xml/wiki/How-to-Run), [Scheduling](https://github.com/JCBird1012/zap2xml/wiki/Scheduling), and [using Docker](https://github.com/JCBird1012/zap2xml/wiki/Using-Docker).

Need help? See [Finding a lineup](https://github.com/JCBird1012/zap2xml/wiki/Finding-a-Lineup-ID) or [Dish and DirecTV lineups](https://github.com/JCBird1012/zap2xml/wiki/US-Dish-Directv-Lineups), or drop a line in the [Discussions](https://github.com/JCBird1012/zap2xml/discussions).

## Multi-listing YAML config

Use `--config=path/to/listings.yml` to fetch multiple TV lineups in a single run. See the [Multi-Listing Config](https://github.com/JCBird1012/zap2xml/wiki/Multi-Listing-Config) wiki page for the full YAML format, precedence rules, and Docker setup.

## Recent Updates

### (2025-08-20)

* Changed default Sort option to the Channel Number in Lineup if available
* Added '--stationid' to sort the previous way by StationID
* Added `--sortname` to sort by the Call Sign

### (2025-08-18)

* Changed URL pull to match output from page when stopped working
* Added Display Name with Channel Number and Call Sign to mirror previous Perl Script
* Added `--nextpvr` option to list Channel Number Call Sign first

### (2025-08-09)

* Restored `<episode-num system="dd_progid">` tag that Plex uses that was missing.
* Fixed Sorting so output is listed by Channel ID (common station/gracenote id) then by date/time.

### (2025-08-07)

* Reordered Program fields to match original Perl script output
* `--postalCode` not required as long as Country and lineup Id correct except Over the Air
* Moved `<date>` above `<category>` to match original Perl output.  Corrected where Movie Release Year is properly displayed.
* Added `<length>` tag.
* Updated channel logo no longer has fixed width so can display in better quality

### (2025-08-06)

* Added Valid Country Codes that can be used
* Added `--mediaportal` option to use `<episode-num system="xmltv_ns">` before others so Media Portal will display Season/Episode properly

### Changes from jef's [original](https://github.com/jef/zap2xml) (by [jesmannstl](https://github.com/jesmannstl/zap2xml))

* Added Category if available (Movie, Sports, News, Talk, Family etc)
* Added Category "Series" to all programs that did not return a category
* Added additional Season Episode formats for various players
* Added year as Season for programs that only list an episode number like daily cable news
* Added `<date>` tag to all programs without an aired date normalized to America/New York
* Added xmltv_ns with the date aired as Season YYYY Episode MMYY to Non Movie or Sports with no other Season/Episode like local news so would have the ability to record as Series is most players.
* Added URL to program details from old Perl function.
* Added --appendAsterisk to add * to title on programs that are New and/or Live
* Added `<previously-shown />` tag to programs that are not `<New>` and/or `<Live>`
* Updated `affiliateId` after `orbebb` stopped working
* Updated Docker with these changes use APPEND_ASTERISK: TRUE for the --appendAsterisk option

### Changes in this fork from jessman's [fork](https://github.com/jesmannstl/zap2xml)

* Docker image uses [Bun](https://bun.com) runtime instead of Node.js - smaller image, and probably some (likely unnoticeable with typical use) performance/memory usage improvements!
* Ability to fetch multiple lineups using a single `zap2xml` instance - no longer have to run multiple containers to fetch multiple lineups! (see [Multi-Listing Config](https://github.com/JCBird1012/zap2xml/wiki/Multi-Listing-Config))
