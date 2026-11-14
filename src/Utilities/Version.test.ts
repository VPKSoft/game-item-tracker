import { describe, expect, it } from "vitest";
import { appVersion, isSemVer } from "./Version.ts";

describe("isSemVer", () => {
    it("accepts valid versions", () => {
        for (const value of ["0.0.1", "0.9.1", "1.0.0", "10.20.30", "1.0.0-beta.1", "1.0.0-rc.1+build.5"]) {
            expect(isSemVer(value)).toBe(true);
        }
    });

    it("rejects invalid versions", () => {
        for (const value of ["", "1", "1.0", "v1.0.0", "v.0.0.1", "01.0.0", "1.0.0-", "1.0.0.0"]) {
            expect(isSemVer(value)).toBe(false);
        }
    });
});

describe("appVersion", () => {
    it("is a valid SemVer version (the release workflow tags it as v<version>)", () => {
        expect(isSemVer(appVersion)).toBe(true);
    });
});
