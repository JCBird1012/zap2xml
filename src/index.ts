import { writeFileSync } from "node:fs";
import { getTVListings } from "./tvlistings.js";
import { buildXmltv } from "./xmltv.js";
import { getConfig } from "./config.js";

function isHelp() {
  if (process.argv.includes("--help")) {
    console.log(`
Usage: node dist/index.js [options]

Options:
--help             Show this help message
--config=FILE      YAML config file for one or more listings
--lineupId=ID      Lineup ID (default: COUNTRY-lineupId-DEFAULT)
--timespan=NUM     Timespan in hours (up to 360 = 15 days, default: 72)
--pref=LIST        User preferences, comma separated. Can be m, p, and h
--country=CON      Country code (default: USA)
--postalCode=ZIP   Postal code (default: -)
--userAgent=UA     Custom user agent string (default: random from bundled list)
--timezone=TZ      Timezone (default: America/New_York)
--outputFile=FILE  Output file name for single-listing mode (default: xmltv.xml)
--appendAsterisk   Append * to titles with <new /> or <live />
--mediaportal      Prioritize xmltv_ns episode-num tags
--nextpvr          Move "channelNo callsign" display-name to first position
--stationid        Sort channels by station ID (legacy behavior)
--sortname         Sort channels alphabetically by call sign/name

When using --config, keep lineupId, country, postalCode, and outputFile in YAML.
Global flags like timespan, userAgent, and XML output flags still override every listing.
`);
    process.exit(0);
  }
}

async function main() {
  try {
    isHelp();
    const runtimeConfig = getConfig();

    if (runtimeConfig.configFile) {
      console.log(`Loaded config file: ${runtimeConfig.configFile}`);
    }

    console.log(`Building XMLTV for ${runtimeConfig.listings.length} listing(s)`);

    for (const listing of runtimeConfig.listings) {
      const label = listing.name || listing.lineupId;
      console.log(`Processing listing: ${label}`);
      console.log(
        `Config: Country=${listing.country}, PostalCode=${listing.postalCode}, OutputFile=${listing.outputFile}`,
      );

      console.log("Fetching TV listings...");
      const data = await getTVListings(listing);
      console.log(`Successfully fetched ${data.channels.length} channels`);

      console.log("Building XMLTV content...");
      const xml = buildXmltv(data, listing);

      console.log(`Writing XMLTV to ${listing.outputFile}...`);
      writeFileSync(listing.outputFile, xml, { encoding: "utf-8" });
      console.log(`XMLTV file created successfully for ${label}!`);
    }
  } catch (err) {
    console.error("Error fetching or building XMLTV:", err);
    process.exit(1);
  }
}

void main();
