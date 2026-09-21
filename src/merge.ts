import type { Channel, Event, GridApiResponse } from "./tvlistings.js";

/**
 * Which record wins when two listings provide a programme for the same
 * channel and start time. Mirrors tvmerge's `--dedupe first|last`.
 */
export type DedupeMode = "first" | "last";

export interface MergeListingInput {
    /** Label used in log output (listing name or lineupId). */
    label: string;
    data: GridApiResponse;
}

export interface MergeStats {
    listings: number;
    channels: number;
    programmes: number;
    duplicateProgrammes: number;
    mergedChannels: number;
}

export interface MergeResult {
    data: GridApiResponse;
    stats: MergeStats;
}

/**
 * Dedupe key for a programme. tvmerge keys on `start::channel` only, so two
 * listings carrying the same slot collapse into one entry even if their
 * metadata differs slightly. Callers group by channel already, so the key is
 * just the start time.
 *
 * Start times are normalized to epoch milliseconds where parseable: separate
 * lineups can express the same instant with different strings (trailing "Z"
 * versus an explicit offset), and those must collide rather than both survive.
 */
export function programmeKey(event: Event): string {
    const parsed = new Date(event.startTime).getTime();
    return Number.isNaN(parsed) ? `raw:${event.startTime}` : `ts:${parsed}`;
}

/**
 * Prefer whichever channel record carries more metadata. Different lineups
 * describe the same station with varying completeness (a channelNo in one
 * feed, an affiliateName in another), so we keep the richer fields rather
 * than blindly taking the first or last.
 *
 * These use `||` rather than `??` because the rest of the codebase treats an
 * empty string as absent for these fields (`buildChannelsXml` guards each with
 * a truthiness check, and `channelComparator` normalizes channelNo via
 * `(a.channelNo || "").trim()`). A feed that reports "" instead of null must
 * still inherit the real value, otherwise the merged channel would silently
 * lose its number, affiliate name, or icon.
 */
function mergeChannelMetadata(existing: Channel, incoming: Channel): Channel {
    return {
        ...existing,
        callSign: existing.callSign || incoming.callSign,
        affiliateName: existing.affiliateName || incoming.affiliateName,
        affiliateCallSign: existing.affiliateCallSign || incoming.affiliateCallSign,
        channelNo: existing.channelNo || incoming.channelNo,
        thumbnail: existing.thumbnail || incoming.thumbnail,
        stationGenres: existing.stationGenres?.length ? existing.stationGenres : incoming.stationGenres,
        stationFilters: existing.stationFilters?.length ? existing.stationFilters : incoming.stationFilters,
    };
}

/**
 * Combine several listings' grid data into a single response.
 *
 * Channels are keyed by `channelId`, so the same station appearing in
 * multiple lineups yields one `<channel>` element with its programmes
 * pooled. Programmes are then deduped per channel by start time.
 */
export function mergeListings(inputs: MergeListingInput[], dedupe: DedupeMode = "first"): MergeResult {
    const channels = new Map<string, Channel>();
    // Per-channel programme index, preserving insertion order for stable output.
    const events = new Map<string, Map<string, Event>>();

    let duplicateProgrammes = 0;
    let mergedChannels = 0;

    for (const { data } of inputs) {
        for (const channel of data.channels) {
            const id = channel.channelId;
            const existing = channels.get(id);

            if (existing) {
                channels.set(id, mergeChannelMetadata(existing, channel));
                mergedChannels++;
            } else {
                channels.set(id, { ...channel, events: [] });
                events.set(id, new Map<string, Event>());
            }

            const channelEvents = events.get(id)!;

            for (const event of channel.events) {
                const key = programmeKey(event);

                if (channelEvents.has(key)) {
                    duplicateProgrammes++;
                    // "first" keeps the record already stored; "last" overwrites it.
                    if (dedupe === "last") {
                        channelEvents.set(key, event);
                    }
                    continue;
                }

                channelEvents.set(key, event);
            }
        }
    }

    let programmes = 0;
    const mergedChannelList: Channel[] = [];

    for (const [id, channel] of channels) {
        const channelEvents = Array.from(events.get(id)?.values() ?? []);
        programmes += channelEvents.length;
        mergedChannelList.push({ ...channel, events: channelEvents });
    }

    return {
        data: { channels: mergedChannelList },
        stats: {
            listings: inputs.length,
            channels: mergedChannelList.length,
            programmes,
            duplicateProgrammes,
            mergedChannels,
        },
    };
}
