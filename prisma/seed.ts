import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fetchCountriesPopulation, fetchCountriesGDP } from "../lib/worldbank";
import { fetchCountriesArea } from "../lib/restcountries";

const prisma = new PrismaClient();

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, relativePath), "utf-8")
  ) as T;
}

const mountains = readJson<{ name: string; value: number }[]>("data/mountains.json");
const planets = readJson<{ name: string; diameter: number; distance: number }[]>(
  "data/planets.json"
);
const cities = readJson<{ name: string; population: number; elevation: number }[]>(
  "data/cities.json"
);

interface CategoryDef {
  group: string;
  metric: string;
  unit: string;
  label: string;
}

async function upsertCategory(def: CategoryDef) {
  return prisma.category.upsert({
    where: { group_metric: { group: def.group, metric: def.metric } },
    update: { unit: def.unit, label: def.label },
    create: def,
  });
}

async function seedItems(
  categoryId: string,
  metric: string,
  unit: string,
  items: { name: string; value: number }[]
) {
  await prisma.item.deleteMany({ where: { categoryId } });
  await prisma.item.createMany({
    data: items.map((item) => ({
      name: item.name,
      value: item.value,
      metric,
      unit,
      categoryId,
    })),
  });
}

async function seedCountries() {
  const population = await upsertCategory({
    group: "Countries",
    metric: "Population",
    unit: "people",
    label: "🌍 Countries — Population",
  });
  const populationData = await fetchCountriesPopulation();
  await seedItems(population.id, "Population", "people", populationData);
  console.log(`Seeded ${populationData.length} countries (population)`);

  const gdp = await upsertCategory({
    group: "Countries",
    metric: "GDP",
    unit: "USD",
    label: "🌍 Countries — GDP",
  });
  const gdpData = await fetchCountriesGDP();
  await seedItems(gdp.id, "GDP", "USD", gdpData);
  console.log(`Seeded ${gdpData.length} countries (GDP)`);

  const area = await upsertCategory({
    group: "Countries",
    metric: "Area",
    unit: "km²",
    label: "🌍 Countries — Area",
  });
  const areaData = await fetchCountriesArea();
  await seedItems(area.id, "Area", "km²", areaData);
  console.log(`Seeded ${areaData.length} countries (area)`);
}

async function seedCities() {
  const population = await upsertCategory({
    group: "Cities",
    metric: "Population",
    unit: "people",
    label: "🏙️ Cities — Population",
  });
  await seedItems(
    population.id,
    "Population",
    "people",
    cities.map((c) => ({ name: c.name, value: c.population }))
  );

  const elevation = await upsertCategory({
    group: "Cities",
    metric: "Elevation",
    unit: "m",
    label: "🏙️ Cities — Elevation",
  });
  await seedItems(
    elevation.id,
    "Elevation",
    "m",
    cities.map((c) => ({ name: c.name, value: c.elevation }))
  );
  console.log(`Seeded ${cities.length} cities`);
}

async function seedMountains() {
  const height = await upsertCategory({
    group: "Mountains",
    metric: "Height",
    unit: "m",
    label: "🏔️ Mountains — Height",
  });
  await seedItems(height.id, "Height", "m", mountains);
  console.log(`Seeded ${mountains.length} mountains`);
}

async function seedPlanets() {
  const size = await upsertCategory({
    group: "Planets",
    metric: "Diameter",
    unit: "km",
    label: "🪐 Planets — Diameter",
  });
  await seedItems(
    size.id,
    "Diameter",
    "km",
    planets.map((p) => ({ name: p.name, value: p.diameter }))
  );

  const distance = await upsertCategory({
    group: "Planets",
    metric: "Distance from Sun",
    unit: "million km",
    label: "🪐 Planets — Distance from Sun",
  });
  await seedItems(
    distance.id,
    "Distance from Sun",
    "million km",
    planets.map((p) => ({ name: p.name, value: p.distance }))
  );
  console.log(`Seeded ${planets.length} planets`);
}

async function seedMovies() {
  if (!process.env.TMDB_API_KEY) {
    console.log("Skipping movies — TMDB_API_KEY not set");
    return;
  }
  const { fetchTopMovies } = await import("../lib/tmdb");
  const movies = await fetchTopMovies(100);

  const boxOffice = await upsertCategory({
    group: "Movies",
    metric: "Box Office",
    unit: "USD",
    label: "🎬 Movies — Box Office",
  });
  await seedItems(
    boxOffice.id,
    "Box Office",
    "USD",
    movies.map((m) => ({ name: m.name, value: m.boxOffice }))
  );

  const budget = await upsertCategory({
    group: "Movies",
    metric: "Budget",
    unit: "USD",
    label: "🎬 Movies — Budget",
  });
  await seedItems(
    budget.id,
    "Budget",
    "USD",
    movies.map((m) => ({ name: m.name, value: m.budget }))
  );
  console.log(`Seeded ${movies.length} movies`);
}

async function main() {
  await seedMountains();
  await seedPlanets();
  await seedCities();

  try {
    await seedCountries();
  } catch (err) {
    console.error("Failed to seed countries (external API issue):", err);
  }

  try {
    await seedMovies();
  } catch (err) {
    console.error("Failed to seed movies (external API issue):", err);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
