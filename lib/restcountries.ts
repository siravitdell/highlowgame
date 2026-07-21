interface RestCountryV5Object {
  names: { common: string };
  area: { kilometers: number | null } | null;
}

interface RestCountryV5Response {
  data: {
    objects: RestCountryV5Object[];
    meta: { total: number; count: number; limit: number; offset: number; more: boolean };
  };
}

export interface RestCountryItem {
  name: string;
  value: number;
}

const PAGE_SIZE = 100;

async function fetchPage(offset: number): Promise<RestCountryV5Response> {
  const apiKey = process.env.REST_COUNTRIES_API_KEY;
  if (!apiKey) {
    throw new Error("REST_COUNTRIES_API_KEY is not set");
  }

  const url = `https://api.restcountries.com/countries/v5?response_fields=names.common,area.kilometers&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`REST Countries API request failed: ${res.status}`);
  }
  return (await res.json()) as RestCountryV5Response;
}

export async function fetchCountriesArea(): Promise<RestCountryItem[]> {
  const items: RestCountryItem[] = [];
  let offset = 0;

  for (;;) {
    const page = await fetchPage(offset);
    for (const country of page.data.objects) {
      const area = country.area?.kilometers;
      if (typeof area === "number" && area > 0) {
        items.push({ name: country.names.common, value: area });
      }
    }

    if (!page.data.meta.more) break;
    offset += PAGE_SIZE;
  }

  return items;
}
