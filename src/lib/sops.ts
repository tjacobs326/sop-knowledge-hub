import { getCollection, type CollectionEntry } from "astro:content";
import { categories, categorySlugFromName } from "../data/categories";

export type SopEntry = CollectionEntry<"sops">;

export async function getAllSops() {
  const entries = await getCollection("sops");

  return entries.sort((a, b) => {
    const dateSort = b.data.lastUpdated.localeCompare(a.data.lastUpdated);
    return dateSort || a.data.title.localeCompare(b.data.title);
  });
}

export function getSopUrl(sop: SopEntry) {
  return `/sops/${categorySlugFromName(sop.data.category)}/${sop.data.slug}/`;
}

export function getCategoryUrl(slug: string) {
  return `/categories/${slug}/`;
}

export function getSopsByCategory(sops: SopEntry[], categoryName: string) {
  return sops.filter((sop) => sop.data.category === categoryName);
}

export function getCategoryCounts(sops: SopEntry[]) {
  return categories.map((category) => ({
    ...category,
    count: sops.filter((sop) => sop.data.category === category.name).length,
  }));
}

export function resolveRelatedSops(current: SopEntry, allSops: SopEntry[]) {
  return current.data.relatedSops.map((related) => {
    const match = allSops.find(
      (sop) => sop.data.title === related || sop.data.id === related || sop.data.slug === related,
    );

    return {
      title: related,
      url: match ? getSopUrl(match) : null,
      purpose: match?.data.purpose,
      status: match?.data.status,
    };
  });
}

export function buildSearchRecord(sop: SopEntry) {
  return {
    id: sop.data.id,
    title: sop.data.title,
    purpose: sop.data.purpose,
    category: sop.data.category,
    tags: sop.data.tags,
    tools: sop.data.tools,
    owner: sop.data.owner,
    audience: sop.data.audience,
    status: sop.data.status,
    lastUpdated: sop.data.lastUpdated,
    reviewDate: sop.data.reviewDate,
    url: getSopUrl(sop),
    body: sop.body,
    relatedSops: sop.data.relatedSops,
  };
}
