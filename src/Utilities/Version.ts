import { description, version } from "../../package.json";

/**
 * Matches a Semantic Versioning 2.0.0 version (`MAJOR.MINOR.PATCH`, optional `-prerelease` and `+build`).
 * The pattern is the one recommended by https://semver.org.
 */
const semVerPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** The application version from `package.json`, a SemVer string such as `0.9.1`. */
const appVersion: string = version;

/** The application name from `package.json`. */
const appName: string = description;

/**
 * Checks whether a string is a valid Semantic Versioning 2.0.0 version.
 * @param value The version string to check (without a leading `v`).
 * @returns `true` if the value is a valid SemVer version.
 */
const isSemVer = (value: string): boolean => semVerPattern.test(value);

export { appName, appVersion, isSemVer };
