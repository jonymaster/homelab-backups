export const SOURCE_ROOT = "/app/source";
export const DESTINATION_ROOT = "/app/destination";

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultDestination(jobName: string): string {
  const slug = slugify(jobName);
  return slug ? `${DESTINATION_ROOT}/${slug}` : DESTINATION_ROOT;
}

export const trimSlash = (path: string) => path.replace(/\/+$/, "");

export const isInside = (path: string, root: string) => {
  const p = trimSlash(path);
  return p === root || p.startsWith(`${root}/`);
};
