/**
 * ISO 3166-1 alpha-2 codes for the countries in the dataset, used to pick the flag
 * in `public/flags/`. Add an entry here when a country is added to the data build.
 * Flags are from flagcdn.com — free to use, no attribution required.
 */
const COUNTRY_CODES: Record<string, string> = {
  "New Zealand": "nz",
  Australia: "au",
  Brazil: "br",
  China: "cn",
  Germany: "de",
  "United States": "us",
};

export function flagSrc(country: string): string | null {
  const code = COUNTRY_CODES[country];
  return code ? `/flags/${code}.svg` : null;
}
