import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as v from "valibot";
import { parse } from "yaml";
import { UserAgent } from "./useragents.js";

const validCountries = [
  "ABW", "AIA", "ARG", "ATG", "BHS", "BLZ", "BRA", "BRB", "BMU", "CAN", "COL", "CRI",
  "CUW", "CYM", "DMA", "DOM", "ECU", "GRD", "GTM", "GUY", "HND", "JAM", "KNA", "LCA",
  "MAF", "MEX", "PAN", "PER", "TCA", "TTO", "URY", "USA", "VCT", "VEN", "VGB"
] as const;

const defaultBaseUrl = "https://tvlistings.gracenote.com/api/grid";
const listingSpecificCliOptions = ["lineupId", "country", "postalCode", "outputFile"] as const;
const listingSpecificEnvVars = ["LINEUP_ID", "COUNTRY", "POSTAL_CODE", "OUTPUT_FILE"] as const;

export interface XmltvOptions {
  appendAsterisk: boolean;
  mediaportal: boolean;
  nextpvr: boolean;
  stationid: boolean;
  sortname: boolean;
}

export interface ListingConfig extends XmltvOptions {
  name?: string;
  baseUrl: string;
  lineupId: string;
  headendId: string;
  timespan: string;
  country: string;
  postalCode: string;
  pref: string;
  timezone: string;
  userAgent: string;
  outputFile: string;
}

export interface RuntimeConfig {
  configFile?: string;
  listings: ListingConfig[];
}

type ListingConfigInput = Partial<Omit<ListingConfig, "headendId">>;

interface ListingsFileConfig {
  defaults?: ListingConfigInput;
  listings: ListingConfigInput[];
}

const StringLikeSchema = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform((value) => value.toString()),
);

const BooleanStringSchema = v.pipe(
  v.string(),
  v.transform((value) => value.trim().toLowerCase()),
  v.check((value) => value === "true" || value === "false", "Invalid boolean value"),
  v.transform((value) => value === "true"),
);

const OptionalStringInputSchema = v.optional(StringLikeSchema);

const OptionalBooleanInputSchema = v.pipe(
  v.optional(v.union([v.boolean(), v.literal(""), BooleanStringSchema])),
  v.transform((value) => (value === "" ? undefined : value)),
);

function stringConfigField(defaultValue: string) {
  return v.pipe(
    v.optional(StringLikeSchema, defaultValue),
    v.transform((value) => (value === "" ? defaultValue : value)),
  );
}

function optionalStringConfigField() {
  return v.pipe(
    v.optional(StringLikeSchema),
    v.transform((value) => (value === "" ? undefined : value)),
  );
}

function booleanConfigField(defaultValue: boolean) {
  return v.pipe(
    v.optional(v.union([v.boolean(), v.literal(""), BooleanStringSchema]), defaultValue),
    v.transform((value) => (value === "" ? defaultValue : value)),
  );
}

const ListingInputSchema = v.strictObject({
  name: OptionalStringInputSchema,
  baseUrl: OptionalStringInputSchema,
  lineupId: OptionalStringInputSchema,
  timespan: OptionalStringInputSchema,
  country: OptionalStringInputSchema,
  postalCode: OptionalStringInputSchema,
  pref: OptionalStringInputSchema,
  timezone: OptionalStringInputSchema,
  userAgent: OptionalStringInputSchema,
  outputFile: OptionalStringInputSchema,
  appendAsterisk: OptionalBooleanInputSchema,
  mediaportal: OptionalBooleanInputSchema,
  nextpvr: OptionalBooleanInputSchema,
  stationid: OptionalBooleanInputSchema,
  sortname: OptionalBooleanInputSchema,
});

