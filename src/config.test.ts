import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig, getHeadendId, processLineupId } from "./config.js";

const originalArgv = [...process.argv];
const trackedEnvVars = [
    "APPEND_ASTERISK",
    "CONFIG_FILE",
    "COUNTRY",
    "LINEUP_ID",
    "MEDIA_PORTAL",
    "MERGE",
    "MERGE_DEDUPE",
    "MERGE_KEEP_INDIVIDUAL",
    "MERGE_OUTPUT_FILE",
    "NEXTPVR",
    "OUTPUT_FILE",
    "POSTAL_CODE",
    "PREF",
    "SORTNAME",
    "STATIONID",
    "TIMESPAN",
    "TZ",
    "USER_AGENT",
];

const tempDirs: string[] = [];

function clearEnv(): void {
    for (const key of trackedEnvVars) {
        delete process.env[key];
    }
}

function createConfigFile(contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), "zap2xml-config-"));
    const filePath = join(dir, "listings.yml");
    writeFileSync(filePath, contents, { encoding: "utf-8" });
    tempDirs.push(dir);
    return filePath;
}

beforeEach(() => {
    process.argv = [...originalArgv];
    clearEnv();
});

afterEach(() => {
    process.argv = [...originalArgv];
    clearEnv();

    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("processLineupId", () => {
    it("returns env LINEUP_ID if set", () => {
        process.env.LINEUP_ID = "USA-12345";
        expect(processLineupId()).toBe("USA-12345");
        delete process.env.LINEUP_ID;
    });

    it("returns argv --lineupId if set", () => {
        process.argv.push("--lineupId=USA-54321");
        expect(processLineupId()).toBe("USA-54321");
    });

    it("prefers argv --lineupId over env LINEUP_ID", () => {
        process.env.LINEUP_ID = "USA-11111";
        process.argv.push("--lineupId=USA-54321");
        expect(processLineupId()).toBe("USA-54321");
    });

    it("returns default if nothing set", () => {
        expect(processLineupId()).toBe("USA-lineupId-DEFAULT");
    });

    it("returns default if lineupId contains OTA", () => {
        process.env.LINEUP_ID = "USA-OTA12345";
        expect(processLineupId()).toBe("USA-lineupId-DEFAULT");
        delete process.env.LINEUP_ID;
    });
});

describe("getHeadendId", () => {
    it("extracts headend from valid lineupId", () => {
        expect(getHeadendId("USA-OTA12345")).toBe("lineupId");
        expect(getHeadendId("USA-NY31587-L")).toBe("NY31587");
        expect(getHeadendId("CAN-OTAT1L0A1")).toBe("lineupId");
        expect(getHeadendId("CAN-0008861-X")).toBe("0008861");
    });

    it("returns 'lineup' if no match", () => {
        expect(getHeadendId("INVALID")).toBe("lineup");
        expect(getHeadendId("")).toBe("lineup");
    });
});

describe("getConfig", () => {
    it("merges YAML defaults, listing overrides, env, and CLI overrides", () => {
        const configFile = createConfigFile(`
defaults:
  timespan: 72
  country: USA
  appendAsterisk: true
  userAgent: Config User Agent

listings:
  - name: atlanta
    lineupId: USA-GA42500-X
    postalCode: "30309"
    outputFile: atlanta.xml

  - name: ottawa
    lineupId: CAN-0008861-X
    country: CAN
    postalCode: K1A0B1
    timespan: 48
    outputFile: ottawa.xml
`);

        process.env.USER_AGENT = "Env User Agent";
        process.argv.push(`--config=${configFile}`, "--timespan=24", "--sortname");

        const config = getConfig();

        expect(config.configFile).toBe(configFile);
        expect(config.listings).toHaveLength(2);
        expect(config.listings[0]).toMatchObject({
            name: "atlanta",
            country: "USA",
            timespan: "24",
            appendAsterisk: true,
            sortname: true,
            userAgent: "Env User Agent",
            outputFile: "atlanta.xml",
        });
        expect(config.listings[1]).toMatchObject({
            name: "ottawa",
            country: "CAN",
            timespan: "24",
            appendAsterisk: true,
            sortname: true,
            userAgent: "Env User Agent",
            outputFile: "ottawa.xml",
        });
    });

    it("coerces YAML scalar values and applies listing overrides", () => {
        const configFile = createConfigFile(`
defaults:
  timespan: 72
  postalCode: 30309
  appendAsterisk: true
  mediaportal: false

listings:
  - lineupId: USA-GA42500-X
    outputFile: atlanta.xml
    timespan: 48
    stationid: true
`);

        process.argv.push(`--config=${configFile}`);

        const config = getConfig();

        expect(config.listings).toHaveLength(1);
        expect(config.listings[0]).toMatchObject({
            lineupId: "USA-GA42500-X",
            country: "USA",
            postalCode: "30309",
            timespan: "48",
            appendAsterisk: true,
            mediaportal: false,
            stationid: true,
            outputFile: "atlanta.xml",
        });
    });

    it("rejects listing-specific CLI overrides when using YAML", () => {
        const configFile = createConfigFile(`
listings:
  - lineupId: USA-GA42500-X
    country: USA
    postalCode: "30309"
    outputFile: atlanta.xml
`);

        process.argv.push(`--config=${configFile}`, "--lineupId=USA-OVERRIDE");

        expect(() => getConfig()).toThrow("Cannot combine --config with listing-specific overrides");
    });

    it("rejects duplicate output files in multi-listing mode", () => {
        const configFile = createConfigFile(`
defaults:
  outputFile: xmltv.xml

listings:
  - lineupId: USA-GA42500-X
    country: USA
    postalCode: "30309"
  - lineupId: CAN-0008861-X
    country: CAN
    postalCode: K1A0B1
`);

        process.argv.push(`--config=${configFile}`);

        expect(() => getConfig()).toThrow("Multiple listings resolve to the same outputFile");
    });

    it("rejects invalid YAML field values", () => {
        const configFile = createConfigFile(`
listings:
  - lineupId: USA-GA42500-X
    country: USA
    postalCode: "30309"
    outputFile: atlanta.xml
    appendAsterisk: maybe
`);

        process.argv.push(`--config=${configFile}`);

        expect(() => getConfig()).toThrow(/Invalid config file .*Expected \(boolean \| "" \| string\)/);
    });
});

describe("getConfig merge options", () => {
    const singleListingYaml = `
listings:
  - name: atlanta
    lineupId: USA-GA42500-X
    country: USA
    postalCode: "30309"
    outputFile: atlanta.xml
  - name: ottawa
    lineupId: CAN-0008861-X
    country: CAN
    postalCode: K1A0B1
    outputFile: ottawa.xml
`;

    it("defaults to merging disabled", () => {
        const config = getConfig();

        expect(config.merge).toEqual({
            enabled: false,
            outputFile: "merged.xml",
            keepIndividual: true,
            dedupe: "first",
        });
    });

    it("reads the merge block from YAML", () => {
        const configFile = createConfigFile(`${singleListingYaml}
merge:
  enabled: true
  outputFile: all.xml
  keepIndividual: false
  dedupe: last
`);

        process.argv.push(`--config=${configFile}`);

        expect(getConfig().merge).toEqual({
            enabled: true,
            outputFile: "all.xml",
            keepIndividual: false,
            dedupe: "last",
        });
    });

    it("enables merging via --merge", () => {
        process.argv.push("--merge");

        expect(getConfig().merge.enabled).toBe(true);
    });

    it("treats --mergeOutputFile as implying --merge", () => {
        process.argv.push("--mergeOutputFile=combined.xml");

        const { merge } = getConfig();
        expect(merge.enabled).toBe(true);
        expect(merge.outputFile).toBe("combined.xml");
    });

    it("disables individual files via --noKeepIndividual", () => {
        process.argv.push("--merge", "--noKeepIndividual");

        expect(getConfig().merge.keepIndividual).toBe(false);
    });

    it("reads merge settings from environment variables", () => {
        process.env.MERGE = "true";
        process.env.MERGE_OUTPUT_FILE = "env.xml";
        process.env.MERGE_DEDUPE = "last";
        process.env.MERGE_KEEP_INDIVIDUAL = "false";

        expect(getConfig().merge).toEqual({
            enabled: true,
            outputFile: "env.xml",
            keepIndividual: false,
            dedupe: "last",
        });
    });

    it("lets CLI merge flags override YAML and env", () => {
        const configFile = createConfigFile(`${singleListingYaml}
merge:
  enabled: true
  outputFile: yaml.xml
  dedupe: first
`);

        process.env.MERGE_OUTPUT_FILE = "env.xml";
        process.argv.push(`--config=${configFile}`, "--mergeOutputFile=cli.xml", "--mergeDedupe=last");

        const { merge } = getConfig();
        expect(merge.outputFile).toBe("cli.xml");
        expect(merge.dedupe).toBe("last");
    });

    it("rejects an invalid dedupe mode", () => {
        process.argv.push("--merge", "--mergeDedupe=middle");

        expect(() => getConfig()).toThrow("Invalid dedupe mode");
    });

    it("rejects a merge outputFile that collides with a listing output", () => {
        const configFile = createConfigFile(`${singleListingYaml}
merge:
  enabled: true
  outputFile: atlanta.xml
`);

        process.argv.push(`--config=${configFile}`);

        expect(() => getConfig()).toThrow(/Merge outputFile "atlanta.xml" collides with listing "atlanta"/);
    });

    it("allows a colliding merge outputFile when individual files are skipped", () => {
        const configFile = createConfigFile(`${singleListingYaml}
merge:
  enabled: true
  outputFile: atlanta.xml
  keepIndividual: false
`);

        process.argv.push(`--config=${configFile}`);

        expect(getConfig().merge.outputFile).toBe("atlanta.xml");
    });

    it("rejects unknown keys in the merge block", () => {
        const configFile = createConfigFile(`${singleListingYaml}
merge:
  enabled: true
  bogusKey: nope
`);

        process.argv.push(`--config=${configFile}`);

        expect(() => getConfig()).toThrow(/Invalid config file/);
    });
});
