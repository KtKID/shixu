function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 登录/同步时间的展示格式：今天 14:32 / 9月2日 21:07 / 2025年12月30日 09:15。 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `今天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
