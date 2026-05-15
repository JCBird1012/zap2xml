import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingConfig } from "./config.js";
import type { GridApiResponse } from "./tvlistings.js";
import { getTVListings } from "./tvlistings.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockConfig: ListingConfig = {
  baseUrl: "https://tvlistings.gracenote.com/api/grid",
  lineupId: "USA-GA42500-X",
  headendId: "GA42500",
  timespan: "6",
  country: "USA",
  postalCode: "30309",
  pref: "",
  timezone: "America/New_York",
  userAgent: "UnitTestAgent/1.0",
  outputFile: "xmltv.xml",
  appendAsterisk: false,
  mediaportal: false,
  nextpvr: false,
  stationid: false,
  sortname: false,
};

const mockGridApiResponse: GridApiResponse = {
  channels: [
    {
      callSign: "KOMODT",
      affiliateName: "AMERICAN BROADCASTING COMPANY",
      affiliateCallSign: null,
      channelId: "19629",
      channelNo: "4.1",
      events: [
        {
          callSign: "KOMODT",
          duration: "60",
          startTime: "2025-07-18T19:00:00Z",
          endTime: "2025-07-18T20:00:00Z",
          thumbnail: "p30687311_b_v13_aa",
          channelNo: "4.1",
          filter: ["filter-news"],
          seriesId: "SH05918266",
          rating: "TV-PG",
          flag: ["New"],
          tags: ["Stereo", "CC"],
          program: {
            title: "GMA3",
            id: "EP059182660025",
            tmsId: "EP059182660025",
            shortDesc:
              "BIA performs; comic Zarna Garg; lifestyle contributor Lori Bergamotto; ABC News chief medical correspondent Dr. Tara Narula.",
            season: "5",
            releaseYear: null,
            episode: "217",
            episodeTitle: "Special Episode",
            seriesId: "SH05918266",
            isGeneric: "0",
          },
        },
      ],
      id: "196290",
      stationGenres: [false],
      stationFilters: ["filter-news", "filter-talk"],
      thumbnail:
        "//zap2it.tmsimg.com/h3/NowShowing/19629/s28708_ll_h15_ac.png?w=55",
    },
  ],
};

describe("getTVListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully fetch TV listings", async () => {
    // Mock successful response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGridApiResponse,
    });

    const result = await getTVListings(mockConfig);

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].callSign).toBe("KOMODT");
    expect(result.channels[0].events[0].program.genres).toEqual(["news"]);
  });

  it("should include a User-Agent header in the request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGridApiResponse,
    });

    await getTVListings(mockConfig);

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers["User-Agent"]).toBeDefined();
    expect(typeof headers["User-Agent"]).toBe("string");
    expect(headers["User-Agent"].length).toBeGreaterThan(0);
  });

  it("should use the configured User-Agent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockGridApiResponse,
    });

    await getTVListings(mockConfig);

    const callArgs = mockFetch.mock.calls[0];
    const userAgent = callArgs[1].headers["User-Agent"];
    expect(userAgent).toBe(mockConfig.userAgent);
  });

  it("should throw an error when response is not ok (4xx status)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Requested lineup was not found",
    });

    await expect(getTVListings(mockConfig)).rejects.toThrow(
      /Failed to fetch URL .*: 404 Not Found - Requested lineup was not found\.\.\./,
    );
  });

  it("should throw an error when response is not ok (5xx status)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Upstream service failed",
    });

    await expect(getTVListings(mockConfig)).rejects.toThrow(
      /Failed to fetch URL .*: 500 Internal Server Error - Upstream service failed\.\.\./,
    );
  });

  it("should throw an error when response is not ok (3xx status)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 301,
      statusText: "Moved Permanently",
      text: async () => "Redirects are not followed here",
    });

    await expect(getTVListings(mockConfig)).rejects.toThrow(
      /Failed to fetch URL .*: 301 Moved Permanently - Redirects are not followed here\.\.\./,
    );
  });

  it("should handle empty channels array", async () => {
    const emptyResponse: GridApiResponse = {
      channels: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => emptyResponse,
    });

    const result = await getTVListings(mockConfig);
    expect(result).toEqual(emptyResponse);
    expect(result.channels).toHaveLength(0);
  });

  it("should handle multiple channels in response", async () => {
    const multiChannelResponse: GridApiResponse = {
      channels: [
        {
          callSign: "KOMODT",
          affiliateName: "AMERICAN BROADCASTING COMPANY",
          affiliateCallSign: null,
          channelId: "19629",
          channelNo: "4.1",
          events: [],
          id: "196290",
          stationGenres: [],
          stationFilters: [],
          thumbnail: "",
        },
        {
          callSign: "KOMODT2",
          affiliateName: "AMERICAN BROADCASTING COMPANY",
          affiliateCallSign: null,
          channelId: "19630",
          channelNo: "4.2",
          events: [],
          id: "196300",
          stationGenres: [],
          stationFilters: [],
          thumbnail: "",
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => multiChannelResponse,
    });

    const result = await getTVListings(mockConfig);
    expect(result.channels).toHaveLength(2);
    expect(result.channels[0].callSign).toBe("KOMODT");
    expect(result.channels[1].callSign).toBe("KOMODT2");
  });

  it("should handle network errors", async () => {
    const networkError = new Error("Network error");
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(getTVListings(mockConfig)).rejects.toThrow("Network error");
  });

  it("should handle JSON parsing errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    await expect(getTVListings(mockConfig)).rejects.toThrow("Invalid JSON");
  });

  it("should handle malformed JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });

    await expect(getTVListings(mockConfig)).rejects.toThrow(
      "Unexpected token < in JSON at position 0",
    );
  });
});
