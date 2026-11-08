/** Converts a name into a key-safe slug, e.g. "Bahari Bass" -> "bahari-bass". */
const slugify = (name: string) => {
    const slug = name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : "item";
};

/** Creates a slug from the name that does not collide with any of the existing ids. */
const uniqueId = (name: string, existing: Iterable<string>) => {
    const taken = new Set(existing);
    const base = slugify(name);
    if (!taken.has(base)) {
        return base;
    }
    let index = 2;
    while (taken.has(`${base}-${index}`)) {
        index++;
    }
    return `${base}-${index}`;
};

/** Creates a random UUID. */
const newUuid = () => crypto.randomUUID();

const parseVersion = (version: string) => version.split(".").map(v => Number.parseInt(v, 10) || 0);

/** Increments one part of a MAJOR.MINOR.PATCH version string. */
const bumpVersion = (version: string, part: "major" | "minor" | "patch") => {
    const [major = 0, minor = 0, patch = 0] = parseVersion(version);
    switch (part) {
        case "major": {
            return `${major + 1}.0.0`;
        }
        case "minor": {
            return `${major}.${minor + 1}.0`;
        }
        default: {
            return `${major}.${minor}.${patch + 1}`;
        }
    }
};

/** Compares two MAJOR.MINOR.PATCH version strings; negative when a < b. */
const compareVersions = (a: string, b: string) => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
};

export { bumpVersion, compareVersions, newUuid, slugify, uniqueId };
