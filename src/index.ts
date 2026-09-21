import { writeFileSync } from "node:fs";
import { getTVListings } from "./tvlistings.js";
import { buildXmltv } from "./xmltv.js";
import { getConfig } from "./config.js";
import { mergeListings, type MergeListingInput } from "./merge.js";

function isHelp() {
    if (process.argv.includes("--help")) {
        console.log(`
Usage: node dist/index.js [options]

Options:
--help                  Show this help message
--config=FILE           YAML config file for one or more listings
--lineupId=ID           Lineup ID (default: COUNTRY-lineupId-DEFAULT)
--timespan=NUM          Timespan in hours (up to 360 = 15 days, default: 72)
--pref=LIST             User preferences, comma separated. Can be m, p, and h
--country=CON           Country code (default: USA)
--postalCode=ZIP        Postal code (default: -)
--userAgent=UA          Custom user agent string (default: random from bundled list)
--timezone=TZ           Timezone (default: America/New_York)
--outputFile=FILE       Output file name for single-listing mode (default: xmltv.xml)
--appendAsterisk        Append * to titles with <new /> or <live />
--mediaportal           Prioritize xmltv_ns episode-num tags
--nextpvr               Move "channelNo callsign" display-name to first position
--stationid             Sort channels by station ID (legacy behavior)
--sortname              Sort channels alphabetically by call sign/name

Merge options:
--merge                 Also write all listings combined into one XMLTV file
--mergeOutputFile=FILE  Merged output file name (implies --merge, default: merged.xml)
--mergeDedupe=MODE      Which duplicate to keep: first (default) or last
--noKeepIndividual      Skip writing the per-listing files; only write the merged file

When using --config, keep lineupId, country, postalCode, and outputFile in YAML.
Global flags like timespan, userAgent, and XML output flags still override every listing.
Merging dedupes channels by channel ID and programmes by channel and start time.
`);
        process.exit(0);
    }
}

async function main() {
    try {
        isHelp();
        const runtimeConfig = getConfig();
        const { merge } = runtimeConfig;

        if (runtimeConfig.configFile) {
            console.log(`Loaded config file: ${runtimeConfig.configFile}`);
        }

        console.log(`Building XMLTV for ${runtimeConfig.listings.length} listing(s)`);

        const merged: MergeListingInput[] = [];

        for (const listing of runtimeConfig.listings) {
            const label = listing.name || listing.lineupId;
            console.log(`Processing listing: ${label}`);
            console.log(
                `Config: Country=${listing.country}, PostalCode=${listing.postalCode}, OutputFile=${listing.outputFile}`,
            );

            console.log("Fetching TV listings...");
            const data = await getTVListings(listing);
            console.log(`Successfully fetched ${data.channels.length} channels`);

            if (merge.enabled) {
                merged.push({ label, data });
            }

            if (!merge.enabled || merge.keepIndividual) {
                console.log("Building XMLTV content...");
                const xml = buildXmltv(data, listing);

                console.log(`Writing XMLTV to ${listing.outputFile}...`);
                writeFileSync(listing.outputFile, xml, { encoding: "utf-8" });
                console.log(`XMLTV file created successfully for ${label}!`);
            }
        }

        if (merge.enabled) {
            console.log(`Merging ${merged.length} listing(s) (dedupe: ${merge.dedupe})...`);
            const { data, stats } = mergeListings(merged, merge.dedupe);
            console.log(
                `Merged into ${stats.channels} channel(s) and ${stats.programmes} programme(s) ` +
                    `(${stats.mergedChannels} overlapping channel record(s), ` +
                    `${stats.duplicateProgrammes} duplicate programme(s) dropped)`,
            );

            // XML output flags are global, so the first listing's options apply
            // to the combined document.
            const xml = buildXmltv(data, runtimeConfig.listings[0]);

            console.log(`Writing merged XMLTV to ${merge.outputFile}...`);
            writeFileSync(merge.outputFile, xml, { encoding: "utf-8" });
            console.log(`Merged XMLTV file created successfully at ${merge.outputFile}!`);
        }
    } catch (err) {
        console.error("Error fetching or building XMLTV:", err);
        process.exit(1);
    }
}

void main();
