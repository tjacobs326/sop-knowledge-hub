export function formatDate(value: string | undefined) {
  if (!value) return "Not set";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function daysUntil(value: string | undefined) {
  if (!value) return null;

  const today = new Date();
  const target = new Date(`${value}T00:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
