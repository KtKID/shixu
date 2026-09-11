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

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 收藏时间的相对展示（homepage feat04）：今天 / 昨天 / N 天前。
 * 按自然日差计算（跨月正确），未来时间（时钟偏差）按「今天」兜底。
 */
export function formatRelativeTime(iso: string, now = new Date()): string {
  const dayDiff = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86400000);
  if (dayDiff <= 0) return '今天';
  if (dayDiff === 1) return '昨天';
  return `${dayDiff} 天前`;
}
