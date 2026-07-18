interface RestCountry {
  name: { common: string };
  area?: number;
}

export interface RestCountryItem {
  name: string;
  value: number;
}

export async function fetchCountriesArea(): Promise<RestCountryItem[]> {
  const res = await fetch("https://restcountries.com/v3.1/all?fields=name,area");
  if (!res.ok) {
    throw new Error(`REST Countries API request failed: ${res.status}`);
  }
  const data = (await res.json()) as RestCountry[];

  return data
    .filter((c) => typeof c.area === "number" && c.area > 0)
    .map((c) => ({ name: c.name.common, value: c.area as number }));
}