const ListingConfigSchema = v.pipe(
  v.strictObject({
    name: optionalStringConfigField(),
    baseUrl: stringConfigField(defaultBaseUrl),
    lineupId: v.optional(StringLikeSchema),
    timespan: stringConfigField("72"),
    country: v.pipe(
      stringConfigField("USA"),
      v.check(
        (country) => validCountries.includes(country as (typeof validCountries)[number]),
        "Invalid country code",
      ),
    ),
    postalCode: stringConfigField("-"),
    pref: stringConfigField(""),
    timezone: stringConfigField("America/New_York"),
    userAgent: stringConfigField(UserAgent),
    outputFile: stringConfigField("xmltv.xml"),
    appendAsterisk: booleanConfigField(false),
    mediaportal: booleanConfigField(false),
    nextpvr: booleanConfigField(false),
    stationid: booleanConfigField(false),
    sortname: booleanConfigField(false),
  }),
  v.transform((input): ListingConfig => {
    const lineupId = normalizeLineupId(
      input.lineupId === undefined || input.lineupId === "" ? `${input.country}-lineupId-DEFAULT` : input.lineupId,
      input.country,
    );

    return {
      ...input,
      lineupId,
      headendId: getHeadendId(lineupId),
    };
  }),
);

const ConfigFileSchema = v.strictObject({
  defaults: v.optional(ListingInputSchema),
  listings: v.pipe(
    v.array(ListingInputSchema),
    v.check((listings) => listings.length > 0, "Expected at least one listing"),
  ),
});

function getArgIndex(name: string): number {
  const prefix = `--${name}=`;
  return process.argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(prefix));
}

function hasArg(name: string): boolean {
  return getArgIndex(name) !== -1;
}

