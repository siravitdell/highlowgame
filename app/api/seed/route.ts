import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCountriesPopulation, fetchCountriesGDP } from "@/lib/worldbank";
import { fetchCountriesArea } from "@/lib/restcountries";

export const dynamic = "force-dynamic";

async function upsertCategory(group: string, metric: string, unit: string, label: string) {
  return prisma.category.upsert({
    where: { group_metric: { group, metric } },
    update: { unit, label },
    create: { group, metric, unit, label },
  });
}

async function replaceItems(
  categoryId: string,
  metric: string,
  unit: string,
  items: { name: string; value: number }[]
) {
  await prisma.item.deleteMany({ where: { categoryId } });
  await prisma.item.createMany({
    data: items.map((item) => ({ ...item, metric, unit, categoryId })),
  });
}

export async function POST(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");

  if (category !== "countries") {
    return NextResponse.json(
      { error: "only 'countries' is supported for on-demand seeding; use prisma/seed.ts for other categories" },
      { status: 400 }
    );
  }

  const [population, gdp, area] = await Promise.all([
    upsertCategory("Countries", "Population", "people", "🌍 Countries — Population"),
    upsertCategory("Countries", "GDP", "USD", "🌍 Countries — GDP"),
    upsertCategory("Countries", "Area", "km²", "🌍 Countries — Area"),
  ]);

  const [populationData, gdpData, areaData] = await Promise.all([
    fetchCountriesPopulation(),
    fetchCountriesGDP(),
    fetchCountriesArea(),
  ]);

  await Promise.all([
    replaceItems(population.id, "Population", "people", populationData),
    replaceItems(gdp.id, "GDP", "USD", gdpData),
    replaceItems(area.id, "Area", "km²", areaData),
  ]);

  return NextResponse.json({
    seeded: {
      population: populationData.length,
      gdp: gdpData.length,
      area: areaData.length,
    },
  });
}
