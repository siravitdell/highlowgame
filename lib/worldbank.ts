interface WorldBankCountry {
  id: string;
  countryiso3code: string;
  country: { id: string; value: string };
  value: number | null;
}

type WorldBankResponse = [unknown, WorldBankCountry[] | undefined];

export interface WorldBankItem {
  name: string;
  value: number;
}

async function fetchIndicator(indicator: string): Promise<WorldBankItem[]> {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=300&mrnev=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`World Bank API request failed: ${res.status}`);
  }
  const data = (await res.json()) as WorldBankResponse;
  const rows = data[1] ?? [];

  return rows
    .filter((row) => row.value !== null && row.country.value && row.countryiso3code)
    .map((row) => ({ name: row.country.value, value: row.value as number }));
}

export async function fetchCountriesPopulation(): Promise<WorldBankItem[]> {
  return fetchIndicator("SP.POP.TOTL");
}

export async function fetchCountriesGDP(): Promise<WorldBankItem[]> {
  return fetchIndicator("NY.GDP.MKTP.CD");
}