function getArgValue(name: string): string | undefined {
  const index = getArgIndex(name);

  if (index === -1) {
    return undefined;
  }

  const arg = process.argv[index]!;
  if (arg === `--${name}`) {
    const nextArg = process.argv[index + 1];
    return nextArg && !nextArg.startsWith("--") ? nextArg : undefined;
  }

  return arg.substring(`--${name}=`.length);
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function compactDefinedValues<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function toSchemaError(source: string, error: unknown): Error {
  if (error instanceof v.ValiError) {
    return new Error(`Invalid ${source}: ${error.issues[0]?.message ?? "schema validation failed"}`);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function parseListingInput(input: unknown, source: string): ListingConfigInput {
  try {
    return v.parse(ListingInputSchema, input, { abortEarly: true });
  } catch (error) {
    throw toSchemaError(source, error);
  }
}

function buildListingConfig(input: ListingConfigInput): ListingConfig {
  try {
    return v.parse(ListingConfigSchema, input, { abortEarly: true });
  } catch (error) {
    throw toSchemaError("listing config", error);
  }
}

function loadConfigFile(configFilePath: string): { path: string; config: ListingsFileConfig } {
  const resolvedPath = resolve(configFilePath);
  const fileContents = readFileSync(resolvedPath, { encoding: "utf-8" });
  const parsed = parse(fileContents);

  try {
    const config = v.parse(ConfigFileSchema, parsed, { abortEarly: true });
    return {
      path: resolvedPath,
      config,
    };
  } catch (error) {
    throw toSchemaError(`config file ${resolvedPath}`, error);
  }
}

function normalizeLineupId(lineupId: string, country: string): string {
  if (lineupId.includes("OTA")) {
    return `${country}-lineupId-DEFAULT`;
  }

  return lineupId;
}

function getGlobalEnvOverrides(): ListingConfigInput {
  return parseListingInput(
    compactDefinedValues({
      timespan: getEnvValue("TIMESPAN"),
      pref: getEnvValue("PREF"),
      timezone: getEnvValue("TZ"),
      userAgent: getEnvValue("USER_AGENT"),
      appendAsterisk: getEnvValue("APPEND_ASTERISK"),
      mediaportal: getEnvValue("MEDIA_PORTAL"),
      nextpvr: getEnvValue("NEXTPVR"),
      stationid: getEnvValue("STATIONID"),
      sortname: getEnvValue("SORTNAME"),
    }),
    "environment overrides",
  );
}

function getGlobalCliOverrides(): ListingConfigInput {
  return parseListingInput(
    compactDefinedValues({
      timespan: getArgValue("timespan"),
      pref: getArgValue("pref"),
      timezone: getArgValue("timezone"),
      userAgent: getArgValue("userAgent"),
      appendAsterisk: hasArg("appendAsterisk") ? true : undefined,
      mediaportal: hasArg("mediaportal") ? true : undefined,
      nextpvr: hasArg("nextpvr") ? true : undefined,
      stationid: hasArg("stationid") ? true : undefined,
      sortname: hasArg("sortname") ? true : undefined,
    }),
    "CLI overrides",
  );
}

function getSingleListingEnvOverrides(): ListingConfigInput {
  return parseListingInput(
    compactDefinedValues({
      lineupId: getEnvValue("LINEUP_ID"),
      country: getEnvValue("COUNTRY"),
      postalCode: getEnvValue("POSTAL_CODE"),
      outputFile: getEnvValue("OUTPUT_FILE"),
    }),
    "single listing environment overrides",
  );
}

function getSingleListingCliOverrides(): ListingConfigInput {
  return parseListingInput(
    compactDefinedValues({
      lineupId: getArgValue("lineupId"),
      country: getArgValue("country"),
      postalCode: getArgValue("postalCode"),
      outputFile: getArgValue("outputFile"),
    }),
    "single listing CLI overrides",
  );
}

function assertNoListingSpecificOverrides(): void {
  const conflicts: string[] = [];

  for (const option of listingSpecificCliOptions) {
    if (hasArg(option)) {
      conflicts.push(`--${option}`);
    }
  }

  for (const envVar of listingSpecificEnvVars) {
    if (getEnvValue(envVar) !== undefined) {
      conflicts.push(envVar);
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `Cannot combine --config with listing-specific overrides (${conflicts.join(", ")}). Move those values into the YAML listings.`,
    );
  }
}

function assertDistinctOutputFiles(listings: ListingConfig[]): void {
  if (listings.length < 2) {
    return;
  }

  const seen = new Map<string, string>();

  for (const listing of listings) {
    const label = listing.name || listing.lineupId;
    const previous = seen.get(listing.outputFile);

    if (previous) {
      throw new Error(
        `Multiple listings resolve to the same outputFile "${listing.outputFile}" (${previous}, ${label}). Set unique outputFile values for each listing.`,
      );
    }

    seen.set(listing.outputFile, label);
  }
}

export function processLineupId(): string {
  return buildListingConfig(
    compactDefinedValues({
      country: getArgValue("country") ?? getEnvValue("COUNTRY"),
      lineupId: getArgValue("lineupId") ?? getEnvValue("LINEUP_ID"),
    }),
  ).lineupId;
}

export function getHeadendId(lineupId: string): string {
  if (lineupId.includes("OTA")) {
    return "lineupId";
  }

  const match = lineupId.match(/^(?:[A-Z]{3})-(.*?)(?:-[A-Z]+)?$/);

  return match?.[1] || "lineup";
}

export function getConfig(): RuntimeConfig {
  const configFile = getArgValue("config") ?? getEnvValue("CONFIG_FILE");

  if (configFile) {
    assertNoListingSpecificOverrides();

    const { path, config } = loadConfigFile(configFile);
    const globalEnvOverrides = getGlobalEnvOverrides();
    const globalCliOverrides = getGlobalCliOverrides();

    const listings = config.listings.map((listingInput) =>
      buildListingConfig({
        ...(config.defaults ?? {}),
        ...listingInput,
        ...globalEnvOverrides,
        ...globalCliOverrides,
      }),
    );

    assertDistinctOutputFiles(listings);

    return {
      configFile: path,
      listings,
    };
  }

  const listing = buildListingConfig({
    ...getGlobalEnvOverrides(),
    ...getSingleListingEnvOverrides(),
    ...getGlobalCliOverrides(),
    ...getSingleListingCliOverrides(),
  });

  return { listings: [listing] };
}
