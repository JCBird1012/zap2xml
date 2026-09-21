import { describe, expect, it } from "vitest";
import type { Channel, Event, GridApiResponse } from "./tvlistings.js";
import { mergeListings, programmeKey } from "./merge.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
    return {
        callSign: "KOMODT",
        duration: "60",
        startTime: "2025-07-18T19:00:00Z",
        endTime: "2025-07-18T20:00:00Z",
        thumbnail: null,
        channelNo: "4.1",
        seriesId: "SH05918266",
        rating: "TV-PG",
        flag: [],
        tags: [],
        ...overrides,
        program: {
            title: "GMA3",
            id: "EP059182660025",
            tmsId: "EP059182660025",
            shortDesc: null,
            season: "5",
            releaseYear: null,
            episode: "217",
            episodeTitle: null,
            seriesId: "SH05918266",
            isGeneric: "0",
            ...overrides.program,
        },
    };
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
    return {
        callSign: "KOMODT",
        affiliateName: null,
        affiliateCallSign: null,
        channelId: "19629",
        channelNo: "4.1",
        events: [],
        id: "196290",
        stationGenres: [],
        stationFilters: [],
        thumbnail: null,
        ...overrides,
    };
}

function listing(label: string, channels: Channel[]): { label: string; data: GridApiResponse } {
    return { label, data: { channels } };
}

describe("programmeKey", () => {
    it("treats equivalent timestamps in different formats as the same slot", () => {
        const a = makeEvent({ startTime: "2025-07-18T19:00:00Z" });
        const b = makeEvent({ startTime: "2025-07-18T15:00:00-04:00" });

        expect(programmeKey(a)).toBe(programmeKey(b));
    });

    it("falls back to the raw value for unparseable timestamps", () => {
        const event = makeEvent({ startTime: "not-a-date" });

        expect(programmeKey(event)).toBe("raw:not-a-date");
    });

    it("distinguishes different start times", () => {
        const a = makeEvent({ startTime: "2025-07-18T19:00:00Z" });
        const b = makeEvent({ startTime: "2025-07-18T20:00:00Z" });

        expect(programmeKey(a)).not.toBe(programmeKey(b));
    });
});

describe("mergeListings", () => {
    it("combines distinct channels from multiple listings", () => {
        const result = mergeListings([
            listing("atlanta", [makeChannel({ channelId: "1", events: [makeEvent()] })]),
            listing("ottawa", [makeChannel({ channelId: "2", events: [makeEvent()] })]),
        ]);

        expect(result.data.channels).toHaveLength(2);
        expect(result.stats.channels).toBe(2);
        expect(result.stats.listings).toBe(2);
        expect(result.stats.programmes).toBe(2);
        expect(result.stats.duplicateProgrammes).toBe(0);
    });

    it("pools programmes for a channel present in two listings", () => {
        const result = mergeListings([
            listing("a", [makeChannel({ channelId: "1", events: [makeEvent({ startTime: "2025-07-18T19:00:00Z" })] })]),
            listing("b", [makeChannel({ channelId: "1", events: [makeEvent({ startTime: "2025-07-18T20:00:00Z" })] })]),
        ]);

        expect(result.data.channels).toHaveLength(1);
        expect(result.data.channels[0]!.events).toHaveLength(2);
        expect(result.stats.mergedChannels).toBe(1);
    });

    it("drops duplicate programmes sharing a channel and start time", () => {
        const result = mergeListings([
            listing("a", [makeChannel({ channelId: "1", events: [makeEvent()] })]),
            listing("b", [makeChannel({ channelId: "1", events: [makeEvent()] })]),
        ]);

        expect(result.data.channels[0]!.events).toHaveLength(1);
        expect(result.stats.duplicateProgrammes).toBe(1);
        expect(result.stats.programmes).toBe(1);
    });

    it("keeps the first duplicate by default", () => {
        const result = mergeListings([
            listing("a", [
                makeChannel({
                    channelId: "1",
                    events: [makeEvent({ program: { title: "First" } as Event["program"] })],
                }),
            ]),
            listing("b", [
                makeChannel({
                    channelId: "1",
                    events: [makeEvent({ program: { title: "Second" } as Event["program"] })],
                }),
            ]),
        ]);

        expect(result.data.channels[0]!.events[0]!.program.title).toBe("First");
    });

    it("keeps the last duplicate when dedupe is 'last'", () => {
        const result = mergeListings(
            [
                listing("a", [
                    makeChannel({
                        channelId: "1",
                        events: [makeEvent({ program: { title: "First" } as Event["program"] })],
                    }),
                ]),
                listing("b", [
                    makeChannel({
                        channelId: "1",
                        events: [makeEvent({ program: { title: "Second" } as Event["program"] })],
                    }),
                ]),
            ],
            "last",
        );

        expect(result.data.channels[0]!.events[0]!.program.title).toBe("Second");
    });

    it("does not dedupe identical start times across different channels", () => {
        const result = mergeListings([
            listing("a", [
                makeChannel({ channelId: "1", events: [makeEvent()] }),
                makeChannel({ channelId: "2", events: [makeEvent()] }),
            ]),
        ]);

        expect(result.stats.duplicateProgrammes).toBe(0);
        expect(result.stats.programmes).toBe(2);
    });

    it("fills in missing channel metadata from a later listing", () => {
        const result = mergeListings([
            listing("a", [makeChannel({ channelId: "1", channelNo: null, affiliateName: null, thumbnail: null })]),
            listing("b", [
                makeChannel({
                    channelId: "1",
                    channelNo: "4.1",
                    affiliateName: "ABC",
                    thumbnail: "//example.com/logo.png",
                }),
            ]),
        ]);

        const channel = result.data.channels[0]!;
        expect(channel.channelNo).toBe("4.1");
        expect(channel.affiliateName).toBe("ABC");
        expect(channel.thumbnail).toBe("//example.com/logo.png");
    });

    it("does not let a later listing overwrite existing channel metadata", () => {
        const result = mergeListings([
            listing("a", [makeChannel({ channelId: "1", channelNo: "4.1", affiliateName: "ABC" })]),
            listing("b", [makeChannel({ channelId: "1", channelNo: "9.9", affiliateName: "NBC" })]),
        ]);

        const channel = result.data.channels[0]!;
        expect(channel.channelNo).toBe("4.1");
        expect(channel.affiliateName).toBe("ABC");
    });

    it("returns an empty result for no listings", () => {
        const result = mergeListings([]);

        expect(result.data.channels).toEqual([]);
        expect(result.stats).toEqual({
            listings: 0,
            channels: 0,
            programmes: 0,
            duplicateProgrammes: 0,
            mergedChannels: 0,
        });
    });

    it("does not mutate the input listings", () => {
        const source = makeChannel({ channelId: "1", events: [makeEvent()] });
        const inputs = [listing("a", [source]), listing("b", [makeChannel({ channelId: "1", events: [makeEvent()] })])];

        mergeListings(inputs);

        expect(source.events).toHaveLength(1);
        expect(inputs[0]!.data.channels[0]!.events).toHaveLength(1);
    });
});
