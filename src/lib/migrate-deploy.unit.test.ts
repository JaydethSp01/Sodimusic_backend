import { describe, expect, it } from "vitest";
import { MAX_RESOLVE_ITERATIONS, failedMigrationName, isUnreachable, resolutionFor } from "../../scripts/migrate-deploy.mjs";

const P3018 = `Error: P3018

A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20261017183453_v3_legal_channels_crm

Database error code: 42P07

Database error:
ERROR: relation "YoutubeChannel" already exists
`;

const P3009 = `Error: P3009

migrate found failed migrations in the target database, new migrations will not be applied. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve
The \`20261017183453_v3_legal_channels_crm\` migration started at 2026-10-17 19:00:00.000000 UTC failed
`;

describe("migrate-deploy.mjs helpers", () => {
  it("extrae el nombre de la migración de P3018 y P3009", () => {
    expect(failedMigrationName(P3018)).toBe("20261017183453_v3_legal_channels_crm");
    expect(failedMigrationName(P3009)).toBe("20261017183453_v3_legal_channels_crm");
    expect(failedMigrationName("Error: P1001 Can't reach database")).toBeNull();
  });

  it("P3018 + 'already exists' → resolve --applied; P3009 → resolve --rolled-back; otros → null", () => {
    expect(resolutionFor(P3018)).toEqual({ action: "applied", name: "20261017183453_v3_legal_channels_crm" });
    expect(resolutionFor(P3009)).toEqual({ action: "rolled-back", name: "20261017183453_v3_legal_channels_crm" });
    expect(resolutionFor(P3018.replace('relation "YoutubeChannel" already exists', 'syntax error at or near "X"'))).toBeNull();
    expect(resolutionFor("Error: P3005 The database schema is not empty")).toBeNull();
    expect(resolutionFor("")).toBeNull();
  });

  it("máximo 3 iteraciones y detección de BD inalcanzable", () => {
    expect(MAX_RESOLVE_ITERATIONS).toBe(3);
    expect(isUnreachable("Error: P1001: Can't reach database server")).toBe(true);
    expect(isUnreachable("connect ENETUNREACH")).toBe(true);
    expect(isUnreachable(P3018)).toBe(false);
  });
});
